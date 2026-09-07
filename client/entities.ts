import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { JOBS, WEAPONS, entitySize } from '../shared/catalog.ts';
import type { Entity, Player, WeaponId } from '../shared/types.ts';
import { labelTexture } from './world.ts';

const materials = new Map<string, THREE.MeshStandardMaterial>();
const avatarSurface = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
materials.set('avatar-surface', avatarSurface);
const material = (color: string, metal = false) => {
  const key = `${color}:${metal}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: metal ? 0.4 : 0.85, metalness: metal ? 0.65 : 0 });
    materials.set(key, m);
  }
  return m;
};
function box(
  group: THREE.Group,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  color: string,
  metal = false,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color, metal));
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  group.add(m);
  return m;
}
function cylinder(
  group: THREE.Group,
  x: number,
  y: number,
  z: number,
  rt: number,
  rb: number,
  h: number,
  color: string,
  metal = false,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 12), material(color, metal));
  m.position.set(x, y, z);
  m.castShadow = true;
  group.add(m);
  return m;
}
function sphere(
  group: THREE.Group,
  x: number,
  y: number,
  z: number,
  r: number,
  color: string,
  scale: [number, number, number] = [1, 1, 1],
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), material(color));
  mesh.position.set(x, y, z);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  group.add(mesh);
  return mesh;
}
function panel(
  group: THREE.Group,
  text: string,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  bg = '#242e2e',
  fg = '#b4d4b0',
): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({
      map: labelTexture(text, bg, fg, 512, Math.round((512 * h) / w), 'bold 64px monospace'),
      roughness: 0.6,
    }),
  );
  m.position.set(x, y, z);
  group.add(m);
  return m;
}
export function makeEntity(e: Entity): THREE.Group {
  const group = new THREE.Group(),
    [w, h, d] = entitySize(e.kind),
    c = e.color;
  if (e.kind === 'weapon' && e.item) {
    const weapon = makeViewmodel(e.item, false);
    weapon.rotation.z = Math.PI / 2;
    weapon.position.z = 0.22;
    weapon.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = object.receiveShadow = true;
        object.frustumCulled = true;
        object.renderOrder = 0;
      }
    });
    group.add(weapon);
  } else if (e.kind === 'crate' || e.kind === 'shipment') {
    box(group, 0, 0, 0, w, h, d, c);
    for (const side of [-1, 1]) {
      for (const y of [-h * 0.38, h * 0.38]) {
        box(group, 0, y, side * (d / 2 + 0.015), w + 0.05, 0.13, 0.05, '#b49b75');
        box(group, side * (w / 2 + 0.015), y, 0, 0.05, 0.13, d, '#b49b75');
      }
      for (const x of [-w * 0.37, w * 0.37]) box(group, x, 0, side * (d / 2 + 0.03), 0.1, h, 0.04, '#b49b75');
    }
    if (e.kind === 'shipment')
      panel(
        group,
        e.item ? WEAPONS[e.item].short : 'SHIPMENT',
        0,
        0.03,
        d / 2 + 0.06,
        w * 0.7,
        h * 0.47,
        '#b8b39a',
        '#303b34',
      );
  } else if (e.kind === 'barrel') {
    cylinder(group, 0, 0, 0, w / 2, w / 2, h, c, true);
    for (const y of [-h * 0.45, -h * 0.22, h * 0.22, h * 0.45])
      cylinder(group, 0, y, 0, w / 2 + 0.014, w / 2 + 0.014, 0.035, '#394442', true);
    cylinder(group, 0.17, h / 2 + 0.01, 0.12, 0.055, 0.055, 0.025, '#333a35', true);
  } else if (e.kind === 'pallet') {
    for (const x of [-0.6, 0, 0.6]) box(group, x, -0.04, 0, 0.14, 0.15, d, '#756247');
    for (let z = -0.5; z <= 0.51; z += 0.25) box(group, 0, 0.075, z, w, 0.07, 0.18, c);
  } else if (e.kind === 'fence') {
    for (const x of [-w / 2 + 0.04, w / 2 - 0.04]) cylinder(group, x, 0, 0, 0.045, 0.045, h, c, true);
    for (const y of [-h / 2 + 0.08, h / 2 - 0.08]) box(group, 0, y, 0, w, 0.06, 0.06, c, true);
    for (let x = -1.25; x <= 1.26; x += 0.18) box(group, x, 0, 0, 0.025, h - 0.15, 0.025, c, true);
    for (let y = -1.15; y < 1.2; y += 0.19) box(group, 0, y, 0, w - 0.15, 0.018, 0.025, c, true);
  } else if (e.kind === 'couch') {
    box(group, 0, -0.22, 0, w, 0.32, d, '#534d40');
    box(group, 0, 0.08, -0.37, w, 0.9, 0.24, c);
    for (const x of [-0.56, 0.56]) box(group, x, -0.03, 0.12, 1.05, 0.2, 0.72, c);
    for (const x of [-1.02, 1.02]) box(group, x, 0.01, 0, 0.25, 0.72, d, c);
  } else if (e.kind === 'table' || e.kind === 'shelf') {
    const shelf = e.kind === 'shelf';
    for (const x of [-w / 2 + 0.06, w / 2 - 0.06])
      for (const z of [-d / 2 + 0.06, d / 2 - 0.06]) box(group, x, 0, z, 0.08, h, 0.08, '#4c5855', true);
    for (let y = shelf ? -h / 2 + 0.12 : h / 2 - 0.1; y < h / 2 + 0.01; y += shelf ? 0.65 : h)
      box(group, 0, y, 0, w, 0.12, d, c);
  } else if (e.kind === 'printer') {
    box(group, 0, 0, 0, w, h, d, '#444b45', true);
    box(group, 0, 0.19, 0.06, 0.74, 0.15, 0.63, '#71786c');
    box(group, 0, 0.305, -0.11, 0.49, 0.025, 0.37, '#c8cbaf');
    panel(group, 'MONEY PRINTER', 0, 0.03, d / 2 + 0.004, 0.72, 0.2);
    box(group, 0, -0.18, d / 2 + 0.04, 0.61, 0.025, 0.11, '#172a21');
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 8, 6),
      new THREE.MeshBasicMaterial({ color: '#a8e0a0' }),
    );
    led.position.set(0.35, 0.2, 0.38);
    group.add(led);
  } else if (e.kind === 'microwave') {
    box(group, 0, 0, 0, w, h, d, '#b1b3a6', true);
    box(group, -0.09, 0, d / 2 + 0.004, 0.58, 0.44, 0.02, '#263935');
    panel(group, 'HOT', 0.32, 0.15, d / 2 + 0.02, 0.14, 0.12);
    box(group, 0.19, -0.01, d / 2 + 0.04, 0.04, 0.3, 0.08, '#535b4f');
    for (let i = 0; i < 3; i++) sphere(group, 0.31, -0.02 - i * 0.07, d / 2 + 0.02, 0.019, '#596558');
  } else if (e.kind === 'money') {
    box(group, 0, 0, 0, w, h, d, '#a0ac86');
    panel(group, '$', 0, 0, d / 2 + 0.003, w * 0.8, h * 0.85, '#a0ac86', '#314832');
  } else box(group, 0, 0, 0, w, h, d, c);
  group.userData.kind = e.kind;
  group.userData.color = e.color;
  return group;
}
export interface Avatar {
  root: THREE.Group;
  head: THREE.Group;
  torso: THREE.Group;
  leftShin: THREE.Group;
  rightShin: THREE.Group;
  leftForearm: THREE.Group;
  rightForearm: THREE.Group;
  leftFoot: THREE.Group;
  rightFoot: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  label: THREE.Sprite;
  job: string;
  phase: number;
  speed: number;
  last: THREE.Vector3;
  labelKey: string;
  equipment?: THREE.Group;
  weapon?: WeaponId;
}
// Keep articulation, but bake solid clothing/skin colors into one surface per body part.
function batchAvatarPart(group: THREE.Group): void {
  const buckets = new Map<THREE.Material, THREE.Mesh[]>();
  for (const child of [...group.children]) {
    if (child instanceof THREE.Group) batchAvatarPart(child);
    else if (child instanceof THREE.Mesh && !Array.isArray(child.material)) {
      const mat = child.material;
      const batchMaterial =
        mat instanceof THREE.MeshStandardMaterial && !mat.map && !mat.metalness ? avatarSurface : mat;
      const meshes = buckets.get(batchMaterial) ?? [];
      meshes.push(child);
      buckets.set(batchMaterial, meshes);
    }
  }
  for (const [mat, meshes] of buckets) {
    if (meshes.length < 2) continue;
    const parts = meshes.map((mesh) => {
      mesh.updateMatrix();
      const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrix);
      if (mat === avatarSurface) {
        const color = (mesh.material as THREE.MeshStandardMaterial).color;
        const colors = new Float32Array(geometry.getAttribute('position').count * 3);
        for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      }
      return geometry;
    });
    const geometry = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    if (!geometry) continue;
    for (const mesh of meshes) {
      mesh.geometry.dispose();
      group.remove(mesh);
    }
    const combined = new THREE.Mesh(geometry, mat);
    combined.castShadow = combined.receiveShadow = true;
    group.add(combined);
  }
}
export function makeAvatar(player: Player): Avatar {
  const root = new THREE.Group();
  const color = JOBS[player.job].color;
  const police = ['police', 'chief'].includes(player.job);
  const suit = ['boss', 'mayor'].includes(player.job);
  const medic = player.job === 'medic',
    cook = player.job === 'cook';
  const appearance = [...player.id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0);
  const skin = ['#c5a182', '#9c735a', '#d4b093', '#795440'][appearance % 4];
  const hair = ['#342d29', '#564132', '#82705a', '#292d2c'][(appearance >>> 3) % 4];
  const shirt = police ? '#354e60' : suit ? '#343c3e' : medic ? '#b9c8bd' : cook ? '#ddd6c1' : color;
  const trousers = police ? '#293944' : suit ? '#30383b' : player.job === 'thief' ? '#3b3944' : '#4b5149';
  const chest = cylinder(root, 0, 1.11, 0, 0.235, 0.18, 0.49, shirt);
  chest.scale.z = 0.72;
  sphere(root, 0, 1.32, 0, 0.23, shirt, [1.07, 0.42, 0.68]);
  const belt = cylinder(root, 0, 0.87, 0, 0.185, 0.19, 0.06, '#303735');
  belt.scale.z = 0.78;
  box(root, 0, 0.872, -0.15, 0.052, 0.039, 0.024, '#999782', true);
  cylinder(root, 0, 1.45, 0, 0.065, 0.079, 0.13, skin);
  for (const side of [-1, 1]) {
    const collar = box(root, side * 0.062, 1.365, -0.119, 0.088, 0.071, 0.026, suit ? '#d8d5c5' : shirt);
    collar.rotation.z = side * 0.4;
  }
  const head = new THREE.Group();
  head.position.y = 1.49;
  root.add(head);
  sphere(head, 0, 0.145, 0, 0.145, skin, [0.94, 1.12, 0.94]);
  sphere(head, 0, 0.075, -0.027, 0.096, skin, [0.9, 0.66, 0.93]);
  for (const side of [-1, 1]) {
    sphere(head, side * 0.135, 0.146, 0, 0.03, skin, [0.53, 1.2, 0.75]);
    sphere(head, side * 0.053, 0.176, -0.127, 0.021, '#e7dfcd', [1, 0.6, 0.5]);
    sphere(head, side * 0.053, 0.176, -0.139, 0.009, '#323d37', [0.8, 1, 0.5]);
    const brow = box(head, side * 0.053, 0.206, -0.124, 0.046, 0.009, 0.013, hair);
    brow.rotation.z = side * -0.08;
  }
  sphere(head, 0, 0.135, -0.143, 0.025, skin, [0.7, 1.05, 1]);
  box(head, 0, 0.084, -0.123, 0.048, 0.009, 0.012, '#855e50');
  const scalp = new THREE.Mesh(
    new THREE.SphereGeometry(0.148, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.4),
    material(hair),
  );
  scalp.position.set(0, 0.157, 0.006);
  scalp.scale.set(0.98, 1.12, 0.98);
  head.add(scalp);
  if (!police && !cook && !['hobo', 'thief'].includes(player.job)) {
    const fringe = sphere(head, -0.036, 0.262, -0.081, 0.072, hair, [1.3, 0.37, 0.68]);
    fringe.rotation.z = -0.22;
  }
  if (police) {
    cylinder(head, 0, 0.28, 0.012, 0.15, 0.144, 0.085, '#293c4b');
    box(head, 0, 0.238, -0.116, 0.25, 0.018, 0.18, '#202c32');
    box(head, 0, 0.277, -0.141, 0.037, 0.04, 0.013, '#c2af70', true);
    box(root, 0, 1.135, -0.161, 0.335, 0.36, 0.076, '#293b40');
    for (const side of [-1, 1]) {
      box(root, side * 0.11, 1.04, -0.214, 0.078, 0.105, 0.031, '#3d5050');
      box(root, side * 0.183, 0.9, 0, 0.07, 0.095, 0.08, '#293b40');
      box(root, side * 0.145, 1.327, 0, 0.065, 0.025, 0.2, '#293b40');
    }
    box(root, -0.096, 1.256, -0.207, 0.044, 0.058, 0.014, '#c2af70', true);
    const badge = panel(root, player.job === 'chief' ? 'CHIEF' : 'CP', 0.043, 1.23, -0.203, 0.145, 0.066);
    badge.rotation.y = Math.PI;
    if (player.job === 'chief')
      for (const side of [-1, 1]) box(root, side * 0.145, 1.343, -0.03, 0.05, 0.012, 0.042, '#c2af70', true);
  } else if (suit) {
    box(root, 0, 1.217, -0.158, 0.114, 0.302, 0.022, '#d8d5c5');
    box(root, 0, 1.21, -0.177, 0.033, 0.25, 0.018, player.job === 'mayor' ? '#92574e' : '#776489');
    for (const side of [-1, 1]) {
      const lapel = box(root, side * 0.076, 1.248, -0.184, 0.067, 0.225, 0.024, '#454f50');
      lapel.rotation.z = side * -0.22;
    }
    box(root, -0.126, 1.225, -0.18, 0.047, 0.019, 0.016, '#d8d5c5');
  } else if (cook) {
    box(root, 0, 1.085, -0.16, 0.28, 0.38, 0.034, '#eee5ce');
    box(root, 0, 0.81, -0.134, 0.32, 0.24, 0.025, '#eee5ce');
    cylinder(head, 0, 0.28, 0, 0.148, 0.146, 0.09, '#eee5ce');
    for (const x of [-0.086, 0, 0.086]) sphere(head, x, 0.365, 0, 0.094, '#eee5ce', [0.85, 0.85, 1.1]);
  } else {
    box(root, 0, 1.115, -0.167, 0.014, 0.4, 0.013, '#626b60');
    for (const side of [-1, 1]) box(root, side * 0.103, 1.227, -0.155, 0.082, 0.072, 0.026, shirt);
    if (medic) {
      box(root, -0.1, 1.245, -0.174, 0.058, 0.019, 0.014, '#a4554d');
      box(root, -0.1, 1.245, -0.174, 0.019, 0.058, 0.014, '#a4554d');
      box(root, 0.218, 0.95, 0.04, 0.105, 0.18, 0.16, '#e0d6bf');
    }
    if (player.job === 'dealer') {
      for (const side of [-1, 1]) box(root, side * 0.16, 1.14, 0, 0.05, 0.47, 0.31, '#654f3c');
      box(root, 0, 1.1, 0.136, 0.28, 0.39, 0.022, '#654f3c');
    }
    if (['hobo', 'thief', 'gangster'].includes(player.job)) {
      sphere(head, 0, 0.243, 0.016, 0.151, player.job === 'hobo' ? '#7d6550' : '#42414b', [1.02, 0.57, 1.02]);
      if (player.job === 'thief') box(head, 0, 0.1, -0.114, 0.19, 0.077, 0.055, '#42414b');
      if (player.job === 'hobo') box(root, -0.102, 1.03, -0.156, 0.086, 0.087, 0.022, '#8c7e63');
    }
  }
  const limb = (side: number, arm: boolean) => {
    const upper = new THREE.Group(),
      lower = new THREE.Group(),
      foot = new THREE.Group();
    upper.position.set(side * (arm ? 0.263 : 0.108), arm ? 1.3 : 0.835, 0);
    root.add(upper);
    cylinder(
      upper,
      0,
      arm ? -0.137 : -0.18,
      0,
      arm ? 0.084 : 0.102,
      arm ? 0.065 : 0.079,
      arm ? 0.28 : 0.36,
      arm ? shirt : trousers,
    );
    sphere(upper, 0, -0.025, 0, arm ? 0.088 : 0.1, arm ? shirt : trousers, [1, 0.7, 0.95]);
    lower.position.y = arm ? -0.28 : -0.37;
    upper.add(lower);
    cylinder(
      lower,
      0,
      arm ? -0.119 : -0.165,
      0,
      arm ? 0.065 : 0.079,
      arm ? 0.05 : 0.061,
      arm ? 0.24 : 0.33,
      arm ? shirt : trousers,
    );
    if (arm) {
      cylinder(lower, 0, -0.237, 0, 0.053, 0.053, 0.041, police ? '#293b40' : shirt);
      sphere(lower, 0, -0.3, -0.01, 0.06, skin, [0.82, 1.17, 0.75]);
    } else {
      foot.position.y = -0.35;
      lower.add(foot);
      sphere(foot, 0, -0.007, -0.043, 0.102, '#303735', [0.82, 0.63, 1.4]);
      box(foot, 0, -0.064, -0.038, 0.164, 0.028, 0.275, '#232c2c');
    }
    return { upper, lower, foot };
  };
  const leftArm = limb(-1, true),
    rightArm = limb(1, true),
    leftLeg = limb(-1, false),
    rightLeg = limb(1, false);
  const torso = new THREE.Group();
  torso.position.y = 0.835;
  for (const child of [...root.children]) {
    if (child === leftLeg.upper || child === rightLeg.upper) continue;
    child.position.y -= 0.835;
    torso.add(child);
  }
  root.add(torso);
  batchAvatarPart(root);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: true, transparent: true }));
  label.position.set(0, cook ? 2.23 : 2.14, 0);
  label.scale.set(2.9, 0.52, 1);
  root.add(label);
  root.position.set(player.x, player.y, player.z);
  return {
    root,
    head,
    torso,
    leftArm: leftArm.upper,
    rightArm: rightArm.upper,
    leftLeg: leftLeg.upper,
    rightLeg: rightLeg.upper,
    leftForearm: leftArm.lower,
    rightForearm: rightArm.lower,
    leftShin: leftLeg.lower,
    rightShin: rightLeg.lower,
    leftFoot: leftLeg.foot,
    rightFoot: rightLeg.foot,
    label,
    job: player.job,
    phase: 0,
    speed: 0,
    last: new THREE.Vector3(player.x, player.y, player.z),
    labelKey: '',
  };
}
export function updateAvatar(a: Avatar, p: Player, dt: number, localPosition: THREE.Vector3): void {
  const dest = new THREE.Vector3(p.x, p.y, p.z);
  if (a.root.position.distanceTo(dest) > 5) a.root.position.copy(dest);
  else a.root.position.lerp(dest, 1 - Math.exp(-14 * dt));
  const speed = Math.hypot(a.root.position.x - a.last.x, a.root.position.z - a.last.z) / Math.max(dt, 0.001);
  a.speed = THREE.MathUtils.damp(a.speed, Math.min(speed, 8), 10, dt);
  a.last.copy(a.root.position);
  a.phase += dt * (3 + a.speed * 2.2);
  const stride = Math.sin(a.phase) * 0.65 * Math.min(a.speed / 3, 1) * (p.crouch ? 0.22 : 1);
  a.leftLeg.rotation.x = (p.crouch ? 1.15 : 0) + stride;
  a.rightLeg.rotation.x = (p.crouch ? 1.15 : 0) - stride;
  a.leftArm.rotation.x = p.weapon === 'keys' ? -stride * 0.65 : 0.95;
  a.rightArm.rotation.x = p.weapon === 'keys' ? stride * 0.65 : 1.15;
  a.leftShin.rotation.x = p.crouch ? -2.05 : -Math.max(0, stride) * 0.65;
  a.rightShin.rotation.x = p.crouch ? -2.05 : -Math.max(0, -stride) * 0.65;
  a.leftFoot.rotation.x = -a.leftLeg.rotation.x - a.leftShin.rotation.x;
  a.rightFoot.rotation.x = -a.rightLeg.rotation.x - a.rightShin.rotation.x;
  a.leftForearm.rotation.x = p.weapon === 'keys' ? 0.12 : 0.48;
  a.rightForearm.rotation.x = p.weapon === 'keys' ? 0.12 : 0.35;
  a.torso.position.y = p.crouch ? 0.46 : 0.835;
  a.torso.rotation.x = p.crouch ? -0.65 : 0;
  a.leftLeg.position.y = a.rightLeg.position.y = a.torso.position.y;
  a.head.rotation.x = THREE.MathUtils.damp(a.head.rotation.x, p.pitch * 0.75 + (p.crouch ? 0.65 : 0), 12, dt);
  a.root.rotation.y = p.yaw;
  a.root.scale.y = p.deadUntil ? 0.18 : 1;
  a.label.position.y = (p.job === 'cook' ? 2.23 : 2.14) - (p.crouch ? 0.57 : 0);
  if (a.weapon !== p.weapon) {
    if (a.equipment) disposeObject(a.equipment);
    a.equipment = makeViewmodel(p.weapon, false);
    a.equipment.position.set(0.2, 1.13, -0.28);
    a.equipment.scale.setScalar(0.7);
    a.equipment.visible = p.weapon !== 'keys';
    a.root.add(a.equipment);
    a.weapon = p.weapon;
  }
  if (a.equipment) {
    a.equipment.rotation.x = p.pitch;
    a.equipment.position.y = p.crouch ? 0.76 : 1.13;
  }
  a.label.visible = !p.deadUntil && localPosition.distanceTo(dest) < 23;
  const key = `${p.name}:${p.job}:${p.jobTitle ?? ''}:${!!p.wantedUntil}:${!!p.arrestedUntil}`;
  if (a.labelKey !== key) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 104;
    const ctx = canvas.getContext('2d')!;
    ctx.textAlign = 'center';
    ctx.font = 'bold 31px sans-serif';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 5;
    ctx.fillStyle = '#f4f0dc';
    ctx.fillText(p.name, 256, 38);
    ctx.font = '23px sans-serif';
    ctx.fillStyle = p.wantedUntil ? '#f3a081' : JOBS[p.job].color;
    ctx.fillText(
      p.arrestedUntil
        ? 'IN CUSTODY'
        : p.wantedUntil
          ? 'WANTED'
          : p.jobTitle
            ? `${p.jobTitle} · ${JOBS[p.job].name}`
            : JOBS[p.job].name,
      256,
      73,
      480,
    );
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    a.label.material.map?.dispose();
    a.label.material.map = tex;
    a.label.material.needsUpdate = true;
    a.labelKey = key;
  }
}
export function makeViewmodel(weapon: WeaponId, withHands = true): THREE.Group {
  const group = new THREE.Group(),
    dark = '#3f4948',
    metal = '#68726b',
    skin = '#c0a182';
  const hand = (x: number, y: number, z: number) => {
    if (!withHands) return;
    const arm = cylinder(group, x, y - 0.12, z + 0.16, 0.065, 0.08, 0.42, '#697265');
    arm.rotation.x = Math.PI / 2 + 0.3;
    sphere(group, x, y, z, 0.07, skin, [0.8, 1.1, 1.2]);
  };
  if (weapon === 'keys') {
    hand(0.11, -0.08, 0.04);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.012, 8, 20), material('#ac9f6e', true));
    ring.position.set(0.1, -0.03, -0.06);
    group.add(ring);
    for (let i = 0; i < 3; i++) {
      const key = box(group, 0.05 + i * 0.035, -0.16, -0.06, 0.019, 0.18, 0.015, '#b7ae8b', true);
      key.rotation.z = (i - 1) * 0.23;
      box(group, 0.057 + i * 0.035, -0.235, -0.06, 0.04, 0.03, 0.02, '#b7ae8b', true);
    }
  } else if (weapon === 'physgun' || weapon === 'toolgun') {
    hand(0, -0.17, 0.08);
    hand(-0.2, -0.1, -0.25);
    box(group, 0, 0, -0.08, 0.23, 0.25, 0.51, dark, true);
    box(group, 0, -0.17, 0.12, 0.12, 0.24, 0.12, '#4c5446');
    const barrel = cylinder(group, 0, 0.015, -0.4, 0.09, 0.12, 0.32, metal, true);
    barrel.rotation.x = Math.PI / 2;
    if (weapon === 'physgun') {
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.073, 16, 10),
        new THREE.MeshBasicMaterial({ color: '#76d4ef' }),
      );
      core.position.set(0, 0.014, -0.59);
      group.add(core);
      for (let k = 0; k < 3; k++) {
        const angle = (k / 3) * Math.PI * 2;
        const claw = box(
          group,
          Math.cos(angle) * 0.135,
          Math.sin(angle) * 0.135,
          -0.5,
          0.045,
          0.045,
          0.32,
          '#9e9d7c',
          true,
        );
        claw.rotation.y = Math.cos(angle) * -0.35;
        claw.rotation.x = Math.sin(angle) * 0.35;
        const tip = sphere(group, Math.cos(angle) * 0.084, Math.sin(angle) * 0.084, -0.68, 0.028, '#a1d7d9');
        (tip.material as THREE.MeshStandardMaterial).emissive.set('#317a99');
      }
      box(group, 0, 0.16, -0.05, 0.15, 0.12, 0.18, metal, true);
    } else {
      box(group, 0, 0.2, -0.02, 0.27, 0.22, 0.07, '#56655f');
      panel(group, 'TOOL', 0, 0.2, 0.022, 0.22, 0.14);
    }
  } else if (['pistol', 'smg', 'shotgun'].includes(weapon)) {
    const long = weapon !== 'pistol';
    hand(0, -0.12, 0.04);
    if (long) hand(-0.07, -0.07, -0.45);
    box(group, 0, 0.015, -0.17, 0.11, 0.13, long ? 0.6 : 0.34, dark, true);
    const grip = box(group, 0, -0.14, 0, 0.085, 0.22, 0.11, '#52564b');
    grip.rotation.x = 0.22;
    const barrel = cylinder(
      group,
      0,
      0.025,
      long ? -0.59 : -0.36,
      0.035,
      0.04,
      long ? 0.41 : 0.11,
      '#303b38',
      true,
    );
    barrel.rotation.x = Math.PI / 2;
    box(group, 0, 0.096, -0.29, 0.016, 0.035, 0.025, '#a6aa8f', true);
    if (weapon === 'smg') box(group, 0, -0.19, -0.29, 0.06, 0.24, 0.1, '#3b453e');
    if (weapon === 'shotgun') box(group, 0, -0.03, -0.47, 0.13, 0.13, 0.25, '#8c7655');
  } else if (weapon === 'medkit') {
    hand(0.14, -0.14, 0.04);
    hand(-0.2, -0.13, -0.03);
    box(group, -0.03, 0, -0.11, 0.42, 0.3, 0.22, '#a2ae99');
    box(group, -0.03, 0.03, 0.011, 0.21, 0.045, 0.02, '#92584d');
    box(group, -0.03, 0.03, 0.013, 0.045, 0.2, 0.02, '#92584d');
  } else if (weapon === 'lockpick') {
    hand(0.04, -0.12, 0.08);
    const pick = box(group, 0.06, 0.02, -0.03, 0.013, 0.24, 0.015, '#b8b99f', true);
    pick.rotation.x = -0.6;
    box(group, 0.065, 0.135, -0.1, 0.035, 0.015, 0.015, '#b8b99f', true);
  } else {
    hand(0.07, -0.14, 0.08);
    const baton = cylinder(
      group,
      0.07,
      0.16,
      -0.08,
      weapon === 'ram' ? 0.09 : 0.035,
      weapon === 'ram' ? 0.09 : 0.035,
      0.67,
      dark,
      true,
    );
    baton.rotation.x = -0.45;
    const stripe = cylinder(
      group,
      0.07,
      0.25,
      -0.123,
      0.038,
      0.038,
      0.13,
      weapon === 'unarrest' ? '#81b3a0' : '#a67760',
    );
    stripe.rotation.x = -0.45;
  }
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = false;
      o.receiveShadow = false;
      o.frustumCulled = false;
      o.renderOrder = 10;
      const m = o.material as THREE.Material;
      if (m instanceof THREE.MeshStandardMaterial) {
        /* World and viewmodel materials remain lit consistently. */
      }
    }
  });
  return group;
}
export function disposeObject(root: THREE.Object3D): void {
  const shared = new Set(materials.values());
  const owned = new Set<THREE.Material>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      for (const mat of Array.isArray(o.material) ? o.material : [o.material])
        if (!shared.has(mat as THREE.MeshStandardMaterial)) owned.add(mat);
    }
    if (o instanceof THREE.Sprite) {
      o.material.map?.dispose();
      o.material.dispose();
    }
  });
  for (const mat of owned) {
    if (mat instanceof THREE.MeshStandardMaterial) mat.map?.dispose();
    mat.dispose();
  }
  root.removeFromParent();
}
