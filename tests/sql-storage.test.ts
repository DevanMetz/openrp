import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SqlFiles, type SqlStorage } from '../server/sql-files.ts';
import { handleHttp } from '../server/http.ts';
import { Moderation } from '../server/moderation.ts';
import { Game } from '../server/game.ts';
import { secretMatches } from '../server/security.ts';

function database(): { db: DatabaseSync; storage: SqlStorage } {
  const db = new DatabaseSync(':memory:');
  const storage: SqlStorage = {
    sql: {
      exec<T extends Record<string, string | number | ArrayBuffer | null>>(
        query: string,
        ...bindings: (string | number | Uint8Array)[]
      ) {
        const statement = db.prepare(query);
        // SQLite BLOBs in Node are Uint8Array; workerd returns ArrayBuffer.
        const result = statement
          .all(...bindings)
          .map((row) =>
            Object.fromEntries(
              Object.entries(row).map(([k, v]) => [k, v instanceof Uint8Array ? v.slice().buffer : v]),
            ),
          ) as T[];
        return Object.assign(result, {
          toArray: () => result,
          one: () => {
            assert.equal(result.length, 1);
            return result[0];
          },
        });
      },
    },
    transactionSync<T>(callback: () => T): T {
      db.exec('BEGIN');
      try {
        const result = callback();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { db, storage };
}

test('SQLite chunks preserve large Unicode saves, appended log byte ranges and atomic replacement', async () => {
  const { db, storage } = database();
  try {
    const files = new SqlFiles(storage);
    const text = '🙂 Union District café\n'.repeat(20000);
    await files.write('world', text);
    assert.ok((await files.size('world')) > 128 * 1024);
    assert.equal(await files.read('world'), text);
    assert.ok((db.prepare('SELECT max(length(data)) AS size FROM chunks').get()!.size as number) <= 65536);
    await files.append('chat', 'hello\n');
    await files.append('chat', '🙂\n');
    assert.equal(await files.read('chat'), 'hello\n🙂\n');
    assert.equal(new TextDecoder().decode(await files.range('chat', 6, 4)), '🙂');
    const original = storage.sql.exec;
    storage.sql.exec = (query, ...bindings) => {
      if (query.startsWith('INSERT INTO chunks')) throw new Error('write failed');
      return original(query, ...bindings);
    };
    await assert.rejects(files.write('world', 'replacement'), /write failed/);
    storage.sql.exec = original;
    assert.equal(await files.read('world'), text, 'failed replacement preserves previous chunks');
    files.checkpoint('world', 'saved');
    assert.equal(await files.read('world'), 'saved');
    await files.remove('chat');
    assert.deepEqual(await files.list(), ['world']);
  } finally {
    db.close();
  }
});

test('Worker HTTP streaming adapter decodes split UTF-8 moderation bodies and enforces operator credentials', async () => {
  const game = new Game();
  const messages: string[] = [];
  game.onEvent = (event) => {
    if (event.type === 'chat') messages.push(event.text);
  };
  const moderation = new Moderation('operator-test', 'reader-test', [], () => {});
  const payload = new TextEncoder().encode(JSON.stringify({ action: 'announce', reason: 'Café 🙂' }));
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of payload) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  const request = new Request('http://localhost/api/admin', {
    method: 'POST',
    headers: { Authorization: 'Bearer operator-test' },
    body: stream,
    duplex: 'half',
  } as RequestInit);
  const response = await handleHttp(request, (req, res) => moderation.handle(req, res, game, () => {}));
  assert.equal(response.status, 200);
  assert.deepEqual(messages, ['Café 🙂']);
  for (const key of ['', 'reader-test']) {
    const denied = await handleHttp(
      new Request('http://localhost/api/admin', { headers: { Authorization: `Bearer ${key}` } }),
      (req, res) => moderation.handle(req, res, game, () => {}),
    );
    assert.equal(denied.status, 401);
  }
  assert.equal(secretMatches('', ''), false);
  assert.equal(secretMatches('anything', undefined), false);
  assert.equal(secretMatches('operator-test', 'operator-test'), true);
  assert.equal(secretMatches('operator-tess', 'operator-test'), false);
});
