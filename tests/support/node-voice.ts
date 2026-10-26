import { WebSocketServer } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { Game } from '../../server/game.ts';
import { VoiceRelay as Core } from '../../server/voice.ts';
import { JoinRate } from '../../server/network.ts';
export class VoiceRelay extends Core {
  private wss = new WebSocketServer({ noServer: true, maxPayload: 48000 });
  private rate = new JoinRate();
  upgrade(req: IncomingMessage, socket: Duplex, head: Buffer, ip: string) {
    if (this.pending(ip) >= 8 || !this.rate.allow(ip)) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      socket.destroy();
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => this.connect(ws, ip));
  }
  override async close() {
    super.close();
    for (const ws of this.wss.clients) ws.terminate();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
  }
}
