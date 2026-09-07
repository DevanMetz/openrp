import type { Delta } from './replication.ts';
export type Vec3 = { x: number; y: number; z: number };
export type Quat = { x: number; y: number; z: number; w: number };
export type JobId =
  | 'citizen'
  | 'police'
  | 'gangster'
  | 'boss'
  | 'dealer'
  | 'medic'
  | 'chief'
  | 'mayor'
  | 'hobo'
  | 'cook'
  | 'thief';
export type WeaponId =
  | 'keys'
  | 'physgun'
  | 'toolgun'
  | 'pistol'
  | 'smg'
  | 'shotgun'
  | 'baton'
  | 'unarrest'
  | 'lockpick'
  | 'medkit'
  | 'ram';
export type PropKind = 'crate' | 'barrel' | 'pallet' | 'fence' | 'couch' | 'table' | 'shelf';
export type ResidentAction = 'give' | 'wanted' | 'unwanted' | 'warrant' | 'license';
export type EntityKind = PropKind | 'printer' | 'microwave' | 'shipment' | 'money' | 'food';
export interface Input {
  seq: number;
  forward: number;
  right: number;
  yaw: number;
  pitch: number;
  jump: boolean;
  sprint: boolean;
  crouch: boolean;
}
export interface Motion extends Vec3 {
  vy: number;
  grounded: boolean;
}
export interface Player extends Motion {
  id: string;
  name: string;
  job: JobId;
  yaw: number;
  pitch: number;
  crouch: boolean;
  money: number;
  health: number;
  hunger: number;
  armor: number;
  weapon: WeaponId;
  weapons: WeaponId[];
  ammo: Partial<Record<WeaponId, number>>;
  reserve: Partial<Record<WeaponId, number>>;
  arrestedUntil: number;
  wantedUntil: number;
  wantedReason: string;
  warrantUntil: number;
  deadUntil: number;
  reloadUntil: number;
  seq: number;
  holding: string | null;
  ping: number;
  license: boolean;
}
export interface Door {
  id: string;
  name: string;
  x: number;
  y?: number;
  z: number;
  width: number;
  height: number;
  rotation: number;
  price: number;
  owner: string | null;
  coowners: string[];
  locked: boolean;
  open: boolean;
  group?: 'government';
  public?: boolean;
}
export interface Entity extends Vec3 {
  id: string;
  kind: EntityKind;
  owner: string;
  q: Quat;
  frozen: boolean;
  health: number;
  cash: number;
  stock: number;
  price: number;
  item?: WeaponId;
  color: string;
  fading: boolean;
  fadeUntil: number;
  heldBy: string | null;
}
export interface Vote {
  id: string;
  candidate: string;
  job: JobId;
  end: number;
  yes: number;
  no: number;
  eligible: string[];
  voted: string[];
}
export interface Snapshot {
  type: 'state';
  time: number;
  players: Player[];
  doors: Door[];
  entities: Entity[];
  laws: string[];
  lockdown: boolean;
  vote: Vote | null;
  nextSalary: number;
}
export type GameEvent =
  | {
      type: 'chat';
      name: string;
      text: string;
      channel: 'local' | 'ooc' | 'advert' | 'me' | 'system' | 'group';
      color?: string;
    }
  | { type: 'notice'; text: string; tone?: 'info' | 'error' | 'success' }
  | { type: 'shot'; from: Vec3; to: Vec3; weapon: WeaponId; shooter: string; hit: boolean }
  | { type: 'sound'; sound: 'cash' | 'door' | 'arrest' | 'heal' | 'break'; position: Vec3 }
  | { type: 'progress'; label: string; end: number };
export type ClientMessage =
  | { type: 'join'; name: string; token?: string; password?: string; account?: boolean }
  | { type: 'input'; input: Input }
  | { type: 'chat'; text: string }
  | { type: 'action'; action: string; target?: string; value?: string | number | boolean }
  | { type: 'ping'; time: number };
export type ServerMessage =
  | Snapshot
  | Delta
  | GameEvent
  | {
      type: 'welcome';
      id: string;
      token: string;
      name: string;
      serverName: string;
      protocol: number;
      voiceTicket: string;
      username?: string;
    }
  | { type: 'pong'; time: number };
export interface Box {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
}
export interface Block extends Box {
  material: string;
}
