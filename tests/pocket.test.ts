import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { Game } from '../server/game.ts';
import { loadWorld, saveWorld } from '../server/persistence.ts';
import { MAX_ENTITIES, MAX_PROPS, POCKET_CAPACITY } from '../shared/catalog.ts';
import { BLOCKS } from '../shared/map.ts';
import type { EntityKind, Player } from '../shared/types.ts';

function fixture() {
  let now = 100_000;
  const game = new Game({ now: () => now });
  const source = game.join('Pocket Owner');
  const p = source.player;
  Object.assign(p, { x: 0, y: 0, z: 20, yaw: 0 });
  const place = (kind: EntityKind, owner = p.id) => game.createEntity(kind, owner, { x: 0, y: 0.5, z: 18 });
  const act = (player: Player, action: string, target: string) => {
    now += 1000;
    game.handle(player.id, { type: 'action', action, target });
  };
  return { game, p, source, place, act };
}

test('pocket transfers loose weapons and props once, retaining contents and releasing physics', () => {
  const { game, p, place, act } = fixture();
  const other = game.join('Other Owner').player;
  const gun = place('weapon', other.id);
  Object.assign(gun, { item: 'shotgun', loadedAmmo: 3, reserveAmmo: 11, health: 93 });
  act(p, 'pocket-store', gun.id);
  assert.equal(game.entities.has(gun.id), false);
  assert.equal(game.bodies.has(gun.id), false);
  assert.equal(p.pocket?.length, 1);
  assert.equal(p.weapons.includes('shotgun'), false, 'storage does not equip a firearm');
  act(p, 'pocket-store', gun.id);
  assert.equal(p.pocket?.length, 1);
  act(other, 'pocket-drop', gun.id);
  assert.equal(p.pocket?.length, 1, 'other residents cannot place this pocket item');
  act(p, 'pocket-drop', gun.id);
  const dropped = [...game.entities.values()][0];
  assert.equal(dropped.owner, p.id);
  assert.notEqual(dropped.id, gun.id, 'old requests cannot affect a later incarnation');
  assert.deepEqual([dropped.loadedAmmo, dropped.reserveAmmo, dropped.health], [3, 11, 93]);
  assert.equal(p.pocket?.length, 0);
  act(p, 'pocket-drop', gun.id);
  assert.equal(game.entities.size, 1);
  game.interact(p, dropped.id);
  assert.deepEqual([p.ammo.shotgun, p.reserve.shotgun], [3, 11]);
  const prop = place('crate');
  prop.color = '#abcdef';
  prop.health = 42;
  act(p, 'pocket-store', prop.id);
  act(p, 'pocket-drop', prop.id);
  const restored = [...game.entities.values()][0];
  assert.equal(restored.color, '#abcdef');
  assert.equal(restored.health, 42);
  act(p, 'pocket-store', restored.id);
  game.damage(p, 200);
  assert.equal(p.pocket?.[0].health, 42, 'death retains stored contents');
  game.respawn(p);
  p.arrestedUntil = game.now() + 60_000;
  act(p, 'pocket-drop', restored.id);
  assert.equal(p.pocket?.length, 1, 'custody blocks placement');
  game.free(p);
  assert.equal(p.pocket?.[0].health, 42, 'release retains stored contents');
});

test('pocket rejects inaccessible, owned, held, frozen, fading and business objects and enforces capacity', () => {
  const { game, p, place, act } = fixture();
  const other = game.join('Other Owner').player;
  const prop = place('crate', other.id);
  act(p, 'pocket-store', prop.id);
  assert.equal(game.entities.has(prop.id), true);
  prop.owner = p.id;
  for (const field of ['frozen', 'fading', 'heldBy'] as const) {
    Object.assign(prop, { [field]: field === 'heldBy' ? other.id : true });
    act(p, 'pocket-store', prop.id);
    assert.equal(p.pocket?.length, 0, field);
    Object.assign(prop, { [field]: field === 'heldBy' ? null : false });
  }
  p.x = 20;
  act(p, 'pocket-store', prop.id);
  assert.equal(p.pocket?.length, 0, 'remote storage');
  p.x = 0;
  for (const field of ['deadUntil', 'arrestedUntil'] as const) {
    p[field] = game.now() + 60_000;
    act(p, 'pocket-store', prop.id);
    assert.equal(p.pocket?.length, 0, field);
    p[field] = 0;
  }
  game.removeEntity(prop.id);
  for (const kind of ['printer', 'microwave', 'shipment'] as const) {
    const business = place(kind);
    act(p, 'pocket-store', business.id);
    assert.equal(p.pocket?.length, 0);
    game.removeEntity(business.id);
  }
  for (let i = 0; i < POCKET_CAPACITY + 1; i++) act(p, 'pocket-store', place('food').id);
  assert.equal(p.pocket?.length, POCKET_CAPACITY);
  assert.equal(game.entities.size, 1, 'overflow remains in the world');
});

test('pocket placement preserves stored objects on obstruction and server limits; props retain their quota', () => {
  const { game, p, place, act } = fixture();
  const prop = place('crate');
  act(p, 'pocket-store', prop.id);
  for (let i = 0; i < MAX_PROPS - 1; i++) game.createEntity('crate', p.id, { x: 35, y: 1, z: 35 });
  assert.equal(game.spawn(p, 'crate'), null, 'pocketed prop reserves a build slot');
  const wall = BLOCKS.find((b) => b.h > 2 && b.w > 4)!;
  Object.assign(p, { x: wall.x, y: wall.y - wall.h / 2, z: wall.z + wall.d / 2 + 0.8 });
  act(p, 'pocket-drop', prop.id);
  assert.equal(p.pocket?.length, 1, 'blocked placement retains item');
  Object.assign(p, { x: 0, y: 0, z: 20 });
  while (game.entities.size < MAX_ENTITIES) game.createEntity('food', p.id, { x: 40, y: 1, z: 40 });
  act(p, 'pocket-drop', prop.id);
  assert.equal(p.pocket?.length, 1, 'full world retains item');
  game.removeEntity([...game.entities.keys()].at(-1)!);
  act(p, 'pocket-drop', prop.id);
  assert.equal(p.pocket?.length, 0, 'existing reserved prop can be placed at build limit');
  assert.equal([...game.entities.values()].filter((e) => e.kind === 'crate').length, MAX_PROPS);
});

test('pockets survive job changes, reconnect and saved-world replacement; corrupt or duplicated contents fail closed', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'openrp-pocket-test-'));
  t.after(() => {
    assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + sep) && dir.includes('openrp-pocket-test-'));
    rmSync(dir, { recursive: true, force: true });
  });
  const { game, p, source, place, act } = fixture();
  const cash = place('money');
  cash.cash = 723;
  act(p, 'pocket-store', cash.id);
  game.applyJob(p, 'medic');
  game.disconnect(p.id);
  saveWorld(dir, game.exportWorld());
  const saved = loadWorld(dir)!;
  const restored = new Game({ world: saved, now: game.now });
  const returning = restored.join('Ignored', source.token).player;
  assert.equal(returning.pocket?.[0].cash, 723);
  assert.equal(restored.entities.size, 0);
  restored.dropPocket(returning, cash.id);
  assert.equal(returning.pocket?.length, 0);
  const bundle = [...restored.entities.values()][0];
  restored.interact(returning, bundle.id);
  assert.equal(returning.money, p.money + 723);
  const profile = saved.profiles.find((v) => v.id === p.id)!;
  const corrupt = structuredClone(saved);
  corrupt.profiles.find((v) => v.id === p.id)!.character!.pocket![0].cash = -1;
  writeFileSync(join(dir, 'world.json'), JSON.stringify(corrupt));
  assert.throws(() => loadWorld(dir));
  profile.character!.pocket!.push(structuredClone(profile.character!.pocket![0]));
  writeFileSync(join(dir, 'world.json'), JSON.stringify(saved));
  assert.throws(() => loadWorld(dir));
});
