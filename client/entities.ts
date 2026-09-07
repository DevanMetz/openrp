import * as THREE from 'three';
import { JOBS, WEAPONS, entitySize } from '../shared/catalog.ts';
import type { Entity, Player, WeaponId } from '../shared/types.ts';
import { labelTexture } from './world.ts';

const materials = new Map<string, THREE.MeshStandardMaterial>();
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
  if (e.kind === 'crate' || e.kind === 'shipment') {
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
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  label: THREE.Sprite;
  job: string;
  phase: number;
  last: THREE.Vector3;
  labelKey: string;
  equipment?: THREE.Group;
  weapon?: WeaponId;
}
export function makeAvatar(player: Player): Avatar {
  const root = new THREE.Group();
  const color = JOBS[player.job].color;
  const police = ['police', 'chief'].includes(player.job),
    suit = ['boss', 'mayor'].includes(player.job),
    skin = ['#c5a182', '#a77f63', '#d4b093', '#987158'][player.id.charCodeAt(0) % 4];
  const shirt = police
    ? '#354e60'
    : suit
      ? '#414743'
      : player.job === 'medic'
        ? '#bcc5b4'
        : player.job === 'cook'
          ? '#d0c9b3'
          : color;
  cylinder(root, 0, 1.13, 0, 0.23, 0.2, 0.57, shirt);
  sphere(root, 0, 1.32, 0, 0.23, shirt, [1.16, 0.65, 0.76]);
  cylinder(root, 0, 0.83, 0, 0.2, 0.19, 0.13, '#3a403a');
  cylinder(root, 0, 1.48, 0, 0.07, 0.085, 0.12, skin);
  sphere(root, 0, 1.64, 0, 0.15, skin, [0.9, 1.14, 0.94]);
  sphere(root, 0, 1.735, 0.01, 0.148, police ? '#3e5054' : '#4e493a', [0.95, 0.65, 1]);
  box(root, 0, 1.635, -0.143, 0.075, 0.07, 0.055, police ? '#273736' : skin);
  for (const x of [-0.056, 0.056])
    sphere(root, x, 1.675, -0.127, police ? 0.04 : 0.012, police ? '#759494' : '#383d36');
  if (police) {
    box(root, 0, 1.14, -0.18, 0.36, 0.42, 0.1, '#334744');
    panel(root, 'CP', 0, 1.24, -0.237, 0.18, 0.09);
  }
  if (suit) {
    box(root, 0, 1.27, -0.185, 0.12, 0.3, 0.025, '#c8c6b6');
    box(root, 0, 1.21, -0.205, 0.038, 0.26, 0.025, '#926652');
  }
  if (player.job === 'medic') {
    box(root, -0.14, 1.3, -0.2, 0.09, 0.025, 0.02, '#a4554d');
    box(root, -0.14, 1.3, -0.2, 0.025, 0.09, 0.02, '#a4554d');
  }
  const limb = (side: number, arm: boolean) => {
    const g = new THREE.Group();
    g.position.set(side * (arm ? 0.28 : 0.12), arm ? 1.3 : 0.82, 0);
    root.add(g);
    cylinder(
      g,
      0,
      arm ? -0.18 : -0.2,
      0,
      arm ? 0.085 : 0.105,
      arm ? 0.075 : 0.085,
      arm ? 0.37 : 0.4,
      arm ? shirt : '#50584f',
    );
    cylinder(
      g,
      0,
      arm ? -0.41 : -0.55,
      arm ? -0.05 : 0.015,
      arm ? 0.07 : 0.075,
      arm ? 0.055 : 0.065,
      arm ? 0.25 : 0.31,
      arm ? shirt : '#50584f',
    );
    if (arm) sphere(g, 0, -0.56, -0.075, 0.068, skin, [0.9, 1.15, 0.8]);
    else box(g, 0, -0.74, -0.055, 0.16, 0.12, 0.3, '#343d39');
    return g;
  };
  const leftArm = limb(-1, true),
    rightArm = limb(1, true),
    leftLeg = limb(-1, false),
    rightLeg = limb(1, false);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: true, transparent: true }));
  label.position.set(0, 2.14, 0);
  label.scale.set(2.9, 0.52, 1);
  root.add(label);
  return {
    root,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    label,
    job: player.job,
    phase: 0,
    last: new THREE.Vector3(player.x, player.y, player.z),
    labelKey: '',
  };
}
export function updateAvatar(a: Avatar, p: Player, dt: number, localPosition: THREE.Vector3): void {
  const dest = new THREE.Vector3(p.x, p.y, p.z);
  if (a.root.position.distanceTo(dest) > 5) a.root.position.copy(dest);
  else a.root.position.lerp(dest, 1 - Math.exp(-14 * dt));
  const moving = a.last.distanceTo(dest) > 0.008;
  a.last.copy(dest);
  a.phase += dt * (moving ? 9 : 2);
  const stride = moving ? Math.sin(a.phase) * 0.65 : 0;
  a.leftLeg.rotation.x = stride;
  a.rightLeg.rotation.x = -stride;
  a.leftArm.rotation.x = p.weapon === 'keys' ? -stride * 0.65 : -0.95;
  a.rightArm.rotation.x = p.weapon === 'keys' ? stride * 0.65 : -1.15;
  a.root.rotation.y = p.yaw;
  a.root.scale.y = p.deadUntil ? 0.18 : p.crouch ? 0.67 : 1;
  if (a.weapon !== p.weapon) {
    if (a.equipment) disposeObject(a.equipment);
    a.equipment = makeViewmodel(p.weapon, false);
    a.equipment.position.set(0.2, 1.13, -0.28);
    a.equipment.scale.setScalar(0.7);
    a.equipment.visible = p.weapon !== 'keys';
    a.root.add(a.equipment);
    a.weapon = p.weapon;
  }
  if (a.equipment) a.equipment.rotation.x = p.pitch;
  a.label.visible = !p.deadUntil && localPosition.distanceTo(dest) < 23;
  const key = `${p.name}:${p.job}:${!!p.wantedUntil}:${!!p.arrestedUntil}`;
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
    ctx.fillText(p.arrestedUntil ? 'IN CUSTODY' : p.wantedUntil ? 'WANTED' : JOBS[p.job].name, 256, 73);
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
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
    if (o instanceof THREE.Sprite) {
      o.material.map?.dispose();
      o.material.dispose();
    }
  });
  root.removeFromParent();
}
