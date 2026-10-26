import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/game.ts';
import type { ClientMessage, ServerMessage, Snapshot } from '../shared/types.ts';

// Pure game assertions: collect the authoritative recipient hook directly. No transport replica.
class Observer {
  messages: ServerMessage[] = [];
  id = '';
  constructor(private game: Game) {
    const previous = game.onEvent;
    game.onEvent = (event, recipient) => {
      previous(event, recipient);
      if (this.id && (!recipient || recipient === this.id)) this.messages.push(structuredClone(event));
    };
  }
  async join(name: string) {
    const joined = this.game.join(name);
    this.id = joined.player.id;
    return { id: this.id };
  }
  send(message: ClientMessage) {
    this.game.handle(this.id, message);
  }
  async wait<T extends ServerMessage>(predicate: (message: ServerMessage) => message is T): Promise<T>;
  async wait(predicate: (message: ServerMessage) => boolean): Promise<ServerMessage>;
  async wait(predicate: (message: ServerMessage) => boolean): Promise<ServerMessage> {
    this.game.step();
    const state = structuredClone(this.game.snapshot());
    const found = this.messages.find(predicate) ?? (predicate(state) ? state : undefined);
    assert.ok(found, 'Expected game event or snapshot');
    return found;
  }
}
test('direct messages reach sender and recipient without leaking to a nearby bystander', async () => {
  let now = 100_000;
  const game = new Game({ now: () => now });
  const clients = Array.from({ length: 3 }, () => new Observer(game));
  const names = ['Message Sender', 'Message Recipient', 'Nearby Bystander'];
  const ids = await Promise.all(clients.map((c, i) => c.join(names[i])));
  for (const id of ids) Object.assign(game.players.get(id.id)!, { x: 0, z: 20 });
  clients[0].send({ type: 'chat', text: '/pm "Message Recipient" Meet at the workshop' });
  await Promise.all(
    clients
      .slice(0, 2)
      .map((c) =>
        c.wait(
          (m) =>
            m.type === 'chat' &&
            m.channel === 'pm' &&
            m.recipientName === names[1] &&
            m.text === 'Meet at the workshop',
        ),
      ),
  );
  now += 800;
  clients[1].send({ type: 'chat', text: `/pm ${ids[0].id} On my way` });
  await Promise.all(
    clients
      .slice(0, 2)
      .map((c) =>
        c.wait(
          (m) =>
            m.type === 'chat' && m.channel === 'pm' && m.recipientName === names[0] && m.text === 'On my way',
        ),
      ),
  );
  now += 800;
  clients[0].send({ type: 'chat', text: '/ooc Direct message delivery barrier' });
  await Promise.all(
    clients.map((c) => c.wait((m) => m.type === 'chat' && m.text === 'Direct message delivery barrier')),
  );
  assert.deepEqual(
    clients.map((c) => c.messages.filter((m) => m.type === 'chat' && m.channel === 'pm').length),
    [2, 2, 0],
  );
});

test('radio observers receive only their tuned channel and switching off stops delivery', async () => {
  let now = 100_000;
  const game = new Game({ now: () => now });
  const clients = Array.from({ length: 3 }, () => new Observer(game));
  const ids = await Promise.all(clients.map((c, i) => c.join(`Radio Resident ${i}`)));
  Object.assign(game.players.get(ids[1].id)!, { x: 100, z: 100 });
  const tune = async (index: number, channel: string) => {
    now += 800;
    clients[index].send({ type: 'chat', text: `/channel ${channel}` });
    await clients[index].wait(
      (m) =>
        m.type === 'notice' &&
        m.text.startsWith(channel === 'off' ? 'Text radio switched off.' : `Tuned to text radio ${channel}.`),
    );
  };
  await tune(0, '0');
  await tune(1, '0');
  now += 800;
  clients[0].send({ type: 'chat', text: '/radio First transmission' });
  await Promise.all(
    clients
      .slice(0, 2)
      .map((c) =>
        c.wait(
          (m) =>
            m.type === 'chat' &&
            m.channel === 'radio' &&
            m.radioChannel === 0 &&
            m.text === 'First transmission',
        ),
      ),
  );
  await tune(1, 'off');
  now += 800;
  clients[0].send({ type: 'chat', text: '/radio Second transmission' });
  await clients[0].wait((m) => m.type === 'chat' && m.text === 'Second transmission');
  now += 800;
  clients[0].send({ type: 'chat', text: '/ooc Radio delivery barrier' });
  await Promise.all(
    clients.map((c) => c.wait((m) => m.type === 'chat' && m.text === 'Radio delivery barrier')),
  );
  assert.deepEqual(
    clients.map((c) => c.messages.filter((m) => m.type === 'chat' && m.channel === 'radio').length),
    [2, 1, 0],
  );
});

test('mayor broadcasts reach distant game observers once and revoked authority cannot broadcast', async () => {
  let now = 100_000;
  const game = new Game({ now: () => now });
  const clients = Array.from({ length: 3 }, () => new Observer(game));
  const logged: string[] = [];
  const onChat = game.onChat;
  game.onChat = (entry) => {
    logged.push(entry.text);
    onChat(entry);
  };
  const identities = await Promise.all(clients.map((c, i) => c.join(`Broadcast Resident ${i}`)));
  const mayor = game.players.get(identities[0].id)!;
  game.applyJob(mayor, 'mayor');
  Object.assign(mayor, { x: 0, y: 0, z: 0 });
  Object.assign(game.players.get(identities[1].id)!, { x: 90, y: 0, z: 90 });
  Object.assign(game.players.get(identities[2].id)!, { x: -90, y: 0, z: -90 });
  const text = 'Town meeting at City Hall';
  clients[0].send({ type: 'chat', text: `/broadcast ${text}` });
  await Promise.all(
    clients.map((c) => c.wait((m) => m.type === 'chat' && m.channel === 'broadcast' && m.text === text)),
  );
  game.applyJob(mayor, 'citizen');
  now += 800;
  clients[0].send({ type: 'chat', text: '/broadcast revoked authority' });
  await clients[0].wait((m) => m.type === 'notice' && m.text.includes('Only a living mayor'));
  // A later accepted message establishes delivery order after the rejected attempt.
  now += 800;
  clients[0].send({ type: 'chat', text: '/ooc delivery barrier' });
  await Promise.all(clients.map((c) => c.wait((m) => m.type === 'chat' && m.text === 'delivery barrier')));
  for (const c of clients) {
    const broadcasts = c.messages.filter((m) => m.type === 'chat' && m.channel === 'broadcast');
    assert.equal(broadcasts.length, 1);
  }
  assert.deepEqual(logged, [text, 'delivery barrier']);
});

test('game observers observe pocket storage and placement without duplicate world objects', async () => {
  let now = 100_000;
  const game = new Game({ now: () => now });
  const a = new Observer(game),
    b = new Observer(game);
  const source = await a.join('Pocket Trader');
  await b.join('Pocket Witness');
  const p = game.players.get(source.id)!;
  Object.assign(p, { x: 0, y: 0, z: 20, yaw: 0 });
  const gun = game.createEntity('weapon', p.id, { x: 0, y: 0.5, z: 18 });
  Object.assign(gun, { item: 'pistol', loadedAmmo: 2, reserveAmmo: 23 });
  await b.wait((m) => m.type === 'state' && m.entities.some((e) => e.id === gun.id));
  a.send({ type: 'action', action: 'pocket-store', target: gun.id });
  const stored = await a.wait(
    (m): m is Snapshot => m.type === 'state' && !!m.players.find((v) => v.id === p.id)?.pocket?.length,
  );
  assert.equal(
    stored.entities.some((e) => e.id === gun.id),
    false,
  );
  now += 1000;
  a.send({ type: 'action', action: 'pocket-drop', target: gun.id });
  const placed = await b.wait(
    (m): m is Snapshot =>
      m.type === 'state' && m.entities.some((e) => e.kind === 'weapon' && e.id !== gun.id),
  );
  assert.equal(placed.entities.filter((e) => e.kind === 'weapon').length, 1);
  assert.equal(placed.players.find((v) => v.id === p.id)?.pocket?.length, 0);
  assert.equal(placed.entities.find((e) => e.kind === 'weapon')?.reserveAmmo, 23);
});
test('game observers receive demotion ballots, cast votes and observe the authoritative result', async () => {
  let now = 100_000;
  const game = new Game({ now: () => now });
  const clients = Array.from({ length: 3 }, () => new Observer(game));
  const [requester, target, witness] = clients;
  await requester.join('Requester');
  const elected = await target.join('Mayor');
  await witness.join('Witness');
  game.applyJob(game.players.get(elected.id)!, 'mayor');
  requester.send({ type: 'action', action: 'demote', target: elected.id, value: 'Ignoring the city' });
  const ballot = await witness.wait((m): m is Snapshot => m.type === 'state' && m.vote?.kind === 'demote');
  assert.equal(ballot.vote?.candidateName, 'Mayor');
  assert.equal(ballot.vote?.reason, 'Ignoring the city');
  witness.send({ type: 'action', action: 'vote', value: true });
  await target.wait((m) => m.type === 'state' && m.vote?.yes === 2);
  now += 20_001;
  const result = await requester.wait(
    (m): m is Snapshot =>
      m.type === 'state' &&
      m.time === now &&
      !m.vote &&
      m.players.some((p) => p.id === elected.id && p.job === 'citizen'),
  );
  assert.equal(result.players.find((p) => p.id === elected.id)?.license, false);
  now += 31_000;
  target.send({ type: 'action', action: 'job', target: 'mayor' });
  await target.wait((m) => m.type === 'notice' && m.text.includes('You were demoted'));
  assert.equal(game.vote, null);
});
test('game observers replicate a dropped firearm and transfer ammunition through pickup', async () => {
  let now = 100_000;
  const game = new Game({ now: () => now });
  const a = new Observer(game),
    b = new Observer(game);
  const source = await a.join('Trader'),
    buyer = await b.join('Customer');
  const p = game.players.get(source.id)!;
  p.weapons.push('pistol');
  p.weapon = 'pistol';
  p.ammo.pistol = 5;
  p.reserve.pistol = 17;
  a.send({ type: 'action', action: 'drop-weapon' });
  const state = await b.wait(
    (m): m is Snapshot => m.type === 'state' && m.entities.some((e) => e.kind === 'weapon'),
  );
  const entity = state.entities.find((e) => e.kind === 'weapon')!;
  assert.equal(entity.loadedAmmo, 5);
  assert.equal(entity.reserveAmmo, 17);
  Object.assign(game.players.get(buyer.id)!, { x: entity.x + 0.7, z: entity.z + 0.9 });
  now += 100;
  b.send({ type: 'action', action: 'interact', target: entity.id });
  const picked = await a.wait(
    (m): m is Snapshot =>
      m.type === 'state' && m.players.some((p) => p.id === buyer.id && p.weapons.includes('pistol')),
  );
  assert.equal(
    picked.entities.some((e) => e.id === entity.id),
    false,
  );
  assert.equal(picked.players.find((p) => p.id === buyer.id)?.reserve.pistol, 17);
  assert.equal(picked.players.find((p) => p.id === source.id)?.weapons.includes('pistol'), false);
});
test('resident menu actions use exact identities and replicate cash and government status to game observers', async () => {
  let now = Date.now();
  const game = new Game({ now: () => now });
  const a = new Observer(game),
    b = new Observer(game);
  const wa = await a.join('Resident Sender'),
    wb = await b.join('Resident Recipient');
  const sender = game.players.get(wa.id)!,
    recipient = game.players.get(wb.id)!;
  Object.assign(sender, { x: 0, y: 0.08, z: 23 });
  Object.assign(recipient, { x: 0, y: 0.08, z: 21, name: 'Renamed Recipient' });
  a.send({ type: 'action', action: 'give', target: wb.id, value: 125 });
  await b.wait((m) => m.type === 'notice' && m.text === 'Resident Sender gave you $125.');
  for (const client of [a, b]) {
    await client.wait(
      (m) =>
        m.type === 'state' &&
        m.players.some((p) => p.id === wa.id && p.money === 1375) &&
        m.players.some((p) => p.id === wb.id && p.money === 1625 && p.name === 'Renamed Recipient'),
    );
  }
  now += 800;
  a.send({ type: 'action', action: 'give', target: wb.id, value: '125' });
  await a.wait((m) => m.type === 'notice' && m.text.startsWith('Enter a whole dollar amount'));
  assert.equal(sender.money, 1375);
  assert.equal(recipient.money, 1625);
  now += 800;
  a.send({ type: 'action', action: 'wanted', target: wb.id, value: 'Impersonation' });
  await a.wait((m) => m.type === 'notice' && m.text === 'Only government jobs can use this action.');
  assert.equal(recipient.wantedUntil, 0);
  game.applyJob(sender, 'chief');
  now += 800;
  a.send({ type: 'action', action: 'wanted', target: wb.id, value: 'Armed robbery' });
  await b.wait(
    (m) => m.type === 'state' && m.players.some((p) => p.id === wb.id && p.wantedReason === 'Armed robbery'),
  );
  now += 800;
  a.send({ type: 'action', action: 'warrant', target: wb.id, value: 'Stolen equipment' });
  await b.wait((m) => m.type === 'state' && m.players.some((p) => p.id === wb.id && !!p.warrantUntil));
  now += 800;
  a.send({ type: 'chat', text: '/unwanted Renamed Recipient' });
  await b.wait((m) => m.type === 'chat' && m.text === 'Renamed Recipient is no longer wanted.');
  assert.equal(recipient.wantedUntil, 0);
});

test('game observers receive both sides of a tip jar payment', async () => {
  const game = new Game();
  const a = new Observer(game),
    b = new Observer(game);
  const owner = await a.join('Tip Owner'),
    donor = await b.join('Tip Visitor');
  Object.assign(game.players.get(owner.id)!, { x: 5, y: 0, z: 20 });
  Object.assign(game.players.get(donor.id)!, { x: 0, y: 0, z: 20 });
  const jar = game.createEntity('tipjar', owner.id, { x: 0, y: 0.32, z: 18 });
  b.send({ type: 'action', action: 'tip', target: jar.id, value: 37 });
  for (const client of [a, b]) {
    const state = await client.wait(
      (m): m is Snapshot => m.type === 'state' && m.players.find((p) => p.id === owner.id)?.money === 1537,
    );
    assert.equal(state.players.find((p) => p.id === donor.id)?.money, 1463);
    assert.equal(state.entities.filter((e) => e.id === jar.id).length, 1);
  }
});

test('weapon inspection reports are delivered to the inspecting client only', async () => {
  const game = new Game();
  const clients = [0, 1, 2].map(() => new Observer(game));
  const joins = [];
  for (const [i, c] of clients.entries()) joins.push(await c.join(`Inspection ${i}`));
  Object.assign(game.players.get(joins[0].id)!, { job: 'police', x: 0, y: 0, z: 20 });
  Object.assign(game.players.get(joins[1].id)!, { x: 0, y: 0, z: 18 });
  Object.assign(game.players.get(joins[2].id)!, { x: 5, y: 0, z: 20 });
  clients[0].send({ type: 'action', action: 'inspect-weapons', target: joins[1].id });
  await clients[0].wait((m) => m.type === 'weapon-inspection');
  await clients[1].wait((m) => m.type === 'notice' && m.text.includes('inspected your'));
  await new Promise((ok) => setTimeout(ok, 150));
  for (const c of clients.slice(1))
    assert.equal(
      c.messages.some((m) => m.type === 'weapon-inspection'),
      false,
    );
});

test('clients observe timed seizure and evidence return without duplicate firearm instances', async () => {
  let now = 100000;
  const game = new Game({ now: () => now });
  const a = new Observer(game),
    b = new Observer(game);
  const aj = await a.join('Evidence Officer'),
    bj = await b.join('Evidence Resident');
  const officer = game.players.get(aj.id)!,
    target = game.players.get(bj.id)!;
  Object.assign(officer, { job: 'police', x: 0, y: 0, z: 20 });
  Object.assign(target, { x: 0, y: 0, z: 18, wantedUntil: 200000 });
  target.weapons.push('pistol');
  target.ammo.pistol = 4;
  target.reserve.pistol = 13;
  a.send({ type: 'action', action: 'confiscate-weapons', target: target.id });
  await a.wait((m) => m.type === 'progress');
  now += 5000;
  const seized = await b.wait(
    (m): m is Snapshot =>
      m.type === 'state' && m.players.find((p) => p.id === target.id)?.evidence?.length === 1,
  );
  assert.equal(seized.players.find((p) => p.id === target.id)?.weapons.includes('pistol'), false);
  now += 800;
  a.send({ type: 'action', action: 'return-evidence', target: target.id });
  const returned = await b.wait(
    (m): m is Snapshot =>
      m.type === 'state' && m.players.find((p) => p.id === target.id)?.pocket?.length === 1,
  );
  const p = returned.players.find((p) => p.id === target.id)!;
  assert.equal(p.evidence?.length, 0);
  assert.equal(p.pocket?.[0].loadedAmmo, 4);
  assert.equal(p.pocket?.[0].reserveAmmo, 13);
});

test('game observers fund, accept and cancel contracts while target and bystander receive no contract details', async () => {
  let now = 100000;
  const game = new Game({ now: () => now });
  const clients = [0, 1, 2, 3].map(() => new Observer(game));
  const joins = [];
  for (const [i, c] of clients.entries()) joins.push(await c.join(`Contract ${i}`));
  const [customer, hitman, target, other] = joins.map((j) => game.players.get(j.id)!);
  game.applyJob(hitman, 'hitman');
  Object.assign(customer, { x: 0, y: 0, z: 20 });
  Object.assign(hitman, { x: 0, y: 0, z: 18 });
  Object.assign(target, { x: 5, y: 0, z: 18 });
  Object.assign(other, { x: 8, y: 0, z: 18 });
  clients[0].send({
    type: 'action',
    action: 'contract-request',
    target: hitman.id,
    value: JSON.stringify({ target: target.id, price: 500 }),
  });
  const offered = await clients[1].wait(
    (m): m is Extract<ServerMessage, { type: 'contract-state' }> =>
      m.type === 'contract-state' && m.entries.some((c) => c.status === 'offered'),
  );
  const id = offered.entries[0].id;
  assert.equal(customer.money, 1000);
  now += 800;
  clients[3].send({ type: 'action', action: 'contract-accept', target: id });
  await clients[3].wait((m) => m.type === 'notice' && m.text.includes('no longer available'));
  assert.equal(game.contracts.contracts.get(id)?.status, 'offered');
  now += 800;
  clients[1].send({ type: 'action', action: 'contract-accept', target: id });
  await clients[0].wait((m) => m.type === 'contract-state' && m.entries.some((c) => c.status === 'active'));
  now += 800;
  clients[0].send({ type: 'action', action: 'contract-cancel', target: id });
  await clients[0].wait((m) => m.type === 'notice' && m.text.includes('cancelled'));
  assert.equal(customer.money, 1500);
  for (const client of clients.slice(2))
    assert.equal(
      client.messages.some((m) => m.type === 'contract-state' && m.entries.length > 0),
      false,
    );
});
