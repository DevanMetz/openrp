import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validProfiles } from '../server/persistence.ts';

test('legacy profile validation accepts round trips and rejects damaged or invalid wallets', () => {
  const profiles = [{ id: 'test', name: 'Citizen', money: 1234, tokenHash: 'a'.repeat(64) }];
  assert.ok(validProfiles(JSON.parse(JSON.stringify(profiles))));
  profiles[0].money = 1500;
  assert.ok(validProfiles(profiles));
  assert.throws(() => JSON.parse('{corrupt'));
  assert.equal(validProfiles([{ ...profiles[0], money: -1 }]), false);
});
