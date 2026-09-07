import * as THREE from 'three';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow-condensed/800.css';
import { City } from './world.ts';
import { makeAvatar, makeEntity, updateAvatar } from './entities.ts';
import { INITIAL_DOORS } from '../shared/map.ts';
import type { Entity, EntityKind, JobId, Player, WeaponId } from '../shared/types.ts';

const W = 1080,
  H = 1080,
  DURATION = 30;
const canvas = document.createElement('canvas');
canvas.width = W;
canvas.height = H;
document.getElementById('stage')!.append(canvas);
const ctx = canvas.getContext('2d', { alpha: false })!;
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  preserveDrawingBuffer: true,
  powerPreference: 'high-performance',
});
renderer.setSize(W, H);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
const scene = new THREE.Scene(),
  camera = new THREE.PerspectiveCamera(60, 1, 0.05, 420);
const city = new City(scene, renderer);
city.updateDoors(INITIAL_DOORS);
const actors: { player: Player; avatar: ReturnType<typeof makeAvatar> }[] = [];
function actor(job: JobId, x: number, z: number, yaw = Math.PI, weapon: WeaponId = 'keys') {
  const player: Player = {
    id: `actor-${actors.length}`,
    name: job,
    job,
    x,
    y: 0.12,
    z,
    vy: 0,
    grounded: true,
    yaw,
    pitch: 0,
    crouch: false,
    money: 1500,
    health: 100,
    hunger: 100,
    armor: 0,
    weapon,
    weapons: [weapon],
    ammo: {},
    reserve: {},
    arrestedUntil: 0,
    wantedUntil: 0,
    wantedReason: '',
    warrantUntil: 0,
    deadUntil: 0,
    reloadUntil: 0,
    seq: 0,
    holding: null,
    ping: 0,
    license: false,
  };
  const avatar = makeAvatar(player);
  scene.add(avatar.root);
  actors.push({ player, avatar });
  return player;
}
function entity(kind: EntityKind, x: number, y: number, z: number, color = '#839784') {
  const data: Entity = {
    id: `studio-${kind}`,
    kind,
    x,
    y,
    z,
    owner: 'studio',
    q: { x: 0, y: 0, z: 0, w: 1 },
    frozen: true,
    health: 100,
    cash: 300,
    stock: 10,
    price: 500,
    color,
    fading: false,
    fadeUntil: 0,
    heldBy: null,
    item: 'pistol',
  };
  const model = makeEntity(data);
  model.position.set(x, y, z);
  scene.add(model);
  return model;
}
actor('mayor', 0, -24.8);
actor('police', -2.1, -25.5, Math.PI, 'baton');
actor('chief', 2.1, -25.5, Math.PI, 'smg');
actor('dealer', -14.5, -12.6, 2.6, 'pistol');
actor('citizen', -11.8, -10, -0.8);
entity('table', -14, 0.65, -10.6, '#8b7556');
entity('shipment', -14, 1.35, -10.6, '#6c7660');
const builder = actor('citizen', 12, 28, -0.4, 'physgun');
entity('fence', 13, 1.4, 23, '#697d76');
entity('fence', 16, 1.4, 23, '#697d76');
entity('couch', 15, 0.7, 25, '#6f8265');
entity('crate', 17, 0.7, 24.5, '#8e7852');
const levitated = entity('barrel', 12, 2, 24, '#568681');
const beam = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
  new THREE.LineBasicMaterial({ color: '#6edbff' }),
);
beam.frustumCulled = false;
scene.add(beam);
entity('table', 25, 0.65, 34, '#8e7959');
entity('printer', 25, 1.28, 34);
entity('money', 25.7, 1.05, 34.3, '#8fa672');
actor('gangster', 26.6, 33, Math.PI * 0.7);
const runner = actor('thief', -6, 1, 0, 'lockpick'),
  chaser = actor('police', -7, 4, 0, 'baton');
actor('medic', 12, -5, 1.2, 'medkit');
actor('cook', -13, 13, -1);
const shots = [
  {
    start: 0,
    title: ['MISS DARKRP?'],
    sub: 'Meet OpenRP. A city made by its players.',
    eye: [11, 5.2, 28],
    end: [7, 4.1, 22],
    look: [-3, 3, -13],
  },
  {
    start: 4,
    title: ['BECOME', 'THE MAYOR.'],
    sub: '11 jobs. One shared city.',
    eye: [4.2, 2.2, -18],
    end: [2.4, 1.9, -19.5],
    look: [0, 1.35, -25],
  },
  {
    start: 8,
    title: ['OPEN A SHOP.'],
    sub: 'Make a living. Make some friends.',
    eye: [-9.2, 2.3, -6.6],
    end: [-10.2, 2, -7.5],
    look: [-14, 1.2, -11],
  },
  {
    start: 12,
    title: ['BUILD', 'YOUR BASE.'],
    sub: 'Physics gun. Props. Your imagination.',
    eye: [8, 2.9, 33],
    end: [8.8, 2.5, 30.5],
    look: [13, 1.7, 25],
  },
  {
    start: 16,
    title: ['PRINT MONEY.'],
    sub: 'The police might have questions.',
    eye: [26.6, 2.2, 37.7],
    end: [25.8, 1.9, 36.3],
    look: [25, 1.25, 34],
  },
  {
    start: 20,
    title: ['START', 'SOME TROUBLE.'],
    sub: 'Wanted. Warrants. Raids.',
    eye: [-2, 2.5, 7],
    end: [-2, 2.5, -5],
    look: [-6, 1.1, 0],
  },
  {
    start: 24,
    title: ['WHAT ROLE', 'ARE YOU TAKING?'],
    sub: 'Bring a friend. Give this city a story.',
    eye: [10, 9, 31],
    end: [5, 7, 25],
    look: [-2, 2, -14],
  },
];
let timeline = 0,
  running = false,
  recording = false,
  began = 0,
  recorder: MediaRecorder | undefined,
  audioContext: AudioContext | undefined;
const status = document.getElementById('status')!;
function text(value: string, x: number, y: number, size: number, color = '#f0eddf', condensed = false) {
  ctx.fillStyle = color;
  ctx.font = `${condensed ? 800 : 700} ${size}px "${condensed ? 'Barlow Condensed' : 'Barlow'}"`;
  ctx.fillText(value, x, y);
}
function draw(time: number, poster = false) {
  const index = poster
    ? 0
    : Math.max(
        0,
        shots.findLastIndex((s) => time >= s.start),
      );
  const shot = shots[index],
    length = (shots[index + 1]?.start ?? DURATION) - shot.start;
  const p = THREE.MathUtils.clamp((time - shot.start) / length, 0, 1),
    smooth = p * p * (3 - 2 * p);
  camera.position
    .set(...(shot.eye as [number, number, number]))
    .lerp(new THREE.Vector3(...(shot.end as [number, number, number])), smooth);
  camera.lookAt(...(shot.look as [number, number, number]));
  if (index === 5) {
    const z = 2 - p * 12;
    runner.z = z;
    chaser.z = z + 2.6;
    runner.x = -6 + Math.sin(p * 6) * 0.4;
    chaser.x = -6.8;
    camera.lookAt(-6, 1.2, z);
  }
  levitated.position.y = 2.1 + Math.sin(time * 1.2) * 0.45;
  levitated.position.x = 12.8 + Math.sin(time * 0.7) * 0.65;
  levitated.rotation.z = Math.sin(time) * 0.2;
  builder.pitch = -0.15;
  beam.geometry.setFromPoints([new THREE.Vector3(12.3, 1.25, 27.5), levitated.position]);
  for (const a of actors) {
    updateAvatar(a.avatar, a.player, 1 / 30, camera.position);
    a.avatar.label.visible = false;
  }
  city.update(time, 1 / 30);
  renderer.render(scene, camera);
  ctx.drawImage(renderer.domElement, 0, 0, canvas.width, canvas.height);
  const w = canvas.width,
    h = canvas.height;
  const top = ctx.createLinearGradient(0, 0, 0, h * 0.52);
  top.addColorStop(0, 'rgba(9,18,19,.87)');
  top.addColorStop(1, 'rgba(9,18,19,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, w, h);
  const bottom = ctx.createLinearGradient(0, h * 0.58, 0, h);
  bottom.addColorStop(0, 'rgba(9,18,19,0)');
  bottom.addColorStop(1, 'rgba(9,18,19,.98)');
  ctx.fillStyle = bottom;
  ctx.fillRect(0, 0, w, h);
  if (poster) {
    const side = ctx.createLinearGradient(0, 0, w, 0);
    side.addColorStop(0, 'rgba(9,18,19,.83)');
    side.addColorStop(1, 'rgba(9,18,19,0)');
    ctx.fillStyle = side;
    ctx.fillRect(0, 0, w, h);
    text('OPEN', 54, 200, 150, '#f0eddf', true);
    text('RP.', 338, 200, 150, '#dcb879', true);
    text('YOUR CITY. YOUR RULES.', 60, 271, 43, '#f0eddf', true);
    text('Jobs. Property. Physics. Possibilities.', 60, 322, 25);
    ctx.fillStyle = '#dcb879';
    ctx.fillRect(60, 411, 360, 68);
    text('PLAY FREE · OPENRP.DEV', 80, 457, 26, '#14201e');
    text('MULTIPLAYER · DESKTOP BROWSER · PUBLIC ALPHA', 60, 568, 18, '#b6c4b7');
    return;
  }
  text('OPENRP.', 54, 65, 34, '#f0eddf', true);
  ctx.fillStyle = '#dcb879';
  ctx.beginPath();
  ctx.arc(w - 213, 52, 5, 0, Math.PI * 2);
  ctx.fill();
  text('PUBLIC ALPHA', w - 198, 59, 19, '#dcb879');
  const titleY = 144;
  shot.title.forEach((line, i) => text(line, 52, titleY + i * 89, index === 6 ? 87 : 98, '#f0eddf', true));
  if (index === 6) {
    ctx.fillStyle = '#dcb879';
    ctx.fillRect(52, h - 249, w - 104, 107);
    text('PLAY FREE  →  OPENRP.DEV', 79, h - 178, 54, '#14201e', true);
    text(shot.sub, 54, h - 285, 30);
    text('DESKTOP BROWSER · NO DOWNLOAD · OPEN SOURCE', 54, h - 99, 22, '#d6dcca');
  } else {
    ctx.fillStyle = '#dcb879';
    ctx.fillRect(54, h - 190, 50, 4);
    text(shot.sub, 54, h - 132, 31);
    text('PLAY FREE AT OPENRP.DEV', 54, h - 88, 21, '#dcb879');
  }
  text('IN-ENGINE ALPHA SCENES', 54, h - 38, 15, '#93a59b');
  ctx.fillStyle = '#46554f';
  ctx.fillRect(w - 246, h - 46, 192, 3);
  ctx.fillStyle = '#dcb879';
  ctx.fillRect(w - 246, h - 46, (192 * time) / DURATION, 3);
  // A brief dark cut masks camera jumps without obscuring the opening hook.
  if (index > 0 && p < 0.035) {
    ctx.fillStyle = `rgba(12,20,19,${0.5 * (1 - p / 0.035)})`;
    ctx.fillRect(0, 0, w, h);
  }
}
function score(ac: AudioContext): MediaStreamAudioDestinationNode {
  const out = ac.createMediaStreamDestination(),
    master = ac.createGain();
  master.gain.value = 0.28;
  master.connect(out);
  const start = ac.currentTime + 0.04;
  function tone(at: number, freq: number, duration: number, gain: number, type: OscillatorType = 'sine') {
    const o = ac.createOscillator(),
      g = ac.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.connect(g);
    g.connect(master);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.009);
    g.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    o.start(at);
    o.stop(at + duration + 0.02);
  }
  for (let beat = 0; beat < 60; beat++) {
    const at = start + beat * 0.5;
    const o = ac.createOscillator(),
      g = ac.createGain();
    o.frequency.setValueAtTime(120, at);
    o.frequency.exponentialRampToValueAtTime(42, at + 0.16);
    o.connect(g);
    g.connect(master);
    g.gain.setValueAtTime(0.9, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.22);
    o.start(at);
    o.stop(at + 0.24);
    const bass = [73.416, 73.416, 58.27, 65.406][Math.floor(beat / 8) % 4];
    tone(at, bass, 0.31, 0.38, 'triangle');
    const note = [293.66, 349.23, 440, 523.25, 440, 349.23, 261.63, 349.23][beat % 8];
    if (beat >= 8) tone(at + 0.25, note, 0.26, 0.12, 'triangle');
    for (let half = 0; half < 2; half++) {
      const buffer = ac.createBuffer(1, ac.sampleRate * 0.06, ac.sampleRate),
        data = buffer.getChannelData(0);
      let seed = beat * 431 + half + 1;
      for (let i = 0; i < data.length; i++) {
        seed = (seed * 16807) % 2147483647;
        data[i] = ((seed / 2147483647) * 2 - 1) * Math.exp(-i / 450);
      }
      const src = ac.createBufferSource(),
        gain = ac.createGain(),
        filter = ac.createBiquadFilter();
      src.buffer = buffer;
      filter.type = 'highpass';
      filter.frequency.value = 7000;
      gain.gain.value = half ? 0.11 : 0.17;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(at + half * 0.25);
    }
    if (beat % 2) {
      tone(at, 175, 0.12, 0.2, 'triangle');
      tone(at, 330, 0.08, 0.07, 'square');
    }
  }
  master.gain.setValueAtTime(0.28, start + 28.5);
  master.gain.linearRampToValueAtTime(0, start + 29.95);
  return out;
}
async function save(name: string, blob: Blob) {
  const res = await fetch(`/__capture/${name}`, { method: 'POST', body: blob });
  if (!res.ok) throw new Error('Export failed');
}
function frame() {
  if (running) {
    timeline = Math.min(DURATION, (performance.now() - began) / 1000);
    if (timeline >= DURATION) {
      running = false;
      if (recording && recorder?.state === 'recording') recorder.stop();
    }
  }
  draw(timeline);
  if (running) status.textContent = `${recording ? 'Recording' : 'Preview'} · ${timeline.toFixed(1)} / 30s`;
  requestAnimationFrame(frame);
}
document.getElementById('preview')!.onclick = () => {
  if (recording) return;
  timeline = 0;
  began = performance.now();
  running = true;
};
document.querySelectorAll<HTMLButtonElement>('[data-shot]').forEach(
  (b) =>
    (b.onclick = () => {
      if (recording) return;
      running = false;
      timeline = Number(b.dataset.shot);
      status.textContent = `Shot preview · ${timeline}s`;
    }),
);
document.getElementById('record')!.onclick = async () => {
  if (recording) return;
  try {
    await document.fonts.ready;
    audioContext = new AudioContext();
    await audioContext.resume();
    const stream = canvas.captureStream(30),
      music = score(audioContext);
    for (const track of music.stream.getAudioTracks()) stream.addTrack(track);
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus'].find((t) =>
      MediaRecorder.isTypeSupported(t),
    );
    recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 10_000_000,
      audioBitsPerSecond: 192_000,
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = async () => {
      try {
        status.textContent = 'Saving film…';
        await save('openrp-launch.webm', new Blob(chunks, { type: 'video/webm' }));
        status.textContent = 'Trailer saved · 30 seconds';
      } catch (e) {
        status.textContent = String(e);
      } finally {
        recording = false;
        stream.getTracks().forEach((t) => t.stop());
        await audioContext?.close();
      }
    };
    timeline = 0;
    began = performance.now();
    recording = running = true;
    recorder.start(1000);
  } catch (e) {
    recording = false;
    status.textContent = String(e);
  }
};
document.getElementById('poster')!.onclick = async () => {
  if (recording) return;
  running = false;
  await document.fonts.ready;
  canvas.width = 1200;
  canvas.height = 630;
  renderer.setSize(1200, 630);
  camera.aspect = 1200 / 630;
  camera.updateProjectionMatrix();
  draw(1, true);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
  await save('social-card.png', blob);
  canvas.width = W;
  canvas.height = H;
  renderer.setSize(W, H);
  camera.aspect = 1;
  camera.updateProjectionMatrix();
  status.textContent = 'Share image saved · 1200 × 630';
};
await document.fonts.ready;
status.textContent = 'Ready · preview any shot or record the film';
frame();
