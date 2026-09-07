import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/game.ts';
import type { GameEvent } from '../shared/types.ts';

test('direct messages resolve exact recipients and never fan out to bystanders or invalid targets', () => {
  let now = 100_000;
  const game = new Game({ now: () => now });
  const a = game.join('Alice').player;
  const b = game.join('Morgan Vale').player;
  game.join('Morgan');
  const events: { e: GameEvent; to?: string }[] = [];
  const logs: { recipientId?: string; text: string }[] = [];
  game.onEvent = (e, to) => events.push({ e, to });
  game.onChat = (entry) => logs.push(entry);
  const send = (text: string) => {
    now += 800;
    events.length = 0;
    game.handle(a.id, { type: 'chat', text });
  };
  for (const address of ['"morgan vale"', b.id]) {
    send(`/PM ${address} Meet <here>`);
    assert.deepEqual(events.map(({ to }) => to), [a.id, b.id]);
    assert.ok(events.every(({ e }) => e.type === 'chat' && e.channel === 'pm' && e.text === 'Meet <here>' && e.recipientName === b.name));
    assert.equal(logs.at(-1)?.recipientId, b.id);
    game.handle(a.id, { type: 'chat', text: `/pm ${b.id} spam` });
    assert.equal(events.length, 2);
  }
  assert.equal(logs.length, 2, 'one log per accepted message');
  for (const text of ['/pm', '/pm "Morgan Vale"', '/pm "Missing" hello', '/pm Alice hello', '/pm "Morgan Va" hello', '/pm "Morgan Vale hello']) {
    send(text);
    assert.ok(events.every(({ e, to }) => e.type === 'notice' && to === a.id));
    assert.equal(logs.length, 2);
  }
  game.disconnect(b.id);
  send(`/pm ${b.id} offline`);
  assert.equal(logs.length, 2);
  assert.ok(events.every(({ e }) => e.type === 'notice'));
});
