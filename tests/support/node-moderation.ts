import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { Moderation as Core } from '../../server/moderation.ts';
export class Moderation extends Core {
  constructor(dir: string, persist: boolean, key?: string, readKey?: string) {
    if (persist) mkdirSync(dir, { recursive: true });
    const path = join(dir, 'bans.json');
    const saved = persist && existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
    super(key, readKey, saved, (bans) => {
      if (persist) {
        writeFileSync(path + '.tmp', JSON.stringify(bans));
        renameSync(path + '.tmp', path);
      }
    });
  }
}
