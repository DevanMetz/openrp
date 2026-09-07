import * as CANNON from 'cannon-es';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import {
  GOVERNMENT,
  INTERACT_RANGE,
  JOBS,
  MAX_ENTITIES,
  MAX_PROPS,
  POLICE,
  PROPS,
  SHOP,
  TICK_RATE,
  WEAPONS,
  entitySize,
} from '../shared/catalog.ts';
import { BLOCKS, INITIAL_DOORS, JAIL, MAP_BOUND, SPAWNS, doorBox } from '../shared/map.ts';
import { direction, distance, eyes, idleInput, movePlayer, overlaps, rayBox } from '../shared/movement.ts';
import type {
  Box,
  ClientMessage,
  Door,
  Entity,
  EntityKind,
  GameEvent,
  Input,
  JobId,
  Player,
  Snapshot,
  Vec3,
  Vote,
  WeaponId,
} from '../shared/types.ts';

export interface Profile {
  id: string;
  name: string;
  money: number;
  tokenHash: string;
}
export interface GameOptions {
  startingMoney: number;
  salarySeconds: number;
  jailSeconds: number;
  profiles?: Profile[];
  now?: () => number;
}
type Runtime = {
  input: Input;
  lastInput: number;
  lastAction: number;
  lastShot: number;
  lastChat: number;
  lastJob: number;
  inputSeq: number;
  grabDistance: number;
  tool: string;
  lockpick?: { door: string; end: number; start: Vec3 };
  votesAt: number;
};
type Hit = { kind: 'world' | 'player' | 'entity' | 'door'; id?: string; t: number; point: Vec3 };
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export function cleanText(v: unknown, max: number): string {
  return typeof v === 'string'
    ? v
        .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '')
        .trim()
        .slice(0, max)
    : '';
}
export class Game {
  players = new Map<string, Player>();
  profiles = new Map<string, Profile>();
  runtime = new Map<string, Runtime>();
  entities = new Map<string, Entity>();
  bodies = new Map<string, CANNON.Body>();
  doorBodies = new Map<string, CANNON.Body>();
  doors: Door[] = structuredClone(INITIAL_DOORS);
  laws = [
    'Do not attack other citizens without a roleplay reason.',
    'Money printers are illegal.',
    'Respect private property and the orders of Civil Protection.',
  ];
  lockdown = false;
  vote: Vote | null = null;
  physics = new CANNON.World({ gravity: new CANNON.Vec3(0, -15.5, 0), allowSleep: true });
  onEvent: (event: GameEvent, recipient?: string) => void = () => {};
  now: () => number;
  nextSalary: number;
  nextProduction: number;
  nextHunger: number;
  options: GameOptions;
  constructor(options: Partial<GameOptions> = {}) {
    this.options = { startingMoney: 1500, salarySeconds: 60, jailSeconds: 60, ...options };
    this.now = options.now ?? Date.now;
    this.nextSalary = this.now() + this.options.salarySeconds * 1000;
    this.nextProduction = this.now() + 30_000;
    this.nextHunger = this.now() + 10_000;
    for (const p of options.profiles ?? []) this.profiles.set(p.tokenHash, p);
    this.physics.broadphase = new CANNON.SAPBroadphase(this.physics);
    this.physics.defaultContactMaterial.friction = 0.55;
    this.physics.defaultContactMaterial.restitution = 0.05;
    this.addStatic({ x: 0, y: -0.5, z: 0, w: 160, h: 1, d: 160 });
    for (const b of BLOCKS) this.addStatic(b);
    for (const d of this.doors) this.doorBodies.set(d.id, this.addStatic(doorBox(d)));
  }
  addStatic(b: Box): CANNON.Body {
    const body = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(b.w / 2, b.h / 2, b.d / 2)),
      position: new CANNON.Vec3(b.x, b.y, b.z),
    });
    this.physics.addBody(body);
    return body;
  }
  join(name: unknown, token?: unknown): { player: Player; token: string } {
    const validToken = typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) ? token : '';
    const saved = validToken ? this.profiles.get(hash(validToken)) : undefined;
    if (saved && this.players.has(saved.id))
      throw new Error('This identity is already connected. Use a private window for a second player.');
    const issued = saved ? validToken : randomBytes(32).toString('hex');
    const profile = saved ?? {
      id: randomUUID(),
      name: '',
      money: this.options.startingMoney,
      tokenHash: hash(issued),
    };
    let displayName = cleanText(name, 24) || saved?.name || `Citizen ${this.players.size + 1}`;
    if ([...this.players.values()].some((p) => p.name.toLowerCase() === displayName.toLowerCase()))
      displayName = `${displayName.slice(0, 19)} #${this.players.size + 1}`;
    profile.name = displayName;
    this.profiles.set(profile.tokenHash, profile);
    const spawn = SPAWNS[this.players.size % SPAWNS.length];
    const player: Player = {
      ...spawn,
      id: profile.id,
      name: displayName,
      job: 'citizen',
      money: profile.money,
      health: 100,
      armor: 0,
      hunger: 100,
      yaw: 0,
      pitch: 0,
      crouch: false,
      vy: 0,
      grounded: false,
      weapon: 'keys',
      weapons: ['keys', 'physgun', 'toolgun'],
      ammo: {},
      reserve: {},
      arrestedUntil: 0,
      wantedUntil: 0,
      wantedReason: '',
      warrantUntil: 0,
      deadUntil: 0,
      reloadUntil: 0,
      seq: 0,
      holding: null,
      ping: 0,
      license: false,
    };
    this.players.set(player.id, player);
    this.runtime.set(player.id, {
      input: idleInput(),
      lastInput: this.now(),
      lastAction: 0,
      lastShot: 0,
      lastChat: 0,
      lastJob: -Infinity,
      inputSeq: -1,
      grabDistance: 4,
      tool: 'freeze',
      votesAt: -Infinity,
    });
    this.system(`${player.name} arrived in Union District.`);
    this.notice(player.id, 'Welcome to the district. F4 for jobs and shops · Q to build · F1 for help.');
    return { player, token: issued };
  }
  disconnect(id: string): void {
    const p = this.players.get(id);
    if (!p) return;
    this.saveProfile(p);
    this.release(p);
    for (const d of this.doors) {
      if (d.owner === id) {
        d.owner = null;
        d.locked = false;
        d.coowners = [];
        d.name = INITIAL_DOORS.find((v) => v.id === d.id)!.name;
      }
      d.coowners = d.coowners.filter((v) => v !== id);
    }
    for (const e of [...this.entities.values()]) if (e.owner === id) this.removeEntity(e.id);
    if (p.job === 'mayor') this.lockdown = false;
    this.players.delete(id);
    this.runtime.delete(id);
    if (this.vote?.candidate === id) this.vote = null;
    this.system(`${p.name} left the district.`);
  }
  saveProfile(p: Player): void {
    for (const v of this.profiles.values())
      if (v.id === p.id) {
        v.money = p.money;
        v.name = p.name;
        break;
      }
  }
  exportProfiles(): Profile[] {
    for (const p of this.players.values()) this.saveProfile(p);
    return [...this.profiles.values()];
  }
  notice(id: string, text: string, tone: 'info' | 'error' | 'success' = 'info'): void {
    this.onEvent({ type: 'notice', text, tone }, id);
  }
  system(text: string): void {
    this.onEvent({ type: 'chat', channel: 'system', name: 'District', text });
  }
  sound(sound: 'cash' | 'door' | 'arrest' | 'heal' | 'break', position: Vec3): void {
    this.onEvent({ type: 'sound', sound, position: { x: position.x, y: position.y, z: position.z } });
  }
  solidEntities(): Box[] {
    return [...this.entities.values()]
      .filter((e) => !(e.fading && e.fadeUntil > this.now()))
      .map((e) => this.entityBox(e));
  }
  entityBox(e: Entity): Box {
    const body = this.bodies.get(e.id)!;
    body.updateAABB();
    const a = body.aabb;
    return {
      x: (a.lowerBound.x + a.upperBound.x) / 2,
      y: (a.lowerBound.y + a.upperBound.y) / 2,
      z: (a.lowerBound.z + a.upperBound.z) / 2,
      w: a.upperBound.x - a.lowerBound.x,
      h: a.upperBound.y - a.lowerBound.y,
      d: a.upperBound.z - a.lowerBound.z,
    };
  }
  trace(
    origin: Vec3,
    dir: Vec3,
    range: number,
    skipPlayer?: string,
    skipEntity?: string,
    skipDoor?: string,
  ): Hit {
    let result: Hit = { kind: 'world', t: range, point: origin };
    const check = (box: Box, kind: Hit['kind'], id?: string) => {
      const t = rayBox(origin, dir, box, result.t);
      if (t !== null && t < result.t) result = { kind, id, t, point: origin };
    };
    for (const b of BLOCKS) check(b, 'world');
    if (dir.y < 0) {
      const t = -origin.y / dir.y;
      if (t >= 0 && t < result.t) result = { kind: 'world', t, point: origin };
    }
    for (const d of this.doors) if (!d.open && d.id !== skipDoor) check(doorBox(d), 'door', d.id);
    for (const e of this.entities.values())
      if (e.id !== skipEntity && !(e.fading && e.fadeUntil > this.now()))
        check(this.entityBox(e), 'entity', e.id);
    for (const p of this.players.values())
      if (p.id !== skipPlayer && !p.deadUntil)
        check(
          { x: p.x, y: p.y + (p.crouch ? 0.56 : 0.86), z: p.z, w: 0.6, h: p.crouch ? 1.12 : 1.72, d: 0.6 },
          'player',
          p.id,
        );
    result.point = {
      x: origin.x + dir.x * result.t,
      y: origin.y + dir.y * result.t,
      z: origin.z + dir.z * result.t,
    };
    return result;
  }
  reachable(p: Player, target: Vec3, range = INTERACT_RANGE, entity?: string, door?: string): boolean {
    const origin = eyes(p),
      len = distance(origin, target);
    if (len > range || len < 0.001) return len < 0.001;
    const dir = {
      x: (target.x - origin.x) / len,
      y: (target.y - origin.y) / len,
      z: (target.z - origin.z) / len,
    };
    return this.trace(origin, dir, len, p.id, entity, door).t >= len - 0.15;
  }
  handle(id: string, msg: ClientMessage): void {
    const p = this.players.get(id),
      r = this.runtime.get(id);
    if (!p || !r) return;
    if (msg.type === 'input') {
      const i = msg.input;
      if (
        !i ||
        ![i.seq, i.forward, i.right, i.yaw, i.pitch].every(finite) ||
        !Number.isSafeInteger(i.seq) ||
        i.seq <= r.inputSeq ||
        Math.abs(i.yaw) > 1e6
      )
        return;
      r.inputSeq = i.seq;
      r.input = {
        seq: i.seq,
        forward: clamp(i.forward, -1, 1),
        right: clamp(i.right, -1, 1),
        yaw: i.yaw % (Math.PI * 2),
        pitch: clamp(i.pitch, -1.48, 1.48),
        jump: i.jump === true,
        sprint: i.sprint === true,
        crouch: i.crouch === true,
      };
      r.lastInput = this.now();
      return;
    }
    if (msg.type === 'chat') {
      this.chat(p, msg.text);
      return;
    }
    if (msg.type !== 'action' || typeof msg.action !== 'string') return;
    if (msg.action === 'release') {
      this.release(p);
      return;
    }
    if (p.deadUntil) return;
    if (this.now() - r.lastAction < 65) return;
    r.lastAction = this.now();
    const target = typeof msg.target === 'string' ? msg.target.slice(0, 64) : '';
    if (msg.action === 'vote') {
      this.castVote(p, msg.value === true);
      return;
    }
    if (p.arrestedUntil) {
      this.notice(id, 'You are in custody. Wait for release or ask an officer.', 'error');
      return;
    }
    switch (msg.action) {
      case 'job':
        if (Object.hasOwn(JOBS, target)) this.changeJob(p, target as JobId);
        break;
      case 'buy':
        this.buy(p, target);
        break;
      case 'spawn':
        if (PROPS.some((v) => v.id === target)) this.spawn(p, target as EntityKind);
        break;
      case 'equip':
        if (p.weapons.includes(target as WeaponId)) {
          this.release(p);
          p.weapon = target as WeaponId;
          p.reloadUntil = 0;
          r.lockpick = undefined;
        }
        break;
      case 'interact':
        this.interact(p, target);
        break;
      case 'primary':
        this.primary(p, false);
        break;
      case 'secondary':
        this.primary(p, true);
        break;
      case 'reload':
        this.reload(p);
        break;
      case 'door-buy':
      case 'door-sell':
      case 'door-lock':
      case 'door-title':
      case 'door-coowner':
        this.doorAction(p, msg.action, target, msg.value);
        break;
      case 'tool':
        if (['freeze', 'remove', 'paint', 'fading'].includes(target)) {
          r.tool = target;
          this.notice(id, `Tool: ${target}`);
        }
        break;
      case 'price': {
        const e = this.entities.get(target);
        if (
          e &&
          e.owner === p.id &&
          ['shipment', 'microwave'].includes(e.kind) &&
          finite(msg.value) &&
          this.reachable(p, e, 5, e.id)
        ) {
          e.price = Math.round(clamp(msg.value, 1, 50_000));
          this.notice(id, `Price set to $${e.price}.`, 'success');
        }
        break;
      }
      case 'rotate':
        if (p.holding) {
          const body = this.bodies.get(p.holding)!;
          const q = new CANNON.Quaternion();
          q.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.PI / 12);
          q.mult(body.quaternion, body.quaternion);
          body.angularVelocity.setZero();
        }
        break;
      case 'distance':
        if (finite(msg.value)) r.grabDistance = clamp(r.grabDistance + msg.value, 2, 10);
        break;
      case 'fade':
        for (const e of this.entities.values())
          if (e.owner === id && e.fading) e.fadeUntil = this.now() + 6000;
        break;
      case 'undo': {
        const e = [...this.entities.values()]
          .reverse()
          .find((e) => e.owner === id && PROPS.some((v) => v.id === e.kind));
        if (e) this.removeEntity(e.id);
        break;
      }
      case 'cleanup':
        for (const e of [...this.entities.values()])
          if (e.owner === id && PROPS.some((v) => v.id === e.kind)) this.removeEntity(e.id);
        break;
    }
  }
  step(dt = 1 / TICK_RATE): void {
    const now = this.now();
    const colliders = [...BLOCKS, ...this.doors.filter((d) => !d.open).map(doorBox), ...this.solidEntities()];
    for (const p of this.players.values()) {
      const r = this.runtime.get(p.id)!;
      if (p.deadUntil) {
        if (now >= p.deadUntil) this.respawn(p);
        else continue;
      }
      if (p.arrestedUntil && now >= p.arrestedUntil) this.free(p);
      if (p.wantedUntil && now >= p.wantedUntil) {
        p.wantedUntil = 0;
        p.wantedReason = '';
      }
      if (p.warrantUntil && now >= p.warrantUntil) p.warrantUntil = 0;
      if (p.reloadUntil && now >= p.reloadUntil) {
        const w = p.weapon,
          amount = Math.min(WEAPONS[w].magazine - (p.ammo[w] ?? 0), p.reserve[w] ?? 0);
        p.ammo[w] = (p.ammo[w] ?? 0) + amount;
        p.reserve[w] = (p.reserve[w] ?? 0) - amount;
        p.reloadUntil = 0;
      }
      const input = now - r.lastInput < 500 ? r.input : { ...r.input, forward: 0, right: 0, jump: false };
      p.yaw = input.yaw;
      p.pitch = input.pitch;
      p.crouch = input.crouch;
      movePlayer(p, input, dt, colliders);
      p.seq = input.seq;
      if (p.arrestedUntil) {
        p.x = clamp(p.x, -7.3, -2.7);
        p.z = clamp(p.z, -46.3, -38.6);
      }
      if (p.y < -10) this.respawn(p);
      if (r.lockpick) {
        const d = this.doors.find((d) => d.id === r.lockpick!.door)!;
        if (
          p.weapon !== 'lockpick' ||
          distance(p, r.lockpick.start) > 0.7 ||
          !this.reachable(p, { x: d.x, y: 1.4, z: d.z }, 3.5, undefined, d.id)
        ) {
          r.lockpick = undefined;
          this.notice(p.id, 'Lockpicking interrupted.');
        } else if (now >= r.lockpick.end) {
          d.locked = false;
          this.setDoor(d, true);
          p.wantedUntil = now + 120_000;
          p.wantedReason = 'Breaking and entering';
          this.notice(p.id, 'Lock picked. Civil Protection has been alerted.', 'success');
          r.lockpick = undefined;
        }
      }
      if (p.holding) {
        const e = this.entities.get(p.holding),
          body = this.bodies.get(p.holding);
        if (!e || !body || distance(p, e) > 16) {
          this.release(p);
          continue;
        }
        const origin = eyes(p),
          dir = direction(p.yaw, p.pitch);
        const hit = this.trace(origin, dir, r.grabDistance, p.id, e.id);
        const length = Math.max(1.1, hit.t - 0.75);
        body.velocity.set(
          clamp((origin.x + dir.x * length - body.position.x) * 9, -16, 16),
          clamp((origin.y + dir.y * length - body.position.y) * 9, -16, 16),
          clamp((origin.z + dir.z * length - body.position.z) * 9, -16, 16),
        );
        body.angularVelocity.scale(0.65, body.angularVelocity);
        body.wakeUp();
      }
    }
    for (const d of this.doors) this.doorBodies.get(d.id)!.collisionResponse = !d.open;
    for (const e of this.entities.values())
      this.bodies.get(e.id)!.collisionResponse = !(e.fading && e.fadeUntil > now);
    this.physics.step(dt);
    for (const e of [...this.entities.values()]) {
      const b = this.bodies.get(e.id)!;
      e.x = b.position.x;
      e.y = b.position.y;
      e.z = b.position.z;
      e.q = { x: b.quaternion.x, y: b.quaternion.y, z: b.quaternion.z, w: b.quaternion.w };
      if (Math.abs(e.x) > MAP_BOUND + 2 || Math.abs(e.z) > MAP_BOUND + 2 || e.y < -8 || e.y > 90)
        this.removeEntity(e.id);
    }
    if (now >= this.nextSalary) {
      this.nextSalary = now + this.options.salarySeconds * 1000;
      for (const p of this.players.values())
        if (!p.arrestedUntil) {
          p.money = Math.min(1e9, p.money + JOBS[p.job].salary);
          if (JOBS[p.job].salary) this.notice(p.id, `Payday +$${JOBS[p.job].salary}`, 'success');
        }
    }
    if (now >= this.nextProduction) {
      this.nextProduction = now + 30_000;
      for (const e of this.entities.values()) {
        if (e.kind === 'printer') e.cash = Math.min(5000, e.cash + 100);
        if (e.kind === 'microwave') e.stock = Math.min(12, e.stock + 3);
      }
    }
    if (now >= this.nextHunger) {
      this.nextHunger = now + 10_000;
      for (const p of this.players.values())
        if (!p.deadUntil && !p.arrestedUntil) {
          p.hunger = Math.max(0, p.hunger - 1);
          if (p.hunger === 0) this.damage(p, 2);
        }
    }
    if (this.vote && now >= this.vote.end) {
      const vote = this.vote;
      this.vote = null;
      const candidate = this.players.get(vote.candidate);
      if (
        candidate &&
        !candidate.deadUntil &&
        !candidate.arrestedUntil &&
        vote.yes > vote.no &&
        vote.yes > vote.eligible.length / 2
      )
        this.applyJob(candidate, vote.job);
      else this.system('The job vote did not pass.');
    }
  }
  snapshot(): Snapshot {
    return {
      type: 'state',
      time: this.now(),
      players: [...this.players.values()],
      doors: this.doors,
      entities: [...this.entities.values()],
      laws: this.laws,
      lockdown: this.lockdown,
      vote: this.vote,
      nextSalary: this.nextSalary,
    };
  }
  changeJob(p: Player, job: JobId): void {
    const r = this.runtime.get(p.id)!,
      def = JOBS[job];
    if (p.job === job) return;
    if (this.now() - r.lastJob < 30_000) {
      this.notice(p.id, 'Wait 30 seconds between job changes.', 'error');
      return;
    }
    if (p.wantedUntil) {
      this.notice(p.id, 'Resolve your wanted status before changing jobs.', 'error');
      return;
    }
    if (def.max && [...this.players.values()].filter((v) => v.job === job).length >= def.max) {
      this.notice(p.id, 'This job is full.', 'error');
      return;
    }
    if (job === 'chief' && p.job !== 'police') {
      this.notice(p.id, 'Become Civil Protection before applying for Chief.', 'error');
      return;
    }
    if (def.vote && this.players.size > 1) {
      if (this.vote) {
        this.notice(p.id, 'A job vote is already in progress.', 'error');
        return;
      }
      if (this.now() - r.votesAt < 60_000) {
        this.notice(p.id, 'You can request another vote in one minute.', 'error');
        return;
      }
      r.votesAt = this.now();
      this.vote = {
        id: randomUUID(),
        candidate: p.id,
        job,
        end: this.now() + 20_000,
        yes: 1,
        no: 0,
        eligible: [...this.players.keys()],
        voted: [p.id],
      };
      this.system(`${p.name} is applying for ${def.name}. Vote with F4.`);
      return;
    }
    this.applyJob(p, job);
  }
  applyJob(p: Player, job: JobId): void {
    if (JOBS[job].max && [...this.players.values()].filter((v) => v.job === job).length >= JOBS[job].max)
      return;
    if (p.job === 'mayor') this.lockdown = false;
    this.release(p);
    p.job = job;
    p.weapons = ['keys', 'physgun', 'toolgun', ...JOBS[job].loadout];
    p.weapon = 'keys';
    p.ammo = {};
    p.reserve = {};
    p.reloadUntil = 0;
    p.license = GOVERNMENT.includes(job);
    for (const w of p.weapons)
      if (WEAPONS[w].magazine) {
        p.ammo[w] = WEAPONS[w].magazine;
        p.reserve[w] = WEAPONS[w].magazine * 3;
      }
    for (const e of [...this.entities.values()])
      if (
        e.owner === p.id &&
        ((e.kind === 'shipment' && job !== 'dealer') || (e.kind === 'microwave' && job !== 'cook'))
      )
        this.removeEntity(e.id);
    this.runtime.get(p.id)!.lastJob = this.now();
    this.system(`${p.name} is now ${JOBS[job].name}.`);
  }
  castVote(p: Player, yes: boolean): void {
    const v = this.vote;
    if (!v || !v.eligible.includes(p.id) || v.voted.includes(p.id)) return;
    v.voted.push(p.id);
    yes ? v.yes++ : v.no++;
    this.notice(p.id, 'Your vote has been counted.');
  }
  spawn(p: Player, kind: EntityKind, paid = false): Entity | null {
    if (this.entities.size >= MAX_ENTITIES) {
      this.notice(p.id, 'The server entity limit has been reached.', 'error');
      return null;
    }
    if (
      !paid &&
      [...this.entities.values()].filter((e) => e.owner === p.id && PROPS.some((v) => v.id === e.kind))
        .length >= MAX_PROPS
    ) {
      this.notice(p.id, `You can have ${MAX_PROPS} building props. Undo or remove a prop first.`, 'error');
      return null;
    }
    const [w, h, d] = entitySize(kind),
      dir = direction(p.yaw, 0);
    const pos = { x: p.x + dir.x * 2.5, y: p.y + h / 2 + 0.1, z: p.z + dir.z * 2.5 };
    const box = { ...pos, w, h, d };
    const colliders = [...BLOCKS, ...this.doors.filter((v) => !v.open).map(doorBox), ...this.solidEntities()];
    const hit = colliders.some(
      (b) =>
        Math.abs(b.x - box.x) < (b.w + box.w) / 2 &&
        Math.abs(b.y - box.y) < (b.h + box.h) / 2 &&
        Math.abs(b.z - box.z) < (b.d + box.d) / 2,
    );
    if (
      hit ||
      !this.reachable(p, { ...pos, y: Math.max(pos.y, 1) }, 5) ||
      [...this.players.values()].some((v) => overlaps(v, box, 1.78)) ||
      Math.abs(pos.x) > MAP_BOUND - 2 ||
      Math.abs(pos.z) > MAP_BOUND - 2
    ) {
      this.notice(p.id, 'Not enough clear space. Face an open area and try again.', 'error');
      return null;
    }
    return this.createEntity(kind, p.id, pos);
  }
  createEntity(kind: EntityKind, owner: string, pos: Vec3): Entity {
    const def = PROPS.find((v) => v.id === kind),
      [w, h, d] = entitySize(kind);
    const e: Entity = {
      ...pos,
      id: randomUUID(),
      kind,
      owner,
      q: { x: 0, y: 0, z: 0, w: 1 },
      frozen: false,
      health: kind === 'printer' ? 120 : 180,
      cash: 0,
      stock: kind === 'microwave' ? 3 : 0,
      price: kind === 'microwave' ? 35 : 250,
      color: def?.color ?? '#555b55',
      fading: false,
      fadeUntil: 0,
      heldBy: null,
    };
    const shape =
      kind === 'barrel'
        ? new CANNON.Cylinder(w / 2, w / 2, h, 12)
        : new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2));
    const body = new CANNON.Body({
      mass: def?.mass ?? 12,
      shape,
      position: new CANNON.Vec3(pos.x, pos.y, pos.z),
      linearDamping: 0.35,
      angularDamping: 0.55,
      allowSleep: true,
      sleepSpeedLimit: 0.12,
    });
    this.physics.addBody(body);
    this.entities.set(e.id, e);
    this.bodies.set(e.id, body);
    return e;
  }
  removeEntity(id: string): void {
    const e = this.entities.get(id);
    if (e?.heldBy) {
      const p = this.players.get(e.heldBy);
      if (p) p.holding = null;
    }
    const b = this.bodies.get(id);
    if (b) this.physics.removeBody(b);
    this.entities.delete(id);
    this.bodies.delete(id);
  }
  buy(p: Player, itemId: string): void {
    const item = SHOP.find((i) => i.id === itemId);
    if (!item) return;
    if (item.jobs && !item.jobs.includes(p.job)) {
      this.notice(p.id, 'Your job cannot purchase this item.', 'error');
      return;
    }
    if (item.kind === 'printer' && GOVERNMENT.includes(p.job)) {
      this.notice(p.id, 'Government employees cannot buy illegal printers.', 'error');
      return;
    }
    if (p.money < item.price) {
      this.notice(p.id, 'You cannot afford this purchase.', 'error');
      return;
    }
    if (
      item.limit &&
      [...this.entities.values()].filter((e) => e.owner === p.id && e.kind === item.kind).length >= item.limit
    ) {
      this.notice(p.id, 'You have reached the limit for this item.', 'error');
      return;
    }
    if (item.kind) {
      const e = this.spawn(p, item.kind, true);
      if (!e) return;
      e.item = item.item;
      if (item.stock) e.stock = item.stock;
      if (item.item) e.price = Math.round((item.price / item.stock!) * 1.5);
    } else if (itemId === 'ammo') {
      const w = p.weapon;
      if (!WEAPONS[w].magazine || (p.reserve[w] ?? 0) >= 300) {
        this.notice(p.id, 'Equip a firearm that needs ammunition.', 'error');
        return;
      }
      p.reserve[w] = Math.min(360, (p.reserve[w] ?? 0) + WEAPONS[w].magazine * 3);
    } else if (itemId === 'armor') p.armor = 100;
    else if (itemId === 'meal') {
      p.hunger = Math.min(100, p.hunger + 35);
      p.health = Math.min(100, p.health + 5);
    }
    p.money -= item.price;
    this.notice(p.id, `Purchased ${item.name} for $${item.price}.`, 'success');
    this.sound('cash', p);
  }
  setDoor(d: Door, open: boolean): void {
    if (!open && [...this.players.values()].some((p) => overlaps(p, doorBox(d), p.crouch ? 1.15 : 1.78)))
      return;
    d.open = open;
    this.doorBodies.get(d.id)!.collisionResponse = !open;
    this.sound('door', { x: d.x, y: 1, z: d.z });
  }
  ownsDoor(p: Player, d: Door): boolean {
    return (
      d.owner === p.id ||
      d.coowners.includes(p.id) ||
      (d.group === 'government' && GOVERNMENT.includes(p.job))
    );
  }
  doorAction(p: Player, action: string, target: string, value: unknown): void {
    const d = this.doors.find((v) => v.id === target);
    if (!d || !this.reachable(p, { x: d.x, y: 1.4, z: d.z }, INTERACT_RANGE, undefined, d.id)) return;
    if (action === 'door-buy') {
      if (d.owner || d.group || p.job === 'hobo') {
        this.notice(p.id, 'This door is not available to you.', 'error');
        return;
      }
      if (p.money < d.price) {
        this.notice(p.id, 'You cannot afford this property.', 'error');
        return;
      }
      if (this.doors.filter((v) => v.owner === p.id).length >= 3) {
        this.notice(p.id, 'You may own up to three properties.', 'error');
        return;
      }
      p.money -= d.price;
      d.owner = p.id;
      this.notice(p.id, `You own ${d.name}. Use your keys to lock it.`, 'success');
      this.sound('cash', p);
      return;
    }
    if (!this.ownsDoor(p, d)) {
      this.notice(p.id, 'You do not have keys to this door.', 'error');
      return;
    }
    if (action === 'door-lock') {
      d.locked = !d.locked;
      this.notice(p.id, d.locked ? 'Door locked.' : 'Door unlocked.');
      this.sound('door', p);
    }
    if (action === 'door-sell' && d.owner === p.id) {
      p.money += Math.floor(d.price * 0.65);
      d.owner = null;
      d.coowners = [];
      d.locked = false;
      d.name = INITIAL_DOORS.find((v) => v.id === d.id)!.name;
      this.notice(p.id, 'Property sold for 65% of the purchase price.', 'success');
    }
    if (action === 'door-title' && d.owner === p.id) d.name = cleanText(value, 40) || d.name;
    if (action === 'door-coowner' && d.owner === p.id && typeof value === 'string') {
      const other = this.players.get(value);
      if (other && other.id !== p.id) {
        d.coowners = d.coowners.includes(other.id)
          ? d.coowners.filter((v) => v !== other.id)
          : [...d.coowners, other.id];
        this.notice(p.id, `Updated keys for ${other.name}.`);
      }
    }
  }
  interact(p: Player, target: string): void {
    const d = this.doors.find((v) => v.id === target);
    if (d) {
      if (!this.reachable(p, { x: d.x, y: 1.4, z: d.z }, INTERACT_RANGE, undefined, d.id)) return;
      if (d.locked && !this.ownsDoor(p, d)) {
        this.notice(p.id, 'Locked. You need keys or a lockpick.', 'error');
        return;
      }
      this.setDoor(d, !d.open);
      return;
    }
    const e = this.entities.get(target);
    if (!e || !this.reachable(p, e, INTERACT_RANGE, e.id)) return;
    if (e.kind === 'printer') {
      if (POLICE.includes(p.job)) {
        this.removeEntity(e.id);
        p.money += 100;
        this.notice(p.id, 'Illegal printer confiscated. +$100', 'success');
      } else if (e.cash > 0) {
        p.money = Math.min(1e9, p.money + e.cash);
        this.notice(p.id, `Collected $${e.cash}.`, 'success');
        e.cash = 0;
        this.sound('cash', e);
      } else this.notice(p.id, 'Printer is running. Income arrives every 30 seconds.');
    } else if (e.kind === 'money') {
      p.money = Math.min(1e9, p.money + e.cash);
      this.removeEntity(e.id);
      this.sound('cash', p);
    } else if (e.kind === 'shipment' || e.kind === 'microwave') {
      if (e.stock <= 0) {
        this.notice(p.id, 'Out of stock.', 'error');
        return;
      }
      if (e.kind === 'shipment' && (!e.item || p.weapons.includes(e.item))) {
        this.notice(p.id, 'You already have this weapon.', 'error');
        return;
      }
      if (e.kind === 'microwave' && p.hunger >= 100) {
        this.notice(p.id, 'You are already full.');
        return;
      }
      const cost = e.owner === p.id ? 0 : e.price;
      if (p.money < cost) {
        this.notice(p.id, 'You cannot afford this item.', 'error');
        return;
      }
      p.money -= cost;
      const owner = this.players.get(e.owner);
      if (owner) {
        owner.money = Math.min(1e9, owner.money + cost);
        if (cost) this.notice(owner.id, `${p.name} bought from your shop. +$${cost}`, 'success');
      }
      e.stock--;
      if (e.kind === 'shipment' && e.item) {
        p.weapons.push(e.item);
        p.ammo[e.item] = WEAPONS[e.item].magazine;
        p.reserve[e.item] = WEAPONS[e.item].magazine * 2;
        this.notice(p.id, `Received ${WEAPONS[e.item].name}.`, 'success');
      } else {
        p.hunger = Math.min(100, p.hunger + 35);
        p.health = Math.min(100, p.health + 5);
        this.notice(p.id, 'A warm meal. +35 hunger', 'success');
      }
      this.sound('cash', p);
    }
  }
  primary(p: Player, secondary: boolean): void {
    const r = this.runtime.get(p.id)!,
      def = WEAPONS[p.weapon];
    if (this.now() - r.lastShot < def.delay) return;
    r.lastShot = this.now();
    const hit = this.trace(eyes(p), direction(p.yaw, p.pitch), def.range, p.id);
    if (p.weapon === 'keys') {
      if (hit.kind === 'door') {
        if (secondary) this.doorAction(p, 'door-lock', hit.id!, undefined);
        else this.interact(p, hit.id!);
      }
      return;
    }
    if (p.weapon === 'physgun') {
      if (p.holding) {
        if (secondary) this.freeze(p.holding, true);
        this.release(p);
        return;
      }
      if (hit.kind !== 'entity') return;
      const e = this.entities.get(hit.id!)!;
      if (e.owner !== p.id || e.heldBy) {
        this.notice(p.id, 'You can move your own props and entities.', 'error');
        return;
      }
      this.freeze(e.id, false);
      if (secondary) return;
      p.holding = e.id;
      e.heldBy = p.id;
      r.grabDistance = clamp(hit.t, 2, 10);
      return;
    }
    if (p.weapon === 'toolgun') {
      if (hit.kind !== 'entity') return;
      const e = this.entities.get(hit.id!)!;
      if (e.owner !== p.id) {
        this.notice(p.id, 'You can only edit your own props.', 'error');
        return;
      }
      if (r.tool === 'freeze') this.freeze(e.id, !e.frozen);
      if (r.tool === 'remove') this.removeEntity(e.id);
      if (r.tool === 'paint')
        e.color = ['#94734e', '#506f79', '#7d564e', '#667854', '#aa956c', '#43494c'][
          Math.floor(Math.random() * 6)
        ];
      if (r.tool === 'fading' && PROPS.some((v) => v.id === e.kind)) {
        e.fading = !e.fading;
        this.freeze(e.id, true);
        this.notice(
          p.id,
          e.fading ? 'Fading door enabled. F opens your fading doors for 6 seconds.' : 'Fading door removed.',
        );
      }
      return;
    }
    if (p.weapon === 'lockpick') {
      if (hit.kind !== 'door' || r.lockpick) return;
      const d = this.doors.find((v) => v.id === hit.id)!;
      if (d.group || !d.locked) {
        this.notice(p.id, 'This lock cannot be picked.', 'error');
        return;
      }
      r.lockpick = { door: d.id, end: this.now() + 8000, start: { x: p.x, y: p.y, z: p.z } };
      this.onEvent({ type: 'progress', label: 'Picking lock · stay close', end: r.lockpick.end }, p.id);
      return;
    }
    if (p.weapon === 'ram' && POLICE.includes(p.job)) {
      if (hit.kind === 'door') {
        const d = this.doors.find((v) => v.id === hit.id)!,
          owner = d.owner ? this.players.get(d.owner) : null;
        if (owner?.warrantUntil) {
          d.locked = false;
          this.setDoor(d, true);
        } else this.notice(p.id, 'A search warrant is required for this property.', 'error');
      }
      return;
    }
    if (p.weapon === 'medkit') {
      const target = secondary ? p : hit.kind === 'player' ? this.players.get(hit.id!) : null;
      if (target && !target.deadUntil) {
        target.health = Math.min(100, target.health + 15);
        this.sound('heal', target);
      }
      return;
    }
    if (p.weapon === 'baton' && POLICE.includes(p.job)) {
      if (hit.kind !== 'player') return;
      const target = this.players.get(hit.id!)!;
      if (!target.wantedUntil || GOVERNMENT.includes(target.job) || target.arrestedUntil) {
        this.notice(p.id, 'Mark a criminal wanted before making an arrest.', 'error');
        return;
      }
      this.release(target);
      Object.assign(target, JAIL);
      target.vy = 0;
      target.arrestedUntil = this.now() + this.options.jailSeconds * 1000;
      target.wantedUntil = 0;
      target.warrantUntil = 0;
      target.weapons = ['keys'];
      target.weapon = 'keys';
      target.reloadUntil = 0;
      p.money += 75;
      this.system(`${p.name} arrested ${target.name} for ${this.options.jailSeconds} seconds.`);
      this.sound('arrest', target);
      return;
    }
    if (p.weapon === 'unarrest') {
      if (hit.kind === 'player') {
        const target = this.players.get(hit.id!)!;
        if (target.arrestedUntil) this.free(target);
      }
      return;
    }
    if (!def.damage || secondary || p.reloadUntil) return;
    if ((p.ammo[p.weapon] ?? 0) <= 0) {
      this.reload(p);
      return;
    }
    p.ammo[p.weapon]!--;
    const pellets = p.weapon === 'shotgun' ? 7 : 1;
    for (let i = 0; i < pellets; i++) {
      const spread = p.weapon === 'shotgun' ? 0.07 : p.weapon === 'smg' ? 0.014 : 0.002;
      const ray = this.trace(
        eyes(p),
        direction(p.yaw + (Math.random() - 0.5) * spread, p.pitch + (Math.random() - 0.5) * spread),
        def.range,
        p.id,
      );
      if (ray.kind === 'player') {
        const target = this.players.get(ray.id!)!;
        const headshot = ray.point.y - target.y > (target.crouch ? 0.94 : 1.42);
        this.damage(target, Math.round(def.damage * (headshot ? 1.5 : 1)), p);
      }
      if (ray.kind === 'entity') {
        const e = this.entities.get(ray.id!)!;
        e.health -= def.damage;
        const body = this.bodies.get(e.id)!;
        const dir = direction(p.yaw, p.pitch);
        body.applyImpulse(new CANNON.Vec3(dir.x * 3, dir.y * 3, dir.z * 3));
        if (e.health <= 0) {
          this.sound('break', e);
          this.removeEntity(e.id);
        }
      }
      this.onEvent({
        type: 'shot',
        from: eyes(p),
        to: ray.point,
        weapon: p.weapon,
        shooter: p.id,
        hit: ray.kind === 'player',
      });
    }
  }
  freeze(id: string, frozen: boolean): void {
    const e = this.entities.get(id)!,
      b = this.bodies.get(id)!;
    e.frozen = frozen;
    b.type = frozen ? CANNON.Body.STATIC : CANNON.Body.DYNAMIC;
    b.mass = frozen ? 0 : (PROPS.find((v) => v.id === e.kind)?.mass ?? 12);
    b.updateMassProperties();
    b.velocity.setZero();
    b.angularVelocity.setZero();
    b.wakeUp();
  }
  release(p: Player): void {
    if (p.holding) {
      const e = this.entities.get(p.holding);
      if (e) e.heldBy = null;
    }
    p.holding = null;
  }
  reload(p: Player): void {
    const w = p.weapon,
      def = WEAPONS[w];
    if (!def.magazine || p.reloadUntil || (p.ammo[w] ?? 0) >= def.magazine || !(p.reserve[w] ?? 0)) return;
    p.reloadUntil = this.now() + def.reload;
  }
  damage(p: Player, amount: number, attacker?: Player): void {
    if (p.deadUntil || p.arrestedUntil) return;
    const absorbed = Math.min(p.armor, Math.ceil(amount * 0.6));
    p.armor -= absorbed;
    p.health = Math.max(0, p.health - amount + absorbed);
    if (attacker && !GOVERNMENT.includes(attacker.job)) {
      attacker.wantedUntil = this.now() + 120_000;
      attacker.wantedReason = 'Assault with a firearm';
    }
    if (p.health <= 0) {
      this.release(p);
      this.runtime.get(p.id)!.lockpick = undefined;
      p.deadUntil = this.now() + 7000;
      p.reloadUntil = 0;
      const lost = Math.min(250, Math.floor(p.money * 0.05));
      p.money -= lost;
      if (lost && this.entities.size < MAX_ENTITIES) {
        const cash = this.createEntity('money', p.id, { x: p.x, y: p.y + 0.4, z: p.z });
        cash.cash = lost;
      }
      if (p.job === 'mayor') {
        p.job = 'citizen';
        this.lockdown = false;
        this.system('The mayor has died. The office is vacant.');
      }
      this.system(`${p.name} died${attacker ? ` in an encounter with ${attacker.name}` : ''}.`);
    }
  }
  respawn(p: Player): void {
    Object.assign(p, SPAWNS[0]);
    p.vy = 0;
    p.grounded = false;
    p.health = 100;
    p.hunger = 100;
    p.armor = 0;
    p.deadUntil = 0;
    p.wantedUntil = 0;
    p.warrantUntil = 0;
    p.weapons = ['keys', 'physgun', 'toolgun', ...JOBS[p.job].loadout];
    p.weapon = 'keys';
    p.ammo = {};
    p.reserve = {};
    for (const w of p.weapons)
      if (WEAPONS[w].magazine) {
        p.ammo[w] = WEAPONS[w].magazine;
        p.reserve[w] = WEAPONS[w].magazine * 2;
      }
  }
  free(p: Player): void {
    p.arrestedUntil = 0;
    this.respawn(p);
    this.notice(p.id, 'You have been released from custody.', 'success');
  }
  chat(p: Player, raw: unknown): void {
    const r = this.runtime.get(p.id)!,
      text = cleanText(raw, 240);
    if (!text || this.now() - r.lastChat < 700) return;
    r.lastChat = this.now();
    const [command, ...words] = text.split(/\s+/);
    const args = words.join(' ');
    let channel: 'local' | 'ooc' | 'advert' | 'me' | 'group' = 'local',
      message = text;
    if (command.startsWith('/')) {
      switch (command.toLowerCase()) {
        case '/ooc':
        case '//':
          channel = 'ooc';
          message = args;
          break;
        case '/me':
          channel = 'me';
          message = args;
          break;
        case '/g':
          channel = 'group';
          message = args;
          break;
        case '/advert':
        case '/ad':
          if (p.money < 50 || !args) {
            this.notice(p.id, 'Advertisements cost $50.', 'error');
            return;
          }
          p.money -= 50;
          channel = 'advert';
          message = args;
          break;
        case '/rpname': {
          const n = cleanText(args, 24);
          if (
            n.length >= 2 &&
            ![...this.players.values()].some((v) => v.id !== p.id && v.name.toLowerCase() === n.toLowerCase())
          ) {
            p.name = n;
            this.notice(p.id, `Your name is now ${n}.`);
          }
          return;
        }
        case '/help':
          this.notice(p.id, 'F1: controls and commands · F4: jobs, shop, laws and votes.');
          return;
        default:
          if (p.deadUntil || p.arrestedUntil) {
            this.notice(p.id, 'You cannot do that while dead or in custody.', 'error');
            return;
          }
          this.command(p, command.toLowerCase(), words);
          return;
      }
    }
    if (!message) return;
    const event: GameEvent = { type: 'chat', name: p.name, text: message, channel, color: JOBS[p.job].color };
    if (channel === 'ooc' || channel === 'advert') this.onEvent(event);
    else
      for (const other of this.players.values())
        if (
          channel === 'group'
            ? GOVERNMENT.includes(p.job)
              ? GOVERNMENT.includes(other.job)
              : ['boss', 'gangster', 'thief'].includes(p.job)
                ? ['boss', 'gangster', 'thief'].includes(other.job)
                : other.job === p.job
            : distance(p, other) < 28
        )
          this.onEvent(event, other.id);
  }
  command(p: Player, command: string, words: string[]): void {
    const args = words.join(' ');
    if (['/wanted', '/unwanted', '/warrant', '/license'].includes(command)) {
      const match = [...this.players.values()].filter(
        (v) => v.name.toLowerCase() === words[0]?.toLowerCase() || v.id === words[0],
      );
      // Quote-free commands accept the longest exact player-name prefix.
      const target =
        [...this.players.values()]
          .sort((a, b) => b.name.length - a.name.length)
          .find(
            (v) =>
              args.toLowerCase() === v.name.toLowerCase() ||
              args.toLowerCase().startsWith(v.name.toLowerCase() + ' '),
          ) ?? match[0];
      if (!target || target.id === p.id) {
        this.notice(p.id, 'Specify another player’s full name, followed by a reason.', 'error');
        return;
      }
      if (!GOVERNMENT.includes(p.job)) {
        this.notice(p.id, 'Only government jobs can use this command.', 'error');
        return;
      }
      const reason = args.slice(target.name.length).trim().slice(0, 90);
      if (command === '/wanted') {
        if (!reason || GOVERNMENT.includes(target.job)) {
          this.notice(p.id, 'A reason is required; government staff cannot be marked wanted.', 'error');
          return;
        }
        target.wantedUntil = this.now() + 120_000;
        target.wantedReason = reason;
        this.system(`${target.name} is wanted: ${reason}`);
      }
      if (command === '/unwanted') {
        target.wantedUntil = 0;
        target.wantedReason = '';
        this.system(`${target.name} is no longer wanted.`);
      }
      if (command === '/warrant') {
        if (!['mayor', 'chief'].includes(p.job) || !reason) {
          this.notice(p.id, 'A mayor or police chief must issue the warrant with a reason.', 'error');
          return;
        }
        target.warrantUntil = this.now() + 90_000;
        this.system(`Search warrant issued for ${target.name}: ${reason}`);
      }
      if (command === '/license') {
        if (p.job !== 'mayor') {
          this.notice(p.id, 'Only the mayor can grant gun licenses.', 'error');
          return;
        }
        target.license = true;
        this.notice(target.id, 'The mayor granted you a gun license.', 'success');
        this.notice(p.id, `Gun license granted to ${target.name}.`);
      }
      return;
    }
    if (['/lockdown', '/unlockdown', '/addlaw', '/removelaw', '/resetlaws'].includes(command)) {
      if (p.job !== 'mayor') {
        this.notice(p.id, 'Only the mayor can do that.', 'error');
        return;
      }
      if (command === '/lockdown' || command === '/unlockdown') {
        this.lockdown = command === '/lockdown';
        this.system(
          this.lockdown
            ? `LOCKDOWN: ${args || 'Return to your homes. Civil Protection is enforcing a curfew.'}`
            : 'The lockdown has ended.',
        );
      }
      if (command === '/addlaw' && args && this.laws.length < 8) {
        this.laws.push(cleanText(args, 120));
        this.system('The mayor updated city law. Read it in F4.');
      }
      if (command === '/removelaw') {
        const n = Number(args);
        if (Number.isInteger(n) && n > 0 && n <= this.laws.length) this.laws.splice(n - 1, 1);
      }
      if (command === '/resetlaws')
        this.laws = [
          'Do not attack other citizens without a roleplay reason.',
          'Money printers are illegal.',
          'Respect private property and the orders of Civil Protection.',
        ];
      return;
    }
    if (command === '/give' || command === '/dropmoney') {
      const amount = Number(words[0]);
      if (!Number.isSafeInteger(amount) || amount <= 0 || amount > p.money || amount > 50_000) {
        this.notice(p.id, 'Enter a whole dollar amount from $1 to $50,000 that you can afford.', 'error');
        return;
      }
      if (command === '/give') {
        const hit = this.trace(eyes(p), direction(p.yaw, p.pitch), 3.5, p.id);
        if (hit.kind !== 'player') {
          this.notice(p.id, 'Look at a nearby player to give money.', 'error');
          return;
        }
        const other = this.players.get(hit.id!)!;
        other.money = Math.min(1e9, other.money + amount);
        this.notice(other.id, `${p.name} gave you $${amount}.`, 'success');
      } else {
        const cash = this.spawn(p, 'money', true);
        if (!cash) return;
        cash.cash = amount;
      }
      p.money -= amount;
      this.notice(p.id, `${command === '/give' ? 'Gave' : 'Dropped'} $${amount}.`, 'success');
      return;
    }
    const jobAliases: Record<string, JobId> = {
      '/citizen': 'citizen',
      '/cp': 'police',
      '/chief': 'chief',
      '/gangster': 'gangster',
      '/mobboss': 'boss',
      '/gundealer': 'dealer',
      '/medic': 'medic',
      '/mayor': 'mayor',
      '/hobo': 'hobo',
      '/cook': 'cook',
      '/thief': 'thief',
    };
    if (Object.hasOwn(jobAliases, command)) this.changeJob(p, jobAliases[command]);
    else this.notice(p.id, 'Unknown command. F1 lists the available commands.', 'error');
  }
}
