import type { LogFiles } from './storage.ts';

export interface SqlStorage {
  sql: {
    exec<T extends Record<string, string | number | ArrayBuffer | null>>(
      query: string,
      ...bindings: (string | number | Uint8Array)[]
    ): Iterable<T> & { toArray(): T[]; one(): T };
  };
  transactionSync<T>(callback: () => T): T;
}

/** Each blob is at most 64 KiB, including large world saves and daily summaries. */
export class SqlFiles implements LogFiles {
  constructor(private storage: SqlStorage) {
    storage.sql.exec('CREATE TABLE IF NOT EXISTS files (name TEXT PRIMARY KEY, size INTEGER NOT NULL)');
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS chunks (name TEXT NOT NULL, offset INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY(name, offset))',
    );
  }
  async list() {
    return this.storage.sql
      .exec<{ name: string }>('SELECT name FROM files')
      .toArray()
      .map((r) => r.name);
  }
  async size(name: string) {
    return this.storage.sql.exec<{ size: number }>('SELECT size FROM files WHERE name = ?', name).one().size;
  }
  async read(name: string) {
    return new TextDecoder().decode(await this.range(name, 0, await this.size(name)));
  }
  async range(name: string, start: number, length: number) {
    const out = new Uint8Array(length);
    for (const row of this.storage.sql.exec<{ offset: number; data: ArrayBuffer }>(
      'SELECT offset, data FROM chunks WHERE name = ? AND offset < ? AND offset + length(data) > ? ORDER BY offset',
      name,
      start + length,
      start,
    )) {
      const data = new Uint8Array(row.data),
        from = Math.max(start, row.offset),
        to = Math.min(start + length, row.offset + data.length);
      out.set(data.subarray(from - row.offset, to - row.offset), from - start);
    }
    return out;
  }
  private appendBytes(name: string, data: Uint8Array, offset: number) {
    for (let at = 0; at < data.length; at += 65536)
      this.storage.sql.exec(
        'INSERT INTO chunks(name, offset, data) VALUES (?, ?, ?)',
        name,
        offset + at,
        data.slice(at, at + 65536),
      );
    this.storage.sql.exec(
      'INSERT INTO files(name,size) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET size=excluded.size',
      name,
      offset + data.length,
    );
  }
  async write(name: string, text: string) {
    const bytes = new TextEncoder().encode(text);
    this.storage.transactionSync(() => {
      this.storage.sql.exec('DELETE FROM chunks WHERE name = ?', name);
      this.appendBytes(name, bytes, 0);
    });
  }
  async append(name: string, text: string) {
    const bytes = new TextEncoder().encode(text);
    this.storage.transactionSync(() => {
      const row = this.storage.sql
        .exec<{ size: number }>('SELECT size FROM files WHERE name = ?', name)
        .toArray()[0];
      this.appendBytes(name, bytes, row?.size ?? 0);
    });
  }
  async remove(name: string) {
    this.storage.transactionSync(() => {
      this.storage.sql.exec('DELETE FROM chunks WHERE name = ?', name);
      this.storage.sql.exec('DELETE FROM files WHERE name = ?', name);
    });
  }
  /** Synchronous checkpoint so account token rotation can roll back on failure. */
  checkpoint(name: string, text: string) {
    const bytes = new TextEncoder().encode(text);
    this.storage.transactionSync(() => {
      this.storage.sql.exec('DELETE FROM chunks WHERE name = ?', name);
      this.appendBytes(name, bytes, 0);
    });
  }
}
