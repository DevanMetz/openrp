import * as THREE from 'three';
import { WEAPONS } from '../shared/catalog.ts';
import type { WeaponId } from '../shared/types.ts';

export const firearmGrips = {
  pistol: { right: [0, -0.12, 0.015], left: [-0.095, -0.145, 0.035], reach: 0.36 },
  smg: { right: [0, -0.12, 0.015], left: [-0.045, -0.085, -0.36], reach: 0.17 },
  shotgun: { right: [0, -0.12, 0.015], left: [-0.045, -0.065, -0.41], reach: 0.17 },
} satisfies Partial<Record<WeaponId, { right: number[]; left: number[]; reach: number }>>;

export function firearmMotion(weapon: WeaponId, reloadUntil: number, now: number) {
  if (weapon !== 'pistol' && weapon !== 'smg' && weapon !== 'shotgun') return;
  const grips = firearmGrips[weapon];
  const progress =
    reloadUntil > now ? THREE.MathUtils.clamp(1 - (reloadUntil - now) / WEAPONS[weapon].reload, 0, 1) : 0;
  const smooth = (from: number, to: number) => THREE.MathUtils.smoothstep(progress, from, to);
  const lower = smooth(0, 0.18) * (1 - smooth(0.82, 1));
  const hand =
    smooth(0.04, 0.22) * (1 - smooth(weapon === 'shotgun' ? 0.64 : 0.8, weapon === 'shotgun' ? 0.8 : 0.98));
  const magazine = weapon === 'shotgun' ? 0 : smooth(0.18, 0.36) * (1 - smooth(0.52, 0.76));
  const pump = weapon === 'shotgun' ? smooth(0.79, 0.86) * (1 - smooth(0.89, 0.97)) : 0;
  const support = new THREE.Vector3().fromArray(grips.left);
  const loading = new THREE.Vector3(
    weapon === 'pistol' ? -0.075 : -0.06,
    (weapon === 'shotgun' ? -0.2 + smooth(0.3, 0.64) * 0.075 : -0.22) - magazine * 0.2,
    weapon === 'smg' ? -0.29 : weapon === 'shotgun' ? -0.065 : 0.015,
  );
  support.lerp(loading, hand);
  support.z += pump * 0.09;
  return {
    grips,
    support,
    lower,
    magazine,
    pump,
    shell: weapon === 'shotgun' && progress > 0.22 && progress < 0.64,
  };
}

const down = new THREE.Vector3(0, -1, 0);
const palmAxis = new THREE.Vector3(0, -0.3, -0.01).normalize();
const reach = new THREE.Vector3(),
  bend = new THREE.Vector3(),
  elbow = new THREE.Vector3();
const direction = new THREE.Vector3(),
  inverse = new THREE.Quaternion();

/** Target and elbow hint are in the shoulder parent's coordinates. Bone lengths stay fixed. */
export function poseArm(upper: THREE.Group, lower: THREE.Group, target: THREE.Vector3, side: number): void {
  const upperLength = 0.28,
    lowerLength = Math.hypot(0.3, 0.01);
  reach.copy(target).sub(upper.position);
  const distance = THREE.MathUtils.clamp(
    reach.length(),
    Math.abs(upperLength - lowerLength) + 0.001,
    upperLength + lowerLength - 0.001,
  );
  if (reach.lengthSq() < 1e-10) reach.copy(down);
  else reach.normalize();
  bend.set(side * 0.6, -1, 0.2).addScaledVector(reach, -bend.dot(reach));
  if (bend.lengthSq() < 1e-8) bend.set(1, 0, 0).addScaledVector(reach, -reach.x);
  bend.normalize();
  const along = (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance);
  elbow
    .copy(reach)
    .multiplyScalar(along)
    .addScaledVector(bend, Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2)));
  upper.quaternion.setFromUnitVectors(down, direction.copy(elbow).normalize());
  inverse.copy(upper.quaternion).invert();
  direction.copy(reach).multiplyScalar(distance).sub(elbow).applyQuaternion(inverse).normalize();
  lower.quaternion.setFromUnitVectors(palmAxis, direction);
}

export function animateFirearm(model: THREE.Group, motion: ReturnType<typeof firearmMotion>): void {
  if (!motion) return;
  const support = model.getObjectByName('support-hand');
  support?.position.copy(motion.support);
  const magazine = model.getObjectByName('magazine');
  if (magazine) magazine.position.y = magazine.userData.restY - motion.magazine * 0.2;
  const pump = model.getObjectByName('pump');
  if (pump) pump.position.z = -0.47 + motion.pump * 0.09;
  const shell = model.getObjectByName('loading-shell');
  if (shell) {
    shell.visible = motion.shell;
    shell.position.copy(motion.support).add(new THREE.Vector3(0.015, 0.09, -0.045));
  }
}

export function updateViewmodel(
  model: THREE.Group,
  frame: {
    weapon: WeaponId;
    reloadUntil: number;
    now: number;
    elapsed: number;
    bob: number;
    moving: boolean;
    recoil: number;
  },
): void {
  const { weapon, reloadUntil, now, elapsed, bob, moving, recoil } = frame;
  const firearm = firearmMotion(weapon, reloadUntil, now);
  const reload = firearm?.lower ?? 0;
  animateFirearm(model, firearm);
  model.position.set(
    0.31 + Math.cos(elapsed * 6) * (moving ? 0.012 : 0.002) - reload * 0.08,
    -0.28 + bob * 0.65 - recoil * 0.015 + reload * 0.12,
    -0.78 + recoil * 0.08 - reload * 0.03,
  );
  model.rotation.set(
    recoil * 0.08 - reload * 0.15,
    -0.05 + reload * 0.24,
    -0.025 + bob * 0.3 + reload * 0.48,
  );
}
