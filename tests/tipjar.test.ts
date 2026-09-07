import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { Game } from '../server/game.ts';
import { saveWorld, loadWorld } from '../server/persistence.ts';

function fixture() {
  const game = new Game({ now: () => 100_000 });
  const owner = game.join('Jar Owner');
  const donor = game.join('Generous Visitor').player;
  Object.assign(owner.player, { x: 5, y: 0, z: 20 });
  Object.assign(donor, { x: 0, y: 0, z: 20 });
  const jar = game.createEntity('tipjar', owner.player.id, { x: 0, y: 0.32, z: 18 });
  return { game, owner, donor, jar };
}

test('tips conserve balances and reject invalid amounts, self donation and wallet overflow', () => {
  const { game, owner, donor, jar } = fixture();
  for (const amount of [0, -1, 1.5, NaN, Infinity, true, '25', 1501, 50_001]) {
    game.donate(donor, jar.id, amount);
    assert.equal(donor.money, 1500);
    assert.equal(owner.player.money, 1500);
  }
  game.donate(donor, jar.id, 125);
  assert.equal(donor.money, 1375);
  assert.equal(owner.player.money, 1625);
  Object.assign(owner.player, { x: 0, y: 0, z: 20 });
  game.donate(owner.player, jar.id, 50);
  assert.equal(owner.player.money, 1625);
  owner.player.money = 1e9 - 10;
  game.donate(donor, jar.id, 11);
  assert.equal(donor.money, 1375);
  assert.equal(owner.player.money, 1e9 - 10);
});

test('tips enforce reach, occlusion, custody, death and correct target kind', () => {
  const { game, owner, donor, jar } = fixture();
  donor.x = 10;
  game.donate(donor, jar.id, 25);
  donor.x = 0;
  const blocker = game.createEntity('crate', donor.id, { x: 0, y: 0.9, z: 19 });
  game.donate(donor, jar.id, 25);
  game.donate(donor, blocker.id, 25);
  game.removeEntity(blocker.id);
  for (const state of ['arrestedUntil', 'deadUntil'] as const) {
    donor[state] = game.now() + 1000;
    game.donate(donor, jar.id, 25);
    donor[state] = 0;
  }
  assert.equal(donor.money, 1500);
  assert.equal(owner.player.money, 1500);
  game.donate(donor, jar.id, 25);
  assert.equal(donor.money, 1475);
  game.removeEntity(jar.id);
  game.donate(donor, jar.id, 25);
  assert.equal(donor.money, 1475, 'stale targets cannot receive payment');
});

test('tip jars respect purchase limits and offline tips survive a world replacement', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'openrp-tip-test-'));
  t.after(() => {
    assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + sep) && dir.includes('openrp-tip-test-'));
    rmSync(dir, { recursive: true, force: true });
  });
  const { game, owner, donor, jar } = fixture();
  game.buy(owner.player, 'tipjar');
  assert.equal(owner.player.money, 1500, 'existing jar reserves the one-jar allowance');
  game.disconnect(owner.player.id);
  game.donate(donor, jar.id, 73);
  assert.equal(donor.money, 1427);
  saveWorld(dir, game.exportWorld());
  const restored = new Game({ world: loadWorld(dir), now: game.now });
  assert.equal(restored.entities.get(jar.id)?.kind, 'tipjar');
  const returning = restored.join('Ignored', owner.token).player;
  assert.equal(returning.money, 1573);
  restored.removeEntity(jar.id);
  assert.equal(returning.money, 1573, 'destroying a jar does not destroy previously paid tips');
  restored.buy(returning, 'tipjar');
  assert.equal(returning.money, 1548);
  assert.equal([...restored.entities.values()].filter((e) => e.kind === 'tipjar').length, 1);
});
