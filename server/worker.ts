import { DurableObject } from 'cloudflare:workers';
import { Game, cleanText } from './game.ts';
import { parseWorld, serializeWorld } from './persistence.ts';
import { clientIP, JoinRate } from './network.ts';
import { Accounts, profileForToken } from './accounts.ts';
import { Moderation } from './moderation.ts';
import { VoiceRelay } from './voice.ts';
import { Observability } from './observability.ts';
import { SqlFiles } from './sql-files.ts';
import { handleHttp } from './http.ts';
import { secretMatches } from './security.ts';
import { PROTOCOL, VERSION, TICK_RATE, SNAPSHOT_RATE } from '../shared/catalog.ts';
import { makeDelta } from '../shared/replication.ts';
import type { ClientMessage, Snapshot } from '../shared/types.ts';

// Bindings are generated; secret presence is optional at runtime and always checked.
type WorldEnv = Env & { ADMIN_TOKEN?: string; ANALYTICS_READ_TOKEN?: string; SERVER_PASSWORD?: string };
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
const numeric = (value: string | undefined, fallback: number, min: number, max: number) =>
  value && Number.isFinite(Number(value))
    ? Math.round(Math.max(min, Math.min(max, Number(value))))
    : fallback;
function allowedOrigin(request: Request, origins: string): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return (
      ['https:', 'http:'].includes(url.protocol) &&
      url.origin === origin &&
      (url.host === new URL(request.url).host ||
        origins
          .split(',')
          .map((s) => s.trim())
          .includes(origin))
    );
  } catch {
    return false;
  }
}
interface Session {
  id?: string;
  ip: string;
  count: number;
  window: number;
  lastSeen: number;
  needsFull: boolean;
  outbound: number;
  outboundAt: number;
  timeout: ReturnType<typeof setTimeout>;
}

export class World extends DurableObject<WorldEnv> {
  private game!: Game;
  private files: SqlFiles;
  private observations!: Observability;
  private moderation!: Moderation;
  private accounts!: Accounts;
  private voice!: VoiceRelay;
  private restoring = false;
  private accountRequests = 0;
  private moderationRequests = 0;
  private sessions = new Map<WebSocket, Session>();
  private joinRate = new JoinRate();
  private voiceRate = new JoinRate();
  private tick?: ReturnType<typeof setInterval>;
  private broadcast?: ReturnType<typeof setInterval>;
  private maintenance?: ReturnType<typeof setInterval>;
  private previous?: Snapshot;
  private lastFull = 0;
  private tickCount = 0;
  private tickTotal = 0;
  private tickMax = 0;
  private tickLagMax = 0;
  private bytesOut = 0;
  private bytesIn = 0;
  private lastSample = Date.now();

  constructor(ctx: DurableObjectState, env: WorldEnv) {
    super(ctx, env);
    this.files = new SqlFiles(this.ctx.storage);
    this.ctx.blockConcurrencyWhile(async () => {
      const names = await this.files.list();
      let world;
      if (names.includes('world')) {
        world = parseWorld(await this.files.read('world'));
      }
      this.game = new Game({
        startingMoney: numeric(this.env.STARTING_MONEY, 1500, 0, 1e7),
        salarySeconds: numeric(this.env.SALARY_SECONDS, 60, 5, 3600),
        jailSeconds: numeric(this.env.JAIL_SECONDS, 60, 5, 600),
        world,
      });
      const bans = names.includes('bans') ? JSON.parse(await this.files.read('bans')) : [];
      if (
        !Array.isArray(bans) ||
        bans.some((b) => !Array.isArray(b) || b.length !== 2 || b.some((v) => typeof v !== 'string'))
      )
        throw new Error('Invalid saved bans; restore a backup.');
      this.moderation = new Moderation(this.env.ADMIN_TOKEN, this.env.ANALYTICS_READ_TOKEN, bans, (saved) =>
        this.files.checkpoint('bans', JSON.stringify(saved)),
      );
      this.observations = await Observability.create({
        persist: true,
        files: this.files,
        maintenance: false,
        retentionDays: numeric(this.env.LOG_RETENTION_DAYS, 30, 1, 90),
      });
      this.voice = new VoiceRelay(this.game);
      this.accounts = new Accounts(
        this.game,
        () => this.checkpoint(),
        (id) => this.disconnect(id, 'Account session changed', false),
        (id) => this.moderation.banned(id),
      );
      this.game.onChat = (message) => this.observations.chat(message);
      this.game.onActivity = (activity) => this.observations.activity(activity);
      this.game.onEvent = (event, recipient) => {
        if (event.type === 'chat' && event.channel === 'system') this.observations.chat(event);
        for (const [ws, session] of this.sessions)
          if (session.id && (!recipient || recipient === session.id)) this.send(ws, event);
      };
      await this.observations.flush();
      await this.ctx.storage.setAlarm((Math.floor(Date.now() / 86_400_000) + 1) * 86_400_000 + 1000);
    });
  }
  private checkpoint() {
    this.files.checkpoint('world', serializeWorld(this.game.exportWorld()));
  }
  async alarm() {
    await this.observations.prune();
    await this.observations.flush();
    await this.ctx.storage.setAlarm((Math.floor(Date.now() / 86_400_000) + 1) * 86_400_000 + 1000);
  }
  private release(ws: WebSocket, reason = 'socket_closed', removeOwned = false) {
    const session = this.sessions.get(ws);
    if (!session) return;
    this.sessions.delete(ws);
    clearTimeout(session.timeout);
    if (session.id) {
      this.observations.left(session.id, reason);
      this.voice.remove(session.id);
      this.game.disconnect(session.id, removeOwned);
      session.id = undefined;
      this.checkpoint();
    }
    this.stopIfEmpty();
    this.ctx.waitUntil(this.observations.flush());
  }
  private closeGame(ws: WebSocket, code: number, reason: string) {
    // Release immediately: an unresponsive peer may never acknowledge the close handshake.
    this.release(ws);
    try {
      ws.close(code, reason);
    } catch {
      /* Transport already gone. */
    }
  }
  private disconnect(id: string, reason: string, removeOwned = true) {
    for (const [ws, session] of this.sessions)
      if (session.id === id) {
        this.send(ws, { type: 'notice', text: reason, tone: 'error' });
        this.release(ws, 'operator_or_account_removal', removeOwned);
        // The full operator reason is in the notice; WebSocket reasons are limited to 123 bytes.
        this.closeGame(ws, 1008, 'Session ended');
      }
  }
  private allowDelivery(session: Session, bytes: number): boolean {
    const now = Date.now();
    session.outbound = Math.min(1_000_000, session.outbound + (now - session.outboundAt) * 1000);
    session.outboundAt = now;
    if (bytes > session.outbound) {
      session.needsFull = true;
      return false;
    }
    session.outbound -= bytes;
    return true;
  }
  private send(ws: WebSocket, value: unknown) {
    if (ws.readyState !== 1) return;
    try {
      const text = JSON.stringify(value);
      const bytes = new TextEncoder().encode(text).byteLength,
        session = this.sessions.get(ws);
      if (session && !this.allowDelivery(session, bytes)) {
        this.closeGame(ws, 1008, 'Outbound rate exceeded');
        return;
      }
      this.bytesOut += bytes;
      ws.send(text);
    } catch {
      this.closeGame(ws, 1011, 'Send failed');
    }
  }
  private start() {
    if (this.tick) return;
    // Standard accept(), not hibernation: the authoritative 30 Hz simulation needs a live instance.
    // Timers run only while residents are joined. Durable storage checkpoints bound replay loss.
    let lastTick = Date.now();
    this.tick = setInterval(() => {
      const now = Date.now();
      this.tickLagMax = Math.max(this.tickLagMax, Math.max(0, now - lastTick - 1000 / TICK_RATE));
      lastTick = now;
      const begin = performance.now();
      this.game.step();
      const elapsed = performance.now() - begin;
      this.tickCount++;
      this.tickTotal += elapsed;
      this.tickMax = Math.max(this.tickMax, elapsed);
    }, 1000 / TICK_RATE);
    this.broadcast = setInterval(() => this.snapshot(), 1000 / SNAPSHOT_RATE);
    this.lastSample = Date.now();
    this.maintenance = setInterval(() => {
      this.checkpoint();
      this.joinRate.prune();
      this.voiceRate.prune();
      const now = Date.now();
      for (const [ws, s] of this.sessions)
        if (now - s.lastSeen > 30_000) this.closeGame(ws, 1008, 'Heartbeat timed out');
      this.sample();
      this.ctx.waitUntil(this.observations.flush());
    }, 3000);
  }
  private sample() {
    const seconds = Math.max(0.001, (Date.now() - this.lastSample) / 1000);
    this.observations.sample(this.game.players.values(), {
      tickMeanMs: this.tickTotal / Math.max(1, this.tickCount),
      tickMaxMs: this.tickMax,
      tickLagMaxMs: this.tickLagMax,
      ticksPerSecond: this.tickCount / seconds,
      gameBytesOut: this.bytesOut,
      gameBytesIn: this.bytesIn,
      sampleSeconds: seconds,
      ...this.voice.metrics(true),
    });
    this.lastSample = Date.now();
    this.tickCount = this.tickTotal = this.tickMax = this.tickLagMax = this.bytesOut = this.bytesIn = 0;
  }
  private stopIfEmpty() {
    if (this.game.players.size || !this.tick) return;
    clearInterval(this.tick);
    clearInterval(this.broadcast);
    clearInterval(this.maintenance);
    this.tick = this.broadcast = this.maintenance = undefined;
    this.previous = undefined;
    this.sample();
    this.checkpoint();
    this.ctx.waitUntil(this.observations.flush());
  }
  private snapshot() {
    if (!this.game.players.size) return;
    const full = JSON.stringify(this.game.snapshot(), (_key, value) =>
      typeof value === 'number' ? Math.round(value * 1000) / 1000 : value,
    );
    const current: Snapshot = JSON.parse(full);
    const resync = !this.previous || current.time - this.lastFull >= 5000;
    const delta = resync ? full : JSON.stringify(makeDelta(this.previous!, current));
    const encoder = new TextEncoder();
    const fullBytes = encoder.encode(full).byteLength,
      deltaBytes = encoder.encode(delta).byteLength;
    if (resync) this.lastFull = current.time;
    for (const [ws, session] of this.sessions)
      if (session.id && ws.readyState === 1) {
        // Workers exposes no bufferedAmount. Bound unacknowledged delivery using the existing
        // client's regular input/ping traffic; stop sending after 5s silence, disconnect at 30s.
        // This is a liveness bound, not a measurement of the network's outbound queue.
        if (Date.now() - session.lastSeen > 5000) {
          session.needsFull = true;
          continue;
        }
        const payload = session.needsFull ? full : delta;
        const bytes = session.needsFull ? fullBytes : deltaBytes;
        if (!this.allowDelivery(session, bytes)) continue;
        try {
          ws.send(payload);
          this.bytesOut += bytes;
          session.needsFull = false;
        } catch {
          this.closeGame(ws, 1011, 'Snapshot send failed');
        }
      }
    this.previous = current;
  }
  private connectGame(ws: WebSocket, ip: string) {
    const session: Session = {
      ip,
      count: 0,
      window: Date.now(),
      lastSeen: Date.now(),
      needsFull: true,
      outbound: 1_000_000,
      outboundAt: Date.now(),
      timeout: setTimeout(() => {
        if (!session.id) this.closeGame(ws, 1008, 'Join timed out');
      }, 10_000),
    };
    this.sessions.set(ws, session);
    ws.addEventListener('message', (event) => {
      if (!this.sessions.has(ws)) return;
      if (typeof event.data !== 'string') {
        this.closeGame(ws, 1003, 'Text JSON required');
        return;
      }
      const bytes = new TextEncoder().encode(event.data).byteLength;
      if (bytes > 8192) {
        this.closeGame(ws, 1009, 'Message too large');
        return;
      }
      this.bytesIn += bytes;
      const now = Date.now();
      if (now - session.window >= 1000) {
        session.window = now;
        session.count = 0;
      }
      if (++session.count > 120) {
        this.observations.count('messageRateRejections');
        this.closeGame(ws, 1008, 'Message rate exceeded');
        return;
      }
      let msg: ClientMessage;
      try {
        msg = JSON.parse(event.data);
        if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') throw new Error();
      } catch {
        this.closeGame(ws, 1007, 'Invalid JSON message');
        return;
      }
      session.lastSeen = now;
      if (msg.type === 'join' && !session.id) {
        this.observations.count('joinAttempts');
        if (
          this.env.SERVER_PASSWORD &&
          !secretMatches(typeof msg.password === 'string' ? msg.password : '', this.env.SERVER_PASSWORD)
        ) {
          this.observations.count('joinRejections');
          this.send(ws, { type: 'notice', text: 'Incorrect server password.', tone: 'error' });
          this.closeGame(ws, 1008, 'Incorrect server password');
          return;
        }
        try {
          if (msg.account && !profileForToken(this.game, msg.token)?.account)
            throw new Error('Your account session expired. Sign in with your username and password.');
          const joined = this.game.join(msg.name, msg.token);
          if (this.moderation.banned(joined.player.id)) {
            this.game.disconnect(joined.player.id);
            throw new Error('This identity is banned from the server.');
          }
          session.id = joined.player.id;
          clearTimeout(session.timeout);
          this.observations.joined(joined.player, joined.returning);
          this.checkpoint();
          this.start();
          this.send(ws, {
            type: 'welcome',
            id: session.id,
            token: joined.token,
            name: joined.player.name,
            serverName: cleanText(this.env.SERVER_NAME, 80),
            protocol: PROTOCOL,
            voiceTicket: this.voice.register(session.id),
            username: profileForToken(this.game, joined.token)?.account?.username,
          });
          this.send(ws, {
            type: 'notice',
            text: `Text chat is logged for ${this.observations.retentionDays} days for moderation. Details: community rules / privacy.`,
          });
        } catch (error) {
          this.observations.count('joinRejections');
          this.send(ws, { type: 'notice', text: (error as Error).message, tone: 'error' });
          this.closeGame(ws, 1008, 'Join rejected');
        }
        return;
      }
      if (!session.id) return;
      if (msg.type === 'ping' && Number.isFinite(msg.time)) {
        this.send(ws, { type: 'pong', time: msg.time });
        return;
      }
      this.game.handle(session.id, msg);
    });
    ws.addEventListener('close', () => this.closeGame(ws, 1000, 'Connection closed'));
    ws.addEventListener('error', () => this.closeGame(ws, 1011, 'Connection failed'));
  }

  async fetch(request: Request): Promise<Response> {
    try {
      return await this.route(request);
    } catch {
      console.error(JSON.stringify({ event: 'request_failed', path: new URL(request.url).pathname }));
      return json({ error: 'World request failed' }, 500);
    } finally {
      if (request.body && !request.body.locked) await request.body.cancel().catch(() => {});
    }
  }
  private async route(request: Request): Promise<Response> {
    const url = new URL(request.url),
      path = url.pathname,
      ip = clientIP(request);
    if (
      this.restoring &&
      (path === '/ws' ||
        path === '/voice' ||
        path === '/api/account' ||
        (path.startsWith('/api/admin') && request.method !== 'GET'))
    )
      return json({ error: 'World restore in progress' }, 503);
    if (path === '/health') return new Response('ok');
    if (path === '/api/status')
      return json({
        name: cleanText(this.env.SERVER_NAME, 80),
        map: 'Union District',
        version: VERSION,
        protocol: PROTOCOL,
        players: this.game.players.size,
        maxPlayers: null,
        password: !!this.env.SERVER_PASSWORD,
        accounts: true,
      });
    if (path === '/api/account') {
      if (!allowedOrigin(request, this.env.ALLOWED_ORIGINS) || url.search)
        return json({ error: 'Account requests must use this server’s page.' }, 403);
      this.accountRequests++;
      try {
        const response = await handleHttp(request, (req, res) =>
          this.accounts.handle(req, res, ip, () => !request.signal.aborted),
        );
        this.ctx.waitUntil(this.observations.flush());
        return response;
      } finally {
        this.accountRequests--;
      }
    }
    if (path === '/api/admin' || path.startsWith('/api/admin/')) {
      const read = path !== '/api/admin' && !['/api/admin/world'].includes(path);
      if (!this.env.ADMIN_TOKEN && !(read && this.env.ANALYTICS_READ_TOKEN))
        return json(
          {
            error:
              'Operator access is not configured. Set ADMIN_TOKEN or ANALYTICS_READ_TOKEN for read-only logs.',
          },
          503,
        );
      const candidate = request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
      if (!(
        secretMatches(candidate, this.env.ADMIN_TOKEN) ||
        (read && secretMatches(candidate, this.env.ANALYTICS_READ_TOKEN))
      ))
        return json({ error: 'Unauthorized' }, 401);
      if (path === '/api/admin/world') {
        if (request.method === 'GET') return json(this.game.exportWorld());
        if (request.method !== 'POST') return json({ error: 'Use GET or POST' }, 405);
        if (this.game.players.size || this.sessions.size || this.accountRequests || this.moderationRequests)
          return json(
            {
              error: 'Restore requires no connected gameplay sockets or pending account/moderation requests.',
            },
            409,
          );
        // Bounded streaming body, including saves larger than the per-value storage limit.
        const reader = request.body?.getReader();
        if (!reader) return json({ error: 'Send a world.json backup' }, 400);
        this.restoring = true;
        let expired = false;
        const deadline = setTimeout(() => {
          expired = true;
          void reader.cancel().catch(() => {});
        }, 10_000);
        const parts: Uint8Array[] = [];
        let length = 0;
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            length += part.value.length;
            if (length > 32 * 1024 * 1024) {
              await reader.cancel();
              return json({ error: 'Backup exceeds 32 MiB restore limit' }, 413);
            }
            parts.push(part.value);
          }
          if (expired) return json({ error: 'Backup upload timed out' }, 408);
          const bytes = new Uint8Array(length);
          let offset = 0;
          for (const part of parts) {
            bytes.set(part, offset);
            offset += part.length;
          }
          const world = parseWorld(new TextDecoder().decode(bytes));
          // Validate and construct before touching the durable checkpoint.
          const replacement = new Game({ ...this.game.options, world });
          this.files.checkpoint('world', JSON.stringify(world));
          const onChat = this.game.onChat,
            onEvent = this.game.onEvent,
            onActivity = this.game.onActivity;
          this.game = replacement;
          this.game.onChat = onChat;
          this.game.onEvent = onEvent;
          this.game.onActivity = onActivity;
          this.voice.close();
          this.voice = new VoiceRelay(this.game);
          this.accounts = new Accounts(
            this.game,
            () => this.checkpoint(),
            (id) => this.disconnect(id, 'Account session changed', false),
            (id) => this.moderation.banned(id),
          );
          this.observations.event('world_restore', {
            profiles: world.profiles.length,
            entities: world.entities.length,
          });
          this.ctx.waitUntil(this.observations.flush());
          return json({ ok: true });
        } catch (error) {
          return json({ error: (error as Error).message }, 400);
        } finally {
          clearTimeout(deadline);
          reader.releaseLock();
          this.restoring = false;
        }
      }
      this.moderationRequests++;
      try {
        const response = await handleHttp(request, (req, res) =>
          path === '/api/admin'
            ? this.moderation.handle(
                req,
                res,
                this.game,
                (id, reason) => this.disconnect(id, reason),
                () => this.checkpoint(),
              )
            : this.observations.handle(req, res),
        );
        this.ctx.waitUntil(this.observations.flush());
        return response;
      } finally {
        this.moderationRequests--;
      }
    }
    if (path === '/ws' || path === '/voice') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
        return json({ error: 'WebSocket upgrade required' }, 426);
      if (!allowedOrigin(request, this.env.ALLOWED_ORIGINS)) {
        this.observations.count('originRejections');
        return json({ error: 'Origin rejected' }, 403);
      }
      const voice = path === '/voice';
      const pending = voice
        ? this.voice.pending(ip)
        : [...this.sessions.values()].filter((s) => !s.id && s.ip === ip).length;
      this.joinRate.prune();
      this.voiceRate.prune();
      if (pending >= 8 || !(voice ? this.voiceRate : this.joinRate).allow(ip)) {
        this.observations.count('connectionRateRejections');
        return json({ error: 'Connection rate exceeded' }, 429);
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.binaryType = 'arraybuffer';
      server.accept();
      if (voice) {
        this.voice.connect(server, ip);
      } else this.connectGame(server, ip);
      return new Response(null, { status: 101, webSocket: client });
    }
    // These pages run Worker-first to retain page/referrer analytics (not for SPA routing).
    if (path === '/' || path === '/index.html') {
      const response = await this.env.ASSETS.fetch(request);
      if (request.method === 'GET' && response.ok) {
        this.observations.page(request.headers.get('Referer') ?? undefined);
        this.ctx.waitUntil(this.observations.flush());
      }
      return response;
    }
    return json({ error: 'Not found' }, 404);
  }
}

export default {
  async fetch(request: Request, env: WorldEnv, ctx: ExecutionContext): Promise<Response> {
    try {
      const path = new URL(request.url).pathname;
      // Keep the ingress upload alive until forwarding settles, even when the object
      // rejects authorization before consuming the body. Cancellation stops the pump.
      if (request.body) {
        const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
        ctx.waitUntil(request.body.pipeTo(writable).catch(() => {}));
        request = new Request(request, { body: readable });
      }
      const response =
        ['/', '/index.html', '/ws', '/voice', '/health'].includes(path) || path.startsWith('/api/')
          ? await env.WORLD.get(env.WORLD.idFromName('official')).fetch(request)
          : await env.ASSETS.fetch(request);
      if (response.status === 101) return response;
      const secured = new Response(response.body, response);
      secured.headers.set('X-Content-Type-Options', 'nosniff');
      secured.headers.set('Referrer-Policy', 'same-origin');
      secured.headers.set('X-Frame-Options', 'SAMEORIGIN');
      secured.headers.set('Permissions-Policy', 'microphone=(self), camera=()');
      return secured;
    } catch {
      console.error(JSON.stringify({ event: 'worker_request_failed' }));
      return json({ error: 'World unavailable' }, 503);
    }
  },
} satisfies ExportedHandler<WorldEnv>;
