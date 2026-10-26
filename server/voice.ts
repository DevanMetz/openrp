import type { Game } from './game.ts';
import { randomToken } from './security.ts';
import { validVoiceFrame, identifyVoiceFrame, inVoiceRange } from '../shared/voice.ts';
export interface VoiceSocket {
  readyState: number;
  send(data: string | Uint8Array): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'message', listener: (event: { data: string | ArrayBuffer }) => void): void;
  addEventListener(type: 'close' | 'error', listener: () => void): void;
}
interface VoiceSession {
  timeout?: ReturnType<typeof setTimeout>;
  id?: string;
  ip: string;
  listening: boolean;
  transmitting: boolean;
  muted: Set<string>;
  window: number;
  frames: number;
  controls: number;
  allowance: number;
  lastFrame: number;
  sequence?: number;
  outbound: number;
  outboundAt: number;
}

export class VoiceRelay {
  private tickets = new Map<string, string>();
  private sessions = new Map<VoiceSocket, VoiceSession>();
  private framesIn = 0;
  private framesOut = 0;
  private bytesOut = 0;

  metrics(reset = false): Record<string, number> {
    const value = {
      voiceConnections: [...this.sessions.values()].filter((s) => !!s.id).length,
      voiceFramesIn: this.framesIn,
      voiceFramesOut: this.framesOut,
      voiceBytesOut: this.bytesOut,
    };
    if (reset) this.framesIn = this.framesOut = this.bytesOut = 0;
    return value;
  }

  constructor(private game: Game) {}
  private end(ws: VoiceSocket, code: number, reason: string) {
    clearTimeout(this.sessions.get(ws)?.timeout);
    this.sessions.delete(ws);
    try {
      ws.close(code, reason);
    } catch {
      /* Transport already gone. */
    }
  }
  pending(ip: string): number {
    return [...this.sessions.values()].filter((s) => !s.id && s.ip === ip).length;
  }
  register(id: string): string {
    this.remove(id);
    const ticket = randomToken();
    this.tickets.set(ticket, id);
    return ticket;
  }

  remove(id: string): void {
    for (const [ticket, player] of this.tickets) if (player === id) this.tickets.delete(ticket);
    for (const [ws, session] of this.sessions) {
      if (session.id === id) {
        session.id = undefined;
        session.transmitting = session.listening = false;
        this.end(ws, 1000, 'Game session ended');
      }
    }
  }

  connect(ws: VoiceSocket, ip: string): void {
    const session: VoiceSession = {
      ip,
      listening: false,
      transmitting: false,
      muted: new Set(),
      window: Date.now(),
      frames: 0,
      controls: 0,
      allowance: 12,
      outbound: 512_000,
      outboundAt: Date.now(),
      lastFrame: Date.now(),
    };
    this.sessions.set(ws, session);
    const timeout = (session.timeout = setTimeout(() => {
      if (!session.id) this.end(ws, 1008, 'Voice join timed out');
    }, 5000));
    ws.addEventListener('error', () => this.end(ws, 1011, 'Voice connection failed'));
    ws.addEventListener('close', () => this.end(ws, 1000, 'Connection closed'));
    ws.addEventListener('message', (event) => {
      const raw = event.data,
        binary = typeof raw !== 'string';
      if (ws.readyState !== 1 || !this.sessions.has(ws)) return;
      const now = Date.now();
      if (now - session.window >= 1000) {
        session.window = now;
        session.frames = session.controls = 0;
      }
      const bytes = typeof raw === 'string' ? Buffer.from(raw) : Buffer.from(raw);
      if (bytes.byteLength > 48_000) {
        this.end(ws, 1009, 'Voice message too large');
        return;
      }
      if (binary) {
        if (!session.id || !validVoiceFrame(bytes)) {
          this.end(ws, 1008, 'Invalid voice frame');
          return;
        }
        if (++session.frames > 120) {
          this.end(ws, 1008, 'Voice rate exceeded');
          return;
        }
        session.allowance = Math.min(12, session.allowance + (now - session.lastFrame) * 0.06);
        session.lastFrame = now;
        if (session.allowance < 1) return;
        session.allowance--;
        const sequence = bytes.readUInt32LE(4);
        if (session.sequence !== undefined) {
          const delta = (sequence - session.sequence) >>> 0;
          if (!delta || delta > 0x7fffffff) return;
        }
        session.sequence = sequence;
        const speaker = this.game.players.get(session.id);
        if (!speaker || speaker.deadUntil || !session.transmitting || !session.listening) return;
        // Recipient eligibility is decided here, using authoritative positions, on every frame.
        // Clients cannot request a distant player or provide a forged sender identity.
        const packet = identifyVoiceFrame(session.id, bytes);
        this.framesIn++;
        for (const [peer, listener] of this.sessions) {
          if (
            peer === ws ||
            !listener.id ||
            !listener.listening ||
            listener.muted.has(session.id) ||
            peer.readyState !== 1
          )
            continue;
          const player = this.game.players.get(listener.id);
          if (player && !player.deadUntil && inVoiceRange(speaker, player)) {
            // No bufferedAmount on Workers. Bound aggregate delivery per listener and
            // drop live audio rather than enqueue an unbounded fan-in from speakers.
            listener.outbound = Math.min(512_000, listener.outbound + (now - listener.outboundAt) * 256);
            listener.outboundAt = now;
            if (listener.outbound < packet.byteLength) continue;
            listener.outbound -= packet.byteLength;
            try {
              peer.send(packet);
            } catch {
              this.end(peer, 1011, 'Voice send failed');
              continue;
            }
            this.framesOut++;
            this.bytesOut += packet.byteLength;
          }
        }
        return;
      }
      if (++session.controls > 30 || bytes.byteLength > 44_000) {
        this.end(ws, 1008, 'Voice control rate exceeded');
        return;
      }
      let msg;
      try {
        msg = JSON.parse(bytes.toString());
      } catch {
        this.end(ws, 1007, 'Invalid voice message');
        return;
      }
      if (!msg || typeof msg !== 'object') {
        this.end(ws, 1007, 'Invalid voice message');
        return;
      }
      if (!session.id) {
        const id =
          msg.type === 'join' && typeof msg.ticket === 'string' ? this.tickets.get(msg.ticket) : undefined;
        if (!id || !this.game.players.has(id) || [...this.sessions.values()].some((s) => s.id === id)) {
          this.end(ws, 1008, 'Voice session unavailable');
          return;
        }
        session.id = id;
        clearTimeout(timeout);
        ws.send(JSON.stringify({ type: 'ready' }));
        return;
      }
      if (
        msg.type !== 'config' ||
        typeof msg.listening !== 'boolean' ||
        typeof msg.transmitting !== 'boolean' ||
        !Array.isArray(msg.muted) ||
        msg.muted.length > 1000 ||
        msg.muted.some((id: unknown) => typeof id !== 'string')
      ) {
        this.end(ws, 1007, 'Invalid voice configuration');
        return;
      }
      session.listening = msg.listening;
      session.transmitting = msg.transmitting && msg.listening;
      session.muted = new Set(msg.muted.filter((id: string) => this.game.players.has(id)));
    });
  }

  close(): void {
    this.tickets.clear();
    for (const ws of this.sessions.keys()) this.end(ws, 1000, 'World stopped');
  }
}
