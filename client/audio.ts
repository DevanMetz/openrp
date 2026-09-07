import type { Vec3, WeaponId } from '../shared/types.ts';

export class GameAudio {
  context?: AudioContext;
  master?: GainNode;
  noise?: AudioBuffer;
  volume = 0.45;
  init(): void {
    if (this.context) {
      void this.context.resume();
      return;
    }
    const ctx = (this.context = new AudioContext());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const ambient = ctx.createBufferSource();
    ambient.buffer = this.noise;
    ambient.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180;
    const gain = ctx.createGain();
    gain.gain.value = 0.036;
    ambient.connect(filter).connect(gain).connect(this.master);
    ambient.start();
  }
  setVolume(value: number): void {
    this.volume = value;
    if (this.master) this.master.gain.value = value;
  }
  tone(
    frequency: number,
    duration: number,
    volume = 0.12,
    type: OscillatorType = 'sine',
    end = frequency,
  ): void {
    const c = this.context;
    if (!c || !this.master) return;
    const o = c.createOscillator(),
      gain = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(frequency, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, end), c.currentTime + duration);
    gain.gain.setValueAtTime(volume, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
    o.connect(gain).connect(this.master);
    o.start();
    o.stop(c.currentTime + duration);
  }
  burst(duration: number, volume: number, frequency = 1200): void {
    const c = this.context;
    if (!c || !this.noise || !this.master) return;
    const n = c.createBufferSource(),
      g = c.createGain(),
      f = c.createBiquadFilter();
    n.buffer = this.noise;
    f.type = 'lowpass';
    f.frequency.value = frequency;
    g.gain.setValueAtTime(volume, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
    n.connect(f).connect(g).connect(this.master);
    n.start();
    n.stop(c.currentTime + duration);
  }
  footstep(): void {
    this.burst(0.085, 0.13, 700);
    this.tone(100, 0.07, 0.025, 'sine', 45);
  }
  shot(weapon: WeaponId, gain = 1): void {
    this.burst(weapon === 'shotgun' ? 0.25 : 0.12, 0.46 * gain, 3600);
    this.tone(weapon === 'shotgun' ? 120 : 160, 0.12, 0.2 * gain, 'triangle', 40);
  }
  effect(sound: string, gain = 1): void {
    if (sound === 'cash') {
      this.tone(880, 0.13, 0.08 * gain);
      setTimeout(() => this.tone(1320, 0.18, 0.06 * gain), 70);
    }
    if (sound === 'door') {
      this.burst(0.18, 0.16 * gain, 450);
      this.tone(160, 0.1, 0.04 * gain, 'triangle', 55);
    }
    if (sound === 'arrest') {
      this.tone(520, 0.35, 0.12 * gain, 'triangle', 250);
    }
    if (sound === 'heal') this.tone(600, 0.2, 0.06 * gain, 'sine', 900);
    if (sound === 'break') this.burst(0.35, 0.3 * gain, 2300);
  }
  distanceGain(a: Vec3, b: Vec3): number {
    return Math.max(0, 1 - Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) / 65);
  }
}
