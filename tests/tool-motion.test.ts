import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { disposeObject, makeAvatar, makeViewmodel, updateAvatar } from '../client/entities.ts';
import { toolGrips, updateViewmodel } from '../client/weapon-motion.ts';
import { Game } from '../server/game.ts';

const tools = ['physgun', 'toolgun', 'medkit', 'ram', 'scanner', 'baton', 'unarrest', 'lockpick'] as const;

function stubLabels(t: { after: (fn: () => void) => void }) {
  const prior = globalThis.document;
  // Canvas text is browser-reviewed; all geometry and transform calculations remain real.
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ fillRect() {}, strokeRect() {}, fillText() {} }) }),
  } as unknown as Document;
  t.after(() => {
    globalThis.document = prior;
  });
}

test('tool handles meet articulated palms across aim, stance and equipment changes', (t) => {
  stubLabels(t);
  const player = new Game().join('Tool grip review').player;
  Object.assign(player, { job: 'police', x: 3, y: 2, z: -5, yaw: 1.1, grounded: true });
  const avatar = makeAvatar(player);
  avatar.labelKey = 'Tool grip review:police::false:false';
  for (const weapon of tools) {
    for (const crouch of [false, true]) {
      for (const pitch of [-1.48, -0.7, 0, 0.7, 1.48]) {
        Object.assign(player, { weapon, crouch, pitch });
        avatar.crouch = Number(crouch);
        avatar.pitch = pitch;
        updateAvatar(avatar, player, 1 / 60, new THREE.Vector3(), 10000);
        avatar.root.updateMatrixWorld(true);
        const grips = toolGrips[weapon]!;
        const shoulder = avatar.torso.localToWorld(new THREE.Vector3(0, 0.465, 0));
        const carry = avatar
          .equipment!.getWorldPosition(new THREE.Vector3())
          .sub(shoulder)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), -avatar.root.rotation.y);
        assert.ok(carry.z < -0.25, `${weapon} must stay in front of the torso while aiming`);
        for (const [upper, lower, grip] of [
          [avatar.rightArm, avatar.rightForearm, grips.right],
          [avatar.leftArm, avatar.leftForearm, grips.left],
        ] as const) {
          if (!grip) continue;
          const palm = lower.localToWorld(new THREE.Vector3(0, -0.3, -0.01));
          const handle = avatar.equipment!.localToWorld(new THREE.Vector3().fromArray(grip));
          const miss = palm.distanceTo(handle);
          assert.ok(miss < 0.001, `${weapon}, crouch=${crouch}, pitch=${pitch}: hand misses by ${miss}m`);
          if (grips.left && !crouch && pitch === 0)
            assert.ok(
              avatar.body.worldToLocal(palm.clone()).z < -0.18,
              'two-handed grips must clear the chest',
            );
          const elbow = lower.getWorldPosition(new THREE.Vector3());
          assert.ok(Math.abs(elbow.distanceTo(upper.getWorldPosition(new THREE.Vector3())) - 0.28) < 1e-8);
          assert.ok(Math.abs(elbow.distanceTo(palm) - Math.hypot(0.3, 0.01)) < 1e-8);
        }
        if (!grips.left) {
          const palm = avatar.leftForearm.getWorldPosition(new THREE.Vector3());
          assert.ok(
            palm.y < avatar.leftArm.getWorldPosition(new THREE.Vector3()).y - 0.2,
            'unused arm should hang naturally instead of holding an invisible second handle',
          );
        }
      }
    }
  }
  disposeObject(avatar.root);
});

test('tool grips stay connected through moving crouch and aim transitions', (t) => {
  stubLabels(t);
  const player = new Game().join('Tool transition').player;
  Object.assign(player, { x: 0, y: 0, z: 0, grounded: true });
  for (const fps of [30, 60, 144]) {
    const avatar = makeAvatar(player);
    avatar.labelKey = 'Tool transition:citizen::false:false';
    for (const weapon of tools) {
      player.weapon = weapon;
      for (let frame = 0; frame < fps; frame++) {
        player.crouch = frame < fps / 2;
        player.pitch = Math.sin((frame / fps) * Math.PI * 2) * 1.48;
        player.x += 0.02;
        player.yaw += 0.03;
        updateAvatar(avatar, player, 1 / fps, new THREE.Vector3(), 10000);
        avatar.root.updateMatrixWorld(true);
        const grips = toolGrips[weapon]!;
        for (const [lower, grip] of [
          [avatar.rightForearm, grips.right],
          [avatar.leftForearm, grips.left],
        ] as const) {
          if (!grip) continue;
          const palm = lower.localToWorld(new THREE.Vector3(0, -0.3, -0.01));
          const handle = avatar.equipment!.localToWorld(new THREE.Vector3().fromArray(grip));
          assert.ok(
            palm.distanceTo(handle) < 0.001,
            `${weapon} transition missed at ${fps}fps frame ${frame}`,
          );
        }
      }
    }
    disposeObject(avatar.root);
  }
});

test('first-person tool hands grip actual handles and stay visible at common aspect ratios', (t) => {
  stubLabels(t);
  for (const weapon of tools) {
    const model = makeViewmodel(weapon);
    model.scale.setScalar(0.68);
    updateViewmodel(model, {
      weapon,
      reloadUntil: 0,
      now: 10000,
      elapsed: 0,
      bob: 0,
      moving: false,
      recoil: 0,
    });
    model.updateMatrixWorld(true);
    const grips = toolGrips[weapon]!;
    for (const [name, grip] of [
      ['primary-hand', grips.right],
      ['support-hand', grips.left],
    ] as const) {
      if (!grip) continue;
      const hand = model.getObjectByName(name)!;
      assert.ok(hand.position.distanceTo(new THREE.Vector3().fromArray(grip)) < 1e-8);
      for (const aspect of [16 / 9, 4 / 3, 1]) {
        const camera = new THREE.PerspectiveCamera(65, aspect, 0.01, 10);
        const palm = hand.getWorldPosition(new THREE.Vector3()).project(camera);
        assert.ok(
          Math.abs(palm.x) < 0.95 && Math.abs(palm.y) < 0.95,
          `${weapon} ${name} is out of frame at aspect ${aspect}`,
        );
      }
    }
    disposeObject(model);
  }
});
