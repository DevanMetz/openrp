import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Profile, SavedWorld } from './game.ts';
import { JOBS, MAX_ENTITIES, POCKET_CAPACITY, PROPS, WEAPONS } from '../shared/catalog.ts';
import { MAP_BOUND } from '../shared/map.ts';
import { validAccount } from './accounts.ts';

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const number = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const integer = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number =>
  number(value, min, max) && Number.isSafeInteger(value);
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max;
const id = (value: unknown): value is string => text(value, 80) && value.length > 0;
const unique = (values: unknown[]) => new Set(values).size === values.length;
const position = (value: Record<string, unknown>) =>
  number(value.x, -MAP_BOUND - 2, MAP_BOUND + 2) &&
  number(value.z, -MAP_BOUND - 2, MAP_BOUND + 2) &&
  number(value.y, -10, 90);
const quaternion = (value: unknown) =>
  object(value) &&
  ['x', 'y', 'z', 'w'].every((key) => number(value[key], -1.01, 1.01)) &&
  Math.abs(Math.hypot(value.x as number, value.y as number, value.z as number, value.w as number) - 1) < 0.01;

function validCharacter(value: unknown): boolean {
  if (!object(value)) return false;
  const weapons = value.weapons;
  if (
    !Array.isArray(weapons) ||
    !weapons.length ||
    !unique(weapons) ||
    !weapons.every((w) => typeof w === 'string' && Object.hasOwn(WEAPONS, w)) ||
    !weapons.includes(value.weapon) ||
    typeof value.job !== 'string' ||
    !Object.hasOwn(JOBS, value.job)
  )
    return false;
  for (const key of ['ammo', 'reserve'] as const) {
    const counts = value[key];
    if (
      !object(counts) ||
      !Object.entries(counts).every(
        ([weapon, amount]) =>
          weapons.includes(weapon) &&
          integer(amount, 0, key === 'reserve' ? 360 : WEAPONS[weapon as keyof typeof WEAPONS].magazine),
      )
    )
      return false;
  }
  return (
    (value.pocket === undefined ||
      (Array.isArray(value.pocket) &&
        value.pocket.length <= POCKET_CAPACITY &&
        value.pocket.every(validPocketItem) &&
        unique(value.pocket.map((e) => e.id)))) &&
    (value.jobBans === undefined ||
      (object(value.jobBans) &&
        Object.entries(value.jobBans).every(
          ([job, until]) => Object.hasOwn(JOBS, job) && integer(until, 0),
        ))) &&
    position(value) &&
    number(value.yaw, -1e6, 1e6) &&
    number(value.pitch, -1.48, 1.48) &&
    ['health', 'hunger', 'armor'].every((key) => number(value[key], 0, 100)) &&
    ['deadUntil', 'arrestedUntil', 'wantedUntil', 'warrantUntil', 'lastJob', 'votesAt'].every((key) =>
      integer(value[key], 0),
    ) &&
    typeof value.crouch === 'boolean' &&
    typeof value.license === 'boolean' &&
    text(value.wantedReason, 90) &&
    Object.keys(value).every((key) =>
      [
        'x',
        'y',
        'z',
        'yaw',
        'pitch',
        'crouch',
        'job',
        'weapons',
        'weapon',
        'ammo',
        'reserve',
        'health',
        'hunger',
        'armor',
        'deadUntil',
        'arrestedUntil',
        'wantedUntil',
        'wantedReason',
        'warrantUntil',
        'license',
        'lastJob',
        'votesAt',
        'jobBans',
        'pocket',
      ].includes(key),
    )
  );
}

function validPocketItem(e: unknown): e is Record<string, unknown> {
  if (
    !object(e) ||
    !id(e.id) ||
    ![...PROPS.map((p) => p.id), 'weapon', 'food', 'money'].includes(e.kind as string)
  )
    return false;
  if (
    !number(e.health, 0, 180) ||
    !integer(e.cash, 0, 50_000) ||
    !integer(e.stock, 0, 12) ||
    !integer(e.price, 1, 50_000) ||
    typeof e.color !== 'string' ||
    !/^#[a-f0-9]{6}$/i.test(e.color)
  )
    return false;
  if (
    !Object.keys(e).every((key) =>
      [
        'id',
        'kind',
        'health',
        'cash',
        'stock',
        'price',
        'item',
        'loadedAmmo',
        'reserveAmmo',
        'color',
      ].includes(key),
    )
  )
    return false;
  return e.kind === 'weapon'
    ? ['pistol', 'smg', 'shotgun'].includes(e.item as string) &&
        integer(e.loadedAmmo, 0, WEAPONS[e.item as keyof typeof WEAPONS].magazine) &&
        integer(e.reserveAmmo, 0, 360)
    : e.item === undefined && e.loadedAmmo === undefined && e.reserveAmmo === undefined;
}

function validProfiles(value: unknown): value is Profile[] {
  return (
    Array.isArray(value) &&
    value.every(
      (p) =>
        object(p) &&
        id(p.id) &&
        text(p.name, 80) &&
        typeof p.tokenHash === 'string' &&
        /^[a-f0-9]{64}$/.test(p.tokenHash) &&
        integer(p.money, 0, 1e9) &&
        (p.account === undefined || validAccount(p.account)) &&
        (p.character === undefined || validCharacter(p.character)),
    ) &&
    unique(value.map((p) => p.id)) &&
    unique(value.map((p) => p.tokenHash)) &&
    unique(value.filter((p) => p.account).map((p) => p.account!.username))
  );
}

function validateWorld(value: unknown): asserts value is SavedWorld {
  if (
    !object(value) ||
    value.version !== 1 ||
    !integer(value.savedAt, 0) ||
    !validProfiles(value.profiles) ||
    !Array.isArray(value.entities) ||
    value.entities.length > MAX_ENTITIES ||
    !Array.isArray(value.doors) ||
    !Array.isArray(value.laws) ||
    value.laws.length > 8 ||
    !value.laws.every((law) => text(law, 120)) ||
    typeof value.lockdown !== 'boolean'
  )
    throw new Error('Invalid or unsupported world save.');
  const owners = new Set(value.profiles.map((p) => p.id));
  const kinds = [...PROPS.map((p) => p.id), 'printer', 'microwave', 'shipment', 'money', 'food', 'weapon'];
  for (const e of value.entities) {
    if (
      !object(e) ||
      !id(e.id) ||
      !owners.has(e.owner as string) ||
      !kinds.includes(e.kind as string) ||
      !position(e) ||
      !quaternion(e.q) ||
      !number(e.health, 0, 180) ||
      !integer(e.cash, 0, 50_000) ||
      !integer(e.stock, 0, 12) ||
      !integer(e.price, 1, 50_000) ||
      typeof e.frozen !== 'boolean' ||
      typeof e.fading !== 'boolean' ||
      !integer(e.fadeUntil, 0) ||
      e.heldBy !== null ||
      typeof e.color !== 'string' ||
      !/^#[a-f0-9]{6}$/i.test(e.color) ||
      (e.item !== undefined && !['pistol', 'smg', 'shotgun'].includes(e.item as string)) ||
      (['shipment', 'weapon'].includes(e.kind as string) && e.item === undefined) ||
      (e.kind === 'weapon' &&
        (!integer(e.loadedAmmo, 0, WEAPONS[e.item as keyof typeof WEAPONS]?.magazine ?? 0) ||
          !integer(e.reserveAmmo, 0, 360))) ||
      (e.kind !== 'weapon' && (e.loadedAmmo !== undefined || e.reserveAmmo !== undefined))
    )
      throw new Error('Invalid entity in world save.');
  }
  for (const d of value.doors) {
    if (
      !object(d) ||
      !id(d.id) ||
      !text(d.name, 40) ||
      !(d.owner === null || owners.has(d.owner as string)) ||
      !Array.isArray(d.coowners) ||
      !d.coowners.every((owner) => owners.has(owner)) ||
      !unique(d.coowners) ||
      typeof d.locked !== 'boolean' ||
      typeof d.open !== 'boolean'
    )
      throw new Error('Invalid property in world save.');
  }
  const objectIds = [
    ...value.entities.map((e) => e.id),
    ...value.profiles.flatMap((p) => (p.character?.pocket ?? []).map((e) => e.id)),
  ];
  if (!unique(objectIds) || !unique(value.doors.map((d) => d.id)))
    throw new Error('Duplicate object IDs in world save.');
}

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
