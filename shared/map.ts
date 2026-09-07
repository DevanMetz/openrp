import type { Block, Box, Door, Vec3 } from './types.ts';

export const MAP_NAME = 'Union District';
export const MAP_BOUND = 74;
export const SPAWNS: Vec3[] = [
  { x: 0, y: 0.12, z: 24 },
  { x: 2, y: 0.12, z: 25 },
  { x: -2, y: 0.12, z: 25 },
  { x: 4, y: 0.12, z: 24 },
  { x: -4, y: 0.12, z: 24 },
];
export const JAIL = { x: -5, y: 0.15, z: -43 };
export interface Building {
  id: string;
  name: string;
  x: number;
  z: number;
  w: number;
  d: number;
  floors: number;
  rotation: number;
  material: string;
  sign: string;
  accent: string;
  price: number;
  use: string;
}
export const BUILDINGS: Building[] = [
  {
    id: 'police',
    name: 'Civil Protection',
    x: 0,
    z: -37,
    w: 23,
    d: 20,
    floors: 3,
    rotation: 0,
    material: 'stone',
    sign: 'CIVIL PROTECTION',
    accent: '#425d6c',
    price: 0,
    use: 'police',
  },
  {
    id: 'cafe',
    name: 'Union Café',
    x: -26,
    z: 12,
    w: 20,
    d: 19,
    floors: 3,
    rotation: Math.PI / 2,
    material: 'brick',
    sign: 'UNION CAFÉ',
    accent: '#4f7264',
    price: 200,
    use: 'cafe',
  },
  {
    id: 'hardware',
    name: 'District Supply',
    x: 27,
    z: 10,
    w: 18,
    d: 20,
    floors: 3,
    rotation: -Math.PI / 2,
    material: 'plaster',
    sign: 'DISTRICT SUPPLY',
    accent: '#997349',
    price: 200,
    use: 'shop',
  },
  {
    id: 'arms',
    name: 'Marlow Arms',
    x: -27,
    z: -13,
    w: 21,
    d: 20,
    floors: 4,
    rotation: Math.PI / 2,
    material: 'plaster',
    sign: 'MARLOW ARMS',
    accent: '#766f52',
    price: 250,
    use: 'arms',
  },
  {
    id: 'clinic',
    name: 'District Clinic',
    x: 28,
    z: -15,
    w: 21,
    d: 21,
    floors: 3,
    rotation: -Math.PI / 2,
    material: 'brick',
    sign: 'DISTRICT CLINIC',
    accent: '#668b82',
    price: 200,
    use: 'clinic',
  },
  {
    id: 'apartment-a',
    name: 'Apartment 01',
    x: -25,
    z: 38,
    w: 20,
    d: 18,
    floors: 4,
    rotation: Math.PI / 2,
    material: 'plaster',
    sign: 'THE ALDER · RESIDENCES',
    accent: '#6d7779',
    price: 100,
    use: 'apartment',
  },
  {
    id: 'apartment-b',
    name: 'Apartment 02',
    x: 26,
    z: 37,
    w: 21,
    d: 20,
    floors: 4,
    rotation: -Math.PI / 2,
    material: 'brick',
    sign: '24 · UNION STREET',
    accent: '#6f665b',
    price: 100,
    use: 'apartment',
  },
  {
    id: 'warehouse',
    name: 'Warehouse 06',
    x: -30,
    z: -48,
    w: 23,
    d: 20,
    floors: 2,
    rotation: Math.PI / 2,
    material: 'industrial',
    sign: '06 / UNION STORAGE',
    accent: '#7c7966',
    price: 350,
    use: 'warehouse',
  },
  {
    id: 'pawn',
    name: 'Second Chance',
    x: 31,
    z: -49,
    w: 23,
    d: 22,
    floors: 2,
    rotation: -Math.PI / 2,
    material: 'industrial',
    sign: 'SECOND CHANCE · PAWN',
    accent: '#916b57',
    price: 150,
    use: 'shop',
  },
];
export function toWorld(b: Building, x: number, y: number, z: number): Vec3 {
  return {
    x: b.x + x * Math.cos(b.rotation) + z * Math.sin(b.rotation),
    y,
    z: b.z - x * Math.sin(b.rotation) + z * Math.cos(b.rotation),
  };
}
export function localBox(
  b: Building,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  material: string,
): Block {
  const p = toWorld(b, x, y, z),
    side = Math.abs(Math.sin(b.rotation)) > 0.5;
  return { ...p, w: side ? d : w, h, d: side ? w : d, material };
}
export const BLOCKS: Block[] = [];
export const INITIAL_DOORS: Door[] = [];
for (const b of BUILDINGS) {
  const add = (x: number, y: number, z: number, w: number, h: number, d: number, m = b.material) =>
    BLOCKS.push(localBox(b, x, y, z, w, h, d, m));
  add(0, 0.04, 0, b.w, 0.08, b.d, 'floor');
  // Ground floors are hollow, with one real doorway per building.
  add(-b.w / 2 + 0.2, 1.7, 0, 0.4, 3.4, b.d);
  add(b.w / 2 - 0.2, 1.7, 0, 0.4, 3.4, b.d);
  add(0, 1.7, -b.d / 2 + 0.2, b.w, 3.4, 0.4);
  const wing = (b.w - 1.65) / 2;
  add(-(b.w + 1.65) / 4, 1.7, b.d / 2 - 0.2, wing, 3.4, 0.4);
  add((b.w + 1.65) / 4, 1.7, b.d / 2 - 0.2, wing, 3.4, 0.4);
  add(0, 3.06, b.d / 2 - 0.2, 1.65, 0.68, 0.4);
  add(0, 3.4 + (b.floors - 1) * 1.6, 0, b.w, (b.floors - 1) * 3.2, b.d);
  add(0, b.floors * 3.2 + 0.2, 0, b.w + 0.45, 0.35, b.d + 0.45, 'concrete');
  const dp = toWorld(b, 0, 0, b.d / 2 - 0.18);
  INITIAL_DOORS.push({
    id: b.id,
    name: b.name,
    x: dp.x,
    z: dp.z,
    width: 1.62,
    height: 2.72,
    rotation: b.rotation,
    price: b.price,
    owner: null,
    coowners: [],
    locked: false,
    open: false,
    ...(b.use === 'police' ? { group: 'government' as const } : {}),
  });
  if (['shop', 'arms', 'clinic', 'cafe'].includes(b.use)) add(-3.3, 0.6, -2.5, 4.5, 1.2, 0.9, 'wood');
}
// A physically enclosed holding cell behind the police reception area.
BLOCKS.push(
  { x: -8, y: 1.5, z: -42, w: 0.25, h: 3, d: 8, material: 'metal' },
  { x: -2, y: 1.5, z: -42, w: 0.25, h: 3, d: 8, material: 'metal' },
  { x: -6.9, y: 1.5, z: -38, w: 2.2, h: 3, d: 0.15, material: 'bars' },
  { x: -3.1, y: 1.5, z: -38, w: 2.2, h: 3, d: 0.15, material: 'bars' },
  { x: -5, y: 2.9, z: -38, w: 1.65, h: 0.2, d: 0.15, material: 'metal' },
);
INITIAL_DOORS.push({
  id: 'cell',
  name: 'Holding cell',
  x: -5,
  z: -38,
  width: 1.6,
  height: 2.8,
  rotation: 0,
  price: 0,
  owner: null,
  coowners: [],
  locked: true,
  open: false,
  group: 'government',
});
// Fountain/plaza, planters, and the boundary walls also exist on the server.
BLOCKS.push(
  { x: 0, y: 0.38, z: 9, w: 5.6, h: 0.76, d: 5.6, material: 'fountain' },
  { x: -10, y: 0.32, z: 9, w: 2.3, h: 0.64, d: 7, material: 'planter' },
  { x: 10, y: 0.32, z: 9, w: 2.3, h: 0.64, d: 7, material: 'planter' },
  { x: 0, y: 2.5, z: -74, w: 150, h: 5, d: 1, material: 'brick' },
  { x: 0, y: 2.5, z: 74, w: 150, h: 5, d: 1, material: 'brick' },
  { x: -74, y: 2.5, z: 0, w: 1, h: 5, d: 150, material: 'brick' },
  { x: 74, y: 2.5, z: 0, w: 1, h: 5, d: 150, material: 'brick' },
);
// Collision-only detail is rendered as furniture, benches and vehicles by the client.
for (const [x, z, side] of [
  [-10, -20, false],
  [11.5, 38, false],
  [8.5, -29, true],
] as const)
  BLOCKS.push({ x, y: 0.7, z, w: side ? 4.2 : 1.7, h: 1.4, d: side ? 1.7 : 4.2, material: 'collision' });
for (const x of [-10, 10]) {
  BLOCKS.push({
    x: x < 0 ? x + 1.8 : x - 1.8,
    y: 0.51,
    z: 8.3,
    w: 2.1,
    h: 1.02,
    d: 0.65,
    material: 'collision',
  });
  for (const z of [7, 11]) BLOCKS.push({ x, y: 2.1, z, w: 0.3, h: 3.6, d: 0.3, material: 'collision' });
}
for (const b of BUILDINGS) {
  if (b.use === 'cafe')
    for (const x of [-6, 5]) {
      BLOCKS.push(localBox(b, x, 0.39, 2, 1.25, 0.78, 1.25, 'collision'));
      for (const z of [0.7, 3.3]) BLOCKS.push(localBox(b, x, 0.52, z, 0.6, 1.04, 0.6, 'collision'));
    }
  if (b.use === 'warehouse')
    for (const x of [-7, 7]) BLOCKS.push(localBox(b, x, 1.25, -4, 1.6, 2.5, 1.2, 'collision'));
}
export function doorBox(d: Door): Box {
  const side = Math.abs(Math.sin(d.rotation)) > 0.5;
  return { x: d.x, y: d.height / 2, z: d.z, w: side ? 0.22 : d.width, h: d.height, d: side ? d.width : 0.22 };
}
export function doorSolid(d: Door): Box | null {
  return d.open ? null : doorBox(d);
}
export function getStaticColliders(doors: Door[]): Box[] {
  return [...BLOCKS, ...doors.filter((d) => !d.open).map(doorBox)];
}
export function districtAt(x: number, z: number): string {
  const inside = BUILDINGS.find((b) => {
    const s = Math.abs(Math.sin(b.rotation)) > 0.5;
    return Math.abs(x - b.x) < (s ? b.d : b.w) / 2 && Math.abs(z - b.z) < (s ? b.w : b.d) / 2;
  });
  return (
    inside?.name ??
    (z < -27
      ? 'Industrial Quarter'
      : z > 28
        ? 'Alder Row'
        : Math.abs(x) > 37
          ? 'Back Alleys'
          : 'Union Square')
  );
}
