import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { cleanText, type Game } from './game.ts';

export class Moderation {
  private key: string;
  private bans = new Map<string, string>();
  constructor(
    private dir: string,
    private persist: boolean,
    key?: string,
  ) {
    if (persist) mkdirSync(dir, { recursive: true });
    const keyPath = join(dir, '.admin-token');
    this.key =
      key ??
      (persist && existsSync(keyPath)
        ? readFileSync(keyPath, 'utf8').trim()
        : randomBytes(32).toString('hex'));
    if (persist && !existsSync(keyPath)) writeFileSync(keyPath, this.key, { mode: 0o600, flag: 'wx' });
    if (persist && existsSync(join(dir, 'bans.json'))) {
      const saved: unknown = JSON.parse(readFileSync(join(dir, 'bans.json'), 'utf8'));
      if (
        !Array.isArray(saved) ||
        saved.some((b) => !Array.isArray(b) || b.length !== 2 || b.some((v) => typeof v !== 'string'))
      )
        throw new Error('Invalid bans.json; restore a valid backup.');
      this.bans = new Map(saved);
    }
  }
  banned(id: string): boolean {
    return this.bans.has(id);
  }
  private save(): void {
    if (!this.persist) return;
    const path = join(this.dir, 'bans.json');
    writeFileSync(path + '.tmp', JSON.stringify([...this.bans]), { mode: 0o600 });
    renameSync(path + '.tmp', path);
  }
  async handle(
    req: IncomingMessage,
    res: ServerResponse,
    game: Game,
    kick: (id: string, reason: string) => void,
  ): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    const candidate = Buffer.from(req.headers.authorization?.replace(/^Bearer /, '') ?? '');
    const expected = Buffer.from(this.key);
    if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) {
      res.writeHead(401);
      res.end('{"error":"Unauthorized"}');
      return;
    }
    if (req.method === 'GET') {
      res.end(
        JSON.stringify({
          players: [...game.players.values()].map((p) => ({ id: p.id, name: p.name, job: p.job })),
          bans: [...this.bans].map(([id, reason]) => ({ id, reason })),
        }),
      );
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('{}');
      return;
    }
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 2048) {
          res.writeHead(413);
          res.end('{}');
          return;
        }
      }
      const data: unknown = JSON.parse(body);
      if (!data || typeof data !== 'object') throw new Error('Invalid command');
      const command = data as Record<string, unknown>;
      const id = cleanText(command.id, 80),
        reason = cleanText(command.reason, 160) || 'Server rules';
      if (command.action === 'announce') {
        game.onEvent({ type: 'chat', channel: 'system', name: 'SERVER', text: reason });
      } else if (command.action === 'unban' && id) {
        this.bans.delete(id);
        this.save();
      } else if ((command.action === 'kick' || command.action === 'ban') && game.players.has(id)) {
        if (command.action === 'ban') {
          this.bans.set(id, reason);
          this.save();
        }
        kick(id, reason);
      } else throw new Error('Unknown command or resident');
      console.log(`Operator ${String(command.action)}: ${id || 'announcement'}`);
      res.end('{"ok":true}');
    } catch (error) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: (error as Error).message }));
    }
  }
}
