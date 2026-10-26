import { secretMatches } from './security.ts';
import type { HttpRequest as IncomingMessage, HttpResponse as ServerResponse } from './http.ts';
import { cleanText, type Game } from './game.ts';

export class Moderation {
  private bans: Map<string, string>;
  constructor(
    private key: string | undefined,
    private readKey: string | undefined,
    saved: [string, string][],
    private persist: (bans: [string, string][]) => void,
  ) {
    this.bans = new Map(saved);
  }
  banned(id: string): boolean {
    return this.bans.has(id);
  }
  authorized(req: IncomingMessage, readOnly = false): boolean {
    const candidate = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
    return secretMatches(candidate, this.key) || (readOnly && secretMatches(candidate, this.readKey));
  }
  private save(): void {
    this.persist([...this.bans]);
  }
  async handle(
    req: IncomingMessage,
    res: ServerResponse,
    game: Game,
    kick: (id: string, reason: string) => void,
    checkpoint: () => void = () => {},
  ): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    if (!this.authorized(req)) {
      res.writeHead(401);
      res.end('{"error":"Unauthorized"}');
      return;
    }
    if (req.method === 'GET') {
      res.end(
        JSON.stringify({
          players: [...game.players.values()].map((p) => ({ id: p.id, name: p.name, job: p.job })),
          owners: [...game.profiles.values()]
            .map(({ id, name }) => ({
              id,
              name: game.players.get(id)?.name ?? name,
              online: game.players.has(id),
              entities: [...game.entities.values()].filter((e) => e.owner === id).length,
              properties: game.doors.filter((d) => d.owner === id).length,
            }))
            .filter((owner) => owner.entities || owner.properties),
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
      const chunks: Buffer[] = [];
      let length = 0;
      for await (const chunk of req) {
        length += chunk.byteLength;
        if (length > 2048) {
          res.writeHead(413);
          res.end('{}');
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
      const data: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!data || typeof data !== 'object') throw new Error('Invalid command');
      const command = data as Record<string, unknown>;
      const id = cleanText(command.id, 80),
        reason = cleanText(command.reason, 160) || 'Server rules';
      let removed: { entities: number; properties: number } | undefined;
      if (command.action === 'announce') {
        game.onEvent({ type: 'chat', channel: 'system', name: 'SERVER', text: reason });
      } else if (command.action === 'unban' && id) {
        this.bans.delete(id);
        this.save();
      } else if (command.action === 'cleanup' && [...game.profiles.values()].some((p) => p.id === id)) {
        removed = game.cleanupOwner(id);
        game.notice(id, `An operator cleared your placed objects and property: ${reason}`);
      } else if ((command.action === 'kick' || command.action === 'ban') && game.players.has(id)) {
        if (command.action === 'ban') {
          this.bans.set(id, reason);
          this.save();
        }
        kick(id, reason);
      } else throw new Error('Unknown command or resident');
      game.onActivity({ kind: 'moderation', action: String(command.action), playerId: id, reason });
      checkpoint();
      console.log(JSON.stringify({ event: 'moderation', action: command.action, id }));
      res.end(JSON.stringify({ ok: true, ...(removed && { removed }) }));
    } catch (error) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: (error as Error).message }));
    }
  }
}
