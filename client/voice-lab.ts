import { ProximityVoice } from './voice.ts';
import { applyDelta } from '../shared/replication.ts';
import type { ServerMessage, Snapshot } from '../shared/types.ts';

if (!import.meta.env.DEV) throw new Error('Voice lab is development-only');
const output = document.getElementById('results')!;
const button = document.getElementById('run') as HTMLButtonElement;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const sockets: WebSocket[] = [];
const voices: ProximityVoice[] = [];
let synthesis: AudioContext | undefined;
let stopped = false;
const log = (text: string) => {
  output.textContent += `\n${text}`;
};
const waitFor = async (condition: () => boolean, description: string) => {
  const until = performance.now() + 6000;
  while (!condition()) {
    if (stopped || performance.now() > until) throw new Error(description);
    await sleep(25);
  }
};

async function join(voice: ProximityVoice, name: string): Promise<string> {
  let id = '';
  let state: Snapshot | undefined;
  const ws = new WebSocket(`ws://${location.host}/ws`);
  sockets.push(ws);
  ws.onopen = () => ws.send(JSON.stringify({ type: 'join', name }));
  ws.onmessage = ({ data }) => {
    const msg: ServerMessage = JSON.parse(data);
    if (msg.type === 'welcome') {
      id = msg.id;
      voice.connect(id, msg.voiceTicket);
    }
    if (msg.type === 'state') state = msg;
    if (msg.type === 'delta' && state) state = applyDelta(state, msg);
    const me = state?.players.find((p) => p.id === id);
    if (me && state) {
      voice.updateWorld(me, state.players);
      voice.updateListener({ x: me.x, y: me.y + 1.63, z: me.z }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 });
    }
  };
  await waitFor(() => !!state && voice.status.connected, 'Voice connection failed');
  return id;
}

function stop(): void {
  stopped = true;
  voices.forEach((v) => v.disconnect());
  voices.length = 0;
  sockets.forEach((s) => s.close());
  sockets.length = 0;
  void synthesis?.close();
  synthesis = undefined;
}
document.getElementById('stop')!.onclick = () => {
  stop();
  log('Stopped. All synthetic audio tracks released.');
};
window.addEventListener('pagehide', stop);
button.onclick = async () => {
  button.disabled = true;
  stopped = false;
  output.textContent = 'Running synthetic audio checks…';
  try {
    synthesis = new AudioContext();
    await synthesis.resume();
    const oscillator = synthesis.createOscillator();
    oscillator.frequency.value = 440;
    const gain = synthesis.createGain();
    gain.gain.value = 0.14;
    const destination = synthesis.createMediaStreamDestination();
    oscillator.connect(gain).connect(destination);
    oscillator.start();
    const a = new ProximityVoice(async () => destination.stream);
    const b = new ProximityVoice(async () => {
      throw new Error('Listener must never request a microphone');
    });
    voices.push(a, b);
    for (const v of voices) {
      v.onNotice = (message) => log(`NOTICE: ${message}`);
      v.setVolume(0.12);
    }
    await Promise.all(voices.map((v) => v.prepare()));
    const aId = await join(a, 'Synthetic Speaker');
    await join(b, 'Synthetic Listener');
    await a.enableMicrophone();
    await sleep(200);
    if (a.diagnostics.sent !== 0) throw new Error('Microphone transmitted before push-to-talk');
    log('PASS · Microphone sends no audio before push-to-talk.');
    a.setTalking(true);
    let peak = 0;
    for (let i = 0; i < 50; i++) {
      await sleep(40);
      peak = Math.max(peak, b.diagnostics.rms);
    }
    if (a.diagnostics.sent < 50 || b.diagnostics.received < 40 || peak < 0.0005)
      throw new Error(`Audio path failed: ${JSON.stringify({ a: a.diagnostics, b: b.diagnostics, peak })}`);
    log(
      `PASS · Actual AudioWorklet → WebSocket relay → spatial audio output: ${a.diagnostics.sent} sent, ${b.diagnostics.received} played; peak RMS ${peak.toFixed(5)}.`,
    );
    log(`Browser audio device: ${a.diagnostics.sampleRate} Hz; voice transport: 16000 Hz.`);
    b.toggleMute(aId);
    await sleep(250);
    const mutedAt = b.diagnostics.received;
    await sleep(250);
    if (b.diagnostics.received !== mutedAt || b.diagnostics.rms > 0.00001)
      throw new Error('Individual mute did not silence output');
    log('PASS · Individual mute stops incoming audio and clears queued playback.');
    b.toggleMute(aId);
    await waitFor(() => b.diagnostics.received > mutedAt + 5, 'Unmute did not resume audio');
    b.toggleDeafened();
    await sleep(250);
    if (b.diagnostics.rms > 0.00001) throw new Error('Deafen did not silence output');
    log('PASS · Mute all voice silences playback.');
    b.toggleDeafened();
    a.setTalking(false);
    const releasedAt = a.diagnostics.sent;
    await sleep(200);
    if (a.diagnostics.sent !== releasedAt) throw new Error('Push-to-talk release continued sending');
    log('PASS · Releasing push-to-talk stops transmission.');
    a.disableMicrophone();
    if (destination.stream.getAudioTracks().some((track) => track.readyState !== 'ended'))
      throw new Error('Microphone track was not released');
    log('PASS · Disabling microphone stops its media track.');
    log('ALL BROWSER VOICE CHECKS PASSED. No real microphone was accessed.');
  } catch (error) {
    log(`FAIL · ${(error as Error).message}`);
  } finally {
    stop();
    button.disabled = false;
  }
};
