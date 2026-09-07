import type { Vec3 } from './types.ts';

// Small, independent PCM frames work on every AudioWorklet-capable browser.
// Audio travels on its own socket, so a slow audio listener cannot stall game updates.
export const VOICE_RANGE = 28;
export const VOICE_SAMPLE_RATE = 16_000;
export const VOICE_SAMPLES = 320;
export const VOICE_FRAME_MS = 20;
export const VOICE_HEADER_BYTES = 8;
export const VOICE_FRAME_BYTES = VOICE_HEADER_BYTES + VOICE_SAMPLES * 2;
export const VOICE_ID_BYTES = 36;
export const VOICE_BACKLOG_BYTES = 8_192;
export const PLAYER_ID_PATTERN = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

export function inVoiceRange(a: Vec3, b: Vec3): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < VOICE_RANGE;
}

export function validVoiceFrame(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength === VOICE_FRAME_BYTES &&
    bytes[0] === 0x4f &&
    bytes[1] === 0x56 &&
    bytes[2] === 1 &&
    bytes[3] === 0
  );
}

export function encodeVoiceFrame(samples: Float32Array, sequence: number): ArrayBuffer {
  if (samples.length !== VOICE_SAMPLES) throw new Error('Invalid voice frame length');
  const packet = new ArrayBuffer(VOICE_FRAME_BYTES);
  const bytes = new Uint8Array(packet);
  bytes.set([0x4f, 0x56, 1, 0]);
  const view = new DataView(packet);
  view.setUint32(4, sequence >>> 0, true);
  for (let i = 0; i < samples.length; i++) {
    const value = Number.isFinite(samples[i]) ? Math.max(-1, Math.min(1, samples[i])) : 0;
    view.setInt16(VOICE_HEADER_BYTES + i * 2, Math.round(value * 32767), true);
  }
  return packet;
}

export function identifyVoiceFrame(id: string, frame: Uint8Array): Uint8Array {
  const packet = new Uint8Array(VOICE_ID_BYTES + frame.byteLength);
  packet.set(new TextEncoder().encode(id));
  packet.set(frame, VOICE_ID_BYTES);
  return packet;
}

export function decodeVoiceFrame(
  packet: ArrayBuffer,
): { id: string; sequence: number; samples: Float32Array } | undefined {
  if (packet.byteLength !== VOICE_ID_BYTES + VOICE_FRAME_BYTES) return;
  const bytes = new Uint8Array(packet);
  if (!validVoiceFrame(bytes.subarray(VOICE_ID_BYTES))) return;
  const id = new TextDecoder().decode(bytes.subarray(0, VOICE_ID_BYTES));
  if (!PLAYER_ID_PATTERN.test(id)) return;
  const view = new DataView(packet, VOICE_ID_BYTES);
  const samples = new Float32Array(VOICE_SAMPLES);
  for (let i = 0; i < samples.length; i++)
    samples[i] = view.getInt16(VOICE_HEADER_BYTES + i * 2, true) / 32768;
  return { id, sequence: view.getUint32(4, true), samples };
}
