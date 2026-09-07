import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { Game } from '../server/game.ts';
import { startServer } from '../server/main.ts';
import { makeDelta, applyDelta } from '../shared/replication.ts';
import { clientIP, JoinRate } from '../server/network.ts';
import type { IncomingMessage } from 'node:http';
import type { ServerMessage } from '../shared/types.ts';

test('delta replication reconstructs motion, inventory, laws, new residents and removed entities', () => {
  const game = new Game();
  const a = game.join('Delta Tester').player;
  game.handle(a.id, { type: 'action', action: 'spawn', target: 'crate' });
  const before = structuredClone(game.snapshot());
  a.x += 2;
  a.money -= 300;
  a.weapons.push('pistol');
  game.laws.push('Test law');
  game.join('New Resident');
  game.entities.clear();
  const after = structuredClone(game.snapshot());
  const delta = makeDelta(before, after);
  assert.deepEqual(applyDelta(before, delta), after);
  assert.ok(JSON.stringify(delta).length < JSON.stringify(after).length * 0.6);
  assert.equal(before.players[0].money, 1500);
});

test('forwarded IPs are only used for an explicit trusted Railway deployment', () => {
  const req = {
    headers: { 'x-real-ip': '203.0.113.24' },
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as IncomingMessage;
  assert.equal(clientIP(req, 'none'), '127.0.0.1');
  assert.equal(clientIP(req, 'railway'), '203.0.113.24');
  req.headers['cf-connecting-ip'] = '198.51.100.9';
  assert.equal(clientIP(req, 'railway'), '203.0.113.24', 'Direct callers cannot spoof Cloudflare visitors');
  req.headers['x-real-ip'] = '172.64.1.1';
  assert.equal(clientIP(req, 'railway'), '198.51.100.9');
  req.headers['x-real-ip'] = '2606:4700::1';
  assert.equal(clientIP(req, 'railway'), '198.51.100.9');
  req.headers['x-real-ip'] = 'spoofed, 127.0.0.1';
  assert.equal(clientIP(req, 'railway'), '127.0.0.1');
  const rate = new JoinRate();
  for (let i = 0; i < 120; i++) assert.equal(rate.allow('one', 1), true);
  assert.equal(rate.allow('one', 2), false);
  assert.equal(rate.allow('two', 2), true);
  rate.prune(60_001);
  assert.equal(rate.allow('one', 60_001), true);
});

async function connect(url: string, name: string, token?: string) {
  const ws = new WebSocket(url);
  const messages: ServerMessage[] = [];
  ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
  await once(ws, 'open');
  ws.send(JSON.stringify({ type: 'join', name, token }));
  const deadline = Date.now() + 4000;
  while (
    !messages.some((m) => m.type === 'welcome') &&
    ws.readyState === WebSocket.OPEN &&
    Date.now() < deadline
  )
    await new Promise((resolve) => setTimeout(resolve, 5));
  return { ws, messages, welcome: messages.find((m) => m.type === 'welcome') };
}

test(
  '80 simultaneous joined residents exceed both former slot caps and same-IP socket cap',
  { timeout: 20_000 },
  async () => {
    const app = await startServer({ port: 0, host: '127.0.0.1', production: true, persist: false });
    const clients: WebSocket[] = [];
    try {
      for (let i = 0; i < 80; i++) {
        const client = await connect(`ws://127.0.0.1:${app.port}/ws`, `Resident ${i}`);
        clients.push(client.ws);
        assert.ok(client.welcome, `Resident ${i} should join`);
      }
      assert.equal(app.game.players.size, 80);
      const status = await (await fetch(`http://127.0.0.1:${app.port}/api/status`)).json();
      assert.equal(status.players, 80);
      assert.equal(status.maxPlayers, null);
      assert.ok(clients.every((ws) => ws.readyState === WebSocket.OPEN));
    } finally {
      clients.forEach((ws) => ws.terminate());
      await app.close();
    }
  },
);

test('moderation requires the operator secret, cleans up bans, and rejects banned reconnects', async () => {
  const key = 'test-only-operator-secret';
  const app = await startServer({
    port: 0,
    host: '127.0.0.1',
    production: true,
    persist: false,
    adminKey: key,
  });
  const base = `http://127.0.0.1:${app.port}`,
    url = `ws://127.0.0.1:${app.port}/ws`;
  const clients: WebSocket[] = [];
  try {
    const a = await connect(url, 'Moderation Subject');
    clients.push(a.ws);
    assert.ok(a.welcome);
    assert.equal((await fetch(`${base}/api/admin`)).status, 401);
    const command = (action: string) =>
      fetch(`${base}/api/admin`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: JSON.stringify({ action, id: a.welcome!.id, reason: 'Test ban' }),
      });
    const closed = once(a.ws, 'close');
    assert.equal((await command('ban')).status, 200);
    await closed;
    assert.equal(app.game.players.size, 0);
    const rejected = await connect(url, 'Moderation Subject', a.welcome.token);
    clients.push(rejected.ws);
    assert.equal(rejected.welcome, undefined);
    assert.ok(rejected.messages.some((m) => m.type === 'notice' && m.text.includes('banned')));
    assert.equal((await command('unban')).status, 200);
    const allowed = await connect(url, 'Moderation Subject', a.welcome.token);
    clients.push(allowed.ws);
    assert.equal(allowed.welcome?.id, a.welcome.id);
  } finally {
    clients.forEach((ws) => ws.terminate());
    await app.close();
  }
});
