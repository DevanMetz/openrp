import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, cleanText } from '../server/game.ts';
import { BLOCKS, SPAWNS, doorBox } from '../shared/map.ts';
import { idleInput, movePlayer, rayBox } from '../shared/movement.ts';
import type { GameEvent, Player } from '../shared/types.ts';

function fixture() {
  let time = 100_000;
  const game = new Game({ now: () => time, salarySeconds: 60 });
  const events: { e: GameEvent; to?: string }[] = [];
  game.onEvent = (e, to) => events.push({ e, to });
  return {
    game,
    events,
    advance: (ms: number) => {
      time += ms;
    },
    act: (p: Player, action: string, target?: string, value?: string | number | boolean) => {
      time += 100;
      game.handle(p.id, { type: 'action', action, target, value });
    },
  };
}
test('legal revocations enforce authority and preserve government role licenses', () => {
  const { game } = fixture();
  const mayor = game.join('City Mayor').player;
  const chief = game.join('Police Chief').player;
  const officer = game.join('Patrol Officer').player;
  const civilian = game.join('Sam Citizen').player;
  mayor.job = 'mayor';
  chief.job = 'chief';
  officer.job = 'police';
  officer.license = true;
  game.command(mayor, '/license', ['Sam', 'Citizen']);
  assert.equal(civilian.license, true);
  game.command(chief, '/unlicense', ['Sam', 'Citizen']);
  assert.equal(civilian.license, true, 'chief cannot revoke licenses');
  game.command(mayor, '/unlicense', ['Sam', 'Citizen']);
  assert.equal(civilian.license, false);
  game.command(mayor, '/unlicense', ['Patrol', 'Officer']);
  assert.equal(officer.license, true);
  game.command(chief, '/warrant', ['Sam', 'Citizen', 'Illegal', 'printers']);
  assert.ok(civilian.warrantUntil > 0);
  game.command(officer, '/unwarrant', ['Sam', 'Citizen']);
  assert.ok(civilian.warrantUntil > 0, 'patrol cannot revoke warrants');
  game.command(civilian, '/unwarrant', ['Sam', 'Citizen']);
  assert.ok(civilian.warrantUntil > 0, 'suspect cannot revoke own warrant');
  game.command(chief, '/unwarrant', ['Sam', 'Citizen']);
  assert.equal(civilian.warrantUntil, 0);
  game.command(mayor, '/warrant', [civilian.id, 'Stolen', 'goods']);
  assert.ok(civilian.warrantUntil > 0, 'ID targets accept reasons');
  game.command(mayor, '/unwarrant', [civilian.id]);
  assert.equal(civilian.warrantUntil, 0);
  game.command(officer, '/wanted', [civilian.id, 'Armed', 'robbery']);
  assert.equal(civilian.wantedReason, 'Armed robbery');
});
test('demotion requires a majority, retains custody, ends lockdown and blocks the old role temporarily', () => {
  const { game, act, advance } = fixture();
  const requester = game.join('Concerned Citizen').player;
  const mayor = game.join('Morgan Vale').player;
  const witness = game.join('Witness').player;
  game.applyJob(mayor, 'mayor');
  game.lockdown = true;
  advance(31_000);
  game.chat(requester, '/demote Morgan Vale Abusing city powers');
  assert.equal(game.snapshot().vote?.kind, 'demote');
  assert.equal(game.vote?.reason, 'Abusing city powers');
  act(mayor, 'job', 'medic');
  assert.equal(mayor.job, 'mayor', 'cannot switch roles to escape a vote');
  const late = game.join('Late Arrival').player;
  act(late, 'vote', undefined, true);
  assert.equal(game.vote?.yes, 1, 'late arrivals cannot change the electorate');
  act(witness, 'vote', undefined, true);
  act(witness, 'vote', undefined, true);
  assert.equal(game.vote?.yes, 2);
  mayor.arrestedUntil = game.now() + 60_000;
  advance(20_001);
  game.step();
  assert.equal(mayor.job, 'citizen');
  assert.equal(game.lockdown, false);
  assert.ok(mayor.arrestedUntil > game.now(), 'demotion does not release custody');
  assert.equal(game.vote, null);
  advance(61_000);
  game.step();
  act(mayor, 'job', 'mayor');
  assert.equal(game.vote, null, 'demoted role cannot start a new election');
  act(mayor, 'job', 'medic');
  assert.equal(mayor.job, 'medic', 'other jobs remain available');
  advance(300_000);
  act(mayor, 'job', 'mayor');
  assert.equal(game.snapshot().vote?.kind, 'job', 'former role becomes available after expiry');
});
test('demotion ties fail and request cooldown survives reconnect', () => {
  const { game, act, advance } = fixture();
  const source = game.join('Requester');
  const target = game.join('Police Officer').player;
  game.applyJob(target, 'police');
  act(source.player, 'demote', target.id, 'Unlawful arrest');
  act(target, 'vote', undefined, false);
  advance(20_001);
  game.step();
  assert.equal(target.job, 'police');
  assert.deepEqual(game.runtime.get(target.id)!.jobBans, {});
  game.disconnect(source.player.id);
  const resumed = game.join('Requester', source.token).player;
  act(resumed, 'demote', target.id, 'Another request');
  assert.equal(game.vote, null);
  advance(60_000);
  act(resumed, 'demote', target.id, 'A later request');
  assert.equal(game.snapshot().vote?.kind, 'demote');
});
test('demotion validates reasons, target roles and requester state without consuming cooldown', () => {
  const { game, act } = fixture();
  const a = game.join('Requester').player;
  const b = game.join('Medic').player;
  act(a, 'demote', b.id, 'Citizen has no job to remove');
  assert.equal(game.vote, null);
  game.applyJob(b, 'medic');
  for (const reason of ['', '   ', '\u0000']) {
    act(a, 'demote', b.id, reason);
    assert.equal(game.vote, null);
  }
  a.arrestedUntil = game.now() + 10_000;
  game.chat(a, '/demote Medic Abuse');
  assert.equal(game.vote, null);
  a.arrestedUntil = 0;
  a.deadUntil = game.now() + 10_000;
  game.command(a, '/demote', ['Medic', 'Abuse']);
  assert.equal(game.vote, null);
  a.deadUntil = 0;
  act(a, 'demote', b.id, 'Refusing treatment');
  assert.equal(game.snapshot().vote?.kind, 'demote');
  const vote = game.vote;
  act(b, 'demote', a.id, 'Cannot replace the vote');
  assert.equal(game.vote, vote);
});
test('dropped firearms transfer loaded and reserve ammunition exactly once and cancel reloads', () => {
  const { game, act } = fixture();
  const owner = game.join('Seller').player;
  const buyer = game.join('Buyer').player;
  Object.assign(owner, { x: 0, z: 24, yaw: 0, weapon: 'pistol', reloadUntil: game.now() + 1700 });
  owner.weapons.push('pistol');
  owner.ammo.pistol = 7;
  owner.reserve.pistol = 19;
  act(owner, 'drop-weapon');
  const dropped = [...game.entities.values()].find((e) => e.kind === 'weapon')!;
  assert.equal(dropped.item, 'pistol');
  assert.equal(dropped.loadedAmmo, 7);
  assert.equal(dropped.reserveAmmo, 19);
  assert.equal(owner.weapons.includes('pistol'), false);
  assert.equal(owner.ammo.pistol, undefined);
  assert.equal(owner.reserve.pistol, undefined);
  assert.equal(owner.reloadUntil, 0);
  assert.equal(owner.weapon, 'keys');
  act(owner, 'drop-weapon');
  assert.equal(game.entities.size, 1);
  Object.assign(buyer, { x: 30, z: 30 });
  act(buyer, 'interact', dropped.id);
  assert.equal(buyer.weapons.includes('pistol'), false, 'remote pickup is rejected');
  Object.assign(buyer, { x: 0.8, z: 23 });
  buyer.weapons.push('pistol');
  buyer.ammo.pistol = 2;
  act(buyer, 'interact', dropped.id);
  assert.equal(game.entities.has(dropped.id), true, 'duplicate firearm is not consumed');
  assert.equal(buyer.ammo.pistol, 2);
  buyer.weapons = buyer.weapons.filter((w) => w !== 'pistol');
  delete buyer.ammo.pistol;
  act(buyer, 'interact', dropped.id);
  assert.equal(game.entities.has(dropped.id), false);
  assert.equal(buyer.ammo.pistol, 7);
  assert.equal(buyer.reserve.pistol, 19);
  act(owner, 'interact', dropped.id);
  assert.equal(owner.weapons.includes('pistol'), false, 'another pickup cannot duplicate it');
});
test('weapon drops reject issued tools, custody, death and obstructed placement without losing equipment', () => {
  const { game, act } = fixture();
  const p = game.join('Officer').player;
  game.applyJob(p, 'police');
  p.weapon = 'pistol';
  act(p, 'drop-weapon');
  assert.equal(game.entities.size, 0);
  assert.equal(p.weapons.includes('pistol'), true);
  game.applyJob(p, 'citizen');
  p.weapons.push('shotgun');
  p.weapon = 'shotgun';
  p.ammo.shotgun = 3;
  p.reserve.shotgun = 11;
  p.arrestedUntil = game.now() + 10_000;
  game.command(p, '/dropweapon', []);
  p.arrestedUntil = 0;
  p.deadUntil = game.now() + 10_000;
  game.command(p, '/dropweapon', []);
  p.deadUntil = 0;
  const wall = BLOCKS.find((b) => b.w > 3 && b.h > 2)!;
  Object.assign(p, { x: wall.x, y: 0.08, z: wall.z + 2.5, yaw: 0 });
  act(p, 'drop-weapon');
  assert.equal(game.entities.size, 0);
  assert.equal(p.weapon, 'shotgun');
  assert.equal(p.ammo.shotgun, 3);
  assert.equal(p.reserve.shotgun, 11);
});
test('untrusted inputs cannot teleport, accelerate time, inject NaNs, or set wallets', () => {
  const { game } = fixture(),
    { player: p } = game.join('Tester');
  const start = p.z;
  for (let i = 0; i < 1000; i++)
    game.handle(p.id, { type: 'input', input: { ...idleInput(), forward: 9000, seq: i, sprint: true } });
  game.step();
  assert.ok(start - p.z < 0.24);
  game.handle(p.id, { type: 'input', input: { ...idleInput(), seq: 1001, yaw: NaN } });
  game.step();
  assert.ok(Number.isFinite(p.x));
  game.handle(p.id, { type: 'action', action: 'money', value: 999999 });
  assert.equal(p.money, 1500);
});
test('collision blocks closed doors and permits the same real doorway when open', () => {
  const { game } = fixture(),
    d = game.doors.find((v) => v.id === 'police')!;
  const motion = { x: d.x, y: 0.08, z: d.z + 2, vy: 0, grounded: true };
  for (let i = 0; i < 35; i++)
    movePlayer(motion, { ...idleInput(), forward: 1 }, 1 / 30, [...BLOCKS, doorBox(d)]);
  assert.ok(motion.z > d.z + 0.3, 'closed door blocks passage');
  for (let i = 0; i < 35; i++) movePlayer(motion, { ...idleInput(), forward: 1 }, 1 / 30, BLOCKS);
  assert.ok(motion.z < d.z - 1, 'open doorway leads into the interior');
});
test('property transactions enforce distance, ownership, affordability, keys, and resale', () => {
  const { game, act } = fixture(),
    { player: a } = game.join('Owner'),
    { player: b } = game.join('Visitor');
  const d = game.doors.find((v) => v.id === 'cafe')!,
    original = a.money;
  act(a, 'door-buy', d.id);
  assert.equal(d.owner, null, 'cannot buy from across the map');
  Object.assign(a, { x: d.x + 1.5, y: 0.08, z: d.z });
  Object.assign(b, { x: d.x + 2.5, y: 0.08, z: d.z + 0.8 });
  act(a, 'door-buy', d.id);
  assert.equal(d.owner, a.id);
  assert.equal(a.money, original - d.price);
  act(b, 'door-buy', d.id);
  assert.equal(d.owner, a.id);
  assert.equal(b.money, 1500);
  act(b, 'door-lock', d.id);
  assert.equal(d.locked, false);
  act(a, 'door-lock', d.id);
  assert.equal(d.locked, true);
  act(b, 'interact', d.id);
  assert.equal(d.open, false);
  act(a, 'door-coowner', d.id, b.id);
  act(b, 'interact', d.id);
  assert.equal(d.open, true);
  act(a, 'door-sell', d.id);
  assert.equal(d.owner, null);
  assert.equal(a.money, original - d.price + Math.floor(d.price * 0.65));
  assert.equal(d.coowners.length, 0);
});
test('job restrictions, elections, duplicate votes, cooldown and chief promotion', () => {
  const { game, act, advance } = fixture(),
    { player: a } = game.join('Candidate'),
    { player: b } = game.join('Voter');
  act(a, 'job', 'chief');
  assert.equal(a.job, 'citizen');
  act(a, 'job', 'mayor');
  assert.ok(game.vote);
  assert.equal(a.job, 'citizen');
  act(b, 'vote', undefined, true);
  act(b, 'vote', undefined, true);
  assert.equal(game.vote!.yes, 2);
  advance(21_000);
  game.step();
  assert.equal(a.job, 'mayor');
  assert.equal(game.vote, null);
  act(a, 'job', 'medic');
  assert.equal(a.job, 'mayor', 'cooldown stops immediate switch');
  advance(31_000);
  act(a, 'job', 'medic');
  assert.equal(a.job, 'medic');
  assert.ok(a.weapons.includes('medkit'));
});
test('printer purchases are atomic, production accrues, collection requires reach, police can confiscate', () => {
  const { game, act, advance } = fixture(),
    { player: p } = game.join('Printer Owner');
  act(p, 'buy', 'printer');
  assert.equal(game.entities.size, 1);
  assert.equal(p.money, 500);
  const e = [...game.entities.values()][0];
  act(p, 'buy', 'printer');
  assert.equal(game.entities.size, 1);
  assert.equal(p.money, 500);
  advance(30_000);
  game.step();
  assert.equal(e.cash, 100);
  Object.assign(p, { x: 55, y: 0, z: 55 });
  act(p, 'interact', e.id);
  assert.equal(e.cash, 100);
  Object.assign(p, SPAWNS[0]);
  act(p, 'interact', e.id);
  assert.equal(p.money, 600);
  assert.equal(e.cash, 0);
  game.applyJob(p, 'police');
  act(p, 'interact', e.id);
  assert.equal(game.entities.size, 0);
  assert.equal(p.money, 700);
});
test('shipments transfer cash and stock exactly once, with role and duplicate-weapon checks', () => {
  const { game, act } = fixture(),
    { player: seller } = game.join('Dealer'),
    { player: buyer } = game.join('Customer');
  act(buyer, 'buy', 'pistol-shipment');
  assert.equal(game.entities.size, 0);
  assert.equal(buyer.money, 1500);
  game.applyJob(seller, 'dealer');
  act(seller, 'buy', 'pistol-shipment');
  const e = [...game.entities.values()][0];
  assert.ok(e);
  Object.assign(buyer, { x: 1.2, y: 0, z: 23 });
  act(seller, 'price', e.id, 250);
  const start = seller.money;
  act(buyer, 'interact', e.id);
  assert.ok(buyer.weapons.includes('pistol'));
  assert.equal(buyer.money, 1250);
  assert.equal(seller.money, start + 250);
  assert.equal(e.stock, 4);
  act(buyer, 'interact', e.id);
  assert.equal(e.stock, 4);
  assert.equal(buyer.money, 1250);
});
test('physics props fall, freeze, enforce ownership, and do not spawn inside walls', () => {
  const { game, act, advance } = fixture(),
    { player: p } = game.join('Builder'),
    { player: b } = game.join('Other');
  act(p, 'spawn', 'crate');
  const e = [...game.entities.values()][0];
  assert.ok(e);
  const body = game.bodies.get(e.id)!;
  body.position.y = 4;
  for (let i = 0; i < 90; i++) {
    advance(34);
    game.step();
  }
  assert.ok(e.y < 0.8 && e.y > 0.55);
  game.freeze(e.id, true);
  const old = e.y;
  for (let i = 0; i < 15; i++) game.step();
  assert.equal(e.y, old);
  b.weapon = 'toolgun';
  Object.assign(b, { x: e.x, y: 0, z: e.z + 2, yaw: 0, pitch: -0.5 });
  game.runtime.get(b.id)!.tool = 'remove';
  act(b, 'primary');
  assert.equal(game.entities.size, 1);
  Object.assign(p, { x: -34, y: 0, z: 12, yaw: Math.PI / 2 });
  const count = game.entities.size;
  act(p, 'spawn', 'shelf');
  assert.equal(game.entities.size, count, 'cannot place props through the cafe wall');
});
test('fading props lose collision for six seconds and restore automatically', () => {
  const { game, act, advance } = fixture(),
    { player: p } = game.join('Builder');
  const e = game.createEntity('fence', p.id, { x: 3, y: 1.3, z: 23 });
  e.fading = true;
  game.freeze(e.id, true);
  assert.equal(game.solidEntities().length, 1);
  act(p, 'fade');
  game.step();
  assert.equal(game.solidEntities().length, 0);
  assert.equal(game.bodies.get(e.id)!.collisionResponse, false);
  advance(6100);
  game.step();
  assert.equal(game.solidEntities().length, 1);
  assert.equal(game.bodies.get(e.id)!.collisionResponse, true);
});
test('combat obeys world occlusion, consumes ammo, reloads, applies damage and respawns', () => {
  const { game, act, advance } = fixture(),
    { player: a } = game.join('Shooter'),
    { player: b } = game.join('Target');
  game.applyJob(a, 'police');
  a.weapon = 'pistol';
  Object.assign(a, { x: 5, y: 0, z: 24, yaw: 0, pitch: 0 });
  Object.assign(b, { x: 5, y: 0, z: 20 });
  act(a, 'primary');
  assert.ok(b.health < 100);
  assert.equal(a.ammo.pistol, 11);
  advance(300);
  b.health = 100;
  Object.assign(a, { x: -26, y: 0, z: -0.5, yaw: 0 });
  Object.assign(b, { x: -26, y: 0, z: -5 });
  act(a, 'primary');
  assert.equal(b.health, 100, 'wall blocks gunfire');
  a.ammo.pistol = 0;
  act(a, 'reload');
  assert.ok(a.reloadUntil);
  advance(1800);
  game.step();
  assert.equal(a.ammo.pistol, 12);
  assert.equal(a.reserve.pistol, 24);
  game.damage(b, 500, a);
  assert.ok(b.deadUntil);
  assert.equal(b.health, 0);
  advance(7100);
  game.step();
  assert.equal(b.deadUntil, 0);
  assert.equal(b.health, 100);
  assert.ok(Math.abs(b.z - SPAWNS[0].z) < 0.3);
});
test('arrests require a wanted suspect, jail cannot be escaped by job switching, release restores movement', () => {
  const { game, act, advance } = fixture(),
    { player: cop } = game.join('Officer'),
    { player: suspect } = game.join('Sam Citizen');
  game.applyJob(cop, 'police');
  cop.weapon = 'baton';
  Object.assign(cop, { x: 5, y: 0, z: 24, yaw: 0, pitch: 0 });
  Object.assign(suspect, { x: 5, y: 0, z: 22 });
  act(cop, 'primary');
  assert.equal(suspect.arrestedUntil, 0);
  game.chat(cop, '/wanted Sam Citizen Armed robbery');
  advance(700);
  act(cop, 'primary');
  assert.ok(suspect.arrestedUntil);
  assert.ok(suspect.z < -38);
  act(suspect, 'job', 'medic');
  assert.equal(suspect.job, 'citizen');
  game.chat(suspect, '/medic');
  assert.equal(suspect.job, 'citizen');
  advance(61_000);
  game.step();
  assert.equal(suspect.arrestedUntil, 0);
  assert.ok(suspect.weapons.includes('physgun'));
});
test('lockpicking takes eight seconds and marks a successful intruder wanted', () => {
  const { game, act, advance } = fixture(),
    { player: p } = game.join('Thief');
  game.applyJob(p, 'thief');
  p.weapon = 'lockpick';
  const d = game.doors.find((d) => d.id === 'cafe')!;
  d.locked = true;
  Object.assign(p, { x: d.x + 2, y: 0, z: d.z, yaw: Math.PI / 2, pitch: 0 });
  act(p, 'primary');
  assert.ok(game.runtime.get(p.id)!.lockpick);
  assert.equal(d.locked, true);
  advance(8100);
  game.step();
  assert.equal(d.locked, false);
  assert.equal(d.open, true);
  assert.ok(p.wantedUntil);
});
test('lockpicking cancels on movement and does not bypass government doors', () => {
  const { game, act, advance } = fixture(),
    { player: p } = game.join('Thief');
  game.applyJob(p, 'thief');
  p.weapon = 'lockpick';
  const d = game.doors.find((v) => v.id === 'cafe')!;
  d.locked = true;
  Object.assign(p, { x: d.x + 2, y: 0, z: d.z, yaw: Math.PI / 2, pitch: 0 });
  act(p, 'primary');
  assert.ok(game.runtime.get(p.id)!.lockpick);
  p.x += 1;
  game.step();
  assert.equal(game.runtime.get(p.id)!.lockpick, undefined);
  assert.equal(d.locked, true);
  const station = game.doors.find((v) => v.id === 'police')!;
  station.locked = true;
  Object.assign(p, { x: station.x, y: 0, z: station.z + 2, yaw: 0 });
  advance(700);
  act(p, 'primary');
  assert.equal(game.runtime.get(p.id)!.lockpick, undefined);
  assert.equal(station.locked, true);
});
test('wallet reconnect credentials persist but are excluded from snapshots', () => {
  const { game } = fixture(),
    first = game.join('Persistent');
  first.player.money = 1234;
  const snapshot = JSON.stringify(game.snapshot());
  assert.ok(!snapshot.includes(first.token));
  assert.ok(!snapshot.includes('tokenHash'));
  assert.throws(() => game.join('Duplicate', first.token), /already connected/);
  game.disconnect(first.player.id);
  const next = new Game({ profiles: game.exportProfiles() });
  const rejoined = next.join('Persistent', first.token);
  assert.equal(rejoined.player.money, 1234);
  assert.equal(rejoined.player.id, first.player.id);
  const stranger = next.join('Stranger', 'a'.repeat(64));
  assert.notEqual(stranger.player.id, first.player.id);
});
test('local chat stays nearby, global chat reaches everyone, and text remains inert', () => {
  const { game, events, advance } = fixture(),
    { player: a } = game.join('<script>alert(1)</script>'),
    { player: b } = game.join('Far Away');
  Object.assign(b, { x: 60, z: 60 });
  events.length = 0;
  game.chat(a, 'Hello locally');
  assert.equal(events.length, 1);
  assert.equal(events[0].to, a.id);
  advance(800);
  game.chat(a, '/ooc Hello everyone');
  assert.equal(events.at(-1)?.to, undefined);
  assert.equal((events.at(-1)?.e as { channel: string }).channel, 'ooc');
  assert.equal(cleanText('safe\u202etext\n', 24), 'safetext');
});
test('ray slabs handle parallel directions and hits behind the ray', () => {
  const b = { x: 0, y: 1, z: -5, w: 2, h: 2, d: 2 };
  assert.equal(rayBox({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, b), 4);
  assert.equal(rayBox({ x: 3, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, b), null);
  assert.equal(rayBox({ x: 0, y: 1, z: -9 }, { x: 0, y: 0, z: -1 }, b), null);
});
