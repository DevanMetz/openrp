import { randomBytes } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import type { Game } from './game.ts';
import { JoinRate } from './network.ts';
import { identifyVoiceFrame, inVoiceRange, validVoiceFrame, VOICE_BACKLOG_BYTES } from '../shared/voice.ts';

interface VoiceSession {
  id?: string;
  ip: string;
  listening: boolean;
  transmitting: boolean;
  muted: Set<string>;
  alive: boolean;
  window: number;
  frames: number;
  controls: number;
  allowance: number;
  lastFrame: number;
  sequence?: number;
}

export class VoiceRelay {
  private wss = new WebSocketServer({ noServer: true, maxPayload: 48_000, perMessageDeflate: false });
  private tickets = new Map<string, string>();
  private sessions = new Map<WebSocket, VoiceSession>();
  private joinRate = new JoinRate();
  private heartbeat: ReturnType<typeof setInterval>;
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

  constructor(private game: Game) {
    this.heartbeat = setInterval(() => {
      this.joinRate.prune();
      for (const [ws, session] of this.sessions) {
        if (!session.alive || ws.bufferedAmount > VOICE_BACKLOG_BYTES * 4) ws.terminate();
        else {
          session.alive = false;
          ws.ping();
        }
      }
    }, 15_000);
  }

  register(id: string): string {
    this.remove(id);
    const ticket = randomBytes(32).toString('hex');
    this.tickets.set(ticket, id);
    return ticket;
  }

  remove(id: string): void {
    for (const [ticket, player] of this.tickets) if (player === id) this.tickets.delete(ticket);
    for (const [ws, session] of this.sessions) {
      if (session.id === id) {
        session.id = undefined;
        session.transmitting = session.listening = false;
        ws.close(1000, 'Game session ended');
      }
    }
  }

  upgrade(req: IncomingMessage, socket: Duplex, head: Buffer, ip: string): void {
    if (
      [...this.sessions.values()].filter((s) => !s.id && s.ip === ip).length >= 8 ||
      !this.joinRate.allow(ip)
    ) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      socket.destroy();
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => this.connect(ws, ip));
  }

  private connect(ws: WebSocket, ip: string): void {
    const session: VoiceSession = {
      ip,
      listening: false,
      transmitting: false,
      muted: new Set(),
      alive: true,
      window: Date.now(),
      frames: 0,
      controls: 0,
      allowance: 12,
      lastFrame: Date.now(),
    };
    this.sessions.set(ws, session);
    const timeout = setTimeout(() => {
      if (!session.id) ws.close(1008, 'Voice join timed out');
    }, 5000);
    ws.on('error', () => ws.terminate());
    ws.on('pong', () => {
      session.alive = true;
    });
    ws.on('close', () => {
      clearTimeout(timeout);
      this.sessions.delete(ws);
    });
    ws.on('message', (raw, binary) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const now = Date.now();
      if (now - session.window >= 1000) {
        session.window = now;
        session.frames = session.controls = 0;
      }
      const bytes = Buffer.isBuffer(raw) ? raw : Buffer.concat(Array.isArray(raw) ? raw : [Buffer.from(raw)]);
      if (binary) {
        if (!session.id || !validVoiceFrame(bytes)) {
          ws.close(1008, 'Invalid voice frame');
          return;
        }
        if (++session.frames > 120) {
          ws.close(1008, 'Voice rate exceeded');
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
            peer.readyState !== WebSocket.OPEN ||
            peer.bufferedAmount > VOICE_BACKLOG_BYTES
          )
            continue;
          const player = this.game.players.get(listener.id);
          if (player && !player.deadUntil && inVoiceRange(speaker, player)) {
            peer.send(packet, { binary: true });
            this.framesOut++;
            this.bytesOut += packet.byteLength;
          }
        }
        return;
      }
      if (++session.controls > 30 || bytes.byteLength > 44_000) {
        ws.close(1008, 'Voice control rate exceeded');
        return;
      }
      let msg;
      try {
        msg = JSON.parse(bytes.toString());
      } catch {
        ws.close(1007, 'Invalid voice message');
        return;
      }
      if (!msg || typeof msg !== 'object') {
        ws.close(1007, 'Invalid voice message');
        return;
      }
      if (!session.id) {
        const id =
          msg.type === 'join' && typeof msg.ticket === 'string' ? this.tickets.get(msg.ticket) : undefined;
        if (!id || !this.game.players.has(id) || [...this.sessions.values()].some((s) => s.id === id)) {
          ws.close(1008, 'Voice session unavailable');
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
        ws.close(1007, 'Invalid voice configuration');
        return;
      }
      session.listening = msg.listening;
      session.transmitting = msg.transmitting && msg.listening;
      session.muted = new Set(msg.muted.filter((id: string) => this.game.players.has(id)));
    });
  }

  async close(): Promise<void> {
    clearInterval(this.heartbeat);
    this.tickets.clear();
    for (const ws of this.sessions.keys()) ws.terminate();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
  }
}
