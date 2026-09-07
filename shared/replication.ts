import type { Door, Entity, Player, Snapshot } from './types.ts';

type Patch<T extends { id: string }> = Partial<T> & { id: string };
export interface Delta {
  type: 'delta';
  time: number;
  players: Patch<Player>[];
  entities: Patch<Entity>[];
  doors: Patch<Door>[];
  removedPlayers: string[];
  removedEntities: string[];
  world: Partial<Pick<Snapshot, 'laws' | 'lockdown' | 'vote' | 'nextSalary'>>;
}
function changes<T extends { id: string }>(before: T[], after: T[]): Patch<T>[] {
  const old = new Map(before.map((v) => [v.id, v]));
  return after.flatMap((value) => {
    const previous = old.get(value.id);
    if (!previous) return [value];
    const fields = Object.entries(value).filter(
      ([key, next]) => JSON.stringify(next) !== JSON.stringify(previous[key as keyof T]),
    );
    return fields.length ? [{ id: value.id, ...Object.fromEntries(fields) } as Patch<T>] : [];
  });
}
const removed = <T extends { id: string }>(before: T[], after: T[]) => {
  const ids = new Set(after.map((v) => v.id));
  return before.filter((v) => !ids.has(v.id)).map((v) => v.id);
};
export function makeDelta(before: Snapshot, after: Snapshot): Delta {
  const world: Delta['world'] = {};
  for (const key of ['laws', 'lockdown', 'vote', 'nextSalary'] as const)
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      Object.assign(world, { [key]: after[key] });
  return {
    type: 'delta',
    time: after.time,
    players: changes(before.players, after.players),
    entities: changes(before.entities, after.entities),
    doors: changes(before.doors, after.doors),
    removedPlayers: removed(before.players, after.players),
    removedEntities: removed(before.entities, after.entities),
    world,
  };
}
function merge<T extends { id: string }>(values: T[], patches: Patch<T>[], removedIds: string[] = []): T[] {
  const gone = new Set(removedIds),
    result = new Map(values.filter((v) => !gone.has(v.id)).map((v) => [v.id, v]));
  for (const patch of patches) result.set(patch.id, { ...result.get(patch.id), ...patch } as T);
  return [...result.values()];
}
export function applyDelta(before: Snapshot, delta: Delta): Snapshot {
  return {
    ...before,
    ...delta.world,
    type: 'state',
    time: delta.time,
    players: merge(before.players, delta.players, delta.removedPlayers),
    entities: merge(before.entities, delta.entities, delta.removedEntities),
    doors: merge(before.doors, delta.doors),
  };
}
