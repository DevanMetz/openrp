import {
  mkdir,
  readdir,
  stat,
  readFile,
  writeFile,
  rename,
  appendFile,
  unlink,
  open,
} from 'node:fs/promises';
import { join } from 'node:path';
import { Observability as Core, type ObservationOptions } from '../../server/observability.ts';
export type { LogQuery } from '../../server/observability.ts';
export { type Activity, type ChatRecord } from '../../server/observability.ts';
export const Observability = {
  async create(options: ObservationOptions) {
    const dir = join(options.dataDir, 'observability');
    if (options.persist) await mkdir(dir, { recursive: true });
    return Core.create({
      ...options,
      files: {
        list: () => readdir(dir),
        size: async (n) => (await stat(join(dir, n))).size,
        read: (n) => readFile(join(dir, n), 'utf8'),
        range: async (n, start, length) => {
          const h = await open(join(dir, n), 'r');
          try {
            const b = Buffer.alloc(length);
            await h.read(b, 0, length, start);
            return b;
          } finally {
            await h.close();
          }
        },
        write: async (n, data) => {
          await writeFile(join(dir, n) + '.tmp', data);
          await rename(join(dir, n) + '.tmp', join(dir, n));
        },
        append: (n, data) => appendFile(join(dir, n), data),
        remove: (n) => unlink(join(dir, n)),
      },
    });
  },
};

export type Observability = Core;
export type { ObservationOptions } from '../../server/observability.ts';
