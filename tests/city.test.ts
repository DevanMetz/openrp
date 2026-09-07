import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLOCKS,
  BUILDINGS,
  FLOOR_HEIGHT,
  INITIAL_DOORS,
  MAP_BOUND,
  ROOMS,
  toWorld,
  type Building,
} from '../shared/map.ts';
import { idleInput, movePlayer, overlaps } from '../shared/movement.ts';
import { Game } from '../server/game.ts';

function walker(building: Building) {
  const p = { ...toWorld(building, 0, 0.08, building.d / 2 + 2), vy: 0, grounded: true };
  return {
    p,
    walk(x: number, z: number, level = 0) {
      const dest = toWorld(building, x, level * FLOOR_HEIGHT + 0.08, z);
      for (let step = 0; step < 600 && Math.hypot(p.x - dest.x, p.z - dest.z) > 0.12; step++) {
        const yaw = Math.atan2(p.x - dest.x, p.z - dest.z);
        movePlayer(p, { ...idleInput(), yaw, forward: 1 }, 1 / 30, BLOCKS);
      }
      assert.ok(
        Math.hypot(p.x - dest.x, p.z - dest.z) <= 0.12,
        `${building.id}: blocked route to ${x},${z}; at ${JSON.stringify(p)}`,
      );
      assert.ok(
        Math.abs(p.y - dest.y) < 0.1,
        `${building.id}: wrong floor at ${x},${z}: ${p.y} vs ${dest.y}`,
      );
    },
  };
}

test('all 24 apartments can be reached by walking, including every bedroom and bathroom on all three floors', () => {
  const buildings = BUILDINGS.filter((b) => b.layout === 'apartments');
  assert.equal(buildings.length, 4);
  assert.equal(ROOMS.filter((r) => buildings.some((b) => b.id === r.building)).length, 72);
  for (const b of buildings) {
    const { walk } = walker(b);
    for (let level = 0; level < b.floors; level++) {
      if (level) {
        walk(0, 0, level - 1);
        walk(0, -9.3, level);
        walk(1.7, -9.3, level);
        walk(1.7, 0, level);
        walk(0, 0, level);
      }
      walk(0, 4.5, level);
      for (const side of [-1, 1]) {
        walk(side * 6.45, 4.5, level);
        walk(side * 6.45, -6, level);
        walk(side * 6.45, -4.2, level);
        walk(side * 12, -4.2, level);
        walk(side * 12, -8, level);
        walk(side * 12, -4.2, level);
        walk(side * 6.45, -4.2, level);
        walk(side * 6.45, 4.5, level);
        walk(0, 4.5, level);
      }
    }
  }
});

test('new businesses connect their front room, workshop and back office through real openings', () => {
  for (const b of BUILDINGS.filter((b) => b.layout === 'rooms')) {
    const { walk } = walker(b);
    walk(0, 0);
    walk(0, -3);
    walk(-4, -3);
    walk(-4, -4.6);
    walk(4, -4.6);
    walk(4, -8);
  }
});

test('loose props remain on the ground throughout the expanded district and after restoring the world', () => {
  let now = 100_000;
  let game = new Game({ now: () => now });
  const owner = game.join('Outer District Builder').player.id;
  const edge = MAP_BOUND - 8;
  for (const [x, z] of [[edge, 0], [-edge, 0], [0, edge], [0, -edge]])
    game.createEntity('crate', owner, { x, y: 4, z });
  for (let pass = 0; pass < 2; pass++) {
    for (let step = 0; step < 90; step++) {
      now += 34;
      game.step();
    }
    assert.equal(game.entities.size, 4, 'props must not fall out of the expanded world');
    for (const entity of game.entities.values()) {
      assert.ok(entity.y > 0.55 && entity.y < 0.8, 'loose crates should rest on the ground');
      assert.equal(entity.owner, owner);
    }
    if (!pass) game = new Game({ world: game.exportWorld(), now: () => now });
  }
});

test('upper-floor property checks use height, shared lobbies cannot be claimed, and old ownership survives expansion', () => {
  let now = 100_000;
  const game = new Game({ now: () => now });
  const joined = game.join('Apartment Owner'),
    p = joined.player;
  const b = BUILDINGS.find((b) => b.id === 'alder-court')!;
  const door = game.doors.find((d) => d.id === 'alder-court-201')!;
  Object.assign(p, toWorld(b, -1, 0.08, 4.5));
  game.doorAction(p, 'door-buy', door.id, undefined);
  assert.equal(door.owner, null);
  Object.assign(p, toWorld(b, -1, FLOOR_HEIGHT + 0.08, 4.5));
  game.doorAction(p, 'door-buy', door.id, undefined);
  assert.equal(door.owner, p.id);
  game.doorAction(p, 'door-lock', door.id, undefined);
  assert.equal(door.locked, true);
  const lobby = game.doors.find((d) => d.id === b.id)!;
  Object.assign(p, toWorld(b, 0, 0.08, b.d / 2 - 1));
  game.doorAction(p, 'door-buy', lobby.id, undefined);
  game.doorAction(p, 'door-lock', lobby.id, undefined);
  assert.equal(lobby.owner, null);
  assert.equal(lobby.locked, false);
  const oldDoor = game.doors.find((d) => d.id === 'apartment-a')!;
  oldDoor.owner = p.id;
  oldDoor.name = 'Original saved home';
  const prop = game.createEntity('shelf', p.id, { x: 70, y: 1.15, z: 32 });
  game.freeze(prop.id, true);
  const save = game.exportWorld();
  const restored = new Game({ world: save, now: () => ++now });
  assert.equal(restored.join('Apartment Owner', joined.token).player.id, p.id);
  assert.equal(restored.doors.find((d) => d.id === door.id)!.owner, p.id);
  assert.equal(restored.doors.find((d) => d.id === door.id)!.y, door.y);
  assert.equal(restored.doors.find((d) => d.id === oldDoor.id)!.name, 'Original saved home');
  assert.deepEqual(
    restored.entities.get(prop.id),
    save.entities.find((e) => e.id === prop.id),
  );
  assert.ok(
    !BLOCKS.some((block) => overlaps({ x: 70, y: 0.08, z: 32 }, block, 1.78)),
    'expansion leaves the former outer city clear',
  );
  assert.equal(new Set(INITIAL_DOORS.map((d) => d.id)).size, INITIAL_DOORS.length);
});
