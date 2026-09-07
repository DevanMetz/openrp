import type { EntityKind, JobId, WeaponId } from './types.ts';

export const VERSION = '0.5.1';
export const PROTOCOL = 6;
export const POCKET_CAPACITY = 8;
export const CHAT_RANGES = { local: 28, whisper: 5, yell: 56 } as const;
export const TICK_RATE = 30;
export const SNAPSHOT_RATE = 15;
export const MAX_PROPS = 20;
export const MAX_ENTITIES = 240;
export const PLAYER_RADIUS = 0.32;
export const PLAYER_HEIGHT = 1.78;
export const EYE_HEIGHT = 1.63;
export const INTERACT_RANGE = 3.4;
export const GIVE_RANGE = 3.5;
export const MAX_TRANSFER = 50_000;
export const JOBS: Record<
  JobId,
  {
    name: string;
    color: string;
    salary: number;
    max: number;
    category: string;
    description: string;
    loadout: WeaponId[];
    vote?: boolean;
  }
> = {
  citizen: {
    name: 'Citizen',
    color: '#85ad80',
    salary: 45,
    max: 0,
    category: 'Citizens',
    description: 'Rent a storefront, start a business, or simply make this city your own.',
    loadout: [],
  },
  police: {
    name: 'Civil Protection',
    color: '#729dc6',
    salary: 65,
    max: 4,
    category: 'Government',
    description: 'Patrol the streets. Mark suspects wanted, arrest criminals, and execute search warrants.',
    loadout: ['pistol', 'baton', 'unarrest', 'ram'],
    vote: true,
  },
  gangster: {
    name: 'Gangster',
    color: '#b394be',
    salary: 45,
    max: 4,
    category: 'Underworld',
    description: 'Work with the mob, protect your territory, and profit from the underground economy.',
    loadout: [],
  },
  boss: {
    name: 'Mob Boss',
    color: '#c58d8e',
    salary: 60,
    max: 1,
    category: 'Underworld',
    description: 'Organize the crew. Pick locks and break arrested associates out of jail.',
    loadout: ['lockpick', 'unarrest'],
  },
  dealer: {
    name: 'Gun Dealer',
    color: '#dfad60',
    salary: 45,
    max: 2,
    category: 'Citizens',
    description: 'Buy weapon shipments wholesale. Set your prices and sell to players from your shop.',
    loadout: [],
  },
  medic: {
    name: 'Medic',
    color: '#6fb8af',
    salary: 45,
    max: 3,
    category: 'Citizens',
    description: 'Keep the district alive. Your medical kit heals others or yourself.',
    loadout: ['medkit'],
  },
  chief: {
    name: 'Police Chief',
    color: '#91b8dc',
    salary: 75,
    max: 1,
    category: 'Government',
    description: 'Promote from Civil Protection. Coordinate officers and approve search warrants.',
    loadout: ['pistol', 'baton', 'unarrest', 'ram'],
  },
  mayor: {
    name: 'Mayor',
    color: '#ce827b',
    salary: 85,
    max: 1,
    category: 'Government',
    description: 'Win the election, write city laws, issue gun licenses, and order lockdowns.',
    loadout: [],
    vote: true,
  },
  hobo: {
    name: 'Hobo',
    color: '#b5a183',
    salary: 0,
    max: 5,
    category: 'Citizens',
    description: 'Build a street shelter and live on the generosity of passing citizens.',
    loadout: [],
  },
  cook: {
    name: 'Cook',
    color: '#d4ad91',
    salary: 45,
    max: 2,
    category: 'Citizens',
    description: 'Open a kitchen. Your microwave produces meals to sell to hungry residents.',
    loadout: [],
  },
  thief: {
    name: 'Thief',
    color: '#a8a2bf',
    salary: 35,
    max: 3,
    category: 'Underworld',
    description: 'Pick locks, raid hidden printers, and disappear into the alleys.',
    loadout: ['lockpick'],
  },
};
export const GOVERNMENT: JobId[] = ['police', 'chief', 'mayor'];
export const POLICE: JobId[] = ['police', 'chief'];
export const WEAPONS: Record<
  WeaponId,
  {
    name: string;
    short: string;
    damage: number;
    range: number;
    delay: number;
    magazine: number;
    reload: number;
  }
> = {
  keys: { name: 'Keys', short: 'KEYS', damage: 0, range: 3.4, delay: 300, magazine: 0, reload: 0 },
  physgun: {
    name: 'Physics Gun',
    short: 'PHYSGUN',
    damage: 0,
    range: 12,
    delay: 150,
    magazine: 0,
    reload: 0,
  },
  toolgun: { name: 'Tool Gun', short: 'TOOLGUN', damage: 0, range: 12, delay: 250, magazine: 0, reload: 0 },
  pistol: { name: '9mm Pistol', short: '9MM', damage: 22, range: 90, delay: 280, magazine: 12, reload: 1700 },
  smg: {
    name: 'Submachine Gun',
    short: 'SMG',
    damage: 13,
    range: 75,
    delay: 110,
    magazine: 30,
    reload: 2100,
  },
  shotgun: {
    name: 'Pump Shotgun',
    short: '12 GAUGE',
    damage: 11,
    range: 36,
    delay: 850,
    magazine: 6,
    reload: 2500,
  },
  baton: { name: 'Arrest Baton', short: 'ARREST', damage: 0, range: 2.7, delay: 600, magazine: 0, reload: 0 },
  unarrest: {
    name: 'Unarrest Baton',
    short: 'RELEASE',
    damage: 0,
    range: 2.7,
    delay: 600,
    magazine: 0,
    reload: 0,
  },
  lockpick: {
    name: 'Lockpick',
    short: 'LOCKPICK',
    damage: 0,
    range: 3.4,
    delay: 500,
    magazine: 0,
    reload: 0,
  },
  medkit: { name: 'Medical Kit', short: 'MEDKIT', damage: 0, range: 2.7, delay: 700, magazine: 0, reload: 0 },
  ram: { name: 'Battering Ram', short: 'RAM', damage: 0, range: 3.4, delay: 900, magazine: 0, reload: 0 },
};
export interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  kind?: EntityKind;
  jobs?: JobId[];
  item?: WeaponId;
  stock?: number;
  limit?: number;
}
export const SHOP: ShopItem[] = [
  {
    id: 'printer',
    name: 'Money printer',
    description: '$100 every 30 seconds. Illegal. Collect earnings with E.',
    price: 1000,
    kind: 'printer',
    limit: 2,
  },
  {
    id: 'microwave',
    name: 'Microwave',
    description: 'Produces meals. Customers pay you to eat.',
    price: 350,
    kind: 'microwave',
    jobs: ['cook'],
    limit: 2,
  },
  {
    id: 'pistol-shipment',
    name: 'Pistol shipment',
    description: 'Five 9mm pistols. Set your retail price in the context menu.',
    price: 600,
    kind: 'shipment',
    jobs: ['dealer'],
    item: 'pistol',
    stock: 5,
    limit: 4,
  },
  {
    id: 'smg-shipment',
    name: 'SMG shipment',
    description: 'Five submachine guns for your gun store.',
    price: 1400,
    kind: 'shipment',
    jobs: ['dealer'],
    item: 'smg',
    stock: 5,
    limit: 4,
  },
  {
    id: 'shotgun-shipment',
    name: 'Shotgun shipment',
    description: 'Five pump shotguns for close encounters.',
    price: 1100,
    kind: 'shipment',
    jobs: ['dealer'],
    item: 'shotgun',
    stock: 5,
    limit: 4,
  },
  { id: 'ammo', name: 'Ammunition', description: 'Three magazines for your equipped firearm.', price: 75 },
  { id: 'armor', name: 'Body armor', description: 'Replenish armor to 100.', price: 400 },
  { id: 'meal', name: 'Takeaway meal', description: 'Restore 35 hunger and 5 health.', price: 50 },
];
export const PROPS: {
  id: EntityKind;
  name: string;
  size: [number, number, number];
  mass: number;
  color: string;
}[] = [
  { id: 'crate', name: 'Wooden crate', size: [1.25, 1.25, 1.25], mass: 18, color: '#9a7751' },
  { id: 'barrel', name: 'Steel barrel', size: [0.85, 1.3, 0.85], mass: 22, color: '#536d65' },
  { id: 'pallet', name: 'Wooden pallet', size: [1.6, 0.22, 1.2], mass: 12, color: '#a08b67' },
  { id: 'fence', name: 'Metal fence', size: [2.8, 2.6, 0.2], mass: 18, color: '#6b7779' },
  { id: 'couch', name: 'Old sofa', size: [2.3, 1.1, 1], mass: 30, color: '#746653' },
  { id: 'table', name: 'Workbench', size: [2, 0.95, 1], mass: 20, color: '#8a7456' },
  { id: 'shelf', name: 'Shelving', size: [1.5, 2.3, 0.5], mass: 20, color: '#64767b' },
];
export function entitySize(kind: EntityKind): [number, number, number] {
  if (kind === 'weapon') return [0.5, 0.28, 1.1];
  return (
    PROPS.find((p) => p.id === kind)?.size ??
    (kind === 'printer'
      ? [0.9, 0.6, 0.75]
      : kind === 'microwave'
        ? [0.9, 0.65, 0.65]
        : kind === 'shipment'
          ? [1.2, 0.7, 0.9]
          : [0.35, 0.18, 0.25])
  );
}
