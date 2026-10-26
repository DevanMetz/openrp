import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { WebSocket } from 'ws';
import { once } from 'node:events';
import { parseWorld } from '../server/persistence.ts';
import { startTestWorker } from './support/worker.ts';

async function checkpoint(directory: string) {
  // Inspect only this test's synthetic SQLite checkpoint, not the live export API.
  const names = await readdir(directory, { recursive: true });
  const path = names.find((name) => name.endsWith('.sqlite') && name.includes('World'));
  assert.ok(path, 'world SQLite database exists');
  const db = new DatabaseSync(join(directory, path), { readOnly: true });
  try {
    const rows = db.prepare("SELECT data FROM chunks WHERE name = 'world' ORDER BY offset").all();
    return parseWorld(Buffer.concat(rows.map((row) => Buffer.from(row.data as Uint8Array))).toString());
  } finally {
    db.close();
  }
}

test(
  'active checkpoints, immediate last-leave save, idle loop stop and workerd restart preserve the world',
  { timeout: 30_000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'openrp-lifecycle-'));
    let app = await startTestWorker({ dataDir: dir });
    const sockets: WebSocket[] = [];
    async function connect(token?: string) {
      const ws = new WebSocket(app.base.replace('http:', 'ws:') + '/ws');
      sockets.push(ws);
      await once(ws, 'open');
      const welcome = new Promise<{ id: string; token: string }>((resolve) =>
        ws.on('message', (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'welcome') resolve(msg);
        }),
      );
      ws.send(JSON.stringify({ type: 'join', name: 'Checkpoint resident', token }));
      return { ws, welcome: await welcome };
    }
    try {
      const client = await connect();
      client.ws.send(JSON.stringify({ type: 'action', action: 'spawn', target: 'crate' }));
      const deadline = Date.now() + 7000;
      let saved = await checkpoint(dir);
      while (!saved.entities.length && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        saved = await checkpoint(dir);
      }
      assert.equal(saved.entities.length, 1, 'periodic checkpoint happens while still connected');
      client.ws.send(JSON.stringify({ type: 'action', action: 'buy', target: 'meal' }));
      // A ping/pong is a delivery barrier after the purchase.
      const pong = new Promise<void>((resolve) =>
        client.ws.on('message', (raw) => {
          if (JSON.parse(raw.toString()).type === 'pong') resolve();
        }),
      );
      client.ws.send(JSON.stringify({ type: 'ping', time: Date.now() }));
      await pong;
      const closed = once(client.ws, 'close');
      client.ws.close();
      await closed;
      saved = await checkpoint(dir);
      assert.equal(saved.profiles[0].money, 1450, 'last leave saves without waiting three seconds');
      await new Promise((resolve) => setTimeout(resolve, 3300));
      assert.deepEqual(await checkpoint(dir), saved, 'idle world does not keep ticking or checkpointing');
      await app.close();
      app = await startTestWorker({ dataDir: dir });
      const resumed = await connect(client.welcome.token);
      assert.equal(resumed.welcome.id, client.welcome.id);
      const restored = await app.world();
      assert.equal(restored.entities[0].id, saved.entities[0].id);
      assert.equal(restored.profiles[0].money, 1450);
    } finally {
      sockets.forEach((ws) => ws.close());
      await app.close();
      await rm(dir, { recursive: true, force: true });
    }
  },
);
