import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadProfiles, saveProfiles } from '../server/persistence.ts';

test('atomic profile store round-trips and refuses to overwrite corrupt data', () => {
  const dir = mkdtempSync(join(tmpdir(), 'openrp-store-test-'));
  try {
    assert.deepEqual(loadProfiles(dir), []);
    const profiles = [{ id: 'test', name: 'Citizen', money: 1234, tokenHash: 'a'.repeat(64) }];
    saveProfiles(dir, profiles);
    assert.deepEqual(loadProfiles(dir), profiles);
    profiles[0].money = 1500;
    saveProfiles(dir, profiles);
    assert.equal(loadProfiles(dir)[0].money, 1500);
    writeFileSync(join(dir, 'profiles.json'), '{corrupt');
    assert.throws(() => loadProfiles(dir), /Restore a backup/);
    writeFileSync(join(dir, 'profiles.json'), JSON.stringify([{ ...profiles[0], money: -1 }]));
    assert.throws(() => loadProfiles(dir), /Restore a backup/);
  } finally {
    const target = resolve(dir),
      parent = resolve(tmpdir());
    if (!target.startsWith(parent + '\\') && !target.startsWith(parent + '/'))
      throw new Error('Refusing cleanup outside the temporary directory.');
    if (!target.includes('openrp-store-test-')) throw new Error('Unexpected temporary directory.');
    rmSync(target, { recursive: true, force: true });
  }
});
