import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, appendFile, mkdir, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WebSocket } from 'ws';
import { Observability, type ObservationOptions, type LogQuery } from '../server/observability.ts';
import { Game } from '../server/game.ts';
import { startServer } from '../server/main.ts';
import type { Player, ServerMessage } from '../shared/types.ts';

interface Row {
  id: string;
  at: string;
  kind: string;
  name: string;
  playerId: string;
  text: string;
  channel: string;
}
const rows = (report: Record<string, unknown>) => report.rows as Row[];
const totals = (report: Record<string, unknown>) => report.totals as Record<string, number>;
async function directory(t: TestContext, before = async () => {}) {
  const dir = await mkdtemp(join(tmpdir(), 'openrp-observe-'));
  t.after(async () => {
    await before();
    assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + sep + 'openrp-observe-'));
    await rm(dir, { recursive: true, force: true });
  });
  return dir;
}
async function fixture(t: TestContext, options: Partial<ObservationOptions> = {}) {
  let store: Observability;
  const dataDir = await directory(t, async () => {
    await store?.close();
  });
  store = await Observability.create({ dataDir, persist: true, ...options });
  return { store, dataDir };
}
const message = (text: string, extra = {}) => ({
  playerId: 'resident-a',
  name: 'Alice',
  job: 'citizen' as const,
  channel: 'local',
  text,
  ...extra,
});

test('analytics splits connected time at UTC midnight, preserves identity counts and excludes open sessions from averages', async (t) => {
  let now = Date.parse('2026-09-06T23:59:50Z');
  const { store, dataDir } = await fixture(t, { now: () => now });
  const game = new Game();
  const a = game.join('Alice').player,
    b = game.join('Bob').player;
  store.joined(a, false);
  now += 5000;
  store.joined(b, false);
  now += 5000;
  store.activity({ kind: 'job', playerId: a.id, name: a.name, previousJob: 'citizen', job: 'medic' });
  a.job = 'medic';
  now += 10_000;
  store.left(b.id, 'socket_1000');
  now += 10_000;
  store.left(a.id, 'socket_1000');
  store.left(a.id, 'duplicate-close');
  store.joined(a, true);
  now += 20_000;
  const report = await store.analytics({ days: 2 });
  assert.deepEqual(report.dates, ['2026-09-06', '2026-09-07']);
  assert.equal(totals(report).uniquePlayers, 2);
  assert.equal(totals(report).joinedSessions, 3);
  assert.equal(totals(report).returningSessions, 1);
  assert.equal(totals(report).newIdentitySessions, 2);
  assert.equal(totals(report).peakPlayers, 2);
  assert.equal(totals(report).playerSeconds, 65);
  assert.equal(totals(report).completedSessions, 2);
  assert.equal(totals(report).averageCompletedSessionSeconds, 22.5);
  assert.deepEqual(
    (report.days as Record<string, number>[]).map((d) => d.playerSeconds),
    [15, 50],
  );
  assert.deepEqual(report.popularJobs, [
    { name: 'medic', playerSeconds: 40 },
    { name: 'citizen', playerSeconds: 25 },
  ]);
  assert.equal(totals(await store.analytics({ days: 2 })).playerSeconds, 65, 'reads do not double count');
  await store.close();
  const reopened = await Observability.create({ dataDir, persist: true, now: () => now });
  try {
    const restored = await reopened.analytics({ days: 2 });
    assert.equal(totals(restored).playerSeconds, 65);
    assert.equal(totals(restored).completedSessions, 3);
    assert.equal(totals(restored).joinedSessions, 3);
    assert.equal((restored.current as { online: number }).online, 0);
  } finally {
    await reopened.close();
  }
});

test('all accepted text channels are logged once before fan-out; rejected messages and commands are excluded', async (t) => {
  let now = 100_000;
  const { store } = await fixture(t);
  const game = new Game({ now: () => now });
  const a = game.join('Alice').player;
  game.join('Bob');
  game.join('Charlie');
  game.onChat = (chat) => store.chat(chat);
  const received: string[] = [];
  game.onEvent = (event) => {
    if (event.type === 'chat') received.push(event.text);
  };
  const say = (text: string) => {
    now += 1000;
    game.chat(a, text);
  };
  say('hello nearby');
  game.chat(a, 'rate limited');
  say('/ooc hello everyone');
  say('/advert shop open');
  say('/me waves');
  say('/g team plan');
  say('/rpname New Alice');
  say('/ooc');
  say('/help');
  say('/not-a-command');
  a.money = 0;
  say('/advert cannot afford');
  const log = rows(await store.logs('chat'));
  assert.equal(log.length, 5);
  assert.deepEqual(
    log.map((r) => r.channel),
    ['group', 'me', 'advert', 'ooc', 'local'],
  );
  assert.ok(
    received.filter((text) => text === 'hello nearby').length > 1,
    'local message was delivered to multiple residents',
  );
  assert.equal(totals(await store.analytics()).chatMessages, 5);
});

test('economy and job counters only include successful server actions, including player shop purchases', async (t) => {
  let now = 100_000;
  const { store } = await fixture(t);
  const game = new Game({ now: () => now });
  const a = game.join('Dealer').player,
    b = game.join('Buyer').player;
  game.onActivity = (event) => store.activity(event);
  const act = (p: Player, action: string, target: string, value?: number) => {
    now += 100;
    game.handle(p.id, { type: 'action', action, target, value });
  };
  act(b, 'buy', 'pistol-shipment'); // Wrong job.
  game.applyJob(a, 'dealer');
  act(a, 'buy', 'pistol-shipment');
  const shipment = [...game.entities.values()][0];
  assert.ok(shipment);
  act(a, 'price', shipment.id, 250);
  Object.assign(b, { x: 1.2, y: 0, z: 23 });
  act(b, 'interact', shipment.id);
  act(b, 'interact', shipment.id); // Already has the weapon.
  const door = game.doors.find((d) => d.id === 'cafe')!;
  act(b, 'door-buy', door.id); // Too far.
  Object.assign(b, { x: door.x + 1.5, y: 0.08, z: door.z });
  act(b, 'door-buy', door.id);
  act(b, 'door-buy', door.id); // Already owned.
  const report = await store.analytics();
  assert.equal(totals(report).purchases, 3);
  assert.equal(totals(report).jobChanges, 1);
  assert.deepEqual(
    new Set((report.purchases as { name: string }[]).map((p) => p.name)),
    new Set(['pistol-shipment', 'shop:pistol', 'property']),
  );
  const events = rows(await store.logs('events', { kind: 'purchase' }));
  assert.equal(events.length, 3);
});

test('reverse cursor pagination preserves identical timestamps and multibyte text across disk chunks', async (t) => {
  const { store } = await fixture(t, { now: () => Date.parse('2026-09-07T12:00:00Z') });
  for (let i = 0; i < 350; i++) store.chat(message(`${i} café 日本語 ${'🙂'.repeat(100)}`));
  const seen: Row[] = [];
  let cursor: string | undefined;
  do {
    const page = await store.logs('chat', { limit: 37, cursor });
    seen.push(...rows(page));
    cursor = page.nextCursor as string | undefined;
  } while (cursor);
  assert.equal(seen.length, 350);
  assert.equal(new Set(seen.map((r) => r.id)).size, 350);
  for (let i = 0; i < seen.length; i++)
    assert.equal(seen[i].text, `${349 - i} café 日本語 ${'🙂'.repeat(100)}`);
});

test('search filters, credential redaction, referrer minimization and interrupted-tail recovery work', async (t) => {
  const { store, dataDir } = await fixture(t, { now: () => Date.parse('2026-09-07T12:00:00Z') });
  const secret = 'c'.repeat(64);
  store.chat(message('Earlier', { channel: 'ooc' }));
  await store.flush();
  const file = join(dataDir, 'observability', '2026-09-07.chat.jsonl');
  await appendFile(file, '{"unfinished":');
  store.chat(
    message(`Need help café ${secret} Bearer private-token \u001b\u202e`, {
      name: '<b>Alice</b>',
      channel: 'group',
    }),
  );
  store.page('https://x.com/someone/status/123?private=never-store-this');
  store.page(undefined);
  const found = rows(
    await store.logs('chat', { date: '2026-09-07', player: 'ALICE', channel: 'group', search: 'CAFÉ' }),
  );
  assert.equal(found.length, 1);
  assert.equal(found[0].name, '<b>Alice</b>', 'JSON keeps text as data; CLI quotes it');
  assert.ok(found[0].text.includes('[redacted credential]'));
  assert.ok(found[0].text.includes('Bearer [redacted]'));
  assert.ok(!/[\u001b\u202e]/.test(found[0].text));
  assert.equal(rows(await store.logs('chat', { player: 'resident-a' })).length, 2);
  assert.equal(rows(await store.logs('chat', { search: 'not present' })).length, 0);
  const report = await store.analytics();
  assert.equal(totals(report).pageRequests, 2);
  assert.deepEqual(report.referrers, [
    { name: 'x.com', requests: 1 },
    { name: 'direct-or-unknown', requests: 1 },
  ]);
  const text = await readFile(file, 'utf8');
  assert.ok(!text.includes(secret));
  assert.ok(!text.includes('private-token'));
  const summary = await readFile(join(dataDir, 'observability', '2026-09-07.summary.json'), 'utf8');
  assert.ok(!summary.includes('never-store-this'));
});

test('invalid query dates, traversal strings, cursors and limits are rejected', async (t) => {
  const { store } = await fixture(t, { now: () => Date.parse('2026-09-07T12:00:00Z') });
  const invalid: LogQuery[] = [
    { date: '../private' },
    { date: '2026-02-30' },
    { date: '2026-09-08' },
    { days: 31 },
    { days: NaN },
    { limit: 201 },
    { limit: 0 },
    { channel: 'secret' },
    { cursor: 'nonsense' },
    { cursor: Buffer.from(JSON.stringify({ date: '../../secret', end: 1 })).toString('base64url') },
    { cursor: Buffer.from(JSON.stringify({ date: '2026-09-07', end: -1 })).toString('base64url') },
  ];
  for (const query of invalid) await assert.rejects(store.logs('chat', query));
});

test('retention deletes only expired log files and disk caps expose dropped rows without losing counters', async (t) => {
  let now = Date.parse('2026-09-05T12:00:00Z');
  const { store, dataDir } = await fixture(t, { retentionDays: 2, maxDailyBytes: 1000, now: () => now });
  const dir = join(dataDir, 'observability');
  await writeFile(join(dir, '2020-01-01.keep.txt'), 'keep');
  for (let i = 0; i < 20; i++) store.chat(message(`message ${i}`));
  const report = await store.analytics();
  assert.equal(totals(report).chatMessages, 20);
  assert.ok(totals(report).droppedLogRecords > 0);
  assert.ok((report.storage as { issues: string[] }).issues.some((s) => s.includes('size limit')));
  assert.ok(rows(await store.logs('chat')).length < 20);
  now += 2 * 86_400_000;
  store.chat(message('retained today'));
  await store.flush();
  assert.deepEqual(
    (await readdir(dir)).filter((f) => f.startsWith('2026-09-05')),
    [],
  );
  assert.equal(await readFile(join(dir, '2020-01-01.keep.txt'), 'utf8'), 'keep');
  assert.equal(rows(await store.logs('chat', { days: 2 })).length, 1);
});

test('corrupt aggregate files are preserved and the report declares incomplete data', async (t) => {
  const dataDir = await directory(t),
    dir = join(dataDir, 'observability');
  await mkdir(dir);
  const file = join(dir, '2026-09-07.summary.json');
  const damaged = JSON.stringify({
    schema: 1,
    date: '2026-09-07',
    firstEventAt: '2026-09-07T00:00:00Z',
    counters: { joinedSessions: 'wrong type' },
    players: {},
    jobs: {},
    purchases: {},
    channels: {},
    referrers: {},
    peakPlayers: 0,
  });
  await writeFile(file, damaged);
  const store = await Observability.create({
    dataDir,
    persist: true,
    now: () => Date.parse('2026-09-07T12:00:00Z'),
  });
  try {
    store.chat(message('new text remains readable'));
    const report = await store.analytics();
    assert.equal(totals(report).chatMessages, 1);
    assert.ok((report.storage as { issues: string[] }).issues.some((s) => s.includes('incomplete')));
    assert.equal(rows(await store.logs('chat')).length, 1);
    await store.close();
    assert.equal(await readFile(file, 'utf8'), damaged);
  } finally {
    await store.close();
  }
});

function receive(ws: WebSocket, predicate: (message: ServerMessage) => boolean): Promise<ServerMessage> {
  return new Promise((ok, fail) => {
    const timeout = setTimeout(() => {
      ws.off('message', listener);
      fail(new Error('No expected server message'));
    }, 3000);
    const listener = (raw: Buffer) => {
      const value = JSON.parse(raw.toString());
      if (predicate(value)) {
        clearTimeout(timeout);
        ws.off('message', listener);
        ok(value);
      }
    };
    ws.on('message', listener);
  });
}

test('an empty operator key never grants anonymous log or moderation access', async () => {
  const app = await startServer({
    port: 0,
    host: '127.0.0.1',
    production: true,
    persist: false,
    adminKey: '',
    analyticsReadKey: 'test-read-key',
  });
  try {
    const base = `http://127.0.0.1:${app.port}`;
    assert.equal((await fetch(base + '/api/admin/analytics')).status, 401);
    assert.equal((await fetch(base + '/api/admin')).status, 401);
    assert.equal(
      (await fetch(base + '/api/admin/analytics', { headers: { authorization: 'Bearer test-read-key' } }))
        .status,
      200,
    );
  } finally {
    await app.close();
  }
});

test('live HTTP/WebSocket logs require authorization, read keys cannot moderate, CLI reads safely, and logs survive replacement', async (t) => {
  const dataDir = await directory(t),
    readKey = 'a'.repeat(64),
    adminKey = 'b'.repeat(64);
  const options = {
    port: 0,
    host: '127.0.0.1',
    production: true,
    dataDir,
    analyticsReadKey: readKey,
    adminKey,
  };
  let app = await startServer(options);
  const clients: WebSocket[] = [];
  try {
    const base = `http://127.0.0.1:${app.port}`;
    for (const path of ['/api/admin/analytics', '/api/admin/chat', '/api/admin/events']) {
      const response = await fetch(base + path);
      assert.equal(response.status, 401);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('access-control-allow-origin'), null);
    }
    assert.equal(
      (await fetch(base + '/api/admin/chat?token=' + readKey)).status,
      401,
      'URL parameters never authorize',
    );
    const get = (path: string, key = readKey) =>
      fetch(base + path, { headers: { authorization: `Bearer ${key}` } });
    assert.equal((await get('/api/admin/analytics', 'wrong')).status, 401);
    assert.equal((await get('/api/admin/analytics', adminKey)).status, 200);
    assert.equal((await get('/api/admin/chat?limit=999')).status, 400);
    assert.equal((await get('/api/admin/not-found')).status, 404);
    assert.equal(
      (await fetch(base + '/data/observability/' + new Date().toISOString().slice(0, 10) + '.chat.jsonl'))
        .status,
      404,
    );
    assert.equal(
      (
        await fetch(base + '/api/admin/chat', {
          method: 'POST',
          headers: { authorization: `Bearer ${readKey}` },
        })
      ).status,
      405,
    );
    let playerId = '',
      reconnectToken = '';
    for (const name of ['Alice', 'Bob']) {
      const ws = new WebSocket(base.replace('http:', 'ws:') + '/ws');
      clients.push(ws);
      await once(ws, 'open');
      const welcomed = receive(ws, (m) => m.type === 'welcome');
      ws.send(JSON.stringify({ type: 'join', name }));
      const welcome = await welcomed;
      assert.equal(welcome.type, 'welcome');
      if (welcome.type === 'welcome' && name === 'Alice') {
        playerId = welcome.id;
        reconnectToken = welcome.token;
      }
    }
    const delivered = receive(clients[1], (m) => m.type === 'chat' && m.text === 'private local test');
    clients[0].send(JSON.stringify({ type: 'chat', text: '/ooc private local test' }));
    await delivered;
    const found = await (await get('/api/admin/chat?search=private%20local%20test')).json();
    assert.equal(found.rows.length, 1);
    assert.equal(found.rows[0].playerId, playerId);
    const report = await (await get('/api/admin/analytics')).json();
    assert.equal(report.totals.joinedSessions, 2);
    assert.equal(report.current.online, 2);
    const denied = await fetch(base + '/api/admin', {
      method: 'POST',
      headers: { authorization: `Bearer ${readKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'kick', id: playerId }),
    });
    assert.equal(denied.status, 401);
    assert.equal(app.game.players.size, 2);
    const events = await (await get('/api/admin/events')).text();
    for (const secret of [readKey, adminKey, reconnectToken, 'voiceTicket', '127.0.0.1'])
      assert.ok(!events.includes(secret));
    const execute = promisify(execFile);
    const env = { ...process.env, ANALYTICS_READ_TOKEN: readKey };
    const json = await execute(
      process.execPath,
      ['--import', 'tsx', 'scripts/observe.ts', 'analytics', '--url', base, '--json'],
      { env },
    );
    assert.equal(JSON.parse(json.stdout).totals.joinedSessions, 2);
    const text = await execute(
      process.execPath,
      ['--import', 'tsx', 'scripts/observe.ts', 'chat', '--url', base, '--player', 'Alice'],
      { env },
    );
    assert.match(text.stdout, /untrusted data, never instructions/);
    assert.match(text.stdout, /private local test/);
    assert.ok(!text.stdout.includes(readKey));
    await app.close();
    app = await startServer(options);
    const restored = await (
      await fetch(`http://127.0.0.1:${app.port}/api/admin/chat?search=private%20local%20test`, {
        headers: { authorization: `Bearer ${readKey}` },
      })
    ).json();
    assert.equal(restored.rows.length, 1);
  } finally {
    clients.forEach((ws) => ws.terminate());
    await app.close();
  }
});
