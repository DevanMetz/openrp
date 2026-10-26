import assert from 'node:assert/strict';
import { startLocalWorker } from './worker-local.ts';
import { WebSocket } from 'ws';
import { once } from 'node:events';

const app = await startLocalWorker();
const clients: WebSocket[] = [];
try {
  const home = await fetch(app.base);
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.ok(html.includes('OpenRP'));
  assert.equal(home.headers.get('permissions-policy'), 'microphone=(self), camera=()');
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"\s]+)"/g)].map((m) => m[1]);
  assert.ok(assets.some((a) => a.endsWith('.js')));
  assert.ok(assets.some((a) => a.endsWith('.css')));
  for (const path of ['/', '/studio.html', '/voice-lab.html', ...assets])
    assert.equal((await fetch(app.base + path)).status, 200, path);
  for (const path of ['/.env', '/package.json', '/client/voice-lab.ts'])
    assert.equal((await fetch(app.base + path)).status, 404, path);
  assert.equal(await (await fetch(app.base + '/health')).text(), 'ok');
  assert.equal((await (await fetch(app.base + '/api/status')).json()).players, 0);
  const ws = new WebSocket(app.base.replace('http:', 'ws:') + '/ws');
  clients.push(ws);
  const welcome = new Promise<Record<string, unknown>>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Join timed out')), 5000);
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'welcome') {
        clearTimeout(timeout);
        resolve(msg);
      }
    });
  });
  await once(ws, 'open');
  ws.send(JSON.stringify({ type: 'join', name: 'Worker smoke' }));
  assert.ok((await welcome).voiceTicket);
  console.log(
    `Worker production smoke passed: three HTML pages, ${assets.length} built assets, private paths, health, status and gameplay join.`,
  );
} finally {
  clients.forEach((ws) => ws.terminate());
  await app.close();
}
