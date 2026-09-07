import { VOICE_SAMPLE_RATE, VOICE_SAMPLES } from '../shared/voice.ts';

declare const sampleRate: number;
declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  abstract process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
}
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

class VoiceCapture extends AudioWorkletProcessor {
  private active = false;
  private frame = new Float32Array(VOICE_SAMPLES);
  private cursor = 0;
  private phase = 0;
  private sum = 0;
  private weight = 0;

  constructor() {
    super();
    this.port.onmessage = ({ data }) => {
      this.active = data === true;
      this.cursor = this.phase = this.sum = this.weight = 0;
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    if (!this.active || !input) return true;
    // Integrate fractional sample intervals; handles both 44.1 and 48 kHz devices.
    const ratio = VOICE_SAMPLE_RATE / sampleRate;
    for (let i = 0; i < input.length; i++) {
      let remaining = ratio;
      while (remaining > 1e-8) {
        const part = Math.min(1 - this.phase, remaining);
        this.sum += input[i] * part;
        this.weight += part;
        this.phase += part;
        remaining -= part;
        if (this.phase >= 1 - 1e-8) {
          this.frame[this.cursor++] = this.sum / this.weight;
          this.phase = this.sum = this.weight = 0;
          if (this.cursor === VOICE_SAMPLES) {
            this.port.postMessage(this.frame, [this.frame.buffer]);
            this.frame = new Float32Array(VOICE_SAMPLES);
            this.cursor = 0;
          }
        }
      }
    }
    // Outputs remain zero: the local microphone is never monitored through speakers.
    return true;
  }
}

registerProcessor('openrp-voice-capture', VoiceCapture);
