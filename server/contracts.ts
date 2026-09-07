import { randomUUID } from 'node:crypto';

export interface ContractResident {
  id: string;
  money: number;
  alive: boolean;
  available: boolean;
  hitman: boolean;
}
import type { HitContract } from '../shared/types.ts';
export type { HitContract } from '../shared/types.ts';
export interface ContractState {
  entries: HitContract[];
  cooldowns: [string, number][];
}
export const CONTRACT_LIMIT = 32;
export const CONTRACT_MIN = 250;
export const CONTRACT_MAX = 50_000;
export const CONTRACT_COOLDOWN = 300_000;

/** Owns escrow transitions. The game supplies live/saved wallets and authoritative role/life state. */
export class ContractBook {
  contracts = new Map<string, HitContract>();
  cooldowns = new Map<string, number>();
  constructor(
    readonly resident: (id: string) => ContractResident | undefined,
    readonly now: () => number,
    readonly nearby: (customer: string, hitman: string) => boolean,
  ) {}
  export(): ContractState {
    return structuredClone({ entries: [...this.contracts.values()], cooldowns: [...this.cooldowns] });
  }
  restore(state: ContractState): void {
    this.contracts = new Map(structuredClone(state.entries).map((c) => [c.id, c]));
    this.cooldowns = new Map(state.cooldowns);
    // A replacement interrupts active work. Pending earned payouts remain payouts.
    for (const c of this.contracts.values())
      if (c.status === 'active' || c.status === 'offered') c.status = 'refund';
    this.tick();
  }
  request(customerId: string, hitmanId: string, targetId: string, price: unknown): HitContract {
    const customer = this.resident(customerId),
      hitman = this.resident(hitmanId),
      target = this.resident(targetId);
    if (
      !customer?.alive ||
      !customer.available ||
      !hitman?.alive ||
      !hitman.available ||
      !hitman.hitman ||
      !target?.alive ||
      !target.available ||
      new Set([customerId, hitmanId, targetId]).size !== 3
    )
      throw new Error('Choose three distinct, available residents and an active hitman.');
    if (!this.nearby(customerId, hitmanId)) throw new Error('Stand near the hitman to request a contract.');
    if (
      typeof price !== 'number' ||
      !Number.isSafeInteger(price) ||
      price < CONTRACT_MIN ||
      price > CONTRACT_MAX ||
      price > customer.money
    )
      throw new Error('Choose an affordable whole-dollar price from $250 to $50,000.');
    if (
      this.contracts.size >= CONTRACT_LIMIT ||
      [...this.contracts.values()].some(
        (c) => c.customer === customerId || c.hitman === hitmanId || c.target === targetId,
      )
    )
      throw new Error('A participant already has a contract, or the contract limit has been reached.');
    if (
      (this.cooldowns.get(customerId) ?? 0) > this.now() ||
      (this.cooldowns.get(targetId) ?? 0) > this.now()
    )
      throw new Error('The customer or target is on a contract cooldown.');
    const contract: HitContract = {
      id: randomUUID(),
      customer: customerId,
      hitman: hitmanId,
      target: targetId,
      price,
      expires: this.now() + 30_000,
      status: 'offered',
    };
    customer.money -= price;
    this.contracts.set(contract.id, contract);
    this.cooldowns.set(customerId, this.now() + CONTRACT_COOLDOWN);
    return { ...contract };
  }
  accept(actorId: string, id: string): void {
    const c = this.contracts.get(id);
    if (!c || c.status !== 'offered' || c.hitman !== actorId)
      throw new Error('This offer is no longer available to you.');
    const hitman = this.resident(actorId),
      target = this.resident(c.target),
      customer = this.resident(c.customer);
    if (
      c.expires <= this.now() ||
      !hitman?.hitman ||
      !hitman.alive ||
      !hitman.available ||
      !target?.alive ||
      !target.available ||
      !customer?.available
    ) {
      this.settle(c, 'refund');
      throw new Error('The offer expired or a participant became unavailable.');
    }
    c.status = 'active';
    c.expires = this.now() + 600_000;
  }
  cancel(actorId: string, id: string): void {
    const c = this.contracts.get(id);
    if (!c || !['offered', 'active'].includes(c.status) || (actorId !== c.customer && actorId !== c.hitman))
      throw new Error('Only the customer or hitman can cancel this contract.');
    this.settle(c, 'refund');
  }
  death(targetId: string, attackerId?: string): void {
    for (const c of [...this.contracts.values()]) {
      if (!['offered', 'active'].includes(c.status)) continue;
      if (c.target === targetId) {
        const hitman = this.resident(c.hitman);
        const paid =
          c.status === 'active' &&
          c.expires > this.now() &&
          attackerId === c.hitman &&
          !!hitman?.hitman &&
          hitman.alive &&
          hitman.available;
        if (paid) this.cooldowns.set(c.target, this.now() + CONTRACT_COOLDOWN);
        this.settle(c, paid ? 'payout' : 'refund');
      } else if (c.hitman === targetId || c.customer === targetId) this.settle(c, 'refund');
    }
  }
  unavailable(id: string): void {
    for (const c of [...this.contracts.values()])
      if (['offered', 'active'].includes(c.status) && [c.customer, c.hitman, c.target].includes(id))
        this.settle(c, 'refund');
  }
  tick(): void {
    for (const c of [...this.contracts.values()]) {
      if (c.status === 'refund' || c.status === 'payout') {
        this.settle(c, c.status);
        continue;
      }
      const hitman = this.resident(c.hitman),
        target = this.resident(c.target),
        customer = this.resident(c.customer);
      if (
        c.expires <= this.now() ||
        !customer?.alive ||
        !customer.available ||
        !hitman?.hitman ||
        !hitman.alive ||
        !hitman.available ||
        !target?.alive ||
        !target.available
      )
        this.settle(c, 'refund');
    }
    for (const [id, until] of this.cooldowns) if (until <= this.now()) this.cooldowns.delete(id);
  }
  private settle(c: HitContract, outcome: 'refund' | 'payout'): void {
    // Pending settlement keeps the escrow intact when a wallet is absent or full.
    c.status = outcome;
    const wallet = this.resident(outcome === 'payout' ? c.hitman : c.customer);
    if (!wallet || wallet.money + c.price > 1e9) return;
    wallet.money += c.price;
    this.contracts.delete(c.id);
  }
}

export function validContractState(
  value: unknown,
  owners: Set<string>,
  savedAt: number,
): value is ContractState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  if (
    Object.keys(state).some((k) => !['entries', 'cooldowns'].includes(k)) ||
    !Array.isArray(state.entries) ||
    state.entries.length > CONTRACT_LIMIT ||
    !Array.isArray(state.cooldowns) ||
    state.cooldowns.length > owners.size
  )
    return false;
  const ids = new Set<string>(),
    customers = new Set<string>(),
    hitmen = new Set<string>(),
    targets = new Set<string>();
  for (const entry of state.entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const c = entry as HitContract;
    if (
      Object.keys(c).some(
        (k) => !['id', 'customer', 'hitman', 'target', 'price', 'expires', 'status'].includes(k),
      ) ||
      typeof c.id !== 'string' ||
      !c.id.length ||
      c.id.length > 80 ||
      ids.has(c.id) ||
      ![c.customer, c.hitman, c.target].every((id) => typeof id === 'string' && owners.has(id)) ||
      new Set([c.customer, c.hitman, c.target]).size !== 3 ||
      !Number.isSafeInteger(c.price) ||
      c.price < CONTRACT_MIN ||
      c.price > CONTRACT_MAX ||
      !Number.isSafeInteger(c.expires) ||
      c.expires < 0 ||
      c.expires > savedAt + 600_000 ||
      !['offered', 'active', 'refund', 'payout'].includes(c.status) ||
      customers.has(c.customer) ||
      hitmen.has(c.hitman) ||
      targets.has(c.target)
    )
      return false;
    ids.add(c.id);
    customers.add(c.customer);
    hitmen.add(c.hitman);
    targets.add(c.target);
  }
  const cooling = new Set<string>();
  for (const row of state.cooldowns) {
    if (
      !Array.isArray(row) ||
      row.length !== 2 ||
      typeof row[0] !== 'string' ||
      !owners.has(row[0]) ||
      cooling.has(row[0]) ||
      !Number.isSafeInteger(row[1]) ||
      row[1] < 0 ||
      row[1] > savedAt + CONTRACT_COOLDOWN
    )
      return false;
    cooling.add(row[0]);
  }
  return true;
}
