import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { WebSocket } from 'ws';
import { startServer } from '../server/main.ts';
import { Game } from '../server/game.ts';
import type { ClientMessage, ServerMessage, Snapshot } from '../shared/types.ts';
import { applyDelta } from '../shared/replication.ts';
import { loadWorld } from '../server/persistence.ts';
import { idleInput } from '../shared/movement.ts';

class Client {
  ws: WebSocket;
  messages: ServerMessage[] = [];
  state?: Snapshot;
  constructor(url: string, origin?: string) {
    this.ws = new WebSocket(url, origin ? { origin } : undefined);
    this.ws.on('message', (raw) => {
      let msg: ServerMessage = JSON.parse(raw.toString());
      if (msg.type === 'delta' && this.state) msg = applyDelta(this.state, msg);
      if (msg.type === 'state') this.state = msg;
      this.messages.push(msg);
    });
  }
  async open(): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise<void>((ok, fail) => {
      this.ws.once('open', ok);
      this.ws.once('error', fail);
    });
  }
  send(msg: ClientMessage): void {
    this.ws.send(JSON.stringify(msg));
  }
  async wait<T extends ServerMessage>(predicate: (message: ServerMessage) => message is T): Promise<T>;
  async wait(predicate: (message: ServerMessage) => boolean): Promise<ServerMessage>;
  async wait(predicate: (message: ServerMessage) => boolean): Promise<ServerMessage> {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const value = this.messages.find(predicate);
      if (value) return value;
      await new Promise((ok) => setTimeout(ok, 15));
    }
    throw new Error('Timed out waiting for server message.');
  }
  async join(name: string, token?: string) {
    this.send({ type: 'join', name, token });
    return await this.wait((m): m is Extract<ServerMessage, { type: 'welcome' }> => m.type === 'welcome');
  }
}
test('real clients receive demotion ballots, cast votes and observe the authoritative result', async () => {
  let now = 100_000;
  const game = new Game({ now: () => now });
  const app = await startServer({ port: 0, host: '127.0.0.1', production: true, persist: false, game });
  const clients = Array.from({ length: 3 }, () => new Client(`ws://127.0.0.1:${app.port}/ws`));
  const [requester, target, witness] = clients;
  try {
    await Promise.all(clients.map((c) => c.open()));
    await requester.join('Requester');
    const elected = await target.join('Mayor');
    await witness.join('Witness');
    game.applyJob(game.players.get(elected.id)!, 'mayor');
    requester.send({ type: 'action', action: 'demote', target: elected.id, value: 'Ignoring the city' });
    const ballot = await witness.wait((m): m is Snapshot => m.type === 'state' && m.vote?.kind === 'demote');
    assert.equal(ballot.vote?.candidateName, 'Mayor');
    assert.equal(ballot.vote?.reason, 'Ignoring the city');
    witness.send({ type: 'action', action: 'vote', value: true });
    await target.wait((m) => m.type === 'state' && m.vote?.yes === 2);
    now += 20_001;
    const result = await requester.wait(
      (m): m is Snapshot =>
        m.type === 'state' &&
        m.time === now &&
        !m.vote &&
        m.players.some((p) => p.id === elected.id && p.job === 'citizen'),
    );
    assert.equal(result.players.find((p) => p.id === elected.id)?.license, false);
    now += 31_000;
    target.send({ type: 'action', action: 'job', target: 'mayor' });
    await target.wait((m) => m.type === 'notice' && m.text.includes('You were demoted'));
    assert.equal(game.vote, null);
  } finally {
    clients.forEach((c) => c.ws.terminate());
    await app.close();
  }
});
test('real clients replicate a dropped firearm and transfer ammunition through pickup', async () => {
  let now = 100_000;
  const game = new Game({ now: () => now });
  const app = await startServer({ game, port: 0, host: '127.0.0.1', production: true, persist: false });
  const a = new Client(`ws://127.0.0.1:${app.port}/ws`),
    b = new Client(`ws://127.0.0.1:${app.port}/ws`);
  try {
    await Promise.all([a.open(), b.open()]);
    const source = await a.join('Trader'),
      buyer = await b.join('Customer');
    const p = game.players.get(source.id)!;
    p.weapons.push('pistol');
    p.weapon = 'pistol';
    p.ammo.pistol = 5;
    p.reserve.pistol = 17;
    a.send({ type: 'action', action: 'drop-weapon' });
    const state = await b.wait(
      (m): m is Snapshot => m.type === 'state' && m.entities.some((e) => e.kind === 'weapon'),
    );
    const entity = state.entities.find((e) => e.kind === 'weapon')!;
    assert.equal(entity.loadedAmmo, 5);
    assert.equal(entity.reserveAmmo, 17);
    Object.assign(game.players.get(buyer.id)!, { x: entity.x + 0.7, z: entity.z + 0.9 });
    now += 100;
    b.send({ type: 'action', action: 'interact', target: entity.id });
    const picked = await a.wait(
      (m): m is Snapshot =>
        m.type === 'state' && m.players.some((p) => p.id === buyer.id && p.weapons.includes('pistol')),
    );
    assert.equal(
      picked.entities.some((e) => e.id === entity.id),
      false,
    );
    assert.equal(picked.players.find((p) => p.id === buyer.id)?.reserve.pistol, 17);
    assert.equal(picked.players.find((p) => p.id === source.id)?.weapons.includes('pistol'), false);
  } finally {
    a.ws.terminate();
    b.ws.terminate();
    await app.close();
  }
});
test('two real clients share player, prop, job and chat state; reconnect preserves wallet and props', async () => {
  const game = new Game(),
    app = await startServer({ port: 0, host: '127.0.0.1', production: true, persist: false, game });
  const a = new Client(`ws://127.0.0.1:${app.port}/ws`),
    b = new Client(`ws://127.0.0.1:${app.port}/ws`);
  try {
    await Promise.all([a.open(), b.open()]);
    const wa = await a.join('Alex Builder');
    const wb = await b.join('Jordan Medic');
    assert.notEqual(wa.id, wb.id);
    const shared = await a.wait((m): m is Snapshot => m.type === 'state' && m.players.length === 2);
    assert.equal(shared.players.length, 2);
    a.send({ type: 'action', action: 'spawn', target: 'crate' });
    const props = await b.wait((m): m is Snapshot => m.type === 'state' && m.entities.length === 1);
    assert.equal(props.entities[0].owner, wa.id);
    b.send({ type: 'action', action: 'job', target: 'medic' });
    await a.wait((m) => m.type === 'state' && m.players.some((p) => p.id === wb.id && p.job === 'medic'));
    b.send({ type: 'chat', text: '/ooc Shared server hello' });
    await a.wait((m) => m.type === 'chat' && m.text === 'Shared server hello');
    a.send({ type: 'action', action: 'buy', target: 'meal' });
    await b.wait((m) => m.type === 'state' && m.players.some((p) => p.id === wa.id && p.money === 1450));
    assert.ok(!JSON.stringify(props).includes(wa.token));
    const closed = new Promise((ok) => a.ws.once('close', ok));
    a.ws.close();
    await closed;
    await b.wait((m) => m.type === 'state' && m.players.length === 1 && m.entities.length === 1);
    const rejoin = new Client(`ws://127.0.0.1:${app.port}/ws`);
    await rejoin.open();
    const wr = await rejoin.join('Alex Builder', wa.token);
    assert.equal(wr.id, wa.id);
    const resumed = await rejoin.wait(
      (m): m is Snapshot => m.type === 'state' && m.players.some((p) => p.id === wr.id),
    );
    assert.equal(resumed.players.find((p) => p.id === wr.id)!.money, 1450);
    assert.equal(resumed.entities[0].id, props.entities[0].id);
    assert.equal(resumed.entities[0].owner, wr.id);
    rejoin.ws.close();
  } finally {
    a.ws.terminate();
    b.ws.terminate();
    await app.close();
  }
});
test('real client purchases survive a page refresh and a server replacement using the same data directory', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'openrp-network-world-'));
  const options = { port: 0, host: '127.0.0.1', production: true, dataDir: dir };
  let app = await startServer(options);
  const clients: Client[] = [];
  t.after(async () => {
    clients.forEach((client) => client.ws.terminate());
    await app.close();
    const path = resolve(dir);
    assert.ok(path.startsWith(resolve(tmpdir()) + sep) && path.includes('openrp-network-world-'));
    rmSync(path, { recursive: true, force: true });
  });
  const connect = async (token?: string) => {
    const client = new Client(`ws://127.0.0.1:${app.port}/ws`);
    clients.push(client);
    await client.open();
    const welcome = await client.join('Saved Dealer', token);
    return { client, welcome };
  };
  const { client, welcome } = await connect();
  const act = async (action: string, target?: string) => {
    await new Promise((done) => setTimeout(done, 80));
    client.send({ type: 'action', action, target });
  };
  await act('job', 'dealer');
  await client.wait(
    (m) => m.type === 'state' && m.players.some((p) => p.id === welcome.id && p.job === 'dealer'),
  );
  await act('buy', 'pistol-shipment');
  const shop = await client.wait((m): m is Snapshot => m.type === 'state' && m.entities.length === 1);
  const shipment = shop.entities[0];
  await act('interact', shipment.id);
  await client.wait(
    (m) => m.type === 'state' && m.players.some((p) => p.id === welcome.id && p.weapons.includes('pistol')),
  );
  await act('buy', 'armor');
  await client.wait(
    (m) => m.type === 'state' && m.players.some((p) => p.id === welcome.id && p.armor === 100),
  );
  client.send({ type: 'input', input: { ...idleInput(), seq: 1, yaw: Math.PI / 2 } });
  await client.wait((m) => m.type === 'state' && m.players.some((p) => Math.abs(p.yaw - Math.PI / 2) < 0.01));
  await act('spawn', 'crate');
  const built = await client.wait((m): m is Snapshot => m.type === 'state' && m.entities.length === 2);
  const prop = built.entities.find((e) => e.kind === 'crate')!;
  app.game.freeze(prop.id, true);
  await act('equip', 'pistol');
  await act('primary');
  await client.wait((m) => m.type === 'state' && m.players.some((p) => p.ammo.pistol === 11));
  const door = app.game.doors.find((d) => d.id === 'cafe')!;
  Object.assign(door, { owner: welcome.id, locked: true, name: 'Persistent Gun Shop' });
  const closed = new Promise((done) => client.ws.once('close', done));
  client.ws.close();
  await closed;
  const disconnectDeadline = Date.now() + 3000;
  while (app.game.players.has(welcome.id) && Date.now() < disconnectDeadline)
    await new Promise((done) => setTimeout(done, 5));
  assert.equal(app.game.players.has(welcome.id), false);
  assert.equal(loadWorld(dir)!.entities.length, 2, 'disconnect checkpoints the world immediately');
  const refreshed = await connect(welcome.token);
  const refreshState = await refreshed.client.wait(
    (m): m is Snapshot => m.type === 'state' && m.players.length === 1,
  );
  assert.equal(refreshed.welcome.id, welcome.id);
  assert.equal(refreshState.entities.length, 2);
  assert.equal(refreshState.players[0].ammo.pistol, 11);
  await app.close();
  app = await startServer(options);
  assert.equal(app.game.entities.size, 2, 'the world is restored before anyone connects');
  const restarted = await connect(welcome.token);
  const restored = await restarted.client.wait(
    (m): m is Snapshot => m.type === 'state' && m.players.length === 1,
  );
  const p = restored.players[0];
  assert.equal(p.id, welcome.id);
  assert.equal(p.job, 'dealer');
  assert.equal(p.weapon, 'pistol');
  assert.equal(p.money, 500);
  assert.equal(p.armor, 100);
  assert.equal(p.ammo.pistol, 11);
  assert.equal(p.reserve.pistol, 24);
  assert.equal(restored.entities.find((e) => e.id === shipment.id)!.stock, 4);
  assert.equal(restored.entities.find((e) => e.id === prop.id)!.frozen, true);
  assert.equal(restored.doors.find((d) => d.id === door.id)!.name, 'Persistent Gun Shop');
  assert.equal(restored.doors.find((d) => d.id === door.id)!.owner, p.id);
});

test('server rejects cross-origin socket use, invalid JSON, and message floods', async () => {
  const app = await startServer({ port: 0, host: '127.0.0.1', production: true, persist: false });
  const url = `ws://127.0.0.1:${app.port}/ws`;
  try {
    const wrong = new Client(url, 'https://unrelated.example');
    await assert.rejects(wrong.open(), /403/);
    const malformed = new Client(url);
    await malformed.open();
    const invalidClosed = new Promise<number>((ok) => malformed.ws.once('close', (code) => ok(code)));
    malformed.ws.send('{');
    assert.equal(await invalidClosed, 1007);
    const flood = new Client(url);
    await flood.open();
    const floodClosed = new Promise<number>((ok) => flood.ws.once('close', (code) => ok(code)));
    for (let i = 0; i < 130; i++) flood.send({ type: 'ping', time: i });
    assert.equal(await floodClosed, 1008);
  } finally {
    await app.close();
  }
});
test('server status is real and optional server passwords are enforced', async () => {
  const app = await startServer({
    port: 0,
    host: '127.0.0.1',
    production: true,
    persist: false,
    password: 'test-only-password',
  });
  const bad = new Client(`ws://127.0.0.1:${app.port}/ws`),
    good = new Client(`ws://127.0.0.1:${app.port}/ws`);
  try {
    const status = await (await fetch(`http://127.0.0.1:${app.port}/api/status`)).json();
    assert.equal(status.players, 0);
    assert.equal(status.password, true);
    await bad.open();
    const closed = new Promise<number>((ok) => bad.ws.once('close', (code) => ok(code)));
    bad.send({ type: 'join', name: 'No Password' });
    assert.equal(await closed, 1008);
    await good.open();
    good.send({ type: 'join', name: 'Has Password', password: 'test-only-password' });
    await good.wait((m) => m.type === 'welcome');
    const after = await (await fetch(`http://127.0.0.1:${app.port}/api/status`)).json();
    assert.equal(after.players, 1);
    assert.equal(await (await fetch(`http://127.0.0.1:${app.port}/health`)).text(), 'ok');
  } finally {
    bad.ws.terminate();
    good.ws.terminate();
    await app.close();
  }
});
