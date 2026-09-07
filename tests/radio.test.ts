import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/game.ts';
import type { GameEvent, Player } from '../shared/types.ts';

test('text radio isolates tuned recipients, rejects invalid tuning and resets after reconnect', () => {
  let now = 100_000;
  const game = new Game({ now: () => now });
  const a = game.join('Radio A').player;
  const joined = game.join('Radio B');
  const b = joined.player;
  const c = game.join('Radio C').player;
  Object.assign(b, { x: 100, z: 100 });
  const events: { e: GameEvent; to?: string }[] = [];
  const logs: { channel: string; radioChannel?: number; text: string }[] = [];
  game.onEvent = (e, to) => events.push({ e, to });
  game.onChat = (entry) => logs.push(entry);
  const send = (p: Player, text: string) => {
    now += 800;
    events.length = 0;
    game.handle(p.id, { type: 'chat', text });
  };
  const recipients = () => events.filter(({ e }) => e.type === 'chat').map(({ to }) => to).sort();
  send(a, '/radio Default channel');
  assert.deepEqual(recipients(), [a.id, b.id, c.id].sort());
  send(a, '/channel 100');
  send(b, '/channel 100');
  send(c, '/channel off');
  send(a, '/RADIO Distant message');
  assert.deepEqual(recipients(), [a.id, b.id].sort());
  assert.deepEqual(logs.at(-1)?.radioChannel, 100);
  for (const value of ['101', '-1', '1.5', '1e1', 'NaN', '2 extra']) {
    send(b, `/channel ${value}`);
    assert.ok(events.some(({ e }) => e.type === 'notice' && e.tone === 'error'));
    send(a, '/radio Still tuned');
    assert.deepEqual(recipients(), [a.id, b.id].sort());
  }
  const count = logs.length;
  send(c, '/radio Off cannot transmit');
  assert.equal(logs.length, count);
  send(a, '/radio   ');
  assert.equal(logs.length, count);
  send(a, '/channel 0');
  game.handle(a.id, { type: 'chat', text: '/radio cooldown bypass' });
  assert.equal(logs.length, count);
  send(a, '/radio Channel zero');
  assert.deepEqual(recipients(), [a.id]);
  assert.equal(logs.at(-1)?.radioChannel, 0);
  game.disconnect(b.id);
  const returning = game.join('Radio B', joined.token).player;
  send(a, '/channel 1');
  send(a, '/radio Reconnected listener');
  assert.deepEqual(recipients(), [a.id, returning.id].sort());
});
