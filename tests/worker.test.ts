import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { startLocalWorker } from '../scripts/worker-local.ts';

async function connect(base: string, name: string, token?: string, password?: string) {
  const ws = new WebSocket(base.replace('http:', 'ws:') + '/ws');
  const welcome = new Promise<{ id: string; token: string; voiceTicket: string }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Worker join timed out')), 5000);
    ws.on('message', (raw) => {
      const value = JSON.parse(raw.toString());
      if (value.type === 'welcome') {
        clearTimeout(timer);
        resolve(value);
      }
    });
    ws.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  await once(ws, 'open');
  ws.send(JSON.stringify({ type: 'join', name, token, password }));
  return { ws, welcome: await welcome };
}

test(
  'real Worker: assets, auth, accounts, voice, moderation, logs and restart persistence',
  { timeout: 120_000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'openrp-worker-test-'));
    const vars = { ADMIN_TOKEN: 'worker-test-operator', ANALYTICS_READ_TOKEN: 'worker-test-reader' };
    let app: Awaited<ReturnType<typeof startLocalWorker>> | undefined;
    const sockets: WebSocket[] = [];
    try {
      app = await startLocalWorker({ persistTo: dir, vars });
      const headers = { Authorization: `Bearer ${vars.ADMIN_TOKEN}` };
      const readHeaders = { Authorization: `Bearer ${vars.ANALYTICS_READ_TOKEN}` };
      for (const path of ['/', '/studio.html', '/voice-lab.html']) {
        const response: Response = await fetch(app.base + path);
        assert.equal(response.status, 200, path);
        assert.ok((await response.text()).includes('<html'));
      }
      assert.equal(await (await fetch(app.base + '/health')).text(), 'ok');
      assert.equal((await fetch(app.base + '/api/admin')).status, 401);
      assert.equal((await fetch(app.base + '/api/admin', { headers: readHeaders })).status, 401);
      assert.equal((await fetch(app.base + '/api/admin/world', { headers: readHeaders })).status, 401);
      assert.equal(
        (
          await fetch(app.base + '/api/account', {
            method: 'POST',
            headers: { Origin: 'https://evil.invalid' },
          })
        ).status,
        403,
      );
      const resident = await connect(app.base, 'Worker Resident');
      sockets.push(resident.ws);
      assert.ok(resident.welcome.token);
      assert.ok(resident.welcome.voiceTicket);
      const voice = new WebSocket(app.base.replace('http:', 'ws:') + '/voice');
      sockets.push(voice);
      await once(voice, 'open');
      const ready = once(voice, 'message');
      voice.send(JSON.stringify({ type: 'join', ticket: resident.welcome.voiceTicket }));
      assert.equal(JSON.parse((await ready)[0].toString()).type, 'ready');
      resident.ws.send(JSON.stringify({ type: 'chat', text: '/ooc Worker persistent chat' }));
      const deadline = Date.now() + 4000;
      let rows: { text: string }[] = [];
      while (Date.now() < deadline && !rows.some((r) => r.text === 'Worker persistent chat')) {
        rows = (
          await (await fetch(app.base + '/api/admin/chat?channel=ooc', { headers: readHeaders })).json()
        ).rows;
        await new Promise((r) => setTimeout(r, 20));
      }
      assert.ok(rows.some((r) => r.text === 'Worker persistent chat'));
      const account = await fetch(app.base + '/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          username: 'worker_resident',
          password: 'test passphrase for workerd',
          token: resident.welcome.token,
        }),
      });
      assert.equal(account.status, 200, JSON.stringify(await account.clone().json()));
      const saved = await account.json();
      const departed = once(resident.ws, 'close');
      if (resident.ws.readyState !== WebSocket.CLOSED) await departed;
      await app.close();
      app = undefined;
      app = await startLocalWorker({ persistTo: dir, vars });
      const login = await fetch(app.base + '/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'login',
          username: 'worker_resident',
          password: 'test passphrase for workerd',
        }),
      });
      assert.equal(login.status, 200);
      const session = await login.json();
      assert.notEqual(session.token, saved.token);
      const restored = await connect(app.base, 'Worker Resident', session.token);
      sockets.push(restored.ws);
      assert.equal(restored.welcome.id, resident.welcome.id);
      const logs = await (
        await fetch(app.base + '/api/admin/chat?channel=ooc', { headers: readHeaders })
      ).json();
      assert.ok(logs.rows.some((r: { text: string }) => r.text === 'Worker persistent chat'));
      const kicked = once(restored.ws, 'close');
      assert.equal(
        (
          await fetch(app.base + '/api/admin', {
            method: 'POST',
            headers,
            body: JSON.stringify({ action: 'ban', id: restored.welcome.id, reason: 'Worker test' }),
          })
        ).status,
        200,
      );
      await kicked;
      assert.equal((await (await fetch(app.base + '/api/status')).json()).players, 0);
      const backup = await (await fetch(app.base + '/api/admin/world', { headers })).json();
      assert.ok(backup.profiles.length);
      assert.ok(!JSON.stringify(logs).includes(session.token));
      assert.equal(
        (await fetch(app.base + '/api/admin/world', { method: 'POST', headers, body: '{}' })).status,
        400,
      );
      // Make a valid backup larger than one storage value; every chunk is bounded in SQL.
      backup.profiles = Array.from({ length: 2000 }, (_, i) => ({
        id: `offline-${i}`,
        name: `Offline ${i}`,
        money: 1500,
        tokenHash: i.toString(16).padStart(64, '0'),
      }));
      backup.doors = [];
      backup.entities = [];
      delete backup.contracts;
      assert.ok(JSON.stringify(backup).length > 128 * 1024);
      assert.equal(
        (
          await fetch(app.base + '/api/admin/world', {
            method: 'POST',
            headers,
            body: JSON.stringify(backup),
          })
        ).status,
        200,
      );
      assert.equal(
        (await (await fetch(app.base + '/api/admin/world', { headers })).json()).profiles.length,
        2000,
      );
      await app.close();
      app = undefined;
      app = await startLocalWorker({ persistTo: dir });
      assert.equal((await fetch(app.base + '/api/admin')).status, 503);
      assert.equal((await fetch(app.base + '/api/admin/analytics')).status, 503);
      assert.equal((await fetch(app.base + '/api/admin/world')).status, 503);
    } finally {
      sockets.forEach((ws) => ws.terminate());
      await app?.close();
      await rm(dir, { recursive: true, force: true });
    }
  },
);
