import { Game } from '../server/game.ts';
import { VoiceRelay, type VoiceSocket } from '../server/voice.ts';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { WebSocket } from 'ws';
import { startTestWorker as startServer } from './support/worker.ts';
import * as voice from '../shared/voice.ts';
import type { ServerMessage } from '../shared/types.ts';

let app: Awaited<ReturnType<typeof startServer>>;
before(async () => {
  app = await startServer({ adminKey: 'voice-operator-test' });
});
after(async () => {
  await app.close();
});
const pause = (ms = 70) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (predicate: () => boolean | Promise<boolean>) => {
  const deadline = Date.now() + 3000;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error('Voice test timed out');
    await pause(10);
  }
};

test('voice packets preserve PCM, clamp unsafe samples, and reject forged or malformed frames', () => {
  const id = 'e3d0669c-eef0-4fb8-aa58-89c52e056bc4';
  const samples = Float32Array.from({ length: voice.VOICE_SAMPLES }, (_, i) => Math.sin(i * 0.1) * 0.7);
  samples[0] = Infinity;
  samples[1] = 2;
  samples[2] = -2;
  const encoded = new Uint8Array(voice.encodeVoiceFrame(samples, 4294967295));
  const decoded = voice.decodeVoiceFrame(voice.identifyVoiceFrame(id, encoded).buffer as ArrayBuffer)!;
  assert.equal(decoded.id, id);
  assert.equal(decoded.sequence, 4294967295);
  assert.equal(decoded.samples[0], 0);
  assert.ok(decoded.samples[1] > 0.999 && decoded.samples[2] < -0.999);
  for (let i = 3; i < samples.length; i++) assert.ok(Math.abs(samples[i] - decoded.samples[i]) < 0.00005);
  assert.equal(voice.validVoiceFrame(encoded.subarray(1)), false);
  encoded[2] = 9;
  assert.equal(voice.validVoiceFrame(encoded), false);
  assert.equal(voice.decodeVoiceFrame(new ArrayBuffer(10)), undefined);
  assert.equal(voice.inVoiceRange({ x: 0, y: 0, z: 0 }, { x: 0, y: 28, z: 0 }), false);
});

for (const sampleRate of [44100, 48000])
  test(`capture worklet resamples ${sampleRate} Hz and discards audio outside push-to-talk`, () => {
    const packets: Float32Array[] = [];
    let Processor: any;
    const code = ts.transpileModule(
      readFileSync(new URL('../client/voice-worklet.ts', import.meta.url), 'utf8'),
      {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
      },
    ).outputText;
    vm.runInNewContext(code, {
      sampleRate,
      Float32Array,
      exports: {},
      require: () => voice,
      AudioWorkletProcessor: class {
        port = {
          onmessage: (_: unknown) => {},
          postMessage: (data: Float32Array) => packets.push(data.slice()),
        };
      },
      registerProcessor: (_name: string, processor: unknown) => {
        Processor = processor;
      },
    });
    const processor = new Processor();
    const block = new Float32Array(128).fill(0.25);
    for (let i = 0; i < 20; i++) processor.process([[block]]);
    assert.equal(packets.length, 0, 'microphone is gated off initially');
    processor.port.onmessage({ data: true });
    for (let offset = 0; offset < sampleRate; offset += 128)
      processor.process([[new Float32Array(Math.min(128, sampleRate - offset)).fill(0.25)]]);
    assert.equal(packets.length, 50, 'one second becomes 50 complete 20 ms packets');
    assert.ok(packets.every((p) => p.length === 320 && p.every((n) => Math.abs(n - 0.25) < 0.00001)));
    processor.port.onmessage({ data: false });
    for (let i = 0; i < 20; i++) processor.process([[block]]);
    assert.equal(packets.length, 50, 'releasing push-to-talk stops capture');
  });

async function resident(base: string, name: string, token?: string) {
  const game = new WebSocket(`${base}/ws`);
  const messages: ServerMessage[] = [];
  game.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
  await once(game, 'open');
  game.send(JSON.stringify({ type: 'join', name, token }));
  await waitFor(() => messages.some((m) => m.type === 'welcome'));
  const welcome = messages.find((m) => m.type === 'welcome') as Extract<ServerMessage, { type: 'welcome' }>;
  const audio = new WebSocket(`${base}/voice`);
  const packets: ArrayBuffer[] = [];
  let ready = false;
  audio.on('message', (raw, binary) => {
    if (binary) packets.push(Uint8Array.from(raw as Buffer).buffer);
    else if (JSON.parse(raw.toString()).type === 'ready') ready = true;
  });
  await once(audio, 'open');
  audio.send(JSON.stringify({ type: 'join', ticket: welcome.voiceTicket }));
  await waitFor(() => ready);
  let sequence = 0;
  const config = async (listening = true, transmitting = true, muted: string[] = []) => {
    audio.send(JSON.stringify({ type: 'config', listening, transmitting, muted }));
    const ack = once(audio, 'pong');
    audio.ping();
    await ack;
  };
  await config();
  return {
    game,
    audio,
    welcome,
    packets,
    config,
    speak: () =>
      audio.send(voice.encodeVoiceFrame(new Float32Array(voice.VOICE_SAMPLES).fill(0.2), ++sequence)),
    close: () => {
      game.close();
      audio.close();
    },
  };
}

test(
  'real voice sockets enforce proximity, push-to-talk, mute and deafen while game traffic continues',
  { timeout: 30_000 },
  async () => {
    const clients: Awaited<ReturnType<typeof resident>>[] = [];
    try {
      const base = `ws://127.0.0.1:${app.port}`;
      const fixture = new Game();
      const seeds = ['Voice Alice', 'Voice Bailey', 'Voice Casey'].map((name) => fixture.join(name));
      seeds.forEach((seed, i) => Object.assign(seed.player, { x: i === 2 ? 60 : i * 2, y: 0.12, z: 24 }));
      await app.restore(fixture.exportWorld());
      const a = await resident(base, 'Voice Alice', seeds[0].token);
      clients.push(a);
      const b = await resident(base, 'Voice Bailey', seeds[1].token);
      clients.push(b);
      const c = await resident(base, 'Voice Casey', seeds[2].token);
      clients.push(c);
      a.speak();
      await waitFor(() => b.packets.length === 1);
      assert.equal(
        voice.decodeVoiceFrame(b.packets[0])?.id,
        a.welcome.id,
        'sender comes from the authenticated session',
      );
      assert.equal(a.packets.length, 0, 'no self echo');
      assert.equal(c.packets.length, 0, 'distant players receive no audio bytes');
      const expectQuiet = async (reason: string) => {
        const before = b.packets.length;
        a.speak();
        await pause();
        assert.equal(b.packets.length, before, reason);
      };
      await b.config(true, true, [a.welcome.id]);
      await expectQuiet('individual mute is enforced by the relay');
      await b.config(false);
      await expectQuiet('deafened players receive no audio');
      await b.config();
      await a.config(true, false);
      await expectQuiet('PTT must be enabled');
      await a.config();
      const before = b.packets.length;
      a.speak();
      await waitFor(() => b.packets.length === before + 1);
      assert.equal((await app.status()).players, 3);
      assert.ok(clients.every((c) => c.game.readyState === WebSocket.OPEN));
      await b.config(true, true, [a.welcome.id]);
      a.close();
      await waitFor(async () => (await app.status()).players === 2);
      const resumed = await resident(base, 'Voice Alice', a.welcome.token);
      clients.push(resumed);
      assert.equal(resumed.welcome.id, a.welcome.id);
      const mutedBeforeReconnect = b.packets.length;
      resumed.speak();
      await pause();
      assert.equal(
        b.packets.length,
        mutedBeforeReconnect,
        'muting survives a speaker reconnect without a listener config refresh',
      );
    } finally {
      clients.forEach((c) => c.close());
      await waitFor(async () => (await app.status()).players === 0);
    }
  },
);

test(
  'voice admission rejects strangers and duplicate sockets, revokes tickets on disconnect, and isolates malformed audio',
  { timeout: 30_000 },
  async () => {
    const base = `ws://127.0.0.1:${app.port}`;
    const clients: WebSocket[] = [];
    let a: Awaited<ReturnType<typeof resident>> | undefined;
    const rejected = async (ticket: string) => {
      const ws = new WebSocket(`${base}/voice`);
      clients.push(ws);
      await once(ws, 'open');
      const closed = once(ws, 'close');
      ws.send(JSON.stringify({ type: 'join', ticket }));
      assert.equal((await closed)[0], 1008);
    };
    try {
      await rejected('not-a-game-session');
      a = await resident(base, 'Voice Security');
      await rejected(a.welcome.voiceTicket);
      const malformed = once(a.audio, 'close');
      a.audio.send(Buffer.alloc(1000));
      assert.equal((await malformed)[0], 1008);
      assert.equal(a.game.readyState, WebSocket.OPEN, 'voice errors do not disconnect gameplay');
      const ticket = a.welcome.voiceTicket;
      a.game.close();
      await once(a.game, 'close');
      await waitFor(async () => (await app.status()).players === 0);
      await rejected(ticket);
      const origin = new WebSocket(`${base}/voice`, { origin: 'https://untrusted.example' });
      clients.push(origin);
      const response = await new Promise<number>((resolve) => {
        origin.on('unexpected-response', (_req, res) => {
          res.resume();
          origin.close();
          resolve(res.statusCode!);
        });
        origin.on('error', () => {});
      });
      assert.equal(response, 403);
    } finally {
      a?.close();
      clients.forEach((ws) => ws.close());
    }
  },
);

test(
  'voice disconnects on moderation, ignores replayed frames, and bounds packet floods',
  { timeout: 30_000 },
  async () => {
    const key = 'voice-operator-test';
    const clients: Awaited<ReturnType<typeof resident>>[] = [];
    try {
      const base = `ws://127.0.0.1:${app.port}`;
      const a = await resident(base, 'Voice Flood');
      clients.push(a);
      const b = await resident(base, 'Voice Observer');
      clients.push(b);
      a.speak();
      await waitFor(() => b.packets.length === 1);
      a.audio.send(voice.encodeVoiceFrame(new Float32Array(320), 1));
      await pause();
      assert.equal(b.packets.length, 1, 'replayed sequence is ignored');
      const closed = once(a.audio, 'close');
      for (let i = 0; i < 140; i++) a.speak();
      assert.equal((await closed)[0], 1008);
      assert.equal(a.game.readyState, WebSocket.OPEN);
      const kicked = once(b.audio, 'close');
      const response = await fetch(`http://127.0.0.1:${app.port}/api/admin`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: JSON.stringify({ action: 'kick', id: b.welcome.id, reason: 'Voice moderation test' }),
      });
      assert.equal(response.status, 200);
      await kicked;
      assert.equal((await app.status()).players === 2, false);
    } finally {
      clients.forEach((c) => c.close());
      await waitFor(async () => (await app.status()).players === 0);
    }
  },
);

// Exercise authoritative live-position/death gates without a transport or server replica.
test('voice relay reevaluates death and range on every frame', () => {
  class Socket implements VoiceSocket {
    readyState = 1;
    packets: (string | Uint8Array)[] = [];
    listeners = new Map<string, Function>();
    send(value: string | Uint8Array) {
      this.packets.push(value);
    }
    close() {
      if (this.readyState === 3) return;
      this.readyState = 3;
      this.listeners.get('close')?.();
    }
    addEventListener(type: string, listener: Function) {
      this.listeners.set(type, listener);
    }
    receive(data: string | ArrayBuffer) {
      this.listeners.get('message')?.({ data });
    }
  }
  const game = new Game();
  const a = game.join('Speaker').player,
    b = game.join('Listener').player;
  Object.assign(a, { x: 0, y: 0, z: 24 });
  Object.assign(b, { x: 2, y: 0, z: 24 });
  const relay = new VoiceRelay(game);
  const sockets = [a, b].map((p) => {
    const socket = new Socket();
    const ticket = relay.register(p.id);
    relay.connect(socket, 'fixture');
    socket.receive(JSON.stringify({ type: 'join', ticket }));
    socket.receive(JSON.stringify({ type: 'config', listening: true, transmitting: true, muted: [] }));
    socket.packets = [];
    return socket;
  });
  let seq = 0;
  const speak = () => sockets[0].receive(voice.encodeVoiceFrame(new Float32Array(320), ++seq));
  try {
    speak();
    assert.equal(sockets[1].packets.length, 1);
    a.deadUntil = Date.now() + 60000;
    speak();
    assert.equal(sockets[1].packets.length, 1);
    a.deadUntil = 0;
    b.deadUntil = Date.now() + 60000;
    speak();
    assert.equal(sockets[1].packets.length, 1);
    b.deadUntil = 0;
    b.x = 50;
    speak();
    assert.equal(sockets[1].packets.length, 1);
    b.x = 2;
    speak();
    assert.equal(sockets[1].packets.length, 2);
  } finally {
    relay.close();
  }
});
