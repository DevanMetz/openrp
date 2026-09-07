import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BLOCKS, BUILDINGS, FLOOR_HEIGHT, MAP_BOUND, ROOMS, toWorld, type Building } from '../shared/map.ts';
import type { Door, Vec3 } from '../shared/types.ts';

let seed = 731;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
export const palette = {
  brick: '#886955',
  plaster: '#b6b09c',
  stone: '#9a9b91',
  industrial: '#787974',
  concrete: '#9a9a8c',
  asphalt: '#424a4c',
  pavement: '#92938a',
  metal: '#434b4d',
  wood: '#7d684c',
  floor: '#8d8777',
  glass: '#33474b',
  trim: '#c4c1ad',
};
export function labelTexture(
  text: string,
  background: string,
  foreground = '#e3dfcf',
  width = 1024,
  height = 160,
  font = 'bold 72px Georgia',
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = foreground;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 3;
  ctx.strokeRect(12, 12, width - 24, height - 24);
  ctx.globalAlpha = 1;
  ctx.fillStyle = foreground;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font;
  ctx.fillText(text, width / 2, height / 2 + 3, width - 58);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function surfaceTexture(kind: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 256, 256);
  if (kind === 'brick' || kind === 'industrial') {
    ctx.fillStyle = kind === 'brick' ? '#4d4b42' : '#55594f';
    ctx.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 9; row++)
      for (let col = -1; col < 5; col++) {
        const light = 28 + rand() * 16;
        ctx.fillStyle = `hsl(${kind === 'brick' ? 22 : 32},${kind === 'brick' ? 18 : 6}%,${light}%)`;
        ctx.fillRect(col * 72 + (row % 2) * 36 + 2, row * 30 + 2, 69, 27);
      }
  }
  if (kind === 'pavement' || kind === 'floor') {
    ctx.strokeStyle = '#636960';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 256; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 256);
      ctx.moveTo(0, i);
      ctx.lineTo(256, i);
      ctx.stroke();
    }
  }
  if (kind === 'wood') {
    for (let i = 0; i < 32; i++) {
      ctx.fillStyle = `rgba(30,20,7,${rand() * 0.14})`;
      ctx.fillRect(0, rand() * 256, 256, rand() * 4 + 1);
    }
  }
  const pixels = ctx.getImageData(0, 0, 256, 256);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const noise = (rand() - 0.5) * (kind === 'asphalt' ? 35 : 20);
    pixels.data[i] += noise;
    pixels.data[i + 1] += noise;
    pixels.data[i + 2] += noise;
  }
  ctx.putImageData(pixels, 0, 0);
  for (let i = 0; i < 24; i++) {
    ctx.fillStyle = `rgba(26,33,23,${rand() * 0.06})`;
    ctx.fillRect(rand() * 256, rand() * 256, rand() * 50, rand() * 100);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}
export class City {
  scene: THREE.Scene;
  materials = new Map<string, THREE.MeshStandardMaterial>();
  batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  doors = new Map<string, { pivot: THREE.Group; label: THREE.Mesh; textureKey: string; angle: number }>();
  water!: THREE.Mesh;
  sun: THREE.DirectionalLight;
  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    const environment = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(environment, 0.03).texture;
    scene.environmentIntensity = 0.3;
    environment.dispose();
    pmrem.dispose();
    scene.background = new THREE.Color('#acb8b5');
    scene.fog = new THREE.FogExp2('#acb8b5', 0.006);
    scene.add(new THREE.HemisphereLight('#d2e0e3', '#6b6450', 2.25));
    this.sun = new THREE.DirectionalLight('#ffe1b0', 3.15);
    this.sun.position.set(-32, 52, 28);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -62, right: 62, top: 62, bottom: -62, near: 1, far: 160 });
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.025;
    scene.add(this.sun, this.sun.target);
    for (const [key, color] of Object.entries(palette))
      this.materials.set(
        key,
        new THREE.MeshStandardMaterial({
          color: '#ffffff',
          map: surfaceTexture(key, color),
          roughness: key === 'metal' || key === 'glass' ? 0.55 : 0.93,
          metalness: key === 'metal' ? 0.4 : 0,
        }),
      );
    this.materials.get('glass')!.color.set('#709498');
    this.materials.get('glass')!.roughness = 0.22;
    this.materials.get('glass')!.metalness = 0.55;
    this.ground();
    for (const b of BLOCKS) {
      if (['fountain', 'planter', 'collision'].includes(b.material)) continue;
      if (b.material === 'bars') {
        for (let x = b.x - b.w / 2; x <= b.x + b.w / 2; x += 0.18)
          this.box(x, b.y, b.z, 0.04, b.h, b.d, 'metal');
        this.box(b.x, 2.4, b.z, b.w, 0.06, b.d, 'metal');
      } else this.box(b.x, b.y, b.z, b.w, b.h, b.d, b.material);
    }
    for (const building of BUILDINGS) this.building(building);
    for (const room of ROOMS) {
      const b = room.box;
      this.box(
        b.x,
        b.y - 1.61,
        b.z,
        b.w,
        0.01,
        b.d,
        room.name === 'Bathroom' ? '#8d9b91' : room.name === 'Bedroom' ? 'wood' : 'floor',
      );
    }
    this.street();
    this.fountain();
    this.skyline();
    this.flush();
  }
  material(key: string): THREE.MeshStandardMaterial {
    let m = this.materials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: key, roughness: 0.85 });
      this.materials.set(key, m);
    }
    return m;
  }
  add(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: THREE.Vector3,
    rotation = new THREE.Euler(),
  ): void {
    geometry.applyMatrix4(
      new THREE.Matrix4().compose(
        position,
        new THREE.Quaternion().setFromEuler(rotation),
        new THREE.Vector3(1, 1, 1),
      ),
    );
    let batch = this.batches.get(material);
    if (!batch) {
      batch = [];
      this.batches.set(material, batch);
    }
    batch.push(geometry);
  }
  box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    material: string,
    rotation = 0,
  ): void {
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.attributes.uv;
    for (let face = 0; face < 6; face++) {
      const a = face < 2 ? d : w,
        b = face < 2 || face >= 4 ? h : d;
      for (let i = 0; i < 4; i++) {
        const n = face * 4 + i;
        uv.setXY(n, (uv.getX(n) * a) / 2, (uv.getY(n) * b) / 2);
      }
    }
    this.add(geo, this.material(material), new THREE.Vector3(x, y, z), new THREE.Euler(0, rotation, 0));
  }
  cylinder(
    x: number,
    y: number,
    z: number,
    r1: number,
    r2: number,
    h: number,
    material: string,
    segments = 12,
  ): void {
    this.add(
      new THREE.CylinderGeometry(r1, r2, h, segments),
      this.material(material),
      new THREE.Vector3(x, y, z),
    );
  }
  flush(): void {
    for (const [mat, geometries] of this.batches) {
      const flat = geometries.map((g) => (g.index ? g.toNonIndexed() : g));
      const geo = mergeGeometries(flat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.staticCity = true;
      this.scene.add(mesh);
      for (const g of new Set([...geometries, ...flat])) g.dispose();
    }
    this.batches.clear();
  }
  sign(
    text: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    bg: string,
    rotation = 0,
    font?: string,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({
        map: labelTexture(text, bg, '#e4dfcb', 1024, Math.round((1024 * h) / w), font ?? 'bold 70px Georgia'),
        roughness: 0.8,
      }),
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotation;
    this.scene.add(mesh);
    return mesh;
  }
  ground(): void {
    this.box(0, -0.08, 0, MAP_BOUND * 2 + 2, 0.15, MAP_BOUND * 2 + 2, 'asphalt');
    this.box(0, -0.005, 8, 28, 0.025, 25, 'pavement');
    for (const x of [-67, 67]) {
      for (const side of [-1, 1]) this.box(x + side * 10, -0.005, 0, 2.2, 0.04, 214, 'pavement');
      for (let z = -104; z <= 104; z += 7) this.box(x, 0.012, z, 0.14, 0.02, 3.2, '#b7ad88');
    }
    for (const z of [-66, 66]) {
      for (const side of [-1, 1]) this.box(0, -0.005, z + side * 10, 214, 0.04, 2.2, 'pavement');
      for (let x = -104; x <= 104; x += 7) this.box(x, 0.013, z, 3.2, 0.02, 0.14, '#b7ad88');
    }
    for (const b of BUILDINGS) {
      const s = Math.abs(Math.sin(b.rotation)) > 0.5;
      const w = s ? b.d : b.w,
        d = s ? b.w : b.d;
      this.box(b.x, -0.005, b.z, w + 3.4, 0.05, d + 3.4, 'pavement');
    }
    for (const x of [-13.7, 13.7]) this.box(x, 0.045, 8, 0.25, 0.14, 25, 'concrete');
    for (let z = -65; z < 69; z += 7) {
      if (z > -7 && z < 24) continue;
      this.box(0, 0.015, z, 0.16, 0.025, 3.3, '#b7ad88');
    }
    for (const z of [-3.5, 26])
      for (let x = -6; x <= 6; x += 2) this.box(x, 0.026, z, 1.1, 0.02, 3.2, '#b8b6a1');
    for (let x = -63; x <= 63; x += 7)
      if (Math.abs(x) > 15) this.box(x, 0.017, -29, 3, 0.02, 0.13, '#b7ad88');
    for (const x of [-14.8, 15.2])
      for (let z = -23; z < 48; z += 20) {
        this.box(x, 0.025, z, 0.55, 0.035, 0.85, 'metal');
        for (let k = 0; k < 6; k++) this.box(x, 0.048, z - 0.3 + k * 0.12, 0.46, 0.025, 0.025, '#171e1e');
      }
    // Tram rails lead toward the old station at the south end of the district.
    for (const x of [-2.1, 2.1]) this.box(x, 0.022, 50, 0.09, 0.04, 37, 'metal');
  }
  building(b: Building): void {
    const floorHeight = b.layout === 'apartments' ? FLOOR_HEIGHT : 3.2;
    const local = (x: number, y: number, z: number, w: number, h: number, d: number, m: string) => {
      const p = toWorld(b, x, y, z);
      this.box(p.x, p.y, p.z, w, h, d, m, b.rotation);
    };
    const signage = (
      text: string,
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      bg: string,
      font?: string,
    ) => {
      const p = toWorld(b, x, y, z);
      this.sign(text, p.x, p.y, p.z, w, h, bg, b.rotation, font);
    };
    for (let floor = 1; floor < b.floors; floor++) {
      const y = floor * floorHeight + 1.7;
      for (let x = -b.w / 2 + 2.2; x < b.w / 2 - 1; x += 3.3) {
        for (const back of [false, true]) {
          const z = (back ? -1 : 1) * (b.d / 2 + 0.015);
          local(x, y, z, 1.6, 2.05, 0.11, 'trim');
          local(
            x,
            y + 0.025,
            z + (back ? -0.07 : 0.07),
            1.38,
            1.82,
            0.08,
            rand() > 0.88 ? '#827a53' : 'glass',
          );
          local(x, y, z + (back ? -0.13 : 0.13), 0.075, 1.9, 0.04, 'trim');
          local(x, y + 0.16, z + (back ? -0.13 : 0.13), 1.45, 0.07, 0.04, 'trim');
          local(x, y - 1.05, z, 1.9, 0.12, 0.42, 'concrete');
          local(x, y + 1.15, z, 1.82, 0.16, 0.28, 'concrete');
          if (rand() > 0.6) local(x + 0.33, y - 0.32, z + (back ? -0.11 : 0.11), 0.53, 1.06, 0.02, '#6d736c');
        }
      }
      for (const side of [-1, 1])
        for (let z = -b.d / 2 + 2.2; z < b.d / 2 - 1.8; z += 3.5) {
          local(side * (b.w / 2 + 0.03), y, z, 0.13, 2.02, 1.55, 'trim');
          local(side * (b.w / 2 + 0.11), y, z, 0.08, 1.8, 1.35, 'glass');
          local(side * (b.w / 2 + 0.16), y, z, 0.04, 1.9, 0.06, 'trim');
          local(side * (b.w / 2 + 0.15), y + 0.14, z, 0.05, 0.065, 1.42, 'trim');
          local(side * (b.w / 2 + 0.1), y - 1.1, z, 0.42, 0.15, 1.85, 'concrete');
        }
      local(0, floor * floorHeight + 0.33, b.d / 2 + 0.04, b.w + 0.25, 0.13, 0.2, 'concrete');
    }
    local(0, 0.24, b.d / 2 + 0.04, b.w, 0.48, 0.13, 'concrete');
    // Shop windows and surrounds retain the collision of real glazing.
    for (const side of [-1, 1]) {
      local(side * 4.4, 1.63, b.d / 2 + 0.025, 4.5, 2.15, 0.14, b.accent);
      local(side * 4.4, 1.67, b.d / 2 + 0.11, 4.12, 1.87, 0.05, 'glass');
      local(side * 4.4, 1.67, b.d / 2 + 0.15, 0.09, 1.95, 0.05, b.accent);
      local(side * 4.4, 2.25, b.d / 2 + 0.15, 4.2, 0.06, 0.05, b.accent);
      if (b.use === 'arms')
        for (let k = -2; k <= 2; k++)
          local(side * 4.4 + k * 0.7, 1.67, b.d / 2 + 0.2, 0.04, 1.9, 0.04, 'metal');
      if (b.use === 'cafe') {
        local(side * 4.4, 2.9, b.d / 2 + 0.65, 4.9, 0.13, 1.35, b.accent);
        local(side * 4.4, 2.69, b.d / 2 + 1.25, 4.9, 0.4, 0.07, b.accent);
        for (let i = -3; i <= 3; i++)
          local(side * 4.4 + i * 0.62, 2.72, b.d / 2 + 1.3, 0.25, 0.34, 0.05, '#c8c4aa');
      }
    }
    local(0, 3.08, b.d / 2 + 0.1, b.w - 0.9, 0.62, 0.25, b.accent);
    signage(b.sign, 0, 3.12, b.d / 2 + 0.24, Math.min(12, b.w - 1.2), 0.52, b.accent, 'bold 62px Georgia');
    local(-0.91, 1.36, b.d / 2 + 0.06, 0.16, 2.72, 0.24, 'concrete');
    local(0.91, 1.36, b.d / 2 + 0.06, 0.16, 2.72, 0.24, 'concrete');
    const top = b.floors * floorHeight + 0.6;
    local(0, top, b.d / 2, b.w + 0.25, 0.55, 0.3, b.material);
    local(0, top, -b.d / 2, b.w + 0.25, 0.55, 0.3, b.material);
    local(2, top + 0.45, -2, 3.1, 0.95, 2.1, 'metal');
    for (let k = 0; k < 7; k++) local(0.7 + k * 0.41, top + 0.97, -2, 0.055, 0.09, 1.8, '#252e2e');
    local(-b.w / 2 + 0.3, top / 2, b.d / 2 + 0.25, 0.1, top, 0.1, 'metal');
    // Interior detailing, deliberately clear enough to furnish with spawned props.
    if (b.layout !== 'apartments') local(0, 3.25, 0, b.w - 0.5, 0.1, b.d - 0.5, '#bcb9a6');
    else {
      for (let level = 0; level < b.floors; level++) {
        if (level < b.floors - 1)
          for (const side of [-1, 1]) {
            const start = toWorld(b, side * 1.035, level * FLOOR_HEIGHT + 1.21, -1.19);
            const end = toWorld(b, side * 1.035, (level + 1) * FLOOR_HEIGHT + 1.04, -8.41);
            const a = new THREE.Vector3(start.x, start.y, start.z);
            const delta = new THREE.Vector3(end.x, end.y, end.z).sub(a);
            this.add(
              new THREE.CylinderGeometry(0.035, 0.035, delta.length(), 8),
              this.material('metal'),
              a.addScaledVector(delta, 0.5),
              new THREE.Euler().setFromQuaternion(
                new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()),
              ),
            );
          }
        signage(
          `FLOOR ${level + 1} · ${level + 1}01 / ${level + 1}02`,
          0,
          level * FLOOR_HEIGHT + 2.35,
          -b.d / 2 + 0.25,
          3.5,
          0.45,
          b.accent,
          'bold 48px sans-serif',
        );
        local(0, level * FLOOR_HEIGHT + 3.16, 5, 1.3, 0.08, 0.3, '#e4e2bc');
        for (const side of [-1, 1]) {
          const label = toWorld(b, side * 2.19, level * FLOOR_HEIGHT + 2.97, 4.5);
          this.sign(
            `${level + 1}0${side < 0 ? 1 : 2}`,
            label.x,
            label.y,
            label.z,
            0.75,
            0.22,
            b.accent,
            b.rotation + (side < 0 ? Math.PI / 2 : -Math.PI / 2),
            'bold 48px sans-serif',
          );
        }
      }
    }
    for (const x of [-4, 4]) {
      local(x, 3.15, 0, 1.3, 0.09, 0.24, '#e4e2bc');
    }
    signage(b.name.toUpperCase(), 0, 2.25, -b.d / 2 + 0.22, 5, 0.6, b.accent, 'bold 62px sans-serif');
    if (b.use === 'cafe') {
      for (const x of [-6, 5]) {
        local(x, 0.73, 2, 1.25, 0.12, 1.25, 'wood');
        local(x, 0.35, 2, 0.1, 0.7, 0.1, 'metal');
        for (const z of [0.7, 3.3]) {
          local(x, 0.43, z, 0.6, 0.12, 0.55, 'wood');
          local(x, 0.2, z, 0.08, 0.4, 0.1, 'metal');
          local(x, 0.78, z + (z < 2 ? -0.22 : 0.22), 0.6, 0.6, 0.07, 'wood');
        }
      }
      signage(
        'COFFEE  ·  HOT MEALS  ·  GOOD COMPANY',
        -3.4,
        2.2,
        -b.d / 2 + 0.23,
        5.5,
        0.8,
        '#293e37',
        '48px Georgia',
      );
    }
    if (b.use === 'clinic') {
      local(-3.3, 1.65, -b.d / 2 + 0.24, 0.25, 1.3, 0.09, '#bdcfbf');
      local(-3.3, 1.65, -b.d / 2 + 0.25, 1.25, 0.25, 0.1, '#bdcfbf');
    }
    if (b.use === 'warehouse')
      for (const x of [-7, 7]) {
        local(x, 1.25, -4, 1.6, 2.5, 1.2, 'wood');
      }
  }
  street(): void {
    for (const x of [-77, 77])
      for (const z of [-49, 7, 55]) {
        this.cylinder(x, 2.6, z, 0.07, 0.12, 5.2, 'metal');
        this.box(x, 5.2, z, 0.7, 0.18, 0.45, '#e2d4a4');
      }
    for (const [text, x, z] of [
      ['WEST ALDER', -67, 61],
      ['CANAL QUARTER', 67, 61],
      ['FOUNDRY WARD', 0, -64],
      ['SOUTHBANK', 0, 70],
    ] as const)
      this.sign(text, x, 3.4, z, 4.5, 0.65, '#425e54', z > 0 ? Math.PI : 0, 'bold 56px sans-serif');
    for (const x of [-12.5, 12.5])
      for (const z of [-21, 0, 25, 46]) {
        this.cylinder(x, 2.65, z, 0.055, 0.1, 5.3, 'metal');
        this.cylinder(x, 0.26, z, 0.2, 0.24, 0.52, 'metal');
        this.box(x + (x < 0 ? 0.45 : -0.45), 5.26, z, 1.1, 0.065, 0.06, 'metal');
        this.box(x + (x < 0 ? 0.9 : -0.9), 5.19, z, 0.43, 0.13, 0.26, 'metal');
        this.box(x + (x < 0 ? 0.9 : -0.9), 5.1, z, 0.33, 0.03, 0.19, '#e2d4a4');
      }
    for (const x of [-10, 10]) {
      this.box(x, 0.3, 9, 2.3, 0.6, 7, 'concrete');
      this.box(x, 0.61, 9, 2.05, 0.05, 6.7, '#484936');
      for (const z of [7, 11]) this.tree(x, z);
      const bx = x < 0 ? x + 1.8 : x - 1.8;
      for (let slat = 0; slat < 4; slat++) this.box(bx, 0.48, 8 + slat * 0.14, 2.1, 0.07, 0.1, 'wood');
      for (let slat = 0; slat < 3; slat++) this.box(bx, 0.77 + slat * 0.15, 8.62, 2.1, 0.1, 0.065, 'wood');
      for (const dx of [-0.8, 0.8]) this.box(bx + dx, 0.25, 8.3, 0.08, 0.5, 0.6, 'metal');
    }
    for (const [x, z] of [
      [-14, 32],
      [14, -7],
      [-14, -34],
      [47, 15],
      [-46, -16],
    ]) {
      this.cylinder(x, 0.52, z, 0.3, 0.27, 1.04, 'metal');
      this.cylinder(x, 1.05, z, 0.32, 0.32, 0.06, 'metal');
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        this.box(x + Math.sin(a) * 0.305, 0.55, z + Math.cos(a) * 0.305, 0.035, 0.8, 0.035, '#272f2d');
      }
    }
    // Street signage and overhead tram wiring give the square a lived-in scale.
    this.box(11.7, 1.9, -5.7, 0.08, 3.8, 0.08, 'metal');
    this.sign('UNION SQUARE', 11.7, 3.55, -5.62, 2.5, 0.4, '#344d48', 0, 'bold 80px sans-serif');
    this.sign('← CIVIL PROTECTION', 11.7, 3.04, -5.62, 2.5, 0.32, '#344d48', 0, 'bold 65px sans-serif');
    for (const z of [-24, 27, 51]) {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 20; i++) {
        const x = -17 + i * 1.7;
        points.push(new THREE.Vector3(x, 8.2 - 1.4 * (1 - (x / 17) ** 2), z));
      }
      this.scene.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({ color: '#434b48' }),
        ),
      );
    }
    for (const x of [-2.1, 2.1])
      this.scene.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(x, 7, -69),
            new THREE.Vector3(x, 7, 70),
          ]),
          new THREE.LineBasicMaterial({ color: '#51564c' }),
        ),
      );
    // Original parked cars; no vehicle controls are implied.
    this.car(-10, -20, '#596b66', 0);
    this.car(11.5, 38, '#8e8470', Math.PI);
    this.car(8.5, -29, '#46545c', Math.PI / 2);
    this.sign('UNION DISTRICT', 0, 4.6, 69, 12, 1.15, '#485a57', Math.PI, 'bold 72px Georgia');
    for (const x of [-6.4, 6.4]) this.box(x, 2.4, 69.2, 0.4, 4.8, 0.4, 'metal');
  }
  tree(x: number, z: number): void {
    this.cylinder(x, 2.1, z, 0.12, 0.22, 3.6, 'wood');
    for (let k = 0; k < 8; k++) {
      const a = rand() * Math.PI * 2,
        radius = rand() * 1.2;
      const geom = new THREE.IcosahedronGeometry(0.85 + rand() * 0.65, 1);
      geom.scale(1, 0.9 + rand() * 0.6, 1);
      this.add(
        geom,
        this.material(['#676e46', '#70794d', '#818458', '#59694b'][k % 4]),
        new THREE.Vector3(x + Math.cos(a) * radius, 3.9 + rand() * 1.6, z + Math.sin(a) * radius),
      );
    }
  }
  car(x: number, z: number, color: string, rot: number): void {
    const part = (dx: number, y: number, dz: number, w: number, h: number, d: number, m: string) =>
      this.box(
        x + dx * Math.cos(rot) + dz * Math.sin(rot),
        y,
        z - dx * Math.sin(rot) + dz * Math.cos(rot),
        w,
        h,
        d,
        m,
        rot,
      );
    part(0, 0.55, 0, 1.7, 0.55, 4.2, color);
    part(0, 0.98, -0.25, 1.53, 0.6, 2.2, color);
    part(0, 1.14, -0.28, 1.48, 0.33, 2.22, 'glass');
    part(0, 1.35, -0.25, 1.5, 0.12, 2.25, color);
    part(0, 1.12, -0.25, 1.57, 0.55, 0.11, color);
    part(0, 0.36, 2.08, 1.7, 0.13, 0.13, 'metal');
    part(0, 0.36, -2.08, 1.7, 0.13, 0.13, 'metal');
    for (const side of [-1, 1]) {
      part(side * 0.58, 0.67, 2.13, 0.45, 0.17, 0.02, '#d5cfa3');
      part(side * 0.61, 0.64, -2.13, 0.36, 0.17, 0.02, '#82564d');
      for (const dz of [-1.35, 1.3]) part(side * 0.82, 0.32, dz, 0.23, 0.58, 0.58, '#242b2b');
    }
  }
  fountain(): void {
    this.box(0, 0.16, 9, 5.6, 0.32, 5.6, 'concrete');
    for (const side of [-1, 1]) {
      this.box(side * 2.57, 0.52, 9, 0.44, 0.55, 5.6, 'stone');
      this.box(0, 0.52, 9 + side * 2.57, 5.6, 0.55, 0.44, 'stone');
    }
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(4.65, 4.65, 24, 24),
      new THREE.MeshStandardMaterial({
        color: '#708e84',
        transparent: true,
        opacity: 0.83,
        roughness: 0.19,
        metalness: 0.45,
      }),
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(0, 0.49, 9);
    this.scene.add(this.water);
    this.cylinder(0, 0.8, 9, 0.55, 0.75, 1.1, 'stone', 24);
    this.cylinder(0, 1.35, 9, 1.24, 0.25, 0.24, 'stone', 32);
    this.cylinder(0, 1.85, 9, 0.16, 0.25, 1, 'stone', 16);
    this.cylinder(0, 2.35, 9, 0.72, 0.15, 0.17, 'stone', 24);
    this.cylinder(0, 2.6, 9, 0.08, 0.13, 0.5, 'stone');
    const stream = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.1, 0.58, 8),
      new THREE.MeshStandardMaterial({ color: '#c0d2c6', transparent: true, opacity: 0.55 }),
    );
    stream.position.set(0, 2.93, 9);
    this.scene.add(stream);
  }
  skyline(): void {
    for (let i = 0; i < 33; i++) {
      const a = (i / 33) * Math.PI * 2,
        r = MAP_BOUND * 1.5 + rand() * 28,
        x = Math.sin(a) * r,
        z = Math.cos(a) * r;
      const h = 13 + rand() * 28,
        w = 9 + rand() * 13,
        d = 12 + rand() * 10;
      this.box(x, h / 2, z, w, h, d, i % 2 ? 'plaster' : 'industrial');
      this.box(x, h + 0.4, z, w + 0.5, 0.6, d + 0.5, 'concrete');
      for (let y = 4; y < h - 1; y += 3.4)
        for (let k = -w / 2 + 2; k < w / 2 - 1; k += 3.2)
          this.box(x + k, y, z + (z < 0 ? d / 2 + 0.02 : -d / 2 - 0.02), 1.2, 1.6, 0.05, '#536064');
    }
    // A municipal clock tower frames the northern end of the square.
    this.box(0, 16, -83, 8, 32, 8, 'stone');
    this.box(0, 29.5, -83, 9.2, 0.6, 9.2, 'concrete');
    this.cylinder(0, 34.7, -83, 0, 6.4, 6, '#4a605d', 4);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#c4c3ac';
    ctx.beginPath();
    ctx.arc(128, 128, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#404c48';
    ctx.lineWidth = 10;
    ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(128 + Math.sin(a) * 98, 128 - Math.cos(a) * 98);
      ctx.lineTo(128 + Math.sin(a) * 109, 128 - Math.cos(a) * 109);
      ctx.lineWidth = 5;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(128, 128);
    ctx.lineTo(171, 76);
    ctx.moveTo(128, 128);
    ctx.lineTo(77, 107);
    ctx.lineWidth = 7;
    ctx.stroke();
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const clock = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 48),
      new THREE.MeshStandardMaterial({ map: tex }),
    );
    clock.position.set(0, 26, -78.96);
    this.scene.add(clock);
    const skyGeometry = new THREE.SphereGeometry(350, 24, 16);
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { top: { value: new THREE.Color('#7f9cae') }, bottom: { value: new THREE.Color('#c3c6b8') } },
      vertexShader:
        'varying float h; void main(){h=normalize(position).y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:
        'uniform vec3 top;uniform vec3 bottom;varying float h;void main(){gl_FragColor=vec4(mix(bottom,top,pow(max(h,0.0),0.65)),1.0);}',
    });
    this.scene.add(new THREE.Mesh(skyGeometry, skyMaterial));
  }
  updateDoors(doors: Door[]): void {
    for (const d of doors) {
      let visual = this.doors.get(d.id);
      if (!visual) {
        const root = new THREE.Group();
        root.position.set(d.x, d.y ?? 0, d.z);
        root.rotation.y = d.rotation;
        const pivot = new THREE.Group();
        pivot.position.x = -d.width / 2;
        root.add(pivot);
        const panel = new THREE.Mesh(
          new THREE.BoxGeometry(d.width, d.height, 0.17),
          this.material(d.group ? '#526768' : '#636954'),
        );
        panel.position.set(d.width / 2, d.height / 2, 0);
        panel.castShadow = panel.receiveShadow = true;
        pivot.add(panel);
        const window = new THREE.Mesh(
          new THREE.BoxGeometry(d.width - 0.24, 1.1, 0.185),
          this.material('glass'),
        );
        window.position.set(d.width / 2, 1.91, 0);
        pivot.add(window);
        for (const z of [-0.14, 0.14]) {
          const handle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.035, 0.035), this.material('#b3aa84'));
          handle.position.set(d.width - 0.19, 1.05, z);
          pivot.add(handle);
        }
        const label = new THREE.Mesh(
          new THREE.PlaneGeometry(1.23, 0.31),
          new THREE.MeshStandardMaterial({ color: '#ffffff' }),
        );
        label.position.set(d.width / 2, 1.3, 0.102);
        pivot.add(label);
        const insideLabel = label.clone();
        insideLabel.position.z = -0.102;
        insideLabel.rotation.y = Math.PI;
        pivot.add(insideLabel);
        this.scene.add(root);
        visual = { pivot, label, textureKey: '', angle: 0 };
        this.doors.set(d.id, visual);
      }
      const text = d.group
        ? 'AUTHORIZED PERSONNEL'
        : d.public
          ? 'SHARED ENTRANCE'
          : d.owner
            ? d.name
            : `FOR SALE · $${d.price}`;
      if (visual.textureKey !== text) {
        const mat = visual.label.material as THREE.MeshStandardMaterial;
        mat.map?.dispose();
        mat.map = labelTexture(
          text,
          d.owner ? '#394c40' : '#d0c9b0',
          d.owner ? '#e3ddc5' : '#39473f',
          512,
          128,
          'bold 36px sans-serif',
        );
        mat.needsUpdate = true;
        visual.textureKey = text;
      }
      visual.angle = d.open ? -Math.PI * 0.48 : 0;
    }
  }
  update(time: number, dt: number, focus: Vec3): void {
    // Keep detailed shadows around the viewer as they enter the outer neighborhoods.
    const x = Math.round(focus.x / 8) * 8,
      z = Math.round(focus.z / 8) * 8;
    this.sun.position.set(x - 32, 52, z + 28);
    this.sun.target.position.set(x, 0, z);
    for (const visual of this.doors.values())
      visual.pivot.rotation.y = THREE.MathUtils.damp(visual.pivot.rotation.y, visual.angle, 12, dt);
    const pos = this.water.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++)
      pos.setZ(i, Math.sin(pos.getX(i) * 5 + time * 2) * Math.cos(pos.getY(i) * 4 - time) * 0.018);
    pos.needsUpdate = true;
  }
}
