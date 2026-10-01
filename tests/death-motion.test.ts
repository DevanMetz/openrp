import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { disposeObject, makeAvatar, updateAvatar, type Avatar } from '../client/entities.ts';
import { Game } from '../server/game.ts';
import type { Box } from '../shared/types.ts';

function resident(crouch = false) {
  const player = new Game().join('Collapse test').player;
  Object.assign(player, {
    job: 'gangster',
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0.4,
    crouch,
    grounded: true,
    weapon: 'smg',
  });
  const avatar = makeAvatar(player);
  avatar.labelKey = 'Collapse test:gangster::false:false';
  updateAvatar(avatar, player, 1 / 60, new THREE.Vector3(), 10000);
  return { player, avatar };
}

function visibleBounds(avatar: Avatar) {
  avatar.root.updateMatrixWorld(true);
  const result = new THREE.Box3();
  const vertex = new THREE.Vector3();
  avatar.body.traverseVisible((part) => {
    if (!(part instanceof THREE.Mesh)) return;
    const points = part.geometry.getAttribute('position');
    for (let i = 0; i < points.count; i++)
      result.expandByPoint(vertex.fromBufferAttribute(points, i).applyMatrix4(part.matrixWorld));
  });
  return result;
}

function checkProportions(avatar: Avatar) {
  assert.deepEqual(avatar.root.scale.toArray(), [1, 1, 1]);
  assert.deepEqual(avatar.body.scale.toArray(), [1, 1, 1]);
  for (const [upper, lower, length] of [
    [avatar.leftArm, avatar.leftForearm, 0.28],
    [avatar.rightArm, avatar.rightForearm, 0.28],
    [avatar.leftLeg, avatar.leftShin, 0.37],
    [avatar.rightLeg, avatar.rightShin, 0.37],
    [avatar.leftShin, avatar.leftFoot, 0.35],
    [avatar.rightShin, avatar.rightFoot, 0.35],
  ] as const) {
    assert.ok(
      Math.abs(
        upper.getWorldPosition(new THREE.Vector3()).distanceTo(lower.getWorldPosition(new THREE.Vector3())) -
          length,
      ) < 1e-8,
    );
  }
}

test('death collapses an intact body without ground penetration, visible equipment or nameplates', () => {
  for (const crouch of [false, true])
    for (const fps of [30, 60, 144]) {
      const { player, avatar } = resident(crouch);
      const initialHeight = visibleBounds(avatar).max.y;
      player.deadUntil = 17000;
      for (let frame = 0; frame < fps; frame++) {
        updateAvatar(avatar, player, 1 / fps, new THREE.Vector3(), 10000 + (frame * 1000) / fps);
        const bounds = visibleBounds(avatar);
        checkProportions(avatar);
        assert.ok(bounds.min.y >= 0.0059, `body below floor at ${fps}fps, frame ${frame}`);
        assert.ok(
          bounds.max.y <= initialHeight + 0.05,
          `body rises before falling: crouch=${crouch}, fps=${fps}, frame=${frame}, initial=${initialHeight}, current=${bounds.max.y}`,
        );
        assert.equal(avatar.equipment!.visible, false);
        assert.equal(avatar.label.visible, false);
      }
      const bounds = visibleBounds(avatar);
      assert.ok(bounds.max.y - bounds.min.y < 0.6, 'body should lie down');
      assert.ok(bounds.max.z - bounds.min.z > 1.5, 'body should retain its length');
      assert.ok(Math.abs(bounds.min.y - 0.006) < 1e-7);
      disposeObject(avatar.root);
    }
});

test('a resident first seen dead appears already settled, including on a raised floor', () => {
  const { player, avatar: alive } = resident();
  disposeObject(alive.root);
  Object.assign(player, { deadUntil: 17000, y: 2, job: 'cook' });
  const avatar = makeAvatar(player);
  const floor: Box = { x: 0, y: 1.9, z: 0, w: 10, h: 0.2, d: 10 };
  updateAvatar(avatar, player, 1 / 60, new THREE.Vector3(), 15000, () => [floor]);
  const bounds = visibleBounds(avatar);
  assert.ok(Math.abs(bounds.min.y - 2.006) < 1e-7);
  assert.ok(bounds.max.y - bounds.min.y < 0.6);
  checkProportions(avatar);
  disposeObject(avatar.root);
});

test('an airborne death falls onto the supporting surface instead of freezing in the air', () => {
  const { player, avatar } = resident();
  Object.assign(player, { deadUntil: 17000, y: 3, vy: 3, grounded: false });
  const platform: Box = { x: 0, y: 0.5, z: 0, w: 8, h: 1, d: 8 };
  for (let frame = 0; frame < 120; frame++) {
    updateAvatar(avatar, player, 1 / 60, new THREE.Vector3(), 10000 + (frame * 1000) / 60, () => [platform]);
    assert.ok(visibleBounds(avatar).min.y >= 1.0059);
  }
  assert.ok(Math.abs(visibleBounds(avatar).min.y - 1.006) < 1e-7);
  assert.equal(player.y, 3, 'cosmetic motion must not move the authoritative player');
  disposeObject(avatar.root);
});

test('collapse chooses an open direction when a wall blocks falling backward', () => {
  const { player, avatar } = resident();
  const wall: Box = { x: 0, y: 1.5, z: 0.8, w: 6, h: 3, d: 0.2 };
  const obstacle = new THREE.Box3().setFromCenterAndSize(
    new THREE.Vector3(0, 1.5, 0.8),
    new THREE.Vector3(6, 3, 0.2),
  );
  player.deadUntil = 17000;
  for (let frame = 0; frame < 90; frame++) {
    updateAvatar(avatar, player, 1 / 60, new THREE.Vector3(), 10000, () => [wall]);
    assert.equal(visibleBounds(avatar).intersectsBox(obstacle), false, `wall contact at frame ${frame}`);
  }
  const bounds = visibleBounds(avatar);
  assert.equal(bounds.intersectsBox(obstacle), false);
  assert.ok(bounds.max.y - bounds.min.y < 0.6, 'the sideward fall must still settle flat');
  assert.ok(Math.abs(bounds.min.y - 0.006) < 1e-7);
  disposeObject(avatar.root);
});

test('respawn resets collapse transforms and restores the same held equipment even nearby', (t) => {
  // Only label-texture drawing is stubbed; the scanner's real mesh and attachment hierarchy are used.
  const priorDocument = globalThis.document;
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ fillRect() {}, strokeRect() {}, fillText() {} }) }),
  } as unknown as Document;
  t.after(() => {
    globalThis.document = priorDocument;
  });
  for (const weapon of ['smg', 'scanner'] as const) {
    const { player, avatar } = resident(true);
    player.weapon = weapon;
    updateAvatar(avatar, player, 1 / 60, new THREE.Vector3(), 10000);
    player.deadUntil = 17000;
    for (let frame = 0; frame < 60; frame++) updateAvatar(avatar, player, 1 / 60, new THREE.Vector3(), 10000);
    Object.assign(player, { deadUntil: 0, x: 1, z: 1, yaw: -1, crouch: false, pitch: -0.2 });
    updateAvatar(avatar, player, 1 / 60, new THREE.Vector3(), 18000);
    assert.equal(avatar.collapse, undefined);
    assert.deepEqual(avatar.body.position.toArray(), [0, 0, 0]);
    assert.deepEqual(avatar.body.quaternion.toArray(), [0, 0, 0, 1]);
    assert.deepEqual(avatar.root.position.toArray(), [1, 0, 1]);
    assert.equal(avatar.equipment!.visible, true);
    assert.equal(avatar.label.visible, true);
    const fresh = makeAvatar(player);
    fresh.labelKey = avatar.labelKey;
    updateAvatar(fresh, player, 1 / 60, new THREE.Vector3(), 18000);
    for (const key of [
      'torso',
      'head',
      'leftLeg',
      'rightLeg',
      'leftShin',
      'rightShin',
      'leftFoot',
      'rightFoot',
      'leftArm',
      'rightArm',
      'leftForearm',
      'rightForearm',
    ] as const) {
      assert.ok(avatar[key].position.distanceTo(fresh[key].position) < 1e-8, key);
      assert.ok(1 - Math.abs(avatar[key].quaternion.dot(fresh[key].quaternion)) < 1e-8, key);
    }
    disposeObject(avatar.root);
    disposeObject(fresh.root);
  }
});
