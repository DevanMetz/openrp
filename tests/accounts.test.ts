import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { handleHttp } from '../server/http.ts';
import { WebSocket } from 'ws';
import { startTestWorker as startServer } from './support/worker.ts';
import { Game } from '../server/game.ts';
import { Accounts, profileForToken } from '../server/accounts.ts';
import { parseWorld, serializeWorld } from '../server/persistence.ts';
import { BUILDINGS, toWorld } from '../shared/map.ts';
import type { ServerMessage } from '../shared/types.ts';

const password = 'A long test passphrase 🎲 2026';
async function account(port: number, body: object, headers: Record<string, string> = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/api/account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: response.status, headers: response.headers, data: await response.json() };
}
async function connect(port: number, name: string, token?: string, account = false) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const messages: ServerMessage[] = [];
  ws.on('message', (data) => messages.push(JSON.parse(data.toString())));
  const first = new Promise<Extract<ServerMessage, { type: 'welcome' | 'notice' }>>((done, fail) => {
    const timeout = setTimeout(() => {
      ws.close();
      fail(new Error('Join timed out'));
    }, 4000);
    ws.on('error', fail);
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString()) as ServerMessage;
      if (message.type === 'welcome' || message.type === 'notice') {
        clearTimeout(timeout);
        done(message);
      }
    });
  });
  await new Promise<void>((done) => ws.once('open', done));
  ws.send(JSON.stringify({ type: 'join', name, token, account }));
  return { ws, messages, first: await first };
}

async function localAccount(accounts: Accounts, body: object, active = () => true) {
  return handleHttp(
    new Request('https://fixture.invalid/api/account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    (req, res) => accounts.handle(req, res, 'fixture', active),
  );
}

test('a guest can attach belongings to an account, sign in from a fresh client after replacement, and sign out without losing ownership', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'openrp-accounts-'));
  let app = await startServer({ dataDir: dir });
  const sockets: WebSocket[] = [];
  t.after(async () => {
    sockets.forEach((ws) => ws.close());
    await app.close();
    const path = resolve(dir);
    assert.ok(path.startsWith(resolve(tmpdir()) + sep) && path.includes('openrp-accounts-'));
    rmSync(path, { recursive: true, force: true });
  });
  const fixture = new Game();
  const seeded = fixture.join('Saved Resident');
  const p = seeded.player;
  Object.assign(p, {
    money: 910,
    health: 87,
    hunger: 71,
    armor: 60,
    weapon: 'pistol',
    weapons: ['keys', 'physgun', 'toolgun', 'pistol'],
    ammo: { pistol: 7 },
    reserve: { pistol: 30 },
  });
  const b = BUILDINGS.find((b) => b.id === 'alder-court')!;
  Object.assign(p, toWorld(b, -6.45, 3.48, 4.5));
  const property = fixture.doors.find((d) => d.id === 'alder-court-201')!;
  property.owner = p.id;
  property.locked = true;
  const prop = fixture.createEntity('shelf', p.id, toWorld(b, -8.5, 4.63, 6));
  fixture.freeze(prop.id, true);
  await app.restore(fixture.exportWorld());
  const guest = await connect(app.port, 'Saved Resident', seeded.token);
  sockets.push(guest.ws);
  assert.equal(guest.first.type, 'welcome');
  if (guest.first.type !== 'welcome') throw new Error('Guest admission failed');
  const original = guest.first;
  const registration = await account(app.port, {
    action: 'register',
    username: 'Saved_Account',
    password,
    token: original.token,
  });
  assert.equal(registration.status, 200);
  assert.equal(registration.data.username, 'saved_account');
  assert.equal(registration.headers.get('cache-control'), 'no-store');
  const saved = await app.world();
  assert.equal(saved.profiles.find((p) => p.id === original.id)!.account!.username, 'saved_account');
  assert.equal(saved.profiles.find((p) => p.id === original.id)!.character!.ammo.pistol, 7);
  assert.equal(saved.entities.find((e) => e.id === prop.id)!.owner, original.id);
  assert.ok(!JSON.stringify(saved).includes(password));
  assert.equal(
    profileForToken(new Game({ world: await app.world() }), original.token),
    undefined,
    'claiming revokes the guest credential',
  );
  await app.close();
  app = await startServer({ dataDir: dir });
  const login = await account(app.port, { action: 'login', username: 'SAVED_ACCOUNT', password });
  assert.equal(login.status, 200);
  assert.notEqual(login.data.token, registration.data.token);
  const returning = await connect(app.port, '', login.data.token, true);
  sockets.push(returning.ws);
  assert.equal(returning.first.type, 'welcome');
  if (returning.first.type !== 'welcome') throw new Error('Account admission failed');
  assert.equal(returning.first.id, original.id);
  assert.equal(returning.first.username, 'saved_account');
  const restoredWorld = await app.world();
  const restoredGame = new Game({ world: restoredWorld });
  const restored = restoredGame.join('', login.data.token).player;
  assert.equal(restored.money, 910);
  assert.equal(restored.ammo.pistol, 7);
  assert.equal(restored.reserve.pistol, 30);
  assert.equal(restored.armor, 60);
  assert.equal(restored.weapon, 'pistol');
  assert.equal(restored.y, 3.48);
  assert.equal(restoredWorld.doors.find((d) => d.id === property.id)!.owner, original.id);
  assert.equal((await app.world()).entities.find((e) => e.id === prop.id)!.frozen, true);
  assert.ok(!JSON.stringify(restoredGame.snapshot()).includes('passwordHash'));
  assert.ok(!JSON.stringify(restoredGame.snapshot()).includes('saved_account'));
  const logout = await account(app.port, { action: 'logout', token: login.data.token });
  assert.equal(logout.status, 200);
  assert.equal((await app.status()).players > 0, false);
  assert.equal(profileForToken(new Game({ world: await app.world() }), login.data.token), undefined);
  assert.equal((await app.world()).entities.find((e) => e.id === prop.id)!.owner, original.id);
  const expired = await connect(app.port, 'Wrong replacement', login.data.token, true);
  sockets.push(expired.ws);
  assert.equal(expired.first.type, 'notice');
  assert.equal(
    (await app.world()).profiles.length,
    1,
    'expired account sessions do not create a blank guest',
  );
  const finalLogin = await account(app.port, { action: 'login', username: 'saved_account', password });
  assert.equal(finalLogin.status, 200);
  assert.equal(
    profileForToken(new Game({ world: await app.world() }), finalLogin.data.token)!.id,
    original.id,
  );
});

test('accounts enforce credentials, uniqueness, origins, payload limits and one active session per identity', async () => {
  const app = await startServer({});
  const sockets: WebSocket[] = [];
  try {
    const registered = await account(app.port, { action: 'register', username: 'resident_one', password });
    assert.equal(registered.status, 200);
    const a = await connect(app.port, '', registered.data.token, true);
    sockets.push(a.ws);
    const denied = await account(app.port, {
      action: 'login',
      username: 'resident_one',
      password: 'This is the wrong password',
    });
    const missing = await account(app.port, { action: 'login', username: 'not_a_resident', password });
    assert.equal(denied.status, 401);
    assert.deepEqual(denied.data, missing.data);
    assert.equal((await app.status()).players, 1);
    const duplicate = await account(app.port, { action: 'register', username: 'RESIDENT_ONE', password });
    assert.equal(duplicate.status, 409);
    const login = await account(app.port, { action: 'login', username: 'resident_one', password });
    assert.equal(login.status, 200);
    assert.equal((await app.status()).players, 0, 'successful password login closes the old live session');
    const next = await connect(app.port, '', login.data.token, true);
    sockets.push(next.ws);
    assert.equal(next.first.type, 'welcome');
    if (a.first.type === 'welcome' && next.first.type === 'welcome') assert.equal(next.first.id, a.first.id);
    assert.equal((await app.status()).players, 1);
    assert.equal((await account(app.port, { action: 'logout', token: registered.data.token })).status, 401);
    assert.equal(
      (await account(app.port, { action: 'register', username: 'bad name', password })).status,
      400,
    );
    assert.equal(
      (await account(app.port, { action: 'register', username: 'valid_name', password: 'short' })).status,
      400,
    );
    assert.equal(
      (
        await account(
          app.port,
          { action: 'login', username: 'resident_one', password },
          { Origin: 'https://unrelated.example' },
        )
      ).status,
      403,
    );
    assert.equal((await account(app.port, { payload: 'x'.repeat(5000) })).status, 413);
    assert.equal((await account(app.port, {}, { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await account(app.port, {}, { Origin: `ftp://127.0.0.1:${app.port}` })).status, 403);
    const query = await fetch(`http://127.0.0.1:${app.port}/api/account?token=not-a-credential`, {
      method: 'POST',
    });
    assert.equal(query.status, 403);
  } finally {
    sockets.forEach((ws) => ws.close());
    await app.close();
  }
});

test('invalid account checkpoints never replace the existing world with anonymous profiles', () => {
  const game = new Game();
  game.join('First Resident');
  game.join('Second Resident');
  const world = game.exportWorld();
  const hash = `scrypt$32768$8$3$${'0'.repeat(32)}$${'0'.repeat(64)}`;
  world.profiles[0].account = { username: 'first_account', passwordHash: hash };
  world.profiles[1].account = { username: 'second_account', passwordHash: hash };
  const checkpoint = serializeWorld(world);
  assert.equal(parseWorld(checkpoint).profiles[0].account!.username, 'first_account');
  for (const account of [
    { username: 'first_account', passwordHash: 'plaintext-is-not-a-hash' },
    { username: 'First_Account', passwordHash: hash },
    { username: 'second_account', passwordHash: hash },
  ]) {
    world.profiles[0].account = account;
    const damaged = JSON.stringify(world);
    assert.throws(() => parseWorld(damaged), /Invalid|Duplicate/);
    assert.equal(parseWorld(checkpoint).profiles[0].account!.username, 'first_account');
  }
});

test('a ban or shutdown during password work cannot claim a guest or rotate its credential', async () => {
  const game = new Game();
  const guest = game.join('Unchanged Guest');
  let running = true;
  const accounts = new Accounts(
    game,
    () => assert.fail('denied requests must not write a checkpoint'),
    () => assert.fail('denied requests must not disconnect the guest'),
    () => true,
  );
  const body = { action: 'register', username: 'unchanged_guest', password, token: guest.token };
  assert.equal((await localAccount(accounts, body, () => running)).status, 403);
  running = false;
  assert.equal((await localAccount(accounts, body, () => running)).status, 503);
  assert.equal(game.profiles.size, 1);
  assert.equal(profileForToken(game, guest.token)!.account, undefined);
  assert.equal(game.players.has(guest.player.id), true);
});

test('simultaneous registration cannot duplicate names or claim one guest twice, and repeated login guesses are bounded', async () => {
  const app = await startServer({});
  try {
    const results = await Promise.all(
      ['same_name', 'SAME_NAME'].map((username) =>
        account(app.port, { action: 'register', username, password }),
      ),
    );
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    assert.equal((await app.world()).profiles.length, 1);
    const guestClient = await connect(app.port, 'Shared Guest');
    assert.equal(guestClient.first.type, 'welcome');
    if (guestClient.first.type !== 'welcome') throw new Error('Guest join failed');
    const guest = guestClient.first;
    const closed = new Promise((resolve) => guestClient.ws.once('close', resolve));
    guestClient.ws.close();
    await closed;
    const claims = await Promise.all(
      ['claim_one', 'claim_two'].map((username) =>
        account(app.port, { action: 'register', username, password, token: guest.token }),
      ),
    );
    assert.deepEqual(claims.map((r) => r.status).sort(), [200, 409]);
    assert.equal((await app.world()).profiles.length, 2);
    let last;
    for (let i = 0; i < 11; i++)
      last = await account(app.port, { action: 'login', username: 'unknown_login', password });
    assert.equal(last!.status, 429);
    assert.equal(last!.headers.get('retry-after'), '300');
  } finally {
    await app.close();
  }
});

test('failed account checkpoints roll back the claim and keep the original guest credential and belongings', async () => {
  const game = new Game();
  const guest = game.join('Keep My Guest');
  const prop = game.createEntity('crate', guest.player.id, { x: 3, y: 1, z: 23 });
  const accounts = new Accounts(
    game,
    () => {
      throw new Error('Simulated checkpoint failure');
    },
    () => assert.fail('failed writes must not disconnect the guest'),
    () => false,
  );
  const result = await localAccount(accounts, {
    action: 'register',
    username: 'failed_save',
    password,
    token: guest.token,
  });
  assert.equal(result.status, 503);
  assert.equal(game.profiles.size, 1);
  assert.equal(profileForToken(game, guest.token)!.account, undefined);
  assert.equal(game.entities.get(prop.id)!.owner, guest.player.id);
  assert.equal(game.players.has(guest.player.id), true);
});
