import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/game.ts';
import { EVIDENCE_CAPACITY } from '../shared/catalog.ts';
import { saveWorld, loadWorld } from '../server/persistence.ts';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
function fixture() {
  let now = 100000;
  const game = new Game({ now: () => now });
  const a = game.join('Officer').player,
    joined = game.join('Suspect'),
    b = joined.player;
  Object.assign(a, { job: 'police', x: 0, y: 0, z: 20 });
  Object.assign(b, { x: 0, y: 0, z: 18, wantedUntil: 200000 });
  b.weapons.push('pistol');
  b.ammo.pistol = 3;
  b.reserve.pistol = 17;
  b.weapon = 'pistol';
  b.reloadUntil = 110000;
  const gun = game.createEntity('weapon', b.id, { x: 4, y: 0.4, z: 18 });
  Object.assign(gun, { item: 'pistol', loadedAmmo: 5, reserveAmmo: 11 });
  const { id, kind, health, cash, stock, price, item, loadedAmmo, reserveAmmo, color } = gun;
  b.pocket = [{ id, kind: 'weapon', health, cash, stock, price, item, loadedAmmo, reserveAmmo, color }];
  game.removeEntity(id);
  return {
    game,
    a,
    b,
    token: joined.token,
    advance: (ms = 5000) => {
      now += ms;
      game.step(0);
    },
  };
}
test('timed confiscation preserves duplicate guns and rounds; partial returns do not overwrite equipment', () => {
  const { game, a, b, advance } = fixture();
  game.startConfiscation(a, b.id);
  advance(4999);
  assert.equal(b.evidence?.length ?? 0, 0);
  advance(1);
  assert.equal(b.evidence?.length, 2);
  assert.equal(b.weapons.includes('pistol'), false);
  assert.equal(b.weapon, 'keys');
  assert.equal(b.reloadUntil, 0);
  assert.equal(b.ammo.pistol, undefined);
  assert.equal(b.pocket?.length, 0);
  assert.deepEqual(
    b.evidence?.map((e) => [e.loadedAmmo, e.reserveAmmo]),
    [
      [3, 17],
      [5, 11],
    ],
  );
  b.pocket = Array.from({ length: 7 }, (_, i) => ({ ...b.evidence![0], id: `occupied-${i}` }));
  b.weapons.push('pistol');
  b.ammo.pistol = 8;
  b.reserve.pistol = 99;
  advance(800);
  game.returnEvidence(a, b.id);
  assert.equal(b.evidence?.length, 1);
  assert.equal(b.pocket.length, 8);
  assert.equal(b.ammo.pistol, 8);
  assert.equal(b.reserve.pistol, 99);
  advance(800);
  game.returnEvidence(a, b.id);
  assert.equal(b.evidence?.length, 1);
  b.pocket = [];
  advance(800);
  game.returnEvidence(a, b.id);
  assert.equal(b.evidence?.length, 0);
  assert.equal(b.pocket.length, 1);
  assert.equal(b.pocket[0].reserveAmmo, 11);
});
test('confiscation cancels on lost reach, occlusion, authority, license, wanted status, custody, death and disconnect', () => {
  for (const change of [
    ({ b }: ReturnType<typeof fixture>) => {
      b.x = 8;
    },
    ({ game, b }: ReturnType<typeof fixture>) => {
      game.createEntity('crate', b.id, { x: 0, y: 1.5, z: 19 });
    },
    ({ a }: ReturnType<typeof fixture>) => {
      a.job = 'citizen';
    },
    ({ b }: ReturnType<typeof fixture>) => {
      b.license = true;
    },
    ({ b }: ReturnType<typeof fixture>) => {
      b.wantedUntil = 0;
    },
    ({ b }: ReturnType<typeof fixture>) => {
      b.arrestedUntil = 200000;
    },
    ({ a }: ReturnType<typeof fixture>) => {
      a.deadUntil = 200000;
    },
    ({ game, b }: ReturnType<typeof fixture>) => {
      game.disconnect(b.id);
    },
  ]) {
    const f = fixture();
    f.game.startConfiscation(f.a, f.b.id);
    change(f);
    f.advance();
    assert.equal(f.b.evidence, undefined);
    assert.ok(f.b.weapons.includes('pistol'));
  }
});
test('full evidence storage rejects confiscation atomically and unauthorized returns do nothing', () => {
  const { game, a, b, advance } = fixture();
  b.evidence = Array.from({ length: EVIDENCE_CAPACITY }, (_, i) => ({
    ...b.pocket![0],
    kind: 'weapon',
    id: `evidence-${i}`,
  }));
  game.startConfiscation(a, b.id);
  advance();
  assert.equal(b.evidence.length, EVIDENCE_CAPACITY);
  assert.ok(b.weapons.includes('pistol'));
  assert.equal(b.pocket?.length, 1);
  a.job = 'mayor';
  game.returnEvidence(a, b.id);
  assert.equal(b.evidence.length, EVIDENCE_CAPACITY);
});
test('evidence survives role changes, reconnect and validated world replacement; duplicate IDs fail closed', (t) => {
  const f = fixture();
  f.game.startConfiscation(f.a, f.b.id);
  f.advance();
  f.game.applyJob(f.b, 'medic');
  f.game.disconnect(f.b.id);
  const dir = mkdtempSync(join(tmpdir(), 'openrp-evidence-test-'));
  t.after(() => {
    assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + sep) && dir.includes('openrp-evidence-test-'));
    rmSync(dir, { recursive: true, force: true });
  });
  saveWorld(dir, f.game.exportWorld());
  const restored = new Game({ world: loadWorld(dir), now: f.game.now });
  const b = restored.join('Ignored', f.token).player;
  assert.equal(b.evidence?.length, 2);
  assert.deepEqual(
    b.evidence?.map((e) => [e.loadedAmmo, e.reserveAmmo]),
    [
      [3, 17],
      [5, 11],
    ],
  );
  const world = restored.exportWorld();
  world.profiles.find((p) => p.id === b.id)!.character!.evidence![1].id = b.evidence![0].id;
  assert.throws(() => saveWorld(dir, world));
  assert.equal(loadWorld(dir)?.profiles.find((p) => p.id === b.id)?.character?.evidence?.length, 2);
});
