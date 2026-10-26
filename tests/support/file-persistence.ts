import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Profile, SavedWorld } from '../../server/game.ts';
import { validateWorld, validProfiles } from '../../server/persistence.ts';
export function loadWorld(directory: string): SavedWorld | undefined {
  try {
    const data: unknown = JSON.parse(readFileSync(resolve(directory, 'world.json'), 'utf8'));
    validateWorld(data);
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    // Never fall back to stale wallet-only data when a world save is damaged.
    throw new Error('Could not read world.json. Restore a backup before starting the server.', {
      cause: error,
    });
  }
}

export function saveWorld(directory: string, world: SavedWorld): void {
  validateWorld(world);
  writeAtomic(directory, 'world.json', world);
}

function writeAtomic(directory: string, name: string, data: unknown): void {
  mkdirSync(directory, { recursive: true });
  const file = resolve(directory, name);
  writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2), { mode: 0o600, flush: true });
  renameSync(`${file}.tmp`, file);
}

export function loadProfiles(directory: string): Profile[] {
  try {
    const data: unknown = JSON.parse(readFileSync(resolve(directory, 'profiles.json'), 'utf8'));
    if (!validProfiles(data)) throw new Error('Invalid profile in store.');
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    // Fail startup instead of overwriting a damaged economy with an empty file.
    throw new Error('Could not read profiles.json. Restore a backup before starting the server.', {
      cause: error,
    });
  }
}
export function saveProfiles(directory: string, profiles: Profile[]): void {
  writeAtomic(directory, 'profiles.json', profiles);
}
