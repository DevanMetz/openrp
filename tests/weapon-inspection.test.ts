import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/game.ts';
import type { GameEvent, JobId } from '../shared/types.ts';
function fixture() {
  let now = 100000;
  const game = new Game({ now: () => now });
  const officer = game.join('Inspector').player,
    target = game.join('Resident').player;
  Object.assign(officer, { job: 'police', x: 0, y: 0, z: 20 });
  Object.assign(target, { x: 0, y: 0, z: 18 });
  target.weapons.push('pistol');
  target.ammo.pistol = 3;
  target.reserve.pistol = 17;
  target.pocket = [
    {
      id: 'stored-gun',
      kind: 'weapon',
      health: 100,
      cash: 0,
      stock: 0,
      price: 0,
      color: '#ffffff',
      item: 'pistol',
      loadedAmmo: 5,
      reserveAmmo: 11,
    },
  ];
  const events: { event: GameEvent; to?: string }[] = [];
  game.onEvent = (event, to) => events.push({ event, to });
  return {
    game,
    officer,
    target,
    events,
    act: () => {
      now += 800;
      game.handle(officer.id, { type: 'action', action: 'inspect-weapons', target: target.id });
    },
  };
}
test('inspection reports exact carried and pocketed firearms only to the officer and notifies the resident', () => {
  const { officer, target, events, act } = fixture();
  act();
  const reports = events.filter((v) => v.event.type === 'weapon-inspection');
  assert.equal(reports.length, 1);
  assert.equal(reports[0].to, officer.id);
  const report = reports[0].event;
  assert.equal(report.type, 'weapon-inspection');
  if (report.type !== 'weapon-inspection') return;
  assert.equal(report.target, target.id);
  assert.equal(report.license, false);
  assert.deepEqual(report.firearms, [
    { weapon: 'pistol', location: 'carried', loaded: 3, reserve: 17, issued: false },
    { weapon: 'pistol', location: 'pocket', loaded: 5, reserve: 11, issued: false },
  ]);
  assert.ok(events.some((v) => v.to === target.id && v.event.type === 'notice'));
  assert.equal(target.ammo.pistol, 3);
  assert.equal(target.pocket?.length, 1);
});
test('inspection checks real role, distance, walls, life and custody, and shares the resident cooldown', () => {
  const { game, officer, target, events, act } = fixture();
  for (const job of ['citizen', 'mayor', 'medic'] as JobId[]) {
    officer.job = job;
    officer.jobTitle = 'Chief';
    act();
  }
  officer.job = 'police';
  target.z = 16;
  act();
  target.z = 18;
  const wall = game.createEntity('crate', target.id, { x: 0, y: 1.5, z: 19 });
  act();
  game.removeEntity(wall.id);
  officer.deadUntil = 200000;
  act();
  officer.deadUntil = 0;
  officer.arrestedUntil = 200000;
  act();
  officer.arrestedUntil = 0;
  target.deadUntil = 200000;
  act();
  target.deadUntil = 0;
  assert.equal(events.filter((v) => v.event.type === 'weapon-inspection').length, 0);
  officer.job = 'chief';
  act();
  game.handle(officer.id, { type: 'action', action: 'inspect-weapons', target: target.id });
  assert.equal(events.filter((v) => v.event.type === 'weapon-inspection').length, 1);
});
