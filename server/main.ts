import { createServer, type Server } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import type { ViteDevServer } from 'vite';
import { Game, cleanText } from './game.ts';
import { loadProfiles, saveProfiles } from './persistence.ts';
import { PROTOCOL, SNAPSHOT_RATE, TICK_RATE, VERSION } from '../shared/catalog.ts';
import type { ClientMessage } from '../shared/types.ts';

try {
  process.loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
const numeric = (value: string | undefined, fallback: number, min: number, max: number) =>
  value && Number.isFinite(Number(value))
    ? Math.round(Math.max(min, Math.min(max, Number(value))))
    : fallback;
export interface ServerOptions {
  port?: number;
  host?: string;
  production?: boolean;
  dataDir?: string;
  persist?: boolean;
  game?: Game;
  password?: string;
}
export async function startServer(
  options: ServerOptions = {},
): Promise<{ server: Server; game: Game; port: number; close: () => Promise<void> }> {
  const port = options.port ?? numeric(process.env.PORT, 3000, 1, 65535);
  const host = options.host ?? process.env.HOST ?? '0.0.0.0';
  const production = options.production ?? process.argv.includes('--production');
  const dataDir = resolve(options.dataDir ?? process.env.DATA_DIR ?? './data');
  const persist = options.persist !== false;
  const game =
    options.game ??
    new Game({
      startingMoney: numeric(process.env.STARTING_MONEY, 1500, 0, 1e7),
      salarySeconds: numeric(process.env.SALARY_SECONDS, 60, 5, 3600),
      jailSeconds: numeric(process.env.JAIL_SECONDS, 60, 5, 600),
      maxPlayers: numeric(process.env.MAX_PLAYERS, 32, 1, 64),
      profiles: persist ? loadProfiles(dataDir) : [],
    });
  const name = cleanText(process.env.SERVER_NAME, 80) || 'OpenRP | Union District';
  const password = options.password ?? process.env.SERVER_PASSWORD ?? '';
  const dist = resolve('dist');
  const mime: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.json': 'application/json',
    '.woff2': 'font/woff2',
    '.ico': 'image/x-icon',
  };
  let vite: ViteDevServer | undefined;
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    if (req.url?.split('?')[0] === '/api/status') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(
        JSON.stringify({
          name,
          map: 'Union District',
          version: VERSION,
          protocol: PROTOCOL,
          players: game.players.size,
          maxPlayers: game.options.maxPlayers,
          password: !!password,
        }),
      );
      return;
    }
    if (req.url === '/health') {
      res.end('ok');
      return;
    }
    if (!production && vite) {
      vite.middlewares(req, res);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      res.end();
      return;
    }
    try {
      const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
      const file = resolve(dist, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!file.startsWith(dist + sep)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      const info = await stat(file);
      if (!info.isFile()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const body = await readFile(file);
      res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
      res.setHeader(
        'Cache-Control',
        pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  if (!production) {
    const { createServer: createVite } = await import('vite');
    vite = await createVite({
      server: {
        port,
        strictPort: true,
        middlewareMode: true,
        hmr: { server, clientPort: port, path: '/__vite_hmr' },
      },
      appType: 'spa',
    });
  }
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8192, perMessageDeflate: false });
  const sessions = new Map<
    WebSocket,
    { id?: string; count: number; window: number; alive: boolean; ip: string }
  >();
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  server.on('upgrade', (req, socket, head) => {
    if (req.url?.split('?')[0] !== '/ws') {
      if (production) socket.destroy();
      return;
    }
    const origin = req.headers.origin;
    let sameHost = false;
    try {
      sameHost = !!origin && new URL(origin).host === req.headers.host;
    } catch {
      /* Invalid origins are rejected below. */
    }
    if (origin && !(allowedOrigins.length ? allowedOrigins.includes(origin) : sameHost)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    const ip = req.socket.remoteAddress ?? 'unknown';
    if (
      [...sessions.values()].filter((s) => s.ip === ip).length >= 8 ||
      sessions.size >= game.options.maxPlayers + 8
    ) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });
  function send(ws: WebSocket, value: unknown) {
    if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 1_000_000) ws.send(JSON.stringify(value));
  }
  game.onEvent = (event, recipient) => {
    for (const [ws, session] of sessions)
      if (session.id && (!recipient || recipient === session.id)) send(ws, event);
  };
  wss.on('connection', (ws, req) => {
    const session = {
      id: undefined as string | undefined,
      count: 0,
      window: Date.now(),
      alive: true,
      ip: req.socket.remoteAddress ?? 'unknown',
    };
    sessions.set(ws, session);
    const joinTimeout = setTimeout(() => {
      if (!session.id) ws.close(1008, 'Join timed out');
    }, 10_000);
    ws.on('pong', () => {
      session.alive = true;
    });
    ws.on('error', () => ws.close());
    ws.on('message', (raw, binary) => {
      if (binary) {
        ws.close(1003, 'Text JSON required');
        return;
      }
      const now = Date.now();
      if (now - session.window > 1000) {
        session.window = now;
        session.count = 0;
      }
      if (++session.count > 120) {
        ws.close(1008, 'Message rate exceeded');
        return;
      }
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
        if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') throw new Error();
      } catch {
        ws.close(1007, 'Invalid JSON message');
        return;
      }
      if (msg.type === 'join' && !session.id) {
        if (password && msg.password !== password) {
          send(ws, { type: 'notice', text: 'Incorrect server password.', tone: 'error' });
          ws.close(1008, 'Incorrect server password');
          return;
        }
        try {
          const joined = game.join(msg.name, msg.token);
          session.id = joined.player.id;
          clearTimeout(joinTimeout);
          send(ws, {
            type: 'welcome',
            id: session.id,
            token: joined.token,
            name: joined.player.name,
            serverName: name,
            maxPlayers: game.options.maxPlayers,
            protocol: PROTOCOL,
          });
          send(ws, game.snapshot());
        } catch (error) {
          send(ws, { type: 'notice', text: (error as Error).message, tone: 'error' });
          ws.close(1008, 'Join rejected');
        }
        return;
      }
      if (!session.id) return;
      if (msg.type === 'ping' && Number.isFinite(msg.time)) {
        send(ws, { type: 'pong', time: msg.time });
        return;
      }
      game.handle(session.id, msg);
    });
    ws.on('close', () => {
      clearTimeout(joinTimeout);
      if (session.id) game.disconnect(session.id);
      sessions.delete(ws);
    });
  });
  const tick = setInterval(() => game.step(), 1000 / TICK_RATE);
  const broadcast = setInterval(() => {
    const state = game.snapshot();
    for (const [ws, session] of sessions) if (session.id) send(ws, state);
  }, 1000 / SNAPSHOT_RATE);
  const heartbeat = setInterval(() => {
    for (const [ws, s] of sessions) {
      if (!s.alive || ws.bufferedAmount > 2_000_000) {
        ws.terminate();
        continue;
      }
      s.alive = false;
      ws.ping();
    }
  }, 15_000);
  const flush = () => {
    if (persist)
      try {
        saveProfiles(dataDir, game.exportProfiles());
      } catch (error) {
        console.error('Profile save failed:', (error as Error).message);
      }
  };
  const saving = setInterval(flush, 10_000);
  await new Promise<void>((ok, fail) => {
    server.once('error', fail);
    server.listen(port, host, () => {
      server.off('error', fail);
      ok();
    });
  });
  const actualPort = (server.address() as { port: number }).port;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    clearInterval(tick);
    clearInterval(broadcast);
    clearInterval(heartbeat);
    clearInterval(saving);
    flush();
    for (const ws of sessions.keys()) ws.terminate();
    await new Promise<void>((ok) => wss.close(() => ok()));
    await vite?.close();
    await new Promise<void>((ok) => server.close(() => ok()));
  };
  return { server, game, port: actualPort, close };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const app = await startServer();
  console.log(
    `\n  OpenRP · Union District\n  http://localhost:${app.port}\n  ${app.game.options.maxPlayers} slots · ${TICK_RATE} Hz server\n`,
  );
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      void app.close().then(() => process.exit(0));
    });
}
