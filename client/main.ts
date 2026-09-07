import * as THREE from 'three';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/800.css';
import './style.css';
import { City } from './world.ts';
import {
  disposeObject,
  makeAvatar,
  makeEntity,
  makeViewmodel,
  updateAvatar,
  type Avatar,
} from './entities.ts';
import { GameAudio } from './audio.ts';
import { UI, type AimTarget } from './ui.ts';
import { EYE_HEIGHT, JOBS, PROPS, PROTOCOL, TICK_RATE, WEAPONS, entitySize } from '../shared/catalog.ts';
import { BLOCKS, doorBox } from '../shared/map.ts';
import { direction, idleInput, movePlayer, rayBox } from '../shared/movement.ts';
import type {
  Box,
  ClientMessage,
  Entity,
  Input,
  Motion,
  Player,
  ServerMessage,
  Snapshot,
  WeaponId,
} from '../shared/types.ts';

const ui = new UI();
const audio = new GameAudio();
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(ui.settings.fov, innerWidth / innerHeight, 0.06, 420);
camera.rotation.order = 'YXZ';
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.13;
renderer.outputColorSpace = THREE.SRGBColorSpace;
ui.el('viewport').append(renderer.domElement);
const city = new City(scene, renderer);
const viewScene = new THREE.Scene();
viewScene.add(new THREE.HemisphereLight('#e0e5cf', '#7a7358', 2.7));
const viewLight = new THREE.DirectionalLight('#fff0ca', 2.1);
viewLight.position.set(-1, 3, 2);
viewScene.add(viewLight);
const viewCamera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.01, 10);
const models = new Map<WeaponId, THREE.Group>();
const entityVisuals = new Map<string, THREE.Group>();
const avatars = new Map<string, Avatar>();
const keys = new Set<string>();
let socket: WebSocket | undefined,
  myId = '',
  state: Snapshot | undefined,
  me: Player | undefined;
let predicted: Motion = { x: 0, y: 0, z: 24, vy: 0, grounded: true };
let pending: Input[] = [],
  seq = 0,
  yaw = 0,
  pitch = 0,
  ping = 0,
  lastPing = 0,
  lastInputTime = 0;
let clockOffset = 0,
  lastFrame = performance.now(),
  accumulator = 0,
  elapsed = 0,
  hudTimer = 0,
  stepTimer = 0,
  recoil = 0;
let mouseDown = false,
  nextFire = 0,
  lastHealth = 100,
  progressEnd = 0,
  progressStart = 0,
  connectedAt = 0;
let fallbackActive = false,
  fallbackDrag = false;
const cameraPos = new THREE.Vector3(0, EYE_HEIGHT, 24);
const beamGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
const beam = new THREE.Line(
  beamGeo,
  new THREE.LineBasicMaterial({ color: '#78d7ff', transparent: true, opacity: 0.9 }),
);
beam.frustumCulled = false;
beam.visible = false;
scene.add(beam);
const shotLines: { object: THREE.Line; until: number }[] = [];
const locked = () => document.pointerLockElement === renderer.domElement;
const controlsActive = () => locked() || fallbackActive;
const serverNow = () => Date.now() + clockOffset;
function send(message: ClientMessage): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}
function action(name: string, target?: string, value?: string | number | boolean): void {
  send({ type: 'action', action: name, target, value });
}
function lock(): void {
  if (!ui.playing || ui.menu || ui.chatOpen) return;
  const fallback = () => {
    if (!ui.menu && !ui.chatOpen) {
      fallbackActive = true;
      ui.notice(
        'Mouse capture unavailable in this browser. Hold right mouse to look; Alt + left click for alternate use.',
      );
    }
  };
  try {
    renderer.domElement.requestPointerLock()?.catch(fallback);
  } catch {
    fallback();
  }
}
function releaseControls(): void {
  keys.clear();
  mouseDown = false;
  fallbackActive = fallbackDrag = false;
  action('release');
  if (locked()) document.exitPointerLock();
  send({ type: 'input', input: { ...idleInput(), seq: ++seq, yaw, pitch } });
}
ui.onResume = lock;
ui.onMenu = releaseControls;
ui.onAction = (name, target, value) => {
  action(name, target, value);
  if (name === 'tool') setTimeout(() => action('equip', 'toolgun'), 90);
};
ui.onChat = (text) => send({ type: 'chat', text });
ui.onSettings = () => {
  audio.setVolume(ui.settings.volume);
  camera.fov = ui.settings.fov;
  camera.updateProjectionMatrix();
  renderer.shadowMap.enabled = ui.settings.quality === 'high';
  renderer.setPixelRatio(Math.min(devicePixelRatio, ui.settings.quality === 'high' ? 1.6 : 1));
};
ui.onSettings();

async function refreshStatus(): Promise<void> {
  try {
    const response = await fetch('/api/status');
    if (!response.ok) throw new Error();
    const status = await response.json();
    ui.serverName = status.name;
    ui.maxPlayers = status.maxPlayers;
    ui.el('password-row').hidden = !status.password;
    if (!ui.playing && socket?.readyState !== WebSocket.CONNECTING)
      ui.status(`${status.players} / ${status.maxPlayers} residents online · Server ready`);
  } catch {
    if (!ui.playing) ui.status('Server unavailable. Check that the OpenRP server is running.');
  }
}
void refreshStatus();
ui.onConnect = (name, password) => {
  if (socket?.readyState === WebSocket.CONNECTING || socket?.readyState === WebSocket.OPEN) return;
  audio.init();
  audio.setVolume(ui.settings.volume);
  ui.status('Joining the district…', true);
  localStorage.setItem('openrp-name', name);
  seq = 0;
  pending = [];
  myId = '';
  state = undefined;
  me = undefined;
  mouseDown = false;
  keys.clear();
  const ws = (socket = new WebSocket(
    `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`,
  ));
  let rejection = '';
  ws.addEventListener('open', () =>
    send({ type: 'join', name, password, token: localStorage.getItem('openrp-token') ?? undefined }),
  );
  ws.addEventListener('message', (event) => {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (msg.type === 'welcome') {
      if (msg.protocol !== PROTOCOL) {
        rejection = 'Client/server version mismatch. Refresh the page.';
        ws.close();
        return;
      }
      myId = msg.id;
      localStorage.setItem('openrp-token', msg.token);
      localStorage.setItem('openrp-name', msg.name);
      ui.serverName = msg.serverName;
      ui.maxPlayers = msg.maxPlayers;
      ui.connected();
      connectedAt = performance.now();
      yaw = pitch = 0;
      // This asynchronous callback cannot rely on a browser user activation.
      ui.open('pause');
      ui.notice('Connected. Click Return to the streets to start playing.');
    } else if (msg.type === 'state') receiveState(msg);
    else if (msg.type === 'pong') ping = Math.round(Date.now() - msg.time);
    else if (msg.type === 'notice') {
      if (!myId) rejection = msg.text;
      ui.notice(msg.text, msg.tone);
    } else if (msg.type === 'chat') ui.chat(msg);
    else if (msg.type === 'shot') {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(msg.from.x, msg.from.y, msg.from.z),
          new THREE.Vector3(msg.to.x, msg.to.y, msg.to.z),
        ]),
        new THREE.LineBasicMaterial({ color: '#eedca2', transparent: true, opacity: 0.7 }),
      );
      scene.add(line);
      shotLines.push({ object: line, until: performance.now() + 75 });
      if (msg.shooter === myId) {
        recoil = 1;
        if (msg.hit) {
          ui.el('hitmarker').hidden = false;
          setTimeout(() => {
            ui.el('hitmarker').hidden = true;
          }, 130);
        }
      }
      if (me) audio.shot(msg.weapon, msg.shooter === myId ? 1 : audio.distanceGain(msg.from, me));
    } else if (msg.type === 'sound' && me) audio.effect(msg.sound, audio.distanceGain(msg.position, me));
    else if (msg.type === 'progress') {
      progressEnd = msg.end;
      progressStart = serverNow();
      ui.el('progress').querySelector('span')!.textContent = msg.label;
    }
  });
  ws.addEventListener('close', (event) => {
    if (socket !== ws) return;
    releaseControls();
    ui.disconnected(
      rejection ||
        (event.code === 1008
          ? 'Connection rejected. Check your identity, password, or server capacity.'
          : 'Disconnected. Your wallet is saved. Enter the district to reconnect.'),
    );
    state = undefined;
    me = undefined;
    pending = [];
    for (const a of avatars.values()) disposeObject(a.root);
    avatars.clear();
    for (const e of entityVisuals.values()) disposeObject(e);
    entityVisuals.clear();
    beam.visible = false;
  });
  ws.addEventListener('error', () => {
    rejection ||= 'Could not reach the server. Check the address and try again.';
  });
};
function entityBox(e: Entity): Box {
  const [w, h, d] = entitySize(e.kind),
    m = new THREE.Matrix4().makeRotationFromQuaternion(
      new THREE.Quaternion(e.q.x, e.q.y, e.q.z, e.q.w),
    ).elements;
  return {
    x: e.x,
    y: e.y,
    z: e.z,
    w: Math.abs(m[0]) * w + Math.abs(m[4]) * h + Math.abs(m[8]) * d,
    h: Math.abs(m[1]) * w + Math.abs(m[5]) * h + Math.abs(m[9]) * d,
    d: Math.abs(m[2]) * w + Math.abs(m[6]) * h + Math.abs(m[10]) * d,
  };
}
function colliders(): Box[] {
  return [
    ...BLOCKS,
    ...(state?.doors.filter((d) => !d.open).map(doorBox) ?? []),
    ...(state?.entities.filter((e) => !(e.fading && e.fadeUntil > serverNow())).map(entityBox) ?? []),
  ];
}
function receiveState(snapshot: Snapshot): void {
  const p = snapshot.players.find((p) => p.id === myId);
  if (!p) return;
  const first = !me;
  state = snapshot;
  me = p;
  clockOffset = snapshot.time - Date.now() + ping / 2;
  pending = pending.filter((i) => i.seq > p.seq);
  predicted = { x: p.x, y: p.y, z: p.z, vy: p.vy, grounded: p.grounded };
  if (!p.deadUntil && !p.arrestedUntil) {
    const boxes = colliders();
    for (const input of pending) movePlayer(predicted, input, 1 / TICK_RATE, boxes);
  }
  if (
    first ||
    cameraPos.distanceTo(new THREE.Vector3(predicted.x, predicted.y + EYE_HEIGHT, predicted.z)) > 4
  )
    cameraPos.set(predicted.x, predicted.y + (p.crouch ? 1.02 : EYE_HEIGHT), predicted.z);
  if (p.health < lastHealth && !first) {
    document.body.classList.add('hurt');
    setTimeout(() => document.body.classList.remove('hurt'), 240);
  }
  lastHealth = p.health;
  city.updateDoors(snapshot.doors);
  const ids = new Set(snapshot.entities.map((e) => e.id));
  for (const [id, visual] of entityVisuals)
    if (!ids.has(id)) {
      disposeObject(visual);
      entityVisuals.delete(id);
    }
  for (const e of snapshot.entities) {
    let visual = entityVisuals.get(e.id);
    if (!visual || visual.userData.color !== e.color) {
      if (visual) disposeObject(visual);
      visual = makeEntity(e);
      visual.position.set(e.x, e.y, e.z);
      visual.quaternion.set(e.q.x, e.q.y, e.q.z, e.q.w);
      entityVisuals.set(e.id, visual);
      scene.add(visual);
    }
    visual.visible = !(e.fading && e.fadeUntil > snapshot.time);
  }
  const playerIds = new Set(snapshot.players.map((p) => p.id));
  for (const [id, a] of avatars)
    if (!playerIds.has(id)) {
      disposeObject(a.root);
      avatars.delete(id);
    }
  for (const other of snapshot.players) {
    if (other.id === myId) continue;
    let a = avatars.get(other.id);
    if (!a || a.job !== other.job) {
      if (a) disposeObject(a.root);
      a = makeAvatar(other);
      a.root.position.set(other.x, other.y, other.z);
      avatars.set(other.id, a);
      scene.add(a.root);
    }
  }
  if (first) ui.update(snapshot, p, ping);
}
function makeInput(): Input {
  const active = controlsActive() && !ui.menu && !ui.chatOpen && me && !me.deadUntil;
  return {
    seq: ++seq,
    forward: active ? (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) : 0,
    right: active ? (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) : 0,
    yaw,
    pitch,
    jump: !!active && keys.has('Space'),
    sprint: !!active && (keys.has('ShiftLeft') || keys.has('ShiftRight')),
    crouch: !!active && (keys.has('ControlLeft') || keys.has('ControlRight')),
  };
}
function aim(): AimTarget | undefined {
  if (!state || !me || me.deadUntil) return;
  const origin = camera.position,
    dir = direction(yaw, pitch),
    maxRange = ['physgun', 'toolgun'].includes(me.weapon) ? 12 : 3.4;
  let nearest = maxRange,
    target: AimTarget | undefined;
  for (const b of BLOCKS) {
    const t = rayBox(origin, dir, b, nearest);
    if (t !== null) nearest = t;
  }
  for (const d of state.doors) {
    const t = rayBox(origin, dir, doorBox(d), nearest);
    if (t === null) continue;
    nearest = t;
    const owner = state.players.find((p) => p.id === d.owner);
    target = {
      kind: 'door',
      id: d.id,
      title: d.name,
      detail: d.group
        ? 'Civil Protection property'
        : owner
          ? `Owned by ${owner.name}${d.locked ? ' · Locked' : ''}`
          : `Unowned · $${d.price}`,
      hint: `E  ${d.open ? 'Close' : 'Open'} door     C  ${owner || d.group ? 'Manage' : 'Buy property'}`,
    };
  }
  for (const e of state.entities) {
    if (e.fading && e.fadeUntil > serverNow()) continue;
    const t = rayBox(origin, dir, entityBox(e), nearest);
    if (t === null) continue;
    nearest = t;
    const owner = state.players.find((p) => p.id === e.owner)?.name ?? 'Unknown';
    const title =
      PROPS.find((v) => v.id === e.kind)?.name ??
      {
        printer: 'Money printer',
        microwave: 'Microwave',
        shipment: `${e.item ? WEAPONS[e.item].name : 'Weapon'} shipment`,
        money: `$${e.cash}`,
        food: 'Meal',
      }[e.kind as 'printer'];
    target = {
      kind: 'entity',
      id: e.id,
      title,
      detail:
        e.kind === 'printer'
          ? `$${e.cash} ready · ${owner}`
          : e.kind === 'shipment' || e.kind === 'microwave'
            ? `${e.stock} in stock · $${e.price} each · ${owner}`
            : `Owned by ${owner}${e.frozen ? ' · Frozen' : ''}`,
      hint:
        e.kind === 'printer'
          ? 'E  Collect / confiscate     C  Options'
          : ['shipment', 'microwave', 'money'].includes(e.kind)
            ? 'E  Use / buy     C  Options'
            : me.weapon === 'physgun'
              ? 'Hold LMB  Grab     RMB  Freeze'
              : 'Equip Physics Gun to move · Q for tools',
    };
  }
  for (const p of state.players) {
    if (p.id === myId || p.deadUntil) continue;
    const t = rayBox(origin, dir, { x: p.x, y: p.y + 0.9, z: p.z, w: 0.65, h: 1.8, d: 0.65 }, nearest);
    if (t === null) continue;
    nearest = t;
    target = {
      kind: 'player',
      id: p.id,
      title: p.name,
      detail: `${JOBS[p.job].name}${p.wantedUntil ? ` · WANTED: ${p.wantedReason}` : ''}`,
      hint: 'Y  Talk     /give amount  Give money',
    };
  }
  return target;
}
document.addEventListener('keydown', (event) => {
  if (event.code === 'Escape') {
    if (ui.chatOpen) {
      event.preventDefault();
      ui.closeChat();
    } else if (ui.menu) {
      event.preventDefault();
      ui.close();
    } else if (fallbackActive) ui.open('pause');
    return;
  }
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName)) return;
  if (event.repeat) return;
  const menus: Record<string, string> = {
    F1: 'help',
    F4: 'jobs',
    KeyQ: 'build',
    Tab: 'players',
    KeyC: 'context',
  };
  if (menus[event.code] && (ui.playing || event.code === 'F1')) {
    event.preventDefault();
    ui.open(menus[event.code]);
    return;
  }
  if (!ui.playing || !me || ui.menu) return;
  if (event.code === 'KeyY' || event.code === 'Enter') {
    event.preventDefault();
    ui.openChat();
    return;
  }
  if (!controlsActive()) return;
  if (['Space', 'ControlLeft', 'ControlRight'].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (/^Digit[1-9]$/.test(event.code)) {
    const w = me.weapons[Number(event.code.slice(-1)) - 1];
    if (w) action('equip', w);
  }
  if (event.code === 'KeyE') {
    const t = aim();
    if (t) action('interact', t.id);
  }
  if (event.code === 'KeyR') action(me.holding ? 'rotate' : 'reload');
  if (event.code === 'KeyF') action('fade');
  if (event.code === 'KeyZ') action('undo');
});
document.addEventListener('keyup', (event) => keys.delete(event.code));
document.addEventListener('mousemove', (event) => {
  if (!(locked() || (fallbackActive && fallbackDrag)) || ui.menu || ui.chatOpen) return;
  yaw = (yaw - event.movementX * 0.002 * ui.settings.sensitivity) % (Math.PI * 2);
  pitch = THREE.MathUtils.clamp(pitch - event.movementY * 0.002 * ui.settings.sensitivity, -1.48, 1.48);
});
document.addEventListener('pointerlockchange', () => {
  if (locked()) {
    fallbackActive = false;
  } else {
    keys.clear();
    mouseDown = false;
    action('release');
    setTimeout(() => {
      if (ui.playing && !ui.menu && !ui.chatOpen) ui.open('pause');
    }, 40);
  }
});
renderer.domElement.addEventListener('click', () => {
  if (ui.playing && !ui.menu && !ui.chatOpen && !controlsActive()) lock();
});
document.addEventListener('mousedown', (event) => {
  if (!controlsActive() || ui.menu || ui.chatOpen || !me) return;
  if (fallbackActive && event.button === 2) {
    fallbackDrag = true;
    return;
  }
  if (fallbackActive && event.button === 0 && event.altKey) {
    action('secondary');
    return;
  }
  if (event.button === 0) {
    mouseDown = true;
    nextFire = performance.now() + WEAPONS[me.weapon].delay;
    action('primary');
  }
  if (event.button === 2) action('secondary');
});
document.addEventListener('mouseup', (event) => {
  if (event.button === 2) fallbackDrag = false;
  if (event.button === 0) {
    mouseDown = false;
    if (me?.weapon === 'physgun') action('release');
  }
});
document.addEventListener('contextmenu', (event) => {
  if (ui.playing) event.preventDefault();
});
document.addEventListener(
  'wheel',
  (event) => {
    if (!controlsActive() || !me) return;
    event.preventDefault();
    if (me.holding) action('distance', undefined, event.deltaY > 0 ? 0.5 : -0.5);
    else {
      const i = me.weapons.indexOf(me.weapon),
        next = (i + (event.deltaY > 0 ? 1 : -1) + me.weapons.length) % me.weapons.length;
      action('equip', me.weapons[next]);
    }
  },
  { passive: false },
);
window.addEventListener('blur', releaseControls);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) releaseControls();
});
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  viewCamera.aspect = camera.aspect;
  viewCamera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
renderer.domElement.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  ui.notice('Graphics context lost. Reload the page to reconnect.', 'error');
  releaseControls();
});

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  elapsed += dt;
  accumulator = Math.min(accumulator + dt, 0.12);
  hudTimer += dt;
  if (me && state && ui.playing) {
    while (accumulator >= 1 / TICK_RATE) {
      accumulator -= 1 / TICK_RATE;
      const input = makeInput();
      send({ type: 'input', input });
      lastInputTime = now;
      if (!me.deadUntil && !me.arrestedUntil) movePlayer(predicted, input, 1 / TICK_RATE, colliders());
      pending.push(input);
      if (pending.length > 90) pending.shift();
    }
    if (Date.now() - lastPing > 3000) {
      lastPing = Date.now();
      send({ type: 'ping', time: lastPing });
    }
    if (mouseDown && WEAPONS[me.weapon].damage && now >= nextFire) {
      action('primary');
      nextFire = now + WEAPONS[me.weapon].delay;
    }
    const moving =
      controlsActive() &&
      !ui.menu &&
      (keys.has('KeyW') || keys.has('KeyS') || keys.has('KeyA') || keys.has('KeyD')) &&
      predicted.grounded;
    stepTimer += dt;
    if (moving && stepTimer > (keys.has('ShiftLeft') ? 0.29 : 0.43)) {
      audio.footstep();
      stepTimer = 0;
    }
    const bob = moving ? Math.sin(elapsed * (keys.has('ShiftLeft') ? 18 : 12)) * 0.025 : 0;
    const targetCamera = new THREE.Vector3(
      predicted.x,
      predicted.y + (me.crouch ? 1.02 : EYE_HEIGHT) + bob,
      predicted.z,
    );
    cameraPos.lerp(targetCamera, 1 - Math.exp(-25 * dt));
    camera.position.copy(cameraPos);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    for (const e of state.entities) {
      const visual = entityVisuals.get(e.id);
      if (visual) {
        visual.position.lerp(new THREE.Vector3(e.x, e.y, e.z), 1 - Math.exp(-18 * dt));
        visual.quaternion.slerp(new THREE.Quaternion(e.q.x, e.q.y, e.q.z, e.q.w), 1 - Math.exp(-18 * dt));
      }
    }
    for (const other of state.players) {
      const a = avatars.get(other.id);
      if (a) updateAvatar(a, other, dt, cameraPos);
    }
    if (hudTimer > 0.1) {
      hudTimer = 0;
      ui.update(
        { ...state, time: serverNow() },
        { ...me, x: predicted.x, y: predicted.y, z: predicted.z },
        ping,
      );
      ui.target(aim());
    }
    let model = models.get(me.weapon);
    if (!model) {
      model = makeViewmodel(me.weapon);
      model.scale.setScalar(0.68);
      models.set(me.weapon, model);
      viewScene.add(model);
    }
    for (const [id, group] of models) group.visible = id === me.weapon;
    recoil = Math.max(0, recoil - dt * 7);
    model.position.set(
      0.31 + Math.cos(elapsed * 6) * (moving ? 0.012 : 0.002),
      -0.28 + bob * 0.65 - recoil * 0.015,
      -0.78 + recoil * 0.08,
    );
    model.rotation.set(recoil * 0.08, -0.05, -0.025 + bob * 0.3);
    const held = me.holding ? entityVisuals.get(me.holding) : undefined;
    beam.visible = !!held;
    if (held) {
      const start = new THREE.Vector3(0.3, -0.27, -1.13)
        .applyQuaternion(camera.quaternion)
        .add(camera.position);
      const pos = beam.geometry.attributes.position;
      pos.setXYZ(0, start.x, start.y, start.z);
      pos.setXYZ(1, held.position.x, held.position.y, held.position.z);
      pos.needsUpdate = true;
    }
    ui.el('progress').hidden = progressEnd <= serverNow();
    if (progressEnd > serverNow())
      (ui.el('progress').querySelector('progress') as HTMLProgressElement).value =
        (serverNow() - progressStart) / (progressEnd - progressStart);
    if (now - connectedAt > 1000 && now - lastInputTime > 1000) keys.clear();
  } else {
    accumulator = 0;
    camera.position.set(8.5 + Math.sin(elapsed * 0.045) * 0.9, 4.7, 28);
    camera.lookAt(-4, 3, -12);
  }
  for (let i = shotLines.length - 1; i >= 0; i--)
    if (shotLines[i].until <= now) {
      const { object } = shotLines.splice(i, 1)[0];
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
      object.removeFromParent();
    }
  city.update(elapsed, dt);
  renderer.autoClear = true;
  renderer.render(scene, camera);
  if (ui.playing && me && !me.deadUntil && !ui.menu && !ui.chatOpen) {
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(viewScene, viewCamera);
  }
}
requestAnimationFrame(frame);

// Read-only, development-only telemetry for reproducible browser QA. No game authority lives here.
if (import.meta.env.DEV)
  Object.defineProperty(window, '__OPENRP_DEBUG__', {
    get: () => ({
      me,
      state,
      predicted: { ...predicted },
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      locked: locked(),
      menu: ui.menu,
      entities: entityVisuals.size,
      avatars: avatars.size,
    }),
  });
