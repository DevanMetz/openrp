import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Profile } from './game.ts';

export function loadProfiles(directory: string): Profile[] {
  try {
    const data: unknown = JSON.parse(readFileSync(resolve(directory, 'profiles.json'), 'utf8'));
    if (!Array.isArray(data)) throw new Error('Profile store must be an array.');
    if (
      !data.every(
        (p) =>
          p &&
          typeof p.id === 'string' &&
          typeof p.name === 'string' &&
          typeof p.tokenHash === 'string' &&
          /^[a-f0-9]{64}$/.test(p.tokenHash) &&
          Number.isSafeInteger(p.money) &&
          p.money >= 0 &&
          p.money <= 1e9,
      )
    )
      throw new Error('Invalid profile in store.');
    return data as Profile[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    // Fail startup instead of overwriting a damaged economy with an empty file.
    throw new Error('Could not read profiles.json. Restore a backup before starting the server.', {
      cause: error,
    });
  }
}
export function saveProfiles(directory: string, profiles: Profile[]): void {
  mkdirSync(directory, { recursive: true });
  const file = resolve(directory, 'profiles.json');
  writeFileSync(`${file}.tmp`, JSON.stringify(profiles, null, 2), { mode: 0o600 });
  renameSync(`${file}.tmp`, file);
}
