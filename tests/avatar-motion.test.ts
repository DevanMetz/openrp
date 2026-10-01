import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { disposeObject, makeAvatar, updateAvatar, type Avatar } from '../client/entities.ts';
import { Game } from '../server/game.ts';

function character() {
  const player = new Game().join('Movement test').player;
  Object.assign(player, { job: 'gangster', weapon: 'pistol', x: 3, y: 2, z: -5, yaw: 0, grounded: true });
  const avatar = makeAvatar(player);
  avatar.labelKey = 'Movement test:gangster::false:false';
  return { player, avatar };
}

function feet(avatar: Avatar) {
  avatar.root.updateMatrixWorld(true);
  return [
    [avatar.leftLeg, avatar.leftShin, avatar.leftFoot],
    [avatar.rightLeg, avatar.rightShin, avatar.rightFoot],
  ].map(([hip, knee, foot]) => {
    const ankle = foot.getWorldPosition(new THREE.Vector3());
    const joint = knee.getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(joint.distanceTo(hip.getWorldPosition(new THREE.Vector3())) - 0.37) < 1e-8);
    assert.ok(Math.abs(ankle.distanceTo(joint) - 0.35) < 1e-8);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(foot.getWorldQuaternion(new THREE.Quaternion()));
    assert.ok(up.distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-8, 'sole must remain level');
    return avatar.root.worldToLocal(ankle);
  });
}

test('crouch and stand transitions keep both soles planted without stretching the legs', () => {
  for (const fps of [30, 60, 144]) {
    const { player, avatar } = character();
    updateAvatar(avatar, player, 1 / fps, new THREE.Vector3(), 10000);
    const standing = avatar.torso.position.y;
    for (const crouch of [true, false]) {
      player.crouch = crouch;
      let previous = avatar.torso.position.y;
      for (let frame = 0; frame < fps; frame++) {
        updateAvatar(avatar, player, 1 / fps, new THREE.Vector3(), 10000);
        const height = avatar.torso.position.y;
        assert.ok(crouch ? height <= previous : height >= previous);
        assert.ok(Math.abs(height - previous) < 0.13, 'stance must blend rather than snap');
        for (const ankle of feet(avatar)) assert.ok(Math.abs(ankle.y - 0.079) < 1e-8);
        previous = height;
      }
      assert.ok(Math.abs(avatar.torso.position.y - standing + (crouch ? 0.33 : 0)) < 1e-5);
    }
    disposeObject(avatar.root);
  }
});

test('walking, strafing and reversing keep a level planted foot through the gait', () => {
  for (const [dx, dz] of [
    [0, -1],
    [0, 1],
    [1, 0],
    [-1, 0],
    [Math.SQRT1_2, -Math.SQRT1_2],
  ]) {
    for (const crouch of [false, true]) {
      const { player, avatar } = character();
      player.crouch = crouch;
      const speed = crouch ? 2.15 : 6.7;
      let highest = 0;
      for (let frame = 0; frame < 180; frame++) {
        const sign = frame < 90 ? 1 : -1;
        player.x += (dx * speed * sign) / 60;
        player.z += (dz * speed * sign) / 60;
        updateAvatar(avatar, player, 1 / 60, new THREE.Vector3(), 10000);
        const ankles = feet(avatar);
        for (const ankle of ankles) {
          assert.ok(ankle.y >= 0.079 - 1e-8, 'foot must not sink through the ground');
          highest = Math.max(highest, ankle.y);
        }
        assert.ok(Math.abs(Math.min(...ankles.map((ankle) => ankle.y)) - 0.079) < 1e-8);
        assert.ok(ankles[0].x < ankles[1].x, 'strafe must not cross the feet');
      }
      assert.ok(highest > 0.11, 'swing foot must visibly lift');
      disposeObject(avatar.root);
    }
  }
});

test('remote turning takes the short path across the yaw boundary and blends aim', () => {
  const { player, avatar } = character();
  player.yaw = avatar.root.rotation.y = Math.PI - 0.05;
  player.yaw = -Math.PI + 0.05;
  player.pitch = 1;
  updateAvatar(avatar, player, 1 / 60, new THREE.Vector3(), 10000);
  assert.ok(avatar.root.rotation.y > Math.PI - 0.05 && avatar.root.rotation.y < Math.PI + 0.05);
  assert.ok(avatar.pitch > 0 && avatar.pitch < 1);
  for (let frame = 0; frame < 60; frame++) updateAvatar(avatar, player, 1 / 60, new THREE.Vector3(), 10000);
  assert.ok(Math.abs(avatar.root.rotation.y - Math.PI - 0.05) < 1e-7);
  assert.ok(Math.abs(avatar.pitch - 1) < 1e-7);
  disposeObject(avatar.root);
});

test('the planted foot travels backward relative to the body, and returns forward while lifted', () => {
  const { player, avatar } = character();
  let previous: THREE.Vector3[] | undefined;
  let plantedSamples = 0,
    liftedSamples = 0;
  for (let frame = 0; frame < 180; frame++) {
    player.z -= 4.3 / 60;
    updateAvatar(avatar, player, 1 / 60, new THREE.Vector3(), 10000);
    const ankles = feet(avatar);
    if (previous && frame > 60) {
      for (let i = 0; i < ankles.length; i++) {
        if (ankles[i].y < 0.08 && previous[i].y < 0.08) {
          assert.ok(ankles[i].z > previous[i].z, 'planted foot must move against forward travel');
          plantedSamples++;
        } else if (ankles[i].y > 0.09 && previous[i].y > 0.09) {
          assert.ok(ankles[i].z < previous[i].z, 'lifted foot must return in the travel direction');
          liftedSamples++;
        }
      }
    }
    previous = ankles;
  }
  assert.ok(plantedSamples > 30 && liftedSamples > 30);
  disposeObject(avatar.root);
});

test('teleports reset locomotion and airborne characters stop cycling their legs', () => {
  const { player, avatar } = character();
  for (let frame = 0; frame < 60; frame++) {
    player.z -= 0.07;
    updateAvatar(avatar, player, 1 / 60, new THREE.Vector3(), 10000);
  }
  player.grounded = false;
  for (let frame = 0; frame < 60; frame++) {
    player.x += 0.07;
    updateAvatar(avatar, player, 1 / 60, new THREE.Vector3(), 10000);
  }
  const phase = avatar.phase;
  updateAvatar(avatar, player, 1 / 60, new THREE.Vector3(), 10000);
  assert.ok(Math.abs(avatar.phase - phase) < 1e-6);
  for (const ankle of feet(avatar)) assert.ok(ankle.y > 0.19);
  Object.assign(player, { x: 100, y: 0, z: 80, crouch: true, grounded: true, yaw: -1, pitch: -0.7 });
  updateAvatar(avatar, player, 1 / 60, new THREE.Vector3(), 10000);
  assert.equal(avatar.speed, 0);
  assert.equal(avatar.phase, 0);
  assert.equal(avatar.root.rotation.y, player.yaw);
  assert.equal(avatar.pitch, player.pitch);
  assert.ok(avatar.root.position.distanceTo(new THREE.Vector3(100, 0, 80)) < 1e-8);
  for (const ankle of feet(avatar)) assert.ok(Math.abs(ankle.y - 0.079) < 1e-8);
  disposeObject(avatar.root);
});
