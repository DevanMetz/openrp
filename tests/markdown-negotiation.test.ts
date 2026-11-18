import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maybeMarkdown } from '../server/markdown-negotiation.ts';

const html = '<html><head><title>OpenRP</title></head><body><main><h1>Welcome</h1><p>Hello</p></main></body></html>';
const response = (type = 'text/html', status = 200) =>
  new Response(html, { status, headers: { 'Content-Type': type, Vary: 'Origin' } });
const request = (accept?: string, method = 'GET') =>
  new Request('https://openrp.dev/', { method, headers: accept ? { Accept: accept } : {} });

test('negotiates markdown while keeping HTML as the default', async () => {
  for (const accept of ['text/markdown', 'text/x-markdown']) {
    const result = await maybeMarkdown(request(accept), response());
    assert.equal(result.headers.get('Content-Type'), 'text/markdown; charset=utf-8');
    assert.equal(result.headers.get('Vary'), 'Origin, Accept');
    assert.match(await result.text(), /# Welcome\n\nHello/);
  }
  for (const accept of [undefined, 'text/html, text/markdown;q=0.5', 'text/markdown;q=0']) {
    const result = await maybeMarkdown(request(accept), response());
    assert.equal(result.headers.get('Content-Type'), 'text/html');
    assert.equal(await result.text(), html);
  }
});

test('preserves non-HTML, error and non-GET responses and handles HEAD', async () => {
  for (const [type, status, method] of [
    ['application/json', 200, 'GET'],
    ['text/html', 404, 'GET'],
    ['text/html', 200, 'POST'],
  ] as const) {
    const original = response(type, status);
    assert.equal(await maybeMarkdown(request('text/markdown', method), original), original);
  }
  const head = await maybeMarkdown(request('text/markdown', 'HEAD'), response());
  assert.equal(head.headers.get('Content-Type'), 'text/markdown; charset=utf-8');
  assert.equal(await head.text(), '');
});
