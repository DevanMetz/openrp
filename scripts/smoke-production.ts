import assert from 'node:assert/strict';
import { startServer } from '../server/main.ts';

const app = await startServer({ port: 0, host: '127.0.0.1', production: true, persist: false });
try {
  const base = `http://127.0.0.1:${app.port}`;
  const home = await fetch(base);
  assert.equal(home.status, 200, 'production index exists; run npm run build first');
  const html = await home.text();
  assert.ok(html.includes('OpenRP'));
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"\s]+)"/g)].map((match) => match[1]);
  assert.ok(assets.some((asset) => asset.endsWith('.js')));
  assert.ok(assets.some((asset) => asset.endsWith('.css')));
  for (const asset of assets) {
    const response = await fetch(base + asset);
    assert.equal(response.status, 200, asset);
    assert.ok(response.headers.get('cache-control')?.includes('immutable'));
    if (asset.endsWith('.js')) assert.ok(response.headers.get('content-type')?.includes('javascript'));
    if (asset.endsWith('.css')) assert.ok(response.headers.get('content-type')?.includes('text/css'));
  }
  assert.equal((await fetch(`${base}/.env`)).status, 404);
  assert.equal((await fetch(`${base}/..%2f..%2fpackage.json`)).status, 403);
  assert.equal(await (await fetch(`${base}/health`)).text(), 'ok');
  const status = await (await fetch(`${base}/api/status`)).json();
  assert.equal(status.players, 0);
  console.log(
    `Production smoke passed: index, ${assets.length} built assets, MIME/cache headers, private-file boundaries and health.`,
  );
} finally {
  await app.close();
}
