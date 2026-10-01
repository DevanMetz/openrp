import * as THREE from 'three';
import type { Box, Player } from '../shared/types.ts';
import type { Avatar } from './entities.ts';

const duration = 0.6;
const bounds = new THREE.Box3();

function visibleBounds(body: THREE.Group): THREE.Box3 {
  body.updateWorldMatrix(true, true);
  bounds.makeEmpty();
  body.traverseVisible((part) => {
    if (!(part instanceof THREE.Mesh)) return;
    bounds.expandByObject(part, true);
  });
  return bounds;
}

/** Cosmetic fall only: the server continues to own death, respawn and collision rules. */
export function startCollapse(a: Avatar, player: Player, boxes: readonly Box[], settled: boolean) {
  if (a.equipment) a.equipment.visible = false;
  const nodes = [
    a.body,
    a.torso,
    a.head,
    a.leftArm,
    a.rightArm,
    a.leftForearm,
    a.rightForearm,
    a.leftLeg,
    a.rightLeg,
    a.leftShin,
    a.rightShin,
    a.leftFoot,
    a.rightFoot,
  ];
  const start = nodes.map((node) => ({ position: node.position.clone(), rotation: node.quaternion.clone() }));
  a.body.position.set(0, 0, 0);
  a.torso.position.y = a.leftLeg.position.y = a.rightLeg.position.y = 0.785;
  a.torso.rotation.set(-0.04, 0, 0);
  a.head.rotation.set(0.12, 0, -0.12);
  a.leftArm.rotation.set(-0.16, 0, -0.4);
  a.rightArm.rotation.set(-0.1, 0, 0.48);
  a.leftForearm.rotation.set(-0.05, 0, 0);
  a.rightForearm.rotation.set(-0.02, 0, 0);
  a.leftLeg.rotation.set(0.08, 0, -0.12);
  a.rightLeg.rotation.set(0.34, 0, 0.16);
  a.leftShin.rotation.set(-0.11, 0, 0);
  a.rightShin.rotation.set(-0.43, 0, 0);
  a.leftFoot.rotation.set(0.06, 0, 0);
  a.rightFoot.rotation.set(0.12, 0, 0);

  let score = Infinity,
    ground = 0,
    floorHeight = 0,
    fallDirection = 0;
  const restingRotation = new THREE.Quaternion();
  const fallAngle = ((a.crouch > 0.5 ? -1 : 1) * Math.PI) / 2;
  // Follow the current lean, then turn toward clear space when a wall blocks that direction.
  for (const direction of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
    a.body.quaternion.setFromEuler(new THREE.Euler(fallAngle, direction, 0, 'YXZ'));
    const candidate = visibleBounds(a.body).clone();
    const overlaps = (box: Box) =>
      candidate.min.x < box.x + box.w / 2 &&
      candidate.max.x > box.x - box.w / 2 &&
      candidate.min.z < box.z + box.d / 2 &&
      candidate.max.z > box.z - box.d / 2;
    let support = 0;
    for (const box of boxes) {
      const top = box.y + box.h / 2;
      if (top <= player.y + 0.25 && overlaps(box)) support = Math.max(support, top);
    }
    const offset = support + 0.006 - candidate.min.y;
    candidate.translate(new THREE.Vector3(0, offset, 0));
    let obstruction = 0;
    for (const box of boxes) {
      if (!overlaps(box)) continue;
      const depth =
        Math.min(candidate.max.y, box.y + box.h / 2) - Math.max(candidate.min.y, box.y - box.h / 2);
      if (depth > 0)
        obstruction +=
          depth *
          (Math.min(candidate.max.x, box.x + box.w / 2) - Math.max(candidate.min.x, box.x - box.w / 2)) *
          (Math.min(candidate.max.z, box.z + box.d / 2) - Math.max(candidate.min.z, box.z - box.d / 2));
    }
    if (obstruction < score) {
      score = obstruction;
      ground = support;
      floorHeight = a.root.position.y + offset;
      fallDirection = direction;
      restingRotation.copy(a.body.quaternion);
    }
    if (score < 1e-8) break;
  }
  a.body.quaternion.copy(restingRotation);
  const end = nodes.map((node) => ({ position: node.position.clone(), rotation: node.quaternion.clone() }));
  nodes.forEach((node, i) => {
    node.position.copy(start[i].position);
    node.quaternion.copy(start[i].rotation);
  });
  return {
    deadline: player.deadUntil,
    age: settled ? duration : 0,
    nodes,
    start,
    end,
    ground,
    floorHeight,
    fallDirection,
    fallAngle,
    anchorY: settled ? floorHeight : a.root.position.y,
    velocity: settled ? 0 : player.vy,
  };
}

export function updateCollapse(a: Avatar, dt: number): void {
  const fall = a.collapse!;
  fall.age = Math.min(duration, fall.age + dt);
  const blend = THREE.MathUtils.smoothstep(fall.age, 0, duration);
  fall.nodes.forEach((node, i) => {
    node.position.lerpVectors(fall.start[i].position, fall.end[i].position, blend);
    node.quaternion.slerpQuaternions(fall.start[i].rotation, fall.end[i].rotation, blend);
  });
  // Turn toward the clear space before the body extends into it. Tip before unfolding crouched legs.
  a.body.rotation.set(
    fall.fallAngle * THREE.MathUtils.smoothstep(fall.age, 0, duration * 0.7),
    fall.fallDirection * THREE.MathUtils.smoothstep(fall.age, 0, 0.14),
    0,
    'YXZ',
  );
  // Fall to the sampled support plane even when the fatal hit happened during a jump.
  fall.anchorY += fall.velocity * dt - 7.75 * dt * dt;
  fall.velocity -= 15.5 * dt;
  a.body.position.y = 0;
  const minimum =
    fall.age === duration
      ? fall.floorHeight
      : fall.ground + 0.006 - visibleBounds(a.body).min.y + a.root.position.y;
  if (fall.anchorY < minimum) {
    fall.anchorY = minimum;
    fall.velocity = 0;
  }
  a.body.position.y = fall.anchorY - a.root.position.y;
  a.label.visible = false;
}
