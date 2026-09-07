import { createServer, type Server } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { WebSocketServer, WebSocket } from 'ws';
import type { ViteDevServer } from 'vite';
import { Game, cleanText } from './game.ts';
import { loadProfiles, loadWorld, saveWorld } from './persistence.ts';
import { clientIP, JoinRate } from './network.ts';
import { Moderation } from './moderation.ts';
import { VoiceRelay } from './voice.ts';
import { Observability } from './observability.ts';
import { PROTOCOL, SNAPSHOT_RATE, TICK_RATE, VERSION } from '../shared/catalog.ts';
import type { ClientMessage, Snapshot } from '../shared/types.ts';
import { makeDelta } from '../shared/replication.ts';

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
  adminKey?: string;
  analyticsReadKey?: string;
}
export async function startServer(
  options: ServerOptions = {},
): Promise<{ server: Server; game: Game; port: number; close: () => Promise<void> }> {
  const port = options.port ?? numeric(process.env.PORT, 3000, 1, 65535);
  const host = options.host ?? process.env.HOST ?? '0.0.0.0';
  const production = options.production ?? process.argv.includes('--production');
  const dataDir = resolve(options.dataDir ?? process.env.DATA_DIR ?? './data');
  const persist = options.persist !== false;
  const world = persist && !options.game ? loadWorld(dataDir) : undefined;
  const game =
    options.game ??
    new Game({
      startingMoney: numeric(process.env.STARTING_MONEY, 1500, 0, 1e7),
      salarySeconds: numeric(process.env.SALARY_SECONDS, 60, 5, 3600),
      jailSeconds: numeric(process.env.JAIL_SECONDS, 60, 5, 600),
      profiles: persist && !world ? loadProfiles(dataDir) : [],
      world,
    });
  // Migrate legacy wallets before admitting players; failed saves never create a blank world.
  if (persist) saveWorld(dataDir, game.exportWorld());
  let closed = false;
  const flush = () => {
    if (persist)
      try {
        saveWorld(dataDir, game.exportWorld());
      } catch (error) {
        console.error('World save failed:', (error as Error).message);
      }
  };
  const name = cleanText(process.env.SERVER_NAME, 80) || 'OpenRP | Union District';
  const password = options.password ?? process.env.SERVER_PASSWORD ?? '';
  const moderation = new Moderation(dataDir, persist, options.adminKey, options.analyticsReadKey);
  const voice = new VoiceRelay(game);
  const observations = await Observability.create({
    dataDir,
    persist,
    retentionDays: numeric(process.env.LOG_RETENTION_DAYS, 30, 1, 90),
  });
  const eventLoop = monitorEventLoopDelay({ resolution: 20 });
  eventLoop.enable();
  let tickCount = 0,
    tickTotal = 0,
    tickMax = 0,
    gameBytesOut = 0,
    gameBytesIn = 0;
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
    '.xml': 'application/xml',
    '.txt': 'text/plain; charset=utf-8',
  };
  let vite: ViteDevServer | undefined;
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Permissions-Policy', 'microphone=(self), camera=()');
    if (closed) {
      res.writeHead(503, { 'Retry-After': '5', 'Cache-Control': 'no-store' });
      res.end('Server restarting');
      return;
    }
    if (req.url?.split('?')[0].startsWith('/api/admin/')) {
      res.setHeader('Cache-Control', 'no-store');
      if (!moderation.authorized(req, true)) {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(401);
        res.end('{"error":"Unauthorized"}');
        return;
      }
      await observations.handle(req, res);
      return;
    }
    if (req.url?.split('?')[0] === '/api/admin') {
      await moderation.handle(
        req,
        res,
        game,
        (id, reason) => {
          for (const [ws, session] of sessions)
            if (session.id === id) {
              send(ws, { type: 'notice', text: `Removed by an operator: ${reason}`, tone: 'error' });
              observations.left(id, 'operator_removal');
              game.disconnect(id, true);
              voice.remove(id);
              session.id = undefined;
              ws.close(1008, 'Removed by an operator');
            }
        },
        flush,
      );
      return;
    }
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
          maxPlayers: null,
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
      if (req.method === 'GET' && req.url?.split('?')[0] === '/') observations.page(req.headers.referer);
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
      if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html'))
        observations.page(req.headers.referer);
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
    { id?: string; count: number; window: number; alive: boolean; ip: string; needsFull: boolean }
  >();
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const joinRate = new JoinRate();
  const proxy = process.env.TRUST_PROXY ?? 'none';
  server.on('upgrade', (req, socket, head) => {
    if (closed) {
      socket.destroy();
      return;
    }
    const path = req.url?.split('?')[0];
    if (path !== '/ws' && path !== '/voice') {
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
      observations.count('originRejections');
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    const ip = clientIP(req, proxy);
    if (path === '/voice') {
      voice.upgrade(req, socket, head, ip);
      return;
    }
    if ([...sessions.values()].filter((s) => !s.id && s.ip === ip).length >= 8 || !joinRate.allow(ip)) {
      observations.count('connectionRateRejections');
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });
  function send(ws: WebSocket, value: unknown) {
    if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 1_000_000) {
      const text = JSON.stringify(value);
      gameBytesOut += Buffer.byteLength(text);
      ws.send(text);
    }
  }
  game.onChat = (message) => observations.chat(message);
  game.onActivity = (activity) => observations.activity(activity);
  game.onEvent = (event, recipient) => {
    if (event.type === 'chat' && event.channel === 'system') observations.chat(event);
    for (const [ws, session] of sessions)
      if (session.id && (!recipient || recipient === session.id)) send(ws, event);
  };
  wss.on('connection', (ws, req) => {
    const session = {
      id: undefined as string | undefined,
      count: 0,
      window: Date.now(),
      alive: true,
      needsFull: true,
      ip: clientIP(req, proxy),
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
      if (closed) return;
      gameBytesIn += Array.isArray(raw) ? raw.reduce((n, b) => n + b.byteLength, 0) : raw.byteLength;
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
        observations.count('messageRateRejections');
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
        observations.count('joinAttempts');
        if (password && msg.password !== password) {
          observations.count('joinRejections');
          send(ws, { type: 'notice', text: 'Incorrect server password.', tone: 'error' });
          ws.close(1008, 'Incorrect server password');
          return;
        }
        try {
          const joined = game.join(msg.name, msg.token);
          if (moderation.banned(joined.player.id)) {
            game.disconnect(joined.player.id);
            throw new Error('This identity is banned from the server.');
          }
          session.id = joined.player.id;
          observations.joined(joined.player, joined.returning);
          clearTimeout(joinTimeout);
          flush();
          send(ws, {
            type: 'welcome',
            id: session.id,
            token: joined.token,
            name: joined.player.name,
            serverName: name,
            protocol: PROTOCOL,
            voiceTicket: voice.register(session.id),
          });
          send(ws, {
            type: 'notice',
            text: `Text chat is logged for ${observations.retentionDays} days for moderation. Details: community rules / privacy.`,
          });
        } catch (error) {
          observations.count('joinRejections');
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
    ws.on('close', (code) => {
      clearTimeout(joinTimeout);
      if (session.id) {
        observations.left(session.id, `socket_${code}`);
        voice.remove(session.id);
        game.disconnect(session.id);
        if (!closed) flush();
      }
      sessions.delete(ws);
    });
  });
  const tick = setInterval(() => {
    const start = performance.now();
    game.step();
    const elapsed = performance.now() - start;
    tickCount++;
    tickTotal += elapsed;
    tickMax = Math.max(tickMax, elapsed);
  }, 1000 / TICK_RATE);
  let lastSample = performance.now();
  const sample = () => {
    const now = performance.now(),
      elapsed = Math.max(0.001, (now - lastSample) / 1000);
    observations.sample(game.players.values(), {
      rssMiB: process.memoryUsage().rss / 1048576,
      tickMeanMs: tickTotal / Math.max(1, tickCount),
      tickMaxMs: tickMax,
      ticksPerSecond: tickCount / elapsed,
      eventLoopP99Ms: eventLoop.count ? eventLoop.percentile(99) / 1e6 : 0,
      gameBytesOut,
      gameBytesIn,
      sampleSeconds: elapsed,
      ...voice.metrics(true),
    });
    lastSample = now;
    tickCount = tickTotal = tickMax = gameBytesOut = gameBytesIn = 0;
    eventLoop.reset();
  };
  const sampling = setInterval(sample, 60_000);
  let previous: Snapshot | undefined;
  let lastFull = 0;
  const broadcast = setInterval(() => {
    if (!game.players.size) return;
    // Clone the mutable simulation, trim sub-millimeter noise, and share one encoded update.
    const full = JSON.stringify(game.snapshot(), (_key, value) =>
      typeof value === 'number' ? Math.round(value * 1000) / 1000 : value,
    );
    const current: Snapshot = JSON.parse(full);
    const resync = !previous || current.time - lastFull >= 5000;
    const update = resync ? full : JSON.stringify(makeDelta(previous!, current));
    const fullBytes = Buffer.byteLength(full),
      updateBytes = resync ? fullBytes : Buffer.byteLength(update);
    if (resync) lastFull = current.time;
    for (const [ws, session] of sessions)
      if (session.id && ws.readyState === WebSocket.OPEN) {
        if (ws.bufferedAmount >= 1_000_000) {
          session.needsFull = true;
          continue;
        }
        const payload = session.needsFull ? full : update;
        gameBytesOut += session.needsFull ? fullBytes : updateBytes;
        ws.send(payload);
        session.needsFull = false;
      }
    previous = current;
  }, 1000 / SNAPSHOT_RATE);
  const heartbeat = setInterval(() => {
    joinRate.prune();
    for (const [ws, s] of sessions) {
      if (!s.alive || ws.bufferedAmount > 2_000_000) {
        ws.terminate();
        continue;
      }
      s.alive = false;
      ws.ping();
    }
  }, 15_000);
  const saving = setInterval(flush, 10_000);
  await new Promise<void>((ok, fail) => {
    server.once('error', fail);
    server.listen(port, host, () => {
      server.off('error', fail);
      ok();
    });
  });
  const actualPort = (server.address() as { port: number }).port;
  const close = async () => {
    if (closed) return;
    closed = true;
    clearInterval(tick);
    clearInterval(broadcast);
    clearInterval(heartbeat);
    clearInterval(saving);
    clearInterval(sampling);
    sample();
    eventLoop.disable();
    flush();
    await observations.close();
    for (const ws of sessions.keys()) ws.terminate();
    await voice.close();
    await new Promise<void>((ok) => wss.close(() => ok()));
    await vite?.close();
    await new Promise<void>((ok) => server.close(() => ok()));
  };
  return { server, game, port: actualPort, close };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const app = await startServer();
  console.log(
    `\n  OpenRP · Union District\n  http://localhost:${app.port}\n  No player slot cap · ${TICK_RATE} Hz server\n`,
  );
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      void app.close().then(() => process.exit(0));
    });
}
