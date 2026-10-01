import * as THREE from 'three';

const down = new THREE.Vector3(0, -1, 0);
const reach = new THREE.Vector3(),
  bend = new THREE.Vector3(),
  kneeOffset = new THREE.Vector3(),
  direction = new THREE.Vector3();
const inverse = new THREE.Quaternion();

/** Place the ankle in the avatar's coordinates, without scaling either leg bone. */
export function poseLeg(hip: THREE.Group, knee: THREE.Group, foot: THREE.Group, ankle: THREE.Vector3): void {
  const thighLength = 0.37,
    shinLength = 0.35;
  reach.copy(ankle).sub(hip.position);
  const distance = THREE.MathUtils.clamp(reach.length(), 0.021, 0.719);
  if (reach.lengthSq() < 1e-10) reach.copy(down);
  else reach.normalize();
  // Knees bend toward the character's toes even while strafing or walking backward.
  bend.set(0, 0, -1).addScaledVector(reach, reach.z);
  if (bend.lengthSq() < 1e-8) bend.set(0, -1, 0).addScaledVector(reach, reach.y);
  bend.normalize();
  const along = (thighLength ** 2 - shinLength ** 2 + distance ** 2) / (2 * distance);
  kneeOffset
    .copy(reach)
    .multiplyScalar(along)
    .addScaledVector(bend, Math.sqrt(Math.max(0, thighLength ** 2 - along ** 2)));
  hip.quaternion.setFromUnitVectors(down, direction.copy(kneeOffset).normalize());
  inverse.copy(hip.quaternion).invert();
  direction.copy(reach).multiplyScalar(distance).sub(kneeOffset).applyQuaternion(inverse).normalize();
  knee.quaternion.setFromUnitVectors(down, direction);
  // Soles stay level during stance changes and the planted half of each step.
  foot.quaternion.copy(hip.quaternion).multiply(knee.quaternion).invert();
}

export function dampAngle(current: number, target: number, rate: number, dt: number): number {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + difference * (1 - Math.exp(-rate * dt));
}
