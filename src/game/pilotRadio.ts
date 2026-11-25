import type { HelicopterAudio } from './audio';
import type { RadioChannel, RadioPriority, RadioTransmission, TargetKind } from './types';

export type PilotRadioEvent =
  | 'mission_start'
  | 'low_rockets'
  | 'rockets_empty'
  | 'cannon_overheat'
  | 'incoming_missile'
  | 'flares_deployed'
  | 'flares_spoofed'
  | 'target_destroyed'
  | 'stage_2'
  | 'stage_3'
  | 'shielded_hit'
  | 'low_altitude'
  | 'victory';

interface RadioEventSpec {
  callsign: RadioChannel;
  frequency: string;
  priority: RadioPriority;
  priorityRank: number;
  cooldownSec: number;
  lines: string[];
}

interface QueuedTransmission {
  event: PilotRadioEvent;
  callsign: RadioChannel;
  frequency: string;
  priority: RadioPriority;
  priorityRank: number;
  text: string;
}

const EVENT_SPECS: Record<Exclude<PilotRadioEvent, 'target_destroyed'>, RadioEventSpec> = {
  mission_start: {
    callsign: 'VIPER 1-1',
    frequency: 'VHF 124.8',
    priority: 'normal',
    priorityRank: 1,
    cooldownSec: 10,
    lines: [
      'Viper one-one on station. Weapons hot, engaging monolith perimeter.',
      'Viper one-one entering killbox. Cleared hot on outer emplacements.',
    ],
  },
  low_rockets: {
    callsign: 'VIPER 1-1',
    frequency: 'VHF 124.8',
    priority: 'caution',
    priorityRank: 2,
    cooldownSec: 16,
    lines: [
      'Caution, Hydra pods running low. Conserve salvos.',
      'Low rockets! Switching primary fire to thirty mike-mike.',
      'Ammo advisory — Hydra pods nearly dry.',
    ],
  },
  rockets_empty: {
    callsign: 'VIPER 1-1',
    frequency: 'VHF 124.8',
    priority: 'caution',
    priorityRank: 2,
    cooldownSec: 12,
    lines: [
      'Winchester on Hydra rockets! Recharging pods.',
      'Rockets depleted! Going guns only until reload.',
    ],
  },
  cannon_overheat: {
    callsign: 'VIPER 1-1',
    frequency: 'VHF 124.8',
    priority: 'caution',
    priorityRank: 2,
    cooldownSec: 11,
    lines: [
      'Thirty mike-mike overheated! Holding fire to cool barrel.',
      'Chain gun thermal limit reached — easing off the trigger.',
      'Cannon hot! Letting the M-230 cool down.',
    ],
  },
  incoming_missile: {
    callsign: 'RWR BETTY',
    frequency: 'GUARD 243.0',
    priority: 'critical',
    priorityRank: 3,
    cooldownSec: 15,
    lines: [
      'Missile warning! Radar lock detected — deploy countermeasures!',
      'Warning! Missile lock bearing monolith — pop flares now!',
      'RWR spike! Incoming threat lock — press F for thermal flares!',
    ],
  },
  flares_deployed: {
    callsign: 'VIPER 1-1',
    frequency: 'VHF 124.8',
    priority: 'normal',
    priorityRank: 1,
    cooldownSec: 7,
    lines: [
      'Chaff and flares away.',
      'Deploying thermal countermeasures.',
    ],
  },
  flares_spoofed: {
    callsign: 'VIPER 1-1',
    frequency: 'VHF 124.8',
    priority: 'normal',
    priorityRank: 2,
    cooldownSec: 4,
    lines: [
      'Flares out! Radar lock broken.',
      'Countermeasures away — threat lock spoofed!',
    ],
  },
  stage_2: {
    callsign: 'OVERLORD',
    frequency: 'UHF 255.4',
    priority: 'critical',
    priorityRank: 3,
    cooldownSec: 5,
    lines: [
      'Viper one-one, Overlord — outer defenses neutralized. Twin copper cores are now exposed.',
      'Good work, Viper. Containment dropped on stage two — strike the twin copper cores.',
    ],
  },
  stage_3: {
    callsign: 'OVERLORD',
    frequency: 'UHF 255.4',
    priority: 'critical',
    priorityRank: 3,
    cooldownSec: 5,
    lines: [
      'Viper one-one, Overlord — both copper cores down! Apex diamond sanctum is wide open, finish it.',
      'Containment field collapsed! Engage the Apex Diamond Core at the monolith crest.',
    ],
  },
  shielded_hit: {
    callsign: 'OVERLORD',
    frequency: 'UHF 255.4',
    priority: 'normal',
    priorityRank: 1,
    cooldownSec: 14,
    lines: [
      'Negative effect, Viper — that core is shielded. Clear active stage nodes first.',
      'Rounds deflecting off containment barrier. Hit active perimeter targets first.',
    ],
  },
  low_altitude: {
    callsign: 'RWR BETTY',
    frequency: 'GPWS WARN',
    priority: 'caution',
    priorityRank: 2,
    cooldownSec: 13,
    lines: [
      'Altitude! Pull up!',
      'Terrain warning — low altitude!',
    ],
  },
  victory: {
    callsign: 'OVERLORD',
    frequency: 'UHF 255.4',
    priority: 'critical',
    priorityRank: 3,
    cooldownSec: 4,
    lines: [
      'Direct hit! Apex core obliterated. Monolith neutralized — great flying, Viper one-one, return to base.',
    ],
  },
};

const TARGET_KILL_LINES: Record<TargetKind, string[]> = {
  flak: [
    'Splash one! Flanking AA battery neutralized.',
    'Good kill — anti-air emplacement destroyed.',
    'Target down! Flak battery eliminated.',
  ],
  basal: [
    'Basal node shattered! Monolith foundation weakening.',
    'Direct hit — basal energy node destroyed.',
    'Good splash on the basal node!',
  ],
  copper: [
    'Copper core breached! Secondary detonations confirmed.',
    'Target destroyed — one copper core down!',
    'Shack! Russet copper core obliterated.',
  ],
  apex: [
    'Apex core destroyed! Monolith collapsing!',
  ],
};

function makeRadioClipCurve(amount = 28): Float32Array<ArrayBuffer> {
  const samples = 256;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    // Asymmetric VHF AM transmitter soft-clipping
    curve[i] = ((3 + amount) * x * 1.35) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

/**
 * Pilot audio feedback & radio-filtered military comms engine.
 * Combines:
 *  - Web Audio API VHF bandpass (320–2750 Hz) + RF WaveShaper saturation DSP bus
 *  - Authentic PTT open/close squelch bursts, Overlord roger beeps, and RWR/Master Caution tones
 *  - Syllable-modulated VHF static carrier bed synchronized to live Web Speech API pilot dialogue
 *  - Procedural bandpass radio formant cadence fallback when OS TTS voices are unavailable
 *  - Priority queue, per-event cooldowns, and automatic cockpit rotor ducking
 */
export class PilotRadioSystem {
  private audio: HelicopterAudio;
  private onTransmissionChange: (tx: RadioTransmission | null) => void;

  private enabled = true;
  private muted = false;
  private nextId = 1;

  // Web Audio VHF radio bus (lazily initialized once HelicopterAudio context exists)
  private radioInput: GainNode | null = null;
  private carrierNoiseNode: AudioBufferSourceNode | null = null;
  private carrierGateGain: GainNode | null = null;
  private carrierHumOsc: OscillatorNode | null = null;
  private carrierHumGain: GainNode | null = null;

  // Speech & queue state
  private activeTx: RadioTransmission | null = null;
  private queue: QueuedTransmission[] = [];
  private lastEventTime = new Map<PilotRadioEvent, number>();
  private lastLinePick = new Map<string, number>();
  private activeTimeoutId: number | null = null;
  private fallbackPulseTimer: number | null = null;
  private disposed = false;

  constructor(
    audio: HelicopterAudio,
    onTransmissionChange: (tx: RadioTransmission | null) => void,
  ) {
    this.audio = audio;
    this.onTransmissionChange = onTransmissionChange;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.cancelAll();
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.cancelAll();
    }
  }

  public getActiveTransmission(): RadioTransmission | null {
    return this.activeTx;
  }

  public trigger(event: PilotRadioEvent, opts?: { targetKind?: TargetKind }): void {
    if (this.disposed || !this.enabled || this.muted) return;

    const nowSec = performance.now() / 1000;
    const cooldown =
      event === 'target_destroyed' ? 1.2 : EVENT_SPECS[event].cooldownSec;
    const prevTime = this.lastEventTime.get(event) ?? -999;
    if (nowSec - prevTime < cooldown) return;

    let item: QueuedTransmission;
    if (event === 'target_destroyed') {
      const kind: TargetKind = opts?.targetKind ?? 'flak';
      const text = this.pickNonRepeating(`kill_${kind}`, TARGET_KILL_LINES[kind]);
      item = {
        event,
        callsign: 'VIPER 1-1',
        frequency: 'VHF 124.8',
        priority: 'normal',
        priorityRank: 2,
        text,
      };
    } else {
      const spec = EVENT_SPECS[event];
      const text = this.pickNonRepeating(event, spec.lines);
      item = {
        event,
        callsign: spec.callsign,
        frequency: spec.frequency,
        priority: spec.priority,
        priorityRank: spec.priorityRank,
        text,
      };
    }

    this.lastEventTime.set(event, nowSec);
    this.enqueue(item);
  }

  public cancelAll(): void {
    this.queue = [];
    this.stopCurrentSpeech(false);
    this.setActiveTx(null);
  }

  public dispose(): void {
    this.disposed = true;
    this.cancelAll();
    try {
      this.carrierNoiseNode?.stop();
      this.carrierHumOsc?.stop();
    } catch {
      // Ignore already-stopped nodes
    }
    this.carrierNoiseNode = null;
    this.carrierHumOsc = null;
    this.radioInput = null;
    this.carrierGateGain = null;
    this.carrierHumGain = null;
  }

  private pickNonRepeating(key: string, pool: string[]): string {
    if (pool.length <= 1) return pool[0] ?? '';
    const lastIdx = this.lastLinePick.get(key) ?? -1;
    let idx = Math.floor(Math.random() * pool.length);
    if (idx === lastIdx) {
      idx = (idx + 1) % pool.length;
    }
    this.lastLinePick.set(key, idx);
    return pool[idx];
  }

  private enqueue(item: QueuedTransmission): void {
    // Critical transmissions immediately preempt lower-priority chatter
    if (
      this.activeTx &&
      item.priorityRank >= 3 &&
      this.priorityToRank(this.activeTx.priority) < 3
    ) {
      this.stopCurrentSpeech(false);
      this.queue = this.queue.filter((q) => q.priorityRank >= 3);
      this.startTransmission(item);
      return;
    }

    if (!this.activeTx) {
      this.startTransmission(item);
      return;
    }

    // Deduplicate same event already waiting in queue
    if (this.queue.some((q) => q.event === item.event)) return;

    // Keep queue shallow (max 2) so comms never lag behind live combat
    this.queue.push(item);
    this.queue.sort((a, b) => b.priorityRank - a.priorityRank);
    if (this.queue.length > 2) {
      this.queue.length = 2;
    }
  }

  private priorityToRank(priority: RadioPriority): number {
    if (priority === 'critical') return 3;
    if (priority === 'caution') return 2;
    return 1;
  }

  private ensureRadioBus(): boolean {
    if (this.radioInput) return true;
    const nodes = this.audio.getAudioNodes();
    if (!nodes) return false;

    const { ctx, masterGain, whiteNoiseBuffer } = nodes;

    // Authentic AN/ARC VHF Military Aviation Radio Filter Chain:
    // High-pass 320 Hz -> Low-pass 2750 Hz -> Nasal presence peak 1400 Hz -> RF soft-clipper
    const input = ctx.createGain();
    input.gain.value = 1.0;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 320;
    hp.Q.value = 0.8;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2750;
    lp.Q.value = 1.1;

    const nasalPeak = ctx.createBiquadFilter();
    nasalPeak.type = 'peaking';
    nasalPeak.frequency.value = 1420;
    nasalPeak.Q.value = 1.3;
    nasalPeak.gain.value = 6.5;

    const clipper = ctx.createWaveShaper();
    clipper.curve = makeRadioClipCurve(24);
    clipper.oversample = '2x';

    const radioOut = ctx.createGain();
    radioOut.gain.value = 0.72;

    input.connect(hp);
    hp.connect(lp);
    lp.connect(nasalPeak);
    nasalPeak.connect(clipper);
    clipper.connect(radioOut);
    radioOut.connect(masterGain);

    // Continuous gated VHF carrier static + subtle 400 Hz aircraft AC bus hum
    const carrierNoise = ctx.createBufferSource();
    carrierNoise.buffer = whiteNoiseBuffer;
    carrierNoise.loop = true;

    const carrierGate = ctx.createGain();
    carrierGate.gain.value = 0.0001;
    carrierNoise.connect(carrierGate);
    carrierGate.connect(input);
    carrierNoise.start();

    const humOsc = ctx.createOscillator();
    humOsc.type = 'sine';
    humOsc.frequency.value = 400;
    const humGain = ctx.createGain();
    humGain.gain.value = 0.0001;
    humOsc.connect(humGain);
    humGain.connect(input);
    humOsc.start();

    this.radioInput = input;
    this.carrierNoiseNode = carrierNoise;
    this.carrierGateGain = carrierGate;
    this.carrierHumOsc = humOsc;
    this.carrierHumGain = humGain;
    return true;
  }

  private playSquelchOpen(item: QueuedTransmission): void {
    if (!this.ensureRadioBus()) return;
    const nodes = this.audio.getAudioNodes();
    if (!nodes || !this.radioInput || !this.carrierGateGain || !this.carrierHumGain) return;
    const { ctx, whiteNoiseBuffer } = nodes;
    const now = ctx.currentTime;

    // 1. Mechanical PTT mic relay click + VHF squelch burst
    const burst = ctx.createBufferSource();
    burst.buffer = whiteNoiseBuffer;
    const burstGain = ctx.createGain();
    burstGain.gain.setValueAtTime(0.001, now);
    burstGain.gain.linearRampToValueAtTime(0.32, now + 0.008);
    burstGain.gain.exponentialRampToValueAtTime(0.001, now + 0.068);
    burst.connect(burstGain);
    burstGain.connect(this.radioInput);
    burst.start(now, Math.random() * 1.5, 0.075);

    // 2. Open modulated VHF static floor + faint 400Hz cockpit intercom hum
    const floorLevel = item.callsign === 'OVERLORD' ? 0.052 : 0.036;
    this.carrierGateGain.gain.cancelScheduledValues(now);
    this.carrierGateGain.gain.setTargetAtTime(floorLevel, now + 0.03, 0.025);
    this.carrierHumGain.gain.cancelScheduledValues(now);
    this.carrierHumGain.gain.setTargetAtTime(0.009, now + 0.03, 0.025);

    // 3. Priority cockpit avionics / Betty warning cue through the VHF filter chain
    if (item.event === 'incoming_missile') {
      // Urgent dual-tone RWR missile-lock warble
      const freqs = [1840, 1380, 1840, 1380];
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, now + idx * 0.075);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.18, now + idx * 0.075);
        g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.075 + 0.068);
        osc.connect(g);
        g.connect(this.radioInput!);
        osc.start(now + idx * 0.075);
        osc.stop(now + idx * 0.075 + 0.072);
      });
    } else if (item.priority === 'caution') {
      // AH-64 Master Caution double chime (880 Hz -> 660 Hz)
      [880, 660].forEach((f, idx) => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now + idx * 0.09);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.16, now + idx * 0.09);
        g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.085);
        osc.connect(g);
        g.connect(this.radioInput!);
        osc.start(now + idx * 0.09);
        osc.stop(now + idx * 0.09 + 0.09);
      });
    } else {
      // Subtle military intercom key-in chirp
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(item.callsign === 'OVERLORD' ? 1240 : 1040, now);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.09, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.042);
      osc.connect(g);
      g.connect(this.radioInput);
      osc.start(now);
      osc.stop(now + 0.048);
    }
  }

  private pulseCarrierSyllable(playFormantFallback = false, pitchBase = 155): void {
    const nodes = this.audio.getAudioNodes();
    if (!nodes || !this.radioInput || !this.carrierGateGain) return;
    const { ctx } = nodes;
    const now = ctx.currentTime;

    // Subtle RF static modulation breathing on each spoken word
    this.carrierGateGain.gain.cancelScheduledValues(now);
    this.carrierGateGain.gain.setValueAtTime(0.068, now);
    this.carrierGateGain.gain.setTargetAtTime(0.034, now + 0.04, 0.05);

    if (playFormantFallback) {
      // Radio-filtered speech-cadence formant pulse when OS TTS is unavailable
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const f0 = pitchBase * (0.9 + Math.random() * 0.24);
      osc.frequency.setValueAtTime(f0, now);
      osc.frequency.linearRampToValueAtTime(f0 * 0.88, now + 0.09);

      const formant = ctx.createBiquadFilter();
      formant.type = 'bandpass';
      formant.frequency.value = 780 + Math.random() * 980;
      formant.Q.value = 3.2;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.11, now + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      osc.connect(formant);
      formant.connect(g);
      g.connect(this.radioInput);
      osc.start(now);
      osc.stop(now + 0.11);
    }
  }

  private playSquelchClose(callsign: RadioChannel): void {
    const nodes = this.audio.getAudioNodes();
    if (!nodes || !this.radioInput || !this.carrierGateGain || !this.carrierHumGain) return;
    const { ctx, whiteNoiseBuffer } = nodes;
    const now = ctx.currentTime;

    this.carrierGateGain.gain.cancelScheduledValues(now);
    this.carrierGateGain.gain.setTargetAtTime(0.0001, now, 0.02);
    this.carrierHumGain.gain.cancelScheduledValues(now);
    this.carrierHumGain.gain.setTargetAtTime(0.0001, now, 0.02);

    // Classic VHF squelch tail click
    const tail = ctx.createBufferSource();
    tail.buffer = whiteNoiseBuffer;
    const tailGain = ctx.createGain();
    tailGain.gain.setValueAtTime(0.24, now);
    tailGain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
    tail.connect(tailGain);
    tailGain.connect(this.radioInput);
    tail.start(now, Math.random() * 1.4, 0.08);

    // Overlord AWACS crisp roger beep
    if (callsign === 'OVERLORD') {
      const beep = ctx.createOscillator();
      beep.type = 'sine';
      beep.frequency.setValueAtTime(1320, now + 0.01);
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0.1, now + 0.01);
      bg.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
      beep.connect(bg);
      bg.connect(this.radioInput);
      beep.start(now + 0.01);
      beep.stop(now + 0.09);
    }
  }

  private pickVoice(callsign: RadioChannel): SpeechSynthesisVoice | null {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;

    const english = voices.filter((v) => /^en[-_]/i.test(v.lang));
    const pool = english.length ? english : voices;

    if (callsign === 'RWR BETTY') {
      const female = pool.find((v) =>
        /samantha|victoria|zira|karen|google us english|female|aria|jenny/i.test(v.name),
      );
      if (female) return female;
    } else if (callsign === 'OVERLORD') {
      const britishOrDeep = pool.find((v) =>
        /daniel|george|arthur|uk english male|guy|david|alex/i.test(v.name),
      );
      if (britishOrDeep) return britishOrDeep;
    } else {
      const pilot = pool.find((v) =>
        /alex|david|mark|matthew|male|google us english/i.test(v.name),
      );
      if (pilot) return pilot;
    }

    return pool[0] ?? null;
  }

  private startTransmission(item: QueuedTransmission): void {
    const tx: RadioTransmission = {
      id: this.nextId++,
      callsign: item.callsign,
      frequency: item.frequency,
      text: item.text,
      priority: item.priority,
    };

    this.setActiveTx(tx);
    this.audio.setRadioDucking(true);
    this.playSquelchOpen(item);

    // Estimate duration from word count for safe watchdog cleanup & fallback mode
    const wordCount = Math.max(3, item.text.split(/\s+/).length);
    const estimatedMs = Math.min(6200, Math.max(1750, wordCount * 355 + 480));

    let finished = false;
    const finish = (playClose: boolean) => {
      if (finished) return;
      finished = true;
      if (this.activeTimeoutId !== null) {
        window.clearTimeout(this.activeTimeoutId);
        this.activeTimeoutId = null;
      }
      if (this.fallbackPulseTimer !== null) {
        window.clearInterval(this.fallbackPulseTimer);
        this.fallbackPulseTimer = null;
      }
      if (playClose && !this.muted && this.enabled) {
        this.playSquelchClose(item.callsign);
      } else {
        this.silenceCarrierImmediate();
      }
      this.audio.setRadioDucking(false);

      if (this.activeTx?.id === tx.id) {
        this.setActiveTx(null);
      }

      if (!this.disposed && this.enabled && !this.muted && this.queue.length > 0) {
        const next = this.queue.shift()!;
        window.setTimeout(() => {
          if (!this.disposed && !this.activeTx && this.enabled && !this.muted) {
            this.startTransmission(next);
          }
        }, 160);
      }
    };

    const hasSpeech =
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      typeof SpeechSynthesisUtterance !== 'undefined';

    if (hasSpeech) {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(item.text);
        const voice = this.pickVoice(item.callsign);
        if (voice) utter.voice = voice;
        utter.lang = 'en-US';
        utter.volume = 0.95;

        if (item.callsign === 'RWR BETTY') {
          utter.rate = 1.22;
          utter.pitch = 1.12;
        } else if (item.callsign === 'OVERLORD') {
          utter.rate = 1.08;
          utter.pitch = 0.84;
        } else {
          utter.rate = 1.15;
          utter.pitch = 0.92;
        }

        let startedSpeech = false;
        utter.onstart = () => {
          startedSpeech = true;
        };
        utter.onboundary = () => {
          if (!finished && !this.muted) {
            this.pulseCarrierSyllable(false);
          }
        };
        utter.onend = () => finish(true);
        utter.onerror = () => {
          // If browser blocks TTS, let radio cadence pulses finish cleanly for the subtitle duration
          if (!startedSpeech && !finished) {
            this.startFallbackCadence(item, estimatedMs, () => finish(true));
          } else {
            finish(true);
          }
        };

        // Slight 70ms offset so PTT key-click & warning tone cut cleanly before voice starts
        window.setTimeout(() => {
          if (finished || this.disposed || this.muted || !this.enabled) return;
          window.speechSynthesis.speak(utter);

          // If TTS voice doesn't start (e.g. headless browser or missing OS voice pack), drive radio cadence fallback
          window.setTimeout(() => {
            if (!startedSpeech && !finished && !this.muted && this.enabled) {
              this.startFallbackCadence(item, Math.max(1200, estimatedMs - 320), () =>
                finish(true),
              );
            }
          }, 320);
        }, 75);

        // Safety watchdog in case browser drops speechSynthesis onend event
        this.activeTimeoutId = window.setTimeout(() => finish(true), estimatedMs + 1600);
        return;
      } catch {
        // Fall through to pure Web Audio radio cadence fallback
      }
    }

    this.startFallbackCadence(item, estimatedMs, () => finish(true));
  }

  private startFallbackCadence(
    item: QueuedTransmission,
    durationMs: number,
    onDone: () => void,
  ): void {
    if (this.fallbackPulseTimer !== null) return;
    const pitchBase =
      item.callsign === 'RWR BETTY' ? 230 : item.callsign === 'OVERLORD' ? 128 : 152;
    this.pulseCarrierSyllable(true, pitchBase);
    this.fallbackPulseTimer = window.setInterval(() => {
      if (this.disposed || this.muted || !this.enabled) return;
      this.pulseCarrierSyllable(true, pitchBase);
    }, 175);

    if (this.activeTimeoutId !== null) {
      window.clearTimeout(this.activeTimeoutId);
    }
    this.activeTimeoutId = window.setTimeout(onDone, durationMs);
  }

  private stopCurrentSpeech(playClose: boolean): void {
    if (this.activeTimeoutId !== null) {
      window.clearTimeout(this.activeTimeoutId);
      this.activeTimeoutId = null;
    }
    if (this.fallbackPulseTimer !== null) {
      window.clearInterval(this.fallbackPulseTimer);
      this.fallbackPulseTimer = null;
    }
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    } catch {
      // Ignore
    }
    if (playClose && this.activeTx) {
      this.playSquelchClose(this.activeTx.callsign);
    } else {
      this.silenceCarrierImmediate();
    }
    this.audio.setRadioDucking(false);
  }

  private silenceCarrierImmediate(): void {
    const nodes = this.audio.getAudioNodes();
    if (!nodes || !this.carrierGateGain || !this.carrierHumGain) return;
    const now = nodes.ctx.currentTime;
    this.carrierGateGain.gain.cancelScheduledValues(now);
    this.carrierGateGain.gain.setTargetAtTime(0.0001, now, 0.015);
    this.carrierHumGain.gain.cancelScheduledValues(now);
    this.carrierHumGain.gain.setTargetAtTime(0.0001, now, 0.015);
  }

  private setActiveTx(tx: RadioTransmission | null): void {
    this.activeTx = tx;
    this.onTransmissionChange(tx);
  }
}
