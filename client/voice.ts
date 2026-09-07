import workletUrl from './voice-worklet.ts?worker&url';
import {
  decodeVoiceFrame,
  encodeVoiceFrame,
  inVoiceRange,
  PLAYER_ID_PATTERN,
  VOICE_BACKLOG_BYTES,
  VOICE_RANGE,
  VOICE_SAMPLE_RATE,
} from '../shared/voice.ts';
import type { Player, Vec3 } from '../shared/types.ts';

export interface VoiceStatus {
  connected: boolean;
  microphone: 'off' | 'requesting' | 'ready' | 'blocked' | 'unsupported';
  talking: boolean;
  deafened: boolean;
  level: number;
  speakers: { id: string; name: string }[];
  muted: ReadonlySet<string>;
}
interface Speaker {
  panner: PannerNode;
  sources: Set<AudioBufferSourceNode>;
  nextTime: number;
  lastHeard: number;
  sequence: number;
}

export class ProximityVoice {
  onChange: (status: VoiceStatus) => void = () => {};
  onNotice: (message: string) => void = () => {};
  private context?: AudioContext;
  private master?: GainNode;
  private analyser?: AnalyserNode;
  private prepared?: Promise<void>;
  private audioReady = false;
  private capture?: AudioWorkletNode;
  private source?: MediaStreamAudioSourceNode;
  private filter?: BiquadFilterNode;
  private stream?: MediaStream;
  private microphone: VoiceStatus['microphone'] = 'off';
  private request = 0;
  private talking = false;
  private deafened = false;
  private volume = 0.8;
  private level = 0;
  private connected = false;
  private socket?: WebSocket;
  private reconnect?: ReturnType<typeof setTimeout>;
  private ticket = '';
  private myId = '';
  private me?: Player;
  private players = new Map<string, Player>();
  private peers = new Map<string, Speaker>();
  private muted = new Set<string>();
  private sequence = 0;
  private sent = 0;
  private received = 0;

  constructor(
    private getMicrophone: () => Promise<MediaStream> = () =>
      navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      }),
  ) {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem('openrp-voice-mutes') ?? '[]');
      if (Array.isArray(saved))
        this.muted = new Set(
          saved.filter((id) => typeof id === 'string' && PLAYER_ID_PATTERN.test(id)).slice(-1000),
        );
    } catch {
      /* Ignore invalid local preferences. */
    }
  }

  get status(): VoiceStatus {
    return {
      connected: this.connected,
      microphone: this.microphone,
      talking: this.talking,
      deafened: this.deafened,
      level: this.level,
      muted: this.muted,
      speakers: [...this.peers]
        .filter(([, peer]) => performance.now() - peer.lastHeard < 220)
        .map(([id]) => ({ id, name: this.players.get(id)?.name ?? 'Resident' })),
    };
  }

  // Read-only measurements for the development voice lab; no audio is recorded.
  get diagnostics(): { sent: number; received: number; rms: number; sampleRate: number } {
    const samples = new Float32Array(256);
    this.analyser?.getFloatTimeDomainData(samples);
    const rms = Math.sqrt(samples.reduce((sum, n) => sum + n * n, 0) / samples.length);
    return { sent: this.sent, received: this.received, rms, sampleRate: this.context?.sampleRate ?? 0 };
  }

  private changed(): void {
    this.onChange(this.status);
  }

  async prepare(): Promise<void> {
    if (!window.isSecureContext || !window.AudioContext || !window.AudioWorkletNode) {
      this.microphone = 'unsupported';
      this.changed();
      return;
    }
    if (!this.context) {
      const context = (this.context = new AudioContext({ latencyHint: 'interactive' }));
      this.master = context.createGain();
      this.master.gain.value = this.deafened ? 0 : this.volume;
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.knee.value = 12;
      limiter.ratio.value = 8;
      this.analyser = context.createAnalyser();
      this.analyser.fftSize = 256;
      this.master.connect(limiter).connect(this.analyser).connect(context.destination);
      this.prepared = context.audioWorklet.addModule(workletUrl);
      context.onstatechange = () => {
        if (context.state !== 'running') this.setTalking(false);
      };
    }
    try {
      // resume() runs in the Join/Enable click, before any asynchronous continuation.
      await Promise.all([this.context.resume(), this.prepared]);
      this.audioReady = true;
    } catch {
      this.microphone = 'unsupported';
      this.onNotice('Voice audio could not start. Try a current desktop browser over HTTPS.');
      this.changed();
    }
  }

  connect(id: string, ticket: string): void {
    this.disconnect();
    this.myId = id;
    this.ticket = ticket;
    this.openSocket();
  }

  private openSocket(): void {
    if (!this.ticket) return;
    const socket = (this.socket = new WebSocket(
      `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/voice`,
    ));
    socket.binaryType = 'arraybuffer';
    socket.onopen = () => socket.send(JSON.stringify({ type: 'join', ticket: this.ticket }));
    socket.onmessage = ({ data }) => {
      if (this.socket !== socket) return;
      if (data instanceof ArrayBuffer) {
        this.receive(data);
        return;
      }
      try {
        if (JSON.parse(data).type === 'ready') {
          this.connected = true;
          this.configure();
          this.changed();
        }
      } catch {
        /* Ignore unrecognized server control messages. */
      }
    };
    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      this.connected = false;
      this.disableMicrophone();
      this.clearSpeakers();
      this.changed();
      if (this.ticket && event.code !== 1008) this.reconnect = setTimeout(() => this.openSocket(), 3000);
      else if (this.ticket) this.onNotice('Voice connection unavailable. Rejoin the district to retry.');
    };
    socket.onerror = () => {
      /* close handles retries; the game socket is independent. */
    };
  }

  disconnect(): void {
    this.ticket = '';
    clearTimeout(this.reconnect);
    this.connected = false;
    this.disableMicrophone();
    const socket = this.socket;
    this.socket = undefined;
    socket?.close();
    this.clearSpeakers();
    this.players.clear();
    this.me = undefined;
    this.changed();
  }

  async enableMicrophone(): Promise<void> {
    if (!this.connected || this.microphone === 'requesting') return;
    const request = ++this.request;
    this.microphone = 'requesting';
    this.changed();
    let stream: MediaStream | undefined;
    try {
      const prepared = this.prepare();
      // Only this explicit button action ever asks the browser for microphone access.
      stream = await this.getMicrophone();
      stream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
      await prepared;
      if (request !== this.request || !this.connected) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      if (!this.context || !this.audioReady || !stream.getAudioTracks().length)
        throw new Error('Microphone unavailable');
      this.stream = stream;
      this.source = this.context.createMediaStreamSource(stream);
      this.filter = this.context.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 7000;
      this.capture = new AudioWorkletNode(this.context, 'openrp-voice-capture', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
      });
      this.capture.port.onmessage = ({ data }: MessageEvent<Float32Array>) => {
        if (
          !this.talking ||
          !this.connected ||
          !this.socket ||
          this.socket.readyState !== WebSocket.OPEN ||
          this.socket.bufferedAmount > VOICE_BACKLOG_BYTES
        )
          return;
        this.socket.send(encodeVoiceFrame(data, ++this.sequence));
        this.sent++;
        this.level = Math.min(1, Math.sqrt(data.reduce((sum, n) => sum + n * n, 0) / data.length) * 4);
      };
      this.capture.onprocessorerror = () => {
        this.disableMicrophone();
        this.onNotice('Microphone audio stopped. Enable your microphone to try again.');
      };
      this.source.connect(this.filter).connect(this.capture).connect(this.context.destination);
      for (const track of stream.getAudioTracks())
        track.onended = () => {
          this.disableMicrophone();
          this.onNotice('Your microphone was disconnected. Enable it to try again.');
        };
      this.microphone = 'ready';
      this.changed();
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      if (request !== this.request) return;
      this.disableMicrophone();
      this.microphone = 'blocked';
      const name = (error as DOMException).name;
      this.onNotice(
        name === 'NotAllowedError'
          ? 'Microphone permission was denied. Allow the microphone in your browser’s site settings, then retry.'
          : name === 'NotFoundError'
            ? 'No microphone found. Connect one and retry.'
            : 'Could not open the microphone. Check your device and browser permissions, then retry.',
      );
      this.changed();
    }
  }

  disableMicrophone(): void {
    ++this.request;
    this.setTalking(false);
    this.capture?.disconnect();
    this.capture?.port.close();
    this.source?.disconnect();
    this.filter?.disconnect();
    this.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    this.capture = undefined;
    this.source = undefined;
    this.filter = undefined;
    this.stream = undefined;
    if (this.microphone !== 'unsupported') this.microphone = 'off';
    this.changed();
  }

  setTalking(wanted: boolean): void {
    const active =
      wanted &&
      this.connected &&
      this.microphone === 'ready' &&
      !this.deafened &&
      !!this.me &&
      !this.me.deadUntil &&
      this.context?.state === 'running';
    if (active === this.talking) return;
    this.talking = active;
    this.level = 0;
    this.stream?.getAudioTracks().forEach((track) => {
      track.enabled = active;
    });
    this.capture?.port.postMessage(active);
    this.configure();
    this.changed();
  }

  setVolume(value: number): void {
    this.volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.8;
    if (this.master && this.context)
      this.master.gain.setTargetAtTime(this.deafened ? 0 : this.volume, this.context.currentTime, 0.015);
  }

  toggleDeafened(): void {
    this.deafened = !this.deafened;
    if (this.deafened) {
      this.setTalking(false);
      this.clearSpeakers();
    } else void this.prepare();
    this.setVolume(this.volume);
    this.configure();
    this.changed();
  }

  toggleMute(id: string): void {
    if (!PLAYER_ID_PATTERN.test(id) || id === this.myId) return;
    if (this.muted.has(id)) this.muted.delete(id);
    else {
      this.muted.add(id);
      this.removeSpeaker(id);
    }
    try {
      localStorage.setItem('openrp-voice-mutes', JSON.stringify([...this.muted].slice(-1000)));
    } catch {
      /* Muting still works when browser storage is unavailable. */
    }
    this.configure();
    this.changed();
  }

  private configure(): void {
    if (!this.connected || this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(
      JSON.stringify({
        type: 'config',
        listening: !this.deafened && !!this.me && !this.me.deadUntil,
        transmitting: this.talking,
        muted: [...this.muted].filter((id) => this.players.has(id)).slice(-1000),
      }),
    );
  }

  updateWorld(me: Player, players: Player[]): void {
    const changed =
      !this.me ||
      !!this.me.deadUntil !== !!me.deadUntil ||
      players.some((p) => !this.players.has(p.id) && this.muted.has(p.id));
    this.me = me;
    this.players = new Map(players.map((p) => [p.id, p]));
    if (me.deadUntil) this.setTalking(false);
    for (const [id] of this.peers) {
      const player = this.players.get(id);
      if (!player || player.deadUntil || me.deadUntil || !inVoiceRange(me, player)) this.removeSpeaker(id);
    }
    if (changed) this.configure();
  }

  updateListener(position: Vec3, forward: Vec3, up: Vec3): void {
    const context = this.context;
    if (!context) return;
    const listener = context.listener;
    for (const axis of ['X', 'Y', 'Z'] as const) {
      const key = axis.toLowerCase() as 'x' | 'y' | 'z';
      listener[`position${axis}`].setTargetAtTime(position[key], context.currentTime, 0.02);
      listener[`forward${axis}`].setTargetAtTime(forward[key], context.currentTime, 0.02);
      listener[`up${axis}`].setTargetAtTime(up[key], context.currentTime, 0.02);
    }
    for (const [id, peer] of this.peers) {
      const player = this.players.get(id);
      if (!player || performance.now() - peer.lastHeard > 1000) {
        this.removeSpeaker(id);
        continue;
      }
      peer.panner.positionX.setTargetAtTime(player.x, context.currentTime, 0.03);
      peer.panner.positionY.setTargetAtTime(
        player.y + (player.crouch ? 1.02 : 1.63),
        context.currentTime,
        0.03,
      );
      peer.panner.positionZ.setTargetAtTime(player.z, context.currentTime, 0.03);
    }
    this.changed();
  }

  private receive(packet: ArrayBuffer): void {
    const context = this.context;
    if (
      !context ||
      context.state !== 'running' ||
      !this.master ||
      this.deafened ||
      !this.me ||
      this.me.deadUntil
    )
      return;
    const frame = decodeVoiceFrame(packet);
    if (!frame || frame.id === this.myId || this.muted.has(frame.id)) return;
    const player = this.players.get(frame.id);
    if (!player || player.deadUntil || !inVoiceRange(player, this.me)) return;
    let peer = this.peers.get(frame.id);
    if (!peer) {
      const panner = context.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'linear';
      panner.refDistance = 2;
      panner.maxDistance = VOICE_RANGE;
      panner.rolloffFactor = 1;
      panner.positionX.value = player.x;
      panner.positionY.value = player.y + (player.crouch ? 1.02 : 1.63);
      panner.positionZ.value = player.z;
      panner.connect(this.master);
      peer = { panner, sources: new Set(), nextTime: 0, lastHeard: 0, sequence: (frame.sequence - 1) >>> 0 };
      this.peers.set(frame.id, peer);
    }
    const delta = (frame.sequence - peer.sequence) >>> 0;
    if (!delta || delta > 0x7fffffff) return;
    peer.sequence = frame.sequence;
    // Bound latency after jitter/bursts instead of replaying an ever-growing backlog.
    if (peer.nextTime - context.currentTime > 0.16) return;
    this.received++;
    peer.lastHeard = performance.now();
    const buffer = context.createBuffer(1, frame.samples.length, VOICE_SAMPLE_RATE);
    buffer.getChannelData(0).set(frame.samples);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(peer.panner);
    const start = peer.nextTime < context.currentTime + 0.005 ? context.currentTime + 0.06 : peer.nextTime;
    peer.nextTime = start + buffer.duration;
    peer.sources.add(source);
    source.onended = () => {
      peer.sources.delete(source);
      source.disconnect();
    };
    source.start(start);
  }

  private removeSpeaker(id: string): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    for (const source of peer.sources) {
      source.stop();
      source.disconnect();
    }
    peer.panner.disconnect();
    this.peers.delete(id);
  }

  private clearSpeakers(): void {
    for (const id of this.peers.keys()) this.removeSpeaker(id);
  }
}
