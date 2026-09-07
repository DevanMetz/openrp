import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { startServer } from '../server/main.ts';
import { Game } from '../server/game.ts';
import type { ClientMessage, ServerMessage, Snapshot } from '../shared/types.ts';

class Client {
  ws: WebSocket;
  messages: ServerMessage[] = [];
  constructor(url: string, origin?: string) {
    this.ws = new WebSocket(url, origin ? { origin } : undefined);
    this.ws.on('message', (raw) => this.messages.push(JSON.parse(raw.toString())));
  }
  async open(): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise<void>((ok, fail) => {
      this.ws.once('open', ok);
      this.ws.once('error', fail);
    });
  }
  send(msg: ClientMessage): void {
    this.ws.send(JSON.stringify(msg));
  }
  async wait<T extends ServerMessage>(predicate: (message: ServerMessage) => message is T): Promise<T>;
  async wait(predicate: (message: ServerMessage) => boolean): Promise<ServerMessage>;
  async wait(predicate: (message: ServerMessage) => boolean): Promise<ServerMessage> {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const value = this.messages.find(predicate);
      if (value) return value;
      await new Promise((ok) => setTimeout(ok, 15));
    }
    throw new Error('Timed out waiting for server message.');
  }
  async join(name: string, token?: string) {
    this.send({ type: 'join', name, token });
    return await this.wait((m): m is Extract<ServerMessage, { type: 'welcome' }> => m.type === 'welcome');
  }
}
test('two real clients share player, prop, job and chat state; disconnect cleanup and reconnect preserve wallet', async () => {
  const game = new Game(),
    app = await startServer({ port: 0, host: '127.0.0.1', production: true, persist: false, game });
  const a = new Client(`ws://127.0.0.1:${app.port}/ws`),
    b = new Client(`ws://127.0.0.1:${app.port}/ws`);
  try {
    await Promise.all([a.open(), b.open()]);
    const wa = await a.join('Alex Builder');
    const wb = await b.join('Jordan Medic');
    assert.notEqual(wa.id, wb.id);
    const shared = await a.wait((m): m is Snapshot => m.type === 'state' && m.players.length === 2);
    assert.equal(shared.players.length, 2);
    a.send({ type: 'action', action: 'spawn', target: 'crate' });
    const props = await b.wait((m): m is Snapshot => m.type === 'state' && m.entities.length === 1);
    assert.equal(props.entities[0].owner, wa.id);
    b.send({ type: 'action', action: 'job', target: 'medic' });
    await a.wait((m) => m.type === 'state' && m.players.some((p) => p.id === wb.id && p.job === 'medic'));
    b.send({ type: 'chat', text: '/ooc Shared server hello' });
    await a.wait((m) => m.type === 'chat' && m.text === 'Shared server hello');
    a.send({ type: 'action', action: 'buy', target: 'meal' });
    await b.wait((m) => m.type === 'state' && m.players.some((p) => p.id === wa.id && p.money === 1450));
    assert.ok(!JSON.stringify(props).includes(wa.token));
    const closed = new Promise((ok) => a.ws.once('close', ok));
    a.ws.close();
    await closed;
    await b.wait((m) => m.type === 'state' && m.players.length === 1 && m.entities.length === 0);
    const rejoin = new Client(`ws://127.0.0.1:${app.port}/ws`);
    await rejoin.open();
    const wr = await rejoin.join('Alex Builder', wa.token);
    assert.equal(wr.id, wa.id);
    const resumed = await rejoin.wait(
      (m): m is Snapshot => m.type === 'state' && m.players.some((p) => p.id === wr.id),
    );
    assert.equal(resumed.players.find((p) => p.id === wr.id)!.money, 1450);
    rejoin.ws.close();
  } finally {
    a.ws.terminate();
    b.ws.terminate();
    await app.close();
  }
});
test('server rejects cross-origin socket use, invalid JSON, and message floods', async () => {
  const app = await startServer({ port: 0, host: '127.0.0.1', production: true, persist: false });
  const url = `ws://127.0.0.1:${app.port}/ws`;
  try {
    const wrong = new Client(url, 'https://unrelated.example');
    await assert.rejects(wrong.open(), /403/);
    const malformed = new Client(url);
    await malformed.open();
    const invalidClosed = new Promise<number>((ok) => malformed.ws.once('close', (code) => ok(code)));
    malformed.ws.send('{');
    assert.equal(await invalidClosed, 1007);
    const flood = new Client(url);
    await flood.open();
    const floodClosed = new Promise<number>((ok) => flood.ws.once('close', (code) => ok(code)));
    for (let i = 0; i < 130; i++) flood.send({ type: 'ping', time: i });
    assert.equal(await floodClosed, 1008);
  } finally {
    await app.close();
  }
});
test('server status is real and optional server passwords are enforced', async () => {
  const app = await startServer({
    port: 0,
    host: '127.0.0.1',
    production: true,
    persist: false,
    password: 'test-only-password',
  });
  const bad = new Client(`ws://127.0.0.1:${app.port}/ws`),
    good = new Client(`ws://127.0.0.1:${app.port}/ws`);
  try {
    const status = await (await fetch(`http://127.0.0.1:${app.port}/api/status`)).json();
    assert.equal(status.players, 0);
    assert.equal(status.password, true);
    await bad.open();
    const closed = new Promise<number>((ok) => bad.ws.once('close', (code) => ok(code)));
    bad.send({ type: 'join', name: 'No Password' });
    assert.equal(await closed, 1008);
    await good.open();
    good.send({ type: 'join', name: 'Has Password', password: 'test-only-password' });
    await good.wait((m) => m.type === 'welcome');
    const after = await (await fetch(`http://127.0.0.1:${app.port}/api/status`)).json();
    assert.equal(after.players, 1);
    assert.equal(await (await fetch(`http://127.0.0.1:${app.port}/health`)).text(), 'ok');
  } finally {
    bad.ws.terminate();
    good.ws.terminate();
    await app.close();
  }
});
