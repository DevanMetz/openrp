import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/game.ts';
import { saveWorld, loadWorld } from '../server/persistence.ts';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
function fixture() {
  let now = 100000;
  const game = new Game({ now: () => now });
  const customer = game.join('Customer'),
    hitman = game.join('Contractor'),
    target = game.join('Target');
  game.applyJob(hitman.player, 'hitman');
  Object.assign(customer.player, { x: 0, y: 0, z: 20 });
  Object.assign(hitman.player, { x: 0, y: 0, z: 18 });
  Object.assign(target.player, { x: 5, y: 0, z: 18 });
  return {
    game,
    customer,
    hitman,
    target,
    advance: (ms: number) => {
      now += ms;
      game.step(0);
    },
  };
}
test('Game contracts debit real wallets, enforce request occlusion and pay once from actual lethal damage', () => {
  const { game, customer, hitman, target } = fixture();
  const block = game.createEntity('crate', customer.player.id, { x: 0, y: 1.5, z: 19 });
  assert.throws(() => game.contracts.request(customer.player.id, hitman.player.id, target.player.id, 500));
  game.removeEntity(block.id);
  const c = game.contracts.request(customer.player.id, hitman.player.id, target.player.id, 500);
  assert.equal(customer.player.money, 1000);
  game.contracts.accept(hitman.player.id, c.id);
  game.damage(target.player, 200, hitman.player);
  game.damage(target.player, 200, hitman.player);
  assert.equal(hitman.player.money, 2000);
  assert.equal(game.contracts.contracts.size, 0);
});
test('Game disconnect, role change and custody refund funded contracts', () => {
  for (const mode of ['disconnect', 'job', 'custody']) {
    const f = fixture();
    const c = f.game.contracts.request(f.customer.player.id, f.hitman.player.id, f.target.player.id, 500);
    f.game.contracts.accept(f.hitman.player.id, c.id);
    if (mode === 'disconnect') f.game.disconnect(f.hitman.player.id);
    if (mode === 'job') f.game.applyJob(f.hitman.player, 'citizen');
    if (mode === 'custody') {
      f.hitman.player.arrestedUntil = 200000;
      f.advance(1);
    }
    assert.equal(f.customer.player.money, 1500);
    assert.equal(f.game.contracts.contracts.size, 0);
  }
});
test('funded world replacement refunds interrupted work and retains pending earned payouts; invalid checkpoints fail closed', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'openrp-contract-test-'));
  t.after(() => {
    assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + sep) && dir.includes('openrp-contract-test-'));
    rmSync(dir, { recursive: true, force: true });
  });
  const f = fixture();
  const c = f.game.contracts.request(f.customer.player.id, f.hitman.player.id, f.target.player.id, 500);
  f.game.contracts.accept(f.hitman.player.id, c.id);
  saveWorld(dir, f.game.exportWorld());
  const restored = new Game({ world: loadWorld(dir), now: f.game.now });
  assert.equal(restored.join('Ignored', f.customer.token).player.money, 1500);
  assert.equal(restored.contracts.contracts.size, 0);
  f.hitman.player.money = 1e9;
  f.game.damage(f.target.player, 200, f.hitman.player);
  saveWorld(dir, f.game.exportWorld());
  const pending = new Game({ world: loadWorld(dir), now: f.game.now });
  assert.equal(pending.contracts.contracts.get(c.id)?.status, 'payout');
  const returning = pending.join('Ignored', f.hitman.token).player;
  returning.money -= 500;
  pending.contracts.tick();
  assert.equal(returning.money, 1e9);
  assert.equal(pending.contracts.contracts.size, 0);
  const invalid = f.game.exportWorld();
  invalid.contracts!.entries[0].price = -1;
  assert.throws(() => saveWorld(dir, invalid));
  assert.equal(loadWorld(dir)?.contracts?.entries[0].price, 500);
});

test('customer custody cancels funded contracts and refunds the customer', () => {
  const f = fixture();
  f.game.contracts.request(f.customer.player.id, f.hitman.player.id, f.target.player.id, 500);
  f.customer.player.arrestedUntil = 200000;
  f.advance(1);
  assert.equal(f.customer.player.money, 1500);
  assert.equal(f.game.contracts.contracts.size, 0);
});

test('Game settlement receipts reach only the customer and hitman after refund or payout', () => {
  for (const payout of [false, true]) {
    const f = fixture();
    const events: { event: import('../shared/types.ts').GameEvent; to?: string }[] = [];
    f.game.onEvent = (event, to) => events.push({ event, to });
    const c = f.game.contracts.request(f.customer.player.id, f.hitman.player.id, f.target.player.id, 500);
    f.game.contracts.accept(f.hitman.player.id, c.id);
    if (payout) f.game.damage(f.target.player, 200, f.hitman.player);
    else f.game.contracts.cancel(f.customer.player.id, c.id);
    const receipts = events.filter((v) => v.event.type === 'notice' && v.event.text.startsWith('Contract '));
    assert.equal(receipts.length, 2);
    assert.deepEqual(new Set(receipts.map((v) => v.to)), new Set([f.customer.player.id, f.hitman.player.id]));
    assert.ok(receipts.every((v) => v.event.type === 'notice' && v.event.text.includes('$500')));
  }
});
