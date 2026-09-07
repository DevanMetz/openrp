import { EYE_HEIGHT, PLAYER_HEIGHT, PLAYER_RADIUS } from './catalog.ts';
import { MAP_BOUND } from './map.ts';
import type { Box, Input, Motion, Vec3 } from './types.ts';

export const idleInput = (): Input => ({
  seq: 0,
  forward: 0,
  right: 0,
  yaw: 0,
  pitch: 0,
  jump: false,
  sprint: false,
  crouch: false,
});
export function overlaps(p: Vec3, b: Box, height: number, radius = PLAYER_RADIUS): boolean {
  return (
    p.x + radius > b.x - b.w / 2 &&
    p.x - radius < b.x + b.w / 2 &&
    p.z + radius > b.z - b.d / 2 &&
    p.z - radius < b.z + b.d / 2 &&
    p.y + height > b.y - b.h / 2 + 0.015 &&
    p.y < b.y + b.h / 2 - 0.015
  );
}
export function movePlayer(p: Motion, input: Input, dt: number, colliders: Box[]): void {
  const height = input.crouch ? 1.15 : PLAYER_HEIGHT;
  const speed = input.crouch ? 2.15 : input.sprint ? 6.7 : 4.3;
  const n = Math.max(1, Math.hypot(input.forward, input.right));
  const fx = -Math.sin(input.yaw),
    fz = -Math.cos(input.yaw);
  const dx = ((fx * input.forward + Math.cos(input.yaw) * input.right) / n) * speed * dt;
  const dz = ((fz * input.forward - Math.sin(input.yaw) * input.right) / n) * speed * dt;
  if (input.jump && p.grounded) {
    p.vy = 5.5;
    p.grounded = false;
  }
  p.vy = Math.max(-30, p.vy - 15.5 * dt);
  const near = colliders.filter(
    (b) => Math.abs(b.x - p.x) < b.w / 2 + 2 && Math.abs(b.z - p.z) < b.d / 2 + 2,
  );
  for (const [axis, delta] of [
    ['x', dx],
    ['z', dz],
  ] as const) {
    p[axis] += delta;
    for (const b of near)
      if (overlaps(p, b, height)) {
        const top = b.y + b.h / 2;
        if (
          p.grounded &&
          top - p.y <= 0.24 &&
          top >= p.y &&
          !near.some((other) => other !== b && overlaps({ ...p, y: top + 0.02 }, other, height))
        ) {
          p.y = top;
          continue;
        }
        const half = (axis === 'x' ? b.w : b.d) / 2;
        if (delta > 0) p[axis] = b[axis] - half - PLAYER_RADIUS - 0.001;
        if (delta < 0) p[axis] = b[axis] + half + PLAYER_RADIUS + 0.001;
      }
    p[axis] = Math.max(-MAP_BOUND + 1, Math.min(MAP_BOUND - 1, p[axis]));
  }
  const oldY = p.y;
  p.y += p.vy * dt;
  p.grounded = false;
  for (const b of near)
    if (overlaps(p, b, height)) {
      if (p.vy <= 0 && oldY >= b.y + b.h / 2 - 0.08) {
        p.y = b.y + b.h / 2;
        p.vy = 0;
        p.grounded = true;
      } else if (p.vy > 0 && oldY + height <= b.y - b.h / 2 + 0.08) {
        p.y = b.y - b.h / 2 - height;
        p.vy = 0;
      }
    }
  if (p.y <= 0) {
    p.y = 0;
    p.vy = 0;
    p.grounded = true;
  }
}
export function direction(yaw: number, pitch: number): Vec3 {
  return { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
}
export function eyes(p: Vec3 & { crouch?: boolean }): Vec3 {
  return { x: p.x, y: p.y + (p.crouch ? 1.02 : EYE_HEIGHT), z: p.z };
}
export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
export function rayBox(origin: Vec3, dir: Vec3, box: Box, range = Infinity): number | null {
  let min = 0,
    max = range;
  for (const [axis, size] of [
    ['x', 'w'],
    ['y', 'h'],
    ['z', 'd'],
  ] as const) {
    const lo = box[axis] - box[size] / 2,
      hi = box[axis] + box[size] / 2;
    if (Math.abs(dir[axis]) < 1e-8) {
      if (origin[axis] < lo || origin[axis] > hi) return null;
    } else {
      const a = (lo - origin[axis]) / dir[axis],
        b = (hi - origin[axis]) / dir[axis];
      min = Math.max(min, Math.min(a, b));
      max = Math.min(max, Math.max(a, b));
      if (min > max) return null;
    }
  }
  return min;
}
