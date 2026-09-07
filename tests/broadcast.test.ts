import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOBS } from '../shared/catalog.ts';
import { Game } from '../server/game.ts';
import type { GameEvent } from '../shared/types.ts';

test('mayor broadcasts enforce real authority, custody, text limits and shared cooldown', () => {
  let time = 100_000;
  const game = new Game({ now: () => time });
  const mayor = game.join('City Mayor').player;
  const events: { event: GameEvent; to?: string }[] = [];
  const logs: unknown[] = [];
  game.onEvent = (event, to) => events.push({ event, to });
  game.onChat = (entry) => logs.push(entry);
  const send = (text: string) => {
    time += 800;
    events.length = 0;
    game.handle(mayor.id, { type: 'chat', text });
  };
  mayor.jobTitle = 'Mayor';
  send('/broadcast forged authority');
  assert.equal(logs.length, 0);
  assert.ok(events.every(({ event, to }) => event.type === 'notice' && to === mayor.id));
  game.applyJob(mayor, 'mayor');
  for (const status of ['deadUntil', 'arrestedUntil'] as const) {
    mayor[status] = time + 10_000;
    send('/broadcast unavailable');
    assert.equal(logs.length, 0);
    assert.ok(events.every(({ event }) => event.type !== 'chat'));
    mayor[status] = 0;
  }
  send('/BROADCAST Welcome <residents>');
  assert.deepEqual(events, [{ event: {
    type: 'chat', name: mayor.name, text: 'Welcome <residents>',
    channel: 'broadcast', color: JOBS.mayor.color,
  }, to: undefined }]);
  assert.equal(logs.length, 1, 'one log for the server-wide message');
  game.handle(mayor.id, { type: 'chat', text: '/ooc bypass' });
  assert.equal(events.length, 1, 'broadcast shares the chat cooldown');
  send('/broadcast   ');
  assert.equal(events.length, 0);
  assert.equal(logs.length, 1);
  send('/broadcast ' + 'x'.repeat(300));
  const last = events[0].event;
  assert.equal(last.type, 'chat');
  if (last.type === 'chat') assert.equal(last.text.length, 229);
});
