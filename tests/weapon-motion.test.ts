import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { firearmMotion, poseArm, updateViewmodel } from '../client/weapon-motion.ts';
import { disposeObject, makeAvatar, makeViewmodel, updateAvatar } from '../client/entities.ts';
import { WEAPONS } from '../shared/catalog.ts';
import { Game } from '../server/game.ts';

test('articulated palms meet firearm grips through crouching, full aim range and reload', () => {
  const player = new Game().join('Motion test').player;
  Object.assign(player, { job: 'gangster', x: 3, y: 2, z: -5, yaw: 1.1 });
  const avatar = makeAvatar(player);
  // Labels are reviewed in the browser; this test exercises the actual limb/equipment hierarchy.
  avatar.labelKey = 'Motion test:gangster::false:false';
  for (const weapon of ['pistol', 'smg', 'shotgun'] as const) {
    for (const crouch of [false, true]) {
      for (const pitch of [-1.48, -0.7, 0, 0.7, 1.48]) {
        for (const progress of [0, 0.2, 0.4, 0.6, 0.85, 0.95, 1]) {
          Object.assign(player, {
            weapon,
            crouch,
            pitch,
            reloadUntil: progress ? 10000 + (1 - progress) * WEAPONS[weapon].reload : 0,
          });
          updateAvatar(avatar, player, 1 / 60, new THREE.Vector3(), 10000);
          avatar.root.updateMatrixWorld(true);
          const motion = firearmMotion(weapon, player.reloadUntil, 10000)!;
          for (const side of [-1, 1]) {
            const upper = side === 1 ? avatar.rightArm : avatar.leftArm;
            const lower = side === 1 ? avatar.rightForearm : avatar.leftForearm;
            const grip =
              side === 1 ? new THREE.Vector3().fromArray(motion.grips.right) : motion.support.clone();
            const palm = lower.localToWorld(new THREE.Vector3(0, -0.3, -0.01));
            const expected = avatar.equipment!.localToWorld(grip);
            assert.ok(
              palm.distanceTo(expected) < 0.001,
              `${weapon}, crouch=${crouch}, pitch=${pitch}, reload=${progress}, side=${side}: palm missed by ${palm.distanceTo(expected)}m`,
            );
            const elbow = lower.getWorldPosition(new THREE.Vector3());
            assert.ok(Math.abs(elbow.distanceTo(upper.getWorldPosition(new THREE.Vector3())) - 0.28) < 1e-8);
            assert.ok(Math.abs(elbow.distanceTo(palm) - Math.hypot(0.3, 0.01)) < 1e-8);
          }
        }
      }
    }
  }
  disposeObject(avatar.root);
});

test('reload poses follow authoritative duration and return to rest after completion or cancellation', () => {
  for (const weapon of ['pistol', 'smg', 'shotgun'] as const) {
    const start = 7000,
      end = start + WEAPONS[weapon].reload;
    const idle = firearmMotion(weapon, 0, start)!;
    assert.deepEqual(firearmMotion(weapon, end, start), idle);
    assert.ok(firearmMotion(weapon, end, start + WEAPONS[weapon].reload * 0.4)!.lower > 0.99);
    for (const [deadline, now] of [
      [end, end],
      [end, end + 200],
      [0, start + 500],
    ]) {
      assert.deepEqual(firearmMotion(weapon, deadline, now), idle);
    }
    const beforeEnd = firearmMotion(weapon, end, end - 1)!;
    assert.ok(beforeEnd.support.distanceTo(idle.support) < 0.001);
    assert.ok(beforeEnd.lower < 0.001);
  }
  assert.equal(firearmMotion('scanner', 20000, 19000), undefined);
});

test('unreachable arm targets keep finite rotations and fixed bone lengths', () => {
  for (const target of [new THREE.Vector3(), new THREE.Vector3(0, -20, 0), new THREE.Vector3(1, 4, 8)]) {
    const upper = new THREE.Group(),
      lower = new THREE.Group();
    lower.position.y = -0.28;
    upper.add(lower);
    poseArm(upper, lower, target, -1);
    upper.updateMatrixWorld(true);
    assert.ok([...upper.quaternion, ...lower.quaternion].every(Number.isFinite));
    assert.ok(lower.localToWorld(new THREE.Vector3(0, -0.3, -0.01)).length() <= 0.581);
    assert.equal(lower.position.length(), 0.28);
  }
});

test('first-person loading hands stay in frame and cached models reset after reload', () => {
  for (const weapon of ['pistol', 'smg', 'shotgun'] as const) {
    const model = makeViewmodel(weapon);
    model.scale.setScalar(0.68);
    const frame = { weapon, reloadUntil: 0, now: 10000, elapsed: 0, bob: 0, moving: false, recoil: 0 };
    const parts = ['support-hand', 'magazine', 'pump', 'loading-shell']
      .map((name) => model.getObjectByName(name))
      .filter((part) => !!part);
    const snapshot = () =>
      [model, ...parts].map((part) => ({
        position: part.position.toArray(),
        rotation: part.quaternion.toArray(),
        visible: part.visible,
      }));
    updateViewmodel(model, frame);
    const rest = snapshot();
    for (const progress of [0.25, 0.42, 0.6, 0.85]) {
      updateViewmodel(model, { ...frame, reloadUntil: frame.now + (1 - progress) * WEAPONS[weapon].reload });
      model.updateMatrixWorld(true);
      for (const aspect of [16 / 9, 4 / 3, 1]) {
        const camera = new THREE.PerspectiveCamera(65, aspect, 0.01, 10);
        const palm = model
          .getObjectByName('support-hand')!
          .getWorldPosition(new THREE.Vector3())
          .project(camera);
        assert.ok(
          Math.abs(palm.x) < 0.92 && Math.abs(palm.y) < 0.92,
          `${weapon} reload hand outside ${aspect} viewport at ${progress}`,
        );
      }
    }
    updateViewmodel(model, frame);
    assert.deepEqual(snapshot(), rest);
    disposeObject(model);
  }
});
