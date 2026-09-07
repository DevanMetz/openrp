import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/game.ts';
import { GIVE_RANGE, MAX_TRANSFER } from '../shared/catalog.ts';
import type { GameEvent, JobId, ResidentAction } from '../shared/types.ts';

function fixture() {
  let now = 100_000;
  const game = new Game({ now: () => now });
  const a = game.join('Alex Jones').player;
  const b = game.join('Sam Citizen').player;
  Object.assign(a, { x: 0, y: 0.08, z: 23, yaw: 0, pitch: 0 });
  Object.assign(b, { x: 0, y: 0.08, z: 21 });
  const events: { event: GameEvent; to?: string }[] = [];
  game.onEvent = (event, to) => events.push({ event, to });
  return {
    game,
    a,
    b,
    events,
    advance: (ms = 800) => {
      now += ms;
    },
    act: (action: ResidentAction, value?: string | number | boolean, target = b.id) => {
      now += 800;
      game.handle(a.id, { type: 'action', action, target, value });
    },
  };
}

test('resident cash transfers conserve balances, reject invalid amounts and never burn a full wallet’s overflow', () => {
  const { a, b, act, events } = fixture();
  for (const value of [0, -1, 1.5, NaN, Infinity, true, '100', 1501, MAX_TRANSFER + 1]) {
    act('give', value);
    assert.equal(a.money, 1500);
    assert.equal(b.money, 1500);
  }
  act('give', 100);
  assert.equal(a.money, 1400);
  assert.equal(b.money, 1600);
  assert.ok(
    events.some(
      ({ event, to }) => to === b.id && event.type === 'notice' && event.text === 'Alex Jones gave you $100.',
    ),
  );
  b.money = 1e9 - 50;
  act('give', 100);
  assert.equal(a.money, 1400);
  assert.equal(b.money, 1e9 - 50);
  act('give', 50);
  assert.equal(b.money, 1e9);
  assert.equal(a.money, 1350);
  a.money = MAX_TRANSFER;
  b.money = 0;
  act('give', MAX_TRANSFER);
  assert.equal(a.money, 0);
  assert.equal(b.money, MAX_TRANSFER);
});

test('cash requires a nearby living recipient and cannot pass through a door, prop or another resident', () => {
  const { game, a, b, act } = fixture();
  b.z = a.z - GIVE_RANGE - 0.01;
  act('give', 100);
  assert.equal(a.money, 1500);
  b.z = a.z - 2;
  b.deadUntil = game.now() + 5000;
  act('give', 100);
  assert.equal(a.money, 1500);
  b.deadUntil = 0;
  const blocker = game.join('Middle Resident').player;
  Object.assign(blocker, { x: a.x, y: a.y, z: a.z - 1 });
  act('give', 100);
  assert.equal(a.money, 1500);
  assert.equal(blocker.money, 1500, 'an obstruction never becomes the selected recipient');
  game.disconnect(blocker.id);
  b.x = 10;
  const prop = game.spawn(a, 'shelf')!;
  assert.ok(prop);
  b.x = 0;
  game.bodies.get(prop.id)!.position.set(a.x, 1.3, a.z - 1);
  act('give', 100);
  assert.equal(a.money, 1500);
  game.removeEntity(prop.id);
  const door = game.doors.find((v) => v.id === 'police')!;
  Object.assign(a, { x: door.x, z: door.z + 1 });
  Object.assign(b, { x: door.x, z: door.z - 1 });
  act('give', 100);
  assert.equal(a.money, 1500);
  door.open = true;
  act('give', 100);
  assert.equal(a.money, 1400);
  assert.equal(b.money, 1600);
});

test('resident actions reject self, disconnected targets, custody and respawning actors', () => {
  const { game, a, b, act } = fixture();
  act('give', 100, a.id);
  assert.equal(a.money, 1500);
  a.arrestedUntil = game.now() + 10_000;
  act('give', 100);
  a.arrestedUntil = 0;
  a.deadUntil = game.now() + 5000;
  act('give', 100);
  a.deadUntil = 0;
  assert.equal(a.money, 1500);
  assert.equal(b.money, 1500);
  game.disconnect(b.id);
  const replacement = game.join(b.name).player;
  Object.assign(replacement, { x: b.x, y: b.y, z: b.z });
  assert.notEqual(replacement.id, b.id);
  act('give', 100);
  assert.equal(a.money, 1500);
  assert.equal(replacement.money, 1500, 'a reused display name cannot receive a stale menu transfer');
  game.applyJob(a, 'mayor');
  act('license');
  act('wanted', 'A stale target');
  assert.equal(replacement.license, false);
  assert.equal(replacement.wantedUntil, 0);
});

test('government menus enforce each role and require clean, bounded reasons', () => {
  for (const job of ['citizen', 'police', 'chief', 'mayor'] as JobId[]) {
    const { game, a, b, act } = fixture();
    game.applyJob(a, job);
    act('wanted', '  ');
    assert.equal(b.wantedUntil, 0);
    act('wanted', '\u202e' + 'Armed robbery '.repeat(12));
    assert.equal(!!b.wantedUntil, job !== 'citizen');
    if (job !== 'citizen') {
      assert.equal(b.wantedReason.length, 90);
      assert.ok(!b.wantedReason.includes('\u202e'));
    }
    b.wantedUntil = game.now() + 10_000;
    act('unwanted');
    assert.equal(!!b.wantedUntil, job === 'citizen');
    act('warrant', '  ');
    assert.equal(b.warrantUntil, 0);
    act('warrant', 'Search for stolen goods');
    assert.equal(!!b.warrantUntil, job === 'chief' || job === 'mayor');
    act('license');
    assert.equal(b.license, job === 'mayor');
    game.applyJob(b, 'police');
    b.wantedUntil = 0;
    act('wanted', 'Protected role');
    assert.equal(b.wantedUntil, 0);
    a.arrestedUntil = game.now() + 1000;
    b.warrantUntil = 0;
    act('warrant', 'In custody');
    assert.equal(b.warrantUntil, 0);
  }
});

test('chat keeps full-name and exact-ID targeting and shares the menu cooldown in both directions', () => {
  const { game, a, b, act, advance, events } = fixture();
  game.applyJob(a, 'mayor');
  const shortName = game.join('Sam').player;
  Object.assign(shortName, { x: 10, z: 23 });
  game.chat(a, '/wanted Sam Citizen Armed robbery');
  assert.equal(b.wantedReason, 'Armed robbery');
  assert.equal(shortName.wantedUntil, 0);
  advance(100);
  game.handle(a.id, { type: 'action', action: 'unwanted', target: b.id });
  assert.ok(b.wantedUntil, 'menu cannot bypass a recent chat action');
  assert.ok(
    events.some(
      ({ event, to }) =>
        to === a.id &&
        event.type === 'notice' &&
        event.text === 'Please wait a moment before another resident action.',
    ),
  );
  advance();
  game.chat(a, `/warrant ${b.id} Stolen equipment`);
  assert.ok(
    events.some(
      ({ event }) =>
        event.type === 'chat' && event.text === 'Search warrant issued for Sam Citizen: Stolen equipment',
    ),
  );
  act('give', 100);
  advance(100);
  game.chat(a, '/give 100');
  assert.equal(a.money, 1400, 'chat cannot bypass a recent menu action');
  advance();
  game.chat(a, '/give 100');
  assert.equal(a.money, 1300);
  assert.equal(b.money, 1700);
  act('unwanted');
  assert.equal(b.wantedUntil, 0);
  advance();
  game.chat(a, `/wanted ${b.id} Correct ID reason`);
  assert.equal(b.wantedReason, 'Correct ID reason');
});
