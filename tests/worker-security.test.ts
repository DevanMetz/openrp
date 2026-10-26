import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { startTestWorker } from './support/worker.ts';

let app: Awaited<ReturnType<typeof startTestWorker>>;
const sockets: WebSocket[] = [];
before(async () => {
  app = await startTestWorker({ vars: { ALLOWED_ORIGINS: 'https://openrp.dev,https://www.openrp.dev' } });
});
after(async () => {
  sockets.forEach((ws) => ws.close());
  await app.close();
});
async function socket(origin?: string) {
  const ws = new WebSocket(app.base.replace('http:', 'ws:') + '/ws', origin ? { origin } : {});
  sockets.push(ws);
  await once(ws, 'open');
  return ws;
}
async function rejectUpgrade(path: string, status: number, origin?: string) {
  const ws = new WebSocket(app.base.replace('http:', 'ws:') + path, origin ? { origin } : {});
  sockets.push(ws);
  await assert.rejects(once(ws, 'open'), new RegExp(String(status)));
}
async function close(ws: WebSocket) {
  const closed = once(ws, 'close');
  ws.close();
  await closed;
}

test('same-host and explicitly allowed origins join; unrelated and malformed origins cannot upgrade', async () => {
  for (const origin of [app.base, 'https://openrp.dev', 'https://www.openrp.dev'])
    await close(await socket(origin));
  const workersDevHost = 'openrp.example.workers.dev';
  const workersDev = new WebSocket(app.base.replace('http:', 'ws:') + '/ws', {
    origin: `https://${workersDevHost}`,
    headers: { Host: workersDevHost },
  });
  sockets.push(workersDev);
  await once(workersDev, 'open');
  await close(workersDev);
  for (const origin of ['https://evil.invalid', 'null', app.base + '/path', 'ftp://127.0.0.1'])
    for (const path of ['/ws', '/voice']) await rejectUpgrade(path, 403, origin);
  assert.equal((await fetch(app.base + '/ws')).status, 426);
});

test('gameplay rejects oversized UTF-8, binary messages and floods with protocol close codes', async () => {
  for (const [payload, expected] of [
    ['🙂'.repeat(2100), 1009],
    [Buffer.from('binary'), 1003],
    ['{', 1007],
  ] as const) {
    const ws = await socket();
    const closed = once(ws, 'close');
    ws.send(payload);
    assert.equal((await closed)[0], expected);
  }
  const ws = await socket();
  const closed = once(ws, 'close');
  for (let i = 0; i < 130; i++) ws.send(JSON.stringify({ type: 'ping', time: i }));
  assert.equal((await closed)[0], 1008);
});

test('pending admission is bounded independently of joined residents', async () => {
  const pending: WebSocket[] = [];
  try {
    for (let i = 0; i < 8; i++) pending.push(await socket());
    await rejectUpgrade('/ws', 429);
  } finally {
    await Promise.all(pending.map(close));
  }
});

test('heartbeats stop silent sessions and revoke their voice ticket', { timeout: 40_000 }, async () => {
  const ws = await socket();
  const welcome = new Promise<{ voiceTicket: string }>((resolve) =>
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'welcome') resolve(msg);
    }),
  );
  ws.send(JSON.stringify({ type: 'join', name: 'Silent resident' }));
  const ticket = (await welcome).voiceTicket;
  const audio = new WebSocket(app.base.replace('http:', 'ws:') + '/voice');
  sockets.push(audio);
  await once(audio, 'open');
  const ready = once(audio, 'message');
  audio.send(JSON.stringify({ type: 'join', ticket }));
  await ready;
  const ended = once(audio, 'close');
  const closed = await once(ws, 'close');
  assert.equal(closed[0], 1008);
  assert.match(closed[1].toString(), /Heartbeat/);
  await ended;
  assert.equal((await app.status()).players, 0);
});

test('connection churn has a per-IP minute limit even when sockets promptly close', async () => {
  // Earlier tests used this IP too: the boundary must occur within 120 more attempts.
  let admitted = 0,
    rejected = false;
  for (let i = 0; i < 121; i++) {
    try {
      await close(await socket());
      admitted++;
    } catch (error) {
      assert.match(String(error), /429/);
      rejected = true;
      break;
    }
  }
  assert.ok(admitted > 0);
  assert.equal(rejected, true);
});
