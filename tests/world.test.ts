import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Game, type SavedWorld } from '../server/game.ts';
import { loadWorld, saveProfiles, saveWorld } from '../server/persistence.ts';
import { startServer } from '../server/main.ts';
import { JAIL, SPAWNS } from '../shared/map.ts';
import { MAX_PROPS } from '../shared/catalog.ts';
import { idleInput } from '../shared/movement.ts';

function directory(t: TestContext) {
  const dir = mkdtempSync(join(tmpdir(), 'openrp-world-test-'));
  t.after(() => {
    const path = resolve(dir);
    assert.ok(path.startsWith(resolve(tmpdir()) + sep) && path.includes('openrp-world-test-'));
    rmSync(path, { recursive: true, force: true });
  });
  return dir;
}

test('offline demotion survives a saved world replacement, removes job stock and keeps property', (t) => {
  const dir = directory(t);
  let now = 100_000;
  const game = new Game({ now: () => now });
  const owner = game.join('Shop Owner');
  const source = game.join('Requester').player;
  const witness = game.join('Witness').player;
  game.applyJob(owner.player, 'dealer');
  const shipment = game.createEntity('shipment', owner.player.id, { x: 10, y: 1, z: 20 });
  const prop = game.createEntity('shelf', owner.player.id, { x: 15, y: 1, z: 20 });
  const door = game.doors.find((d) => d.id === 'cafe')!;
  door.owner = owner.player.id;
  game.requestDemotion(source, owner.player.id, 'Breaking shop agreements');
  game.castVote(witness, true);
  game.disconnect(owner.player.id);
  assert.equal(game.vote?.kind, 'demote', 'disconnect does not cancel the public vote');
  now += 20_001;
  game.step();
  assert.equal(game.entities.has(shipment.id), false);
  assert.equal(game.entities.has(prop.id), true);
  assert.equal(door.owner, owner.player.id);
  saveWorld(dir, game.exportWorld());
  const restored = new Game({ now: () => now, world: loadWorld(dir) });
  const p = restored.join('Shop Owner', owner.token).player;
  assert.equal(p.job, 'citizen');
  assert.deepEqual(p.weapons, ['keys', 'physgun', 'toolgun']);
  assert.equal(Object.hasOwn(p, 'jobBans'), false, 'private runtime fields stay out of snapshots');
  now += 31_000;
  restored.changeJob(p, 'dealer');
  assert.equal(p.job, 'citizen', 'restart does not bypass role restriction');
  now += 300_000;
  restored.changeJob(p, 'dealer');
  assert.equal(p.job, 'dealer');
});
test('a demotion target can reconnect during voting but cannot evade the police role ban', () => {
  let now = 100_000;
  const game = new Game({ now: () => now });
  const target = game.join('Chief');
  const source = game.join('Requester').player;
  const witness = game.join('Witness').player;
  game.applyJob(target.player, 'chief');
  game.requestDemotion(source, target.player.id, 'Abuse of office');
  game.disconnect(target.player.id);
  const resumed = game.join('Chief', target.token).player;
  game.castVote(witness, true);
  now += 20_001;
  game.step();
  assert.equal(resumed.job, 'citizen');
  now += 31_000;
  game.changeJob(resumed, 'police');
  assert.equal(game.vote, null, 'police and chief share the demotion restriction');
  assert.equal(resumed.job, 'citizen');
});
test('dropped firearm and exact ammunition survive a world replacement without restoring the source gun', (t) => {
  const dir = directory(t);
  const game = new Game();
  const source = game.join('Trader');
  source.player.weapons.push('smg');
  source.player.weapon = 'smg';
  source.player.ammo.smg = 13;
  source.player.reserve.smg = 47;
  game.dropWeapon(source.player);
  const dropped = [...game.entities.values()].find((e) => e.kind === 'weapon')!;
  assert.ok(dropped);
  saveWorld(dir, game.exportWorld());
  const restored = new Game({ world: loadWorld(dir) });
  const trader = restored.join('Trader', source.token).player;
  assert.equal(trader.weapons.includes('smg'), false);
  const buyer = restored.join('Customer').player;
  Object.assign(buyer, { x: dropped.x + 0.8, y: 0.08, z: dropped.z + 1 });
  restored.interact(buyer, dropped.id);
  assert.equal(buyer.ammo.smg, 13);
  assert.equal(buyer.reserve.smg, 47);
  assert.equal(restored.entities.has(dropped.id), false);
  saveWorld(dir, restored.exportWorld());
  assert.equal(
    loadWorld(dir)!.entities.some((e) => e.kind === 'weapon'),
    false,
  );
  const corrupt = game.exportWorld();
  corrupt.entities.find((e) => e.id === dropped.id)!.loadedAmmo = 31;
  assert.throws(() => saveWorld(dir, corrupt), /Invalid entity/);
});
test('refresh preserves inventory, vitals, ownership and shared keys while releasing transient physics holds', () => {
  let now = 100_000;
  const game = new Game({ now: () => now });
  const owner = game.join('Builder'),
    guest = game.join('Key Holder');
  const p = owner.player;
  game.applyJob(p, 'dealer');
  Object.assign(p, { x: 4, z: 20, yaw: 0.8, pitch: -0.2, health: 71, hunger: 63, armor: 48, license: true });
  p.weapons.push('pistol');
  p.weapon = 'pistol';
  p.ammo.pistol = 7;
  p.reserve.pistol = 19;
  const prop = game.createEntity('shelf', p.id, { x: 10, y: 1.2, z: 20 });
  p.holding = prop.id;
  prop.heldBy = p.id;
  const door = game.doors.find((d) => d.id === 'cafe')!;
  Object.assign(door, { owner: p.id, coowners: [guest.player.id], locked: true, name: 'Builder Base' });
  const character = game.exportProfiles().find((v) => v.id === p.id)!.character;
  game.disconnect(guest.player.id);
  game.disconnect(p.id);
  assert.equal(game.players.size, 0);
  assert.equal(game.entities.get(prop.id)?.heldBy, null);
  assert.equal(door.owner, p.id);
  assert.deepEqual(door.coowners, [guest.player.id]);
  for (let i = 0; i < 3; i++) {
    const resumed = game.join('Builder', owner.token).player;
    assert.deepEqual(game.exportProfiles().find((v) => v.id === resumed.id)!.character, character);
    assert.equal(resumed.holding, null);
    assert.equal(resumed.seq, 0);
    assert.equal(game.entities.size, 1);
    assert.equal(game.entities.get(prop.id)?.owner, resumed.id);
    now += 100;
    game.handle(resumed.id, { type: 'action', action: 'job', target: 'medic' });
    assert.equal(resumed.job, 'dealer', 'refresh cannot bypass the job cooldown');
    game.disconnect(resumed.id);
  }
  const keyHolder = game.join('Key Holder', guest.token).player;
  assert.equal(game.ownsDoor(keyHolder, door), true);
  assert.ok(!JSON.stringify(game.snapshot()).includes(owner.token));
  assert.ok(!JSON.stringify(game.snapshot()).includes('tokenHash'));
});

test('one atomic checkpoint restores props, physics, businesses, wallets and property across a restart', (t) => {
  const dir = directory(t);
  let now = 100_000;
  const game = new Game({ now: () => now });
  const { player, token } = game.join('Persistent Builder');
  const crate = game.createEntity('crate', player.id, { x: 10, y: 4, z: 20 });
  game.freeze(crate.id, true);
  Object.assign(crate, { color: '#506f79', health: 82, fading: true, fadeUntil: now + 6000 });
  game.bodies.get(crate.id)!.quaternion.set(0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8));
  const q = game.bodies.get(crate.id)!.quaternion;
  const barrel = game.createEntity('barrel', player.id, { x: 15, y: 4, z: 20 });
  const printer = game.createEntity('printer', player.id, { x: 20, y: 1, z: 20 });
  printer.cash = 700;
  const shipment = game.createEntity('shipment', player.id, { x: 25, y: 1, z: 20 });
  Object.assign(shipment, { item: 'shotgun', stock: 2, price: 413 });
  const microwave = game.createEntity('microwave', player.id, { x: 30, y: 1, z: 20 });
  Object.assign(microwave, { stock: 7, price: 42 });
  Object.assign(game.doors[1], { owner: player.id, name: 'Saved property', locked: true, open: true });
  game.laws.push('Keep Union Square clean.');
  player.money = 987;
  const saved = game.exportWorld();
  saveWorld(dir, saved);
  assert.deepEqual(loadWorld(dir), saved);
  const restored = new Game({ world: loadWorld(dir), now: () => now });
  assert.equal(restored.players.size, 0, 'saved residents are offline until authenticated');
  assert.deepEqual(restored.snapshot().entities, saved.entities);
  assert.deepEqual(restored.exportWorld().doors, saved.doors);
  assert.deepEqual(restored.laws, saved.laws);
  assert.equal(restored.bodies.get(crate.id)!.mass, 0);
  assert.equal(restored.bodies.get(crate.id)!.collisionResponse, false);
  assert.ok(restored.bodies.get(barrel.id)!.mass > 0);
  assert.equal(restored.bodies.get(crate.id)!.quaternion.y, q.y, 'even a rotation between ticks is saved');
  assert.equal(restored.join('Persistent Builder', token).player.money, 987);
  now += 7000;
  restored.step();
  assert.equal(restored.bodies.get(crate.id)!.collisionResponse, true);
  assert.equal(restored.entities.get(crate.id)!.y, 4, 'frozen placement survives physics stepping');
  assert.ok(restored.entities.get(barrel.id)!.y < 4, 'unfrozen props retain live rigid-body physics');
  restored.removeEntity(printer.id);
  saveWorld(dir, restored.exportWorld());
  const restartedAgain = new Game({ world: loadWorld(dir) });
  assert.equal(restartedAgain.entities.has(printer.id), false, 'deleted objects never resurrect');
  assert.equal(restartedAgain.entities.size, 4);
  const before = readFileSync(join(dir, 'world.json'), 'utf8');
  for (const corrupt of [
    (w: SavedWorld) => {
      w.entities[0].q = { x: 0, y: 0, z: 0, w: 0 };
    },
    (w: SavedWorld) => {
      w.entities[0].owner = 'unknown';
    },
    (w: SavedWorld) => {
      w.entities[0].stock = -1;
    },
    (w: SavedWorld) => {
      w.entities.push(w.entities[0]);
    },
  ]) {
    const invalid = restartedAgain.exportWorld();
    corrupt(invalid);
    assert.throws(() => saveWorld(dir, invalid), /Invalid|Duplicate/);
    assert.equal(readFileSync(join(dir, 'world.json'), 'utf8'), before);
  }
});

test('offline keys can be revoked and operator cleanup stays removed across restart', () => {
  const game = new Game(),
    owner = game.join('Owner'),
    guest = game.join('Guest');
  const door = game.doors.find((d) => d.id === 'cafe')!;
  Object.assign(door, { owner: owner.player.id, coowners: [guest.player.id], locked: true });
  Object.assign(owner.player, { x: door.x + 1.5, y: 0.08, z: door.z });
  game.createEntity('shelf', owner.player.id, { x: 10, y: 1.2, z: 20 });
  game.disconnect(guest.player.id);
  game.handle(owner.player.id, {
    type: 'action',
    action: 'door-coowner',
    target: door.id,
    value: guest.player.id,
  });
  assert.deepEqual(door.coowners, []);
  game.disconnect(owner.player.id, true);
  const next = new Game({ world: game.exportWorld() });
  assert.equal(next.entities.size, 0);
  assert.equal(next.doors.find((d) => d.id === door.id)!.owner, null);
  assert.equal(next.join('Owner', owner.token).player.money, 1500);
});

test('offline businesses credit the saved owner and preserve stock and cash together', (t) => {
  const dir = directory(t),
    game = new Game();
  const seller = game.join('Offline Dealer'),
    buyer = game.join('Customer');
  game.applyJob(seller.player, 'dealer');
  const shipment = game.createEntity('shipment', seller.player.id, { x: 0, y: 0.5, z: 22 });
  Object.assign(shipment, { item: 'pistol', stock: 5, price: 250 });
  game.disconnect(seller.player.id);
  Object.assign(buyer.player, SPAWNS[0]);
  game.handle(buyer.player.id, { type: 'action', action: 'interact', target: shipment.id });
  assert.equal(buyer.player.money, 1250);
  assert.ok(buyer.player.weapons.includes('pistol'));
  assert.equal(shipment.stock, 4);
  saveWorld(dir, game.exportWorld());
  const next = new Game({ world: loadWorld(dir) });
  assert.equal(next.join('Offline Dealer', seller.token).player.money, 1750);
  assert.equal(next.join('Customer', buyer.token).player.money, 1250);
  assert.equal(next.entities.get(shipment.id)!.stock, 4);
});

test('refresh retains prop limits and active custody, death and wanted penalties', () => {
  let now = 100_000;
  const game = new Game({ now: () => now }),
    joined = game.join('Repeat Visitor');
  for (let i = 0; i < MAX_PROPS; i++)
    game.createEntity('crate', joined.player.id, { x: 40, y: i + 1, z: 40 });
  Object.assign(joined.player, {
    arrestedUntil: now + 60_000,
    wantedUntil: now + 120_000,
    wantedReason: 'Test case',
  });
  game.disconnect(joined.player.id);
  let resumed = game.join('Repeat Visitor', joined.token).player;
  assert.equal(resumed.arrestedUntil, now + 60_000);
  assert.equal(resumed.wantedReason, 'Test case');
  assert.equal(resumed.x, JAIL.x);
  assert.equal(resumed.z, JAIL.z);
  assert.equal(game.spawn(resumed, 'crate'), null, 'reconnect retains the owner prop count');
  resumed.arrestedUntil = 0;
  game.damage(resumed, 1000);
  const money = resumed.money,
    deadUntil = resumed.deadUntil;
  game.disconnect(resumed.id);
  resumed = game.join('Repeat Visitor', joined.token).player;
  assert.equal(resumed.deadUntil, deadUntil);
  assert.equal(resumed.money, money, 'death loss is not charged a second time');
  game.disconnect(resumed.id);
  now += 7001;
  resumed = game.join('Repeat Visitor', joined.token).player;
  assert.equal(resumed.deadUntil, 0, 'expired death follows normal respawn rules');
  assert.equal(resumed.health, 100);
  game.handle(resumed.id, { type: 'input', input: { ...idleInput(), seq: 1, forward: 1 } });
  game.step();
  assert.equal(resumed.seq, 1, 'a new connection starts a fresh input sequence');
});

test('saved jobs respect occupied slots without deleting the returning inventory', () => {
  const game = new Game(),
    first = game.join('Old Boss'),
    other = game.join('New Boss');
  game.applyJob(first.player, 'boss');
  first.player.weapons.push('shotgun');
  first.player.ammo.shotgun = 4;
  game.disconnect(first.player.id);
  game.applyJob(other.player, 'boss');
  const resumed = game.join('Old Boss', first.token).player;
  assert.equal(resumed.job, 'citizen');
  assert.ok(resumed.weapons.includes('shotgun'));
  assert.equal(resumed.ammo.shotgun, 4);
  assert.equal([...game.players.values()].filter((p) => p.job === 'boss').length, 1);
});

test('legacy wallet saves migrate once and damaged or unsupported worlds never fall back to old money', async (t) => {
  const dir = directory(t),
    legacy = new Game(),
    joined = legacy.join('Legacy Resident');
  joined.player.money = 1234;
  const profile = { ...legacy.exportProfiles()[0] };
  delete profile.character;
  saveProfiles(dir, [profile]);
  const original = readFileSync(join(dir, 'profiles.json'), 'utf8');
  const app = await startServer({ port: 0, host: '127.0.0.1', production: true, dataDir: dir });
  try {
    assert.equal(app.game.join('Legacy Resident', joined.token).player.money, 1234);
  } finally {
    await app.close();
  }
  const good = loadWorld(dir)!;
  assert.equal(good.profiles[0].id, profile.id);
  assert.equal(readFileSync(join(dir, 'profiles.json'), 'utf8'), original);
  const corruptions: ((world: SavedWorld) => void)[] = [
    (w) => {
      (w as { version: number }).version = 999;
    },
    (w) => {
      w.profiles[0].money = -1;
    },
    (w) => {
      w.profiles[0].character!.ammo = { pistol: 999 };
    },
    (w) => {
      w.profiles[0].character!.x = NaN;
    },
    (w) => {
      w.profiles.push(w.profiles[0]);
    },
    (w) => {
      w.doors[0].owner = 'missing-owner';
    },
  ];
  for (const corrupt of corruptions) {
    const value = structuredClone(good);
    corrupt(value);
    assert.throws(() => saveWorld(dir, value), /Invalid|Duplicate/);
    assert.deepEqual(loadWorld(dir), good, 'failed validation leaves the last checkpoint intact');
    writeFileSync(join(dir, 'world.json'), JSON.stringify(value));
    await assert.rejects(startServer({ port: 0, production: true, dataDir: dir }), /Restore a backup/);
    saveWorld(dir, good);
  }
  writeFileSync(join(dir, 'world.json'), '{truncated');
  assert.throws(() => loadWorld(dir), /Restore a backup/);
});

test('authenticated operators can clear an offline owner without wiping inventories or other residents', async (t) => {
  const dir = directory(t),
    game = new Game();
  const owner = game.join('Offline Builder'),
    other = game.join('Active Builder');
  owner.player.money = 1234;
  owner.player.weapons.push('pistol');
  owner.player.ammo.pistol = 6;
  game.createEntity('crate', owner.player.id, { x: -3, y: 0.7, z: 20 });
  game.createEntity('printer', owner.player.id, { x: 3, y: 0.5, z: 20 });
  const preserved = game.createEntity('shelf', other.player.id, { x: 4, y: 1.2, z: 26 });
  const door = game.doors.find((d) => d.id === 'cafe')!;
  Object.assign(door, { owner: owner.player.id, coowners: [other.player.id], locked: true });
  game.disconnect(owner.player.id);
  const key = 'test-only-cleanup-key',
    readKey = 'test-only-analytics-read-key';
  let app = await startServer({
    port: 0,
    host: '127.0.0.1',
    production: true,
    dataDir: dir,
    game,
    adminKey: key,
    analyticsReadKey: readKey,
  });
  try {
    const url = `http://127.0.0.1:${app.port}/api/admin`;
    const command = (credential: string, id = owner.player.id) =>
      fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cleanup', id, reason: 'Abandoned setup' }),
      });
    const listing = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    const list = await listing.json();
    assert.deepEqual(
      list.owners.find((p: { id: string }) => p.id === owner.player.id),
      {
        id: owner.player.id,
        name: 'Offline Builder',
        online: false,
        entities: 2,
        properties: 1,
      },
    );
    assert.equal(list.owners.find((p: { id: string }) => p.id === other.player.id).online, true);
    assert.ok(!JSON.stringify(list).includes('tokenHash'));
    assert.ok(!JSON.stringify(list).includes(owner.token));
    assert.ok(!JSON.stringify(list).includes('character'));
    for (const credential of ['', readKey]) {
      assert.equal((await command(credential)).status, 401);
      assert.equal(app.game.entities.size, 3);
    }
    assert.equal((await command(key, 'unknown-id')).status, 400);
    const cleaned = await promisify(execFile)(
      process.execPath,
      ['--import', 'tsx', 'scripts/admin.ts', 'cleanup', owner.player.id, 'Abandoned setup'],
      { env: { ...process.env, DATA_DIR: dir, PORT: String(app.port) } },
    );
    assert.deepEqual(JSON.parse(cleaned.stdout), { ok: true, removed: { entities: 2, properties: 1 } });
    assert.equal(app.game.entities.size, 1);
    assert.equal(app.game.entities.has(preserved.id), true);
    assert.equal(app.game.players.has(other.player.id), true, 'cleanup does not kick residents');
    assert.equal(loadWorld(dir)!.entities.length, 1, 'the cleanup is saved before success is returned');
    assert.equal(loadWorld(dir)!.doors.find((d) => d.id === door.id)!.owner, null);
    const events = await (
      await fetch(`${url}/events?kind=moderation`, { headers: { Authorization: `Bearer ${readKey}` } })
    ).text();
    assert.ok(events.includes('"action":"cleanup"'), 'cleanup emits the moderation activity hook');
    const again = await command(key);
    assert.deepEqual(await again.json(), { ok: true, removed: { entities: 0, properties: 0 } });
    await app.close();
    app = await startServer({ port: 0, host: '127.0.0.1', production: true, dataDir: dir });
    assert.equal(app.game.entities.size, 1);
    assert.equal(app.game.entities.has(preserved.id), true);
    const restored = app.game.join('Offline Builder', owner.token).player;
    assert.equal(restored.money, 1234);
    assert.equal(restored.ammo.pistol, 6);
    assert.ok(restored.weapons.includes('pistol'));
  } finally {
    await app.close();
  }
});
