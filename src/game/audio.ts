/**
 * Realistic multi-layer procedural Web Audio API helicopter & combat synthesizer.
 * Models 5 authentic acoustic layers of a heavy military attack gunship from inside
 * the cockpit:
 *  1. Sub-bass main rotor pressure thump (unipolar sharp-attack blade-pass envelope)
 *  2. Blade-Vortex Interaction (BVI) aerodynamic chop/slap (intensifies on climb & bank)
 *  3. High-RPM tail rotor anti-torque hum
 *  4. Twin turboshaft engine & main transmission gearbox whine with torque spool-up
 *  5. Canopy wind rush & cockpit airframe buffeting tied to airspeed
 */
export class HelicopterAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private heliBus: GainNode | null = null;

  // Main rotor blade-pass LFO & shaped unipolar envelope
  private bladeLfo: OscillatorNode | null = null;
  private bladeChopFilter: BiquadFilterNode | null = null;
  private bladeSubOsc: OscillatorNode | null = null;
  private bladeSlapGain: GainNode | null = null;

  // Tail rotor anti-torque layer
  private tailLfo: OscillatorNode | null = null;
  private tailGain: GainNode | null = null;

  // Twin turboshaft & transmission gearbox
  private turbineMainOsc: OscillatorNode | null = null;
  private turbineHarmOsc: OscillatorNode | null = null;
  private turbineGain: GainNode | null = null;

  // Airspeed canopy wind & cockpit cabin rumble
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;

  // Pre-baked noise buffers
  private whiteNoiseBuffer: AudioBuffer | null = null;
  private brownNoiseBuffer: AudioBuffer | null = null;

  private muted = false;
  private active = false;
  private radioDucked = false;
  private lastWarningBeep = 0;

  public getAudioNodes(): {
    ctx: AudioContext;
    masterGain: GainNode;
    whiteNoiseBuffer: AudioBuffer;
  } | null {
    if (!this.ctx || !this.masterGain || !this.whiteNoiseBuffer) return null;
    return {
      ctx: this.ctx,
      masterGain: this.masterGain,
      whiteNoiseBuffer: this.whiteNoiseBuffer,
    };
  }

  public setRadioDucking(ducked: boolean): void {
    this.radioDucked = ducked;
    if (!this.ctx || !this.heliBus || !this.active) return;
    const now = this.ctx.currentTime;
    this.heliBus.gain.setTargetAtTime(ducked ? 0.56 : 0.86, now, 0.08);
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        muted ? 0 : 0.85,
        this.ctx.currentTime,
        0.04,
      );
    }
  }

  public init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    const ctx = this.ctx;

    // Master output with gentle soft-clipping compressor so heavy rotor + cannon + explosions stay punchy & clean
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -10;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.14;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.85;
    this.masterGain.connect(compressor);
    compressor.connect(ctx.destination);

    // Pre-bake 3s seamless white noise & warm brown/pink noise buffers
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * 3;
    this.whiteNoiseBuffer = ctx.createBuffer(1, length, sampleRate);
    this.brownNoiseBuffer = ctx.createBuffer(1, length, sampleRate);
    const white = this.whiteNoiseBuffer.getChannelData(0);
    const brown = this.brownNoiseBuffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < length; i++) {
      const w = Math.random() * 2 - 1;
      white[i] = w;
      lastOut = (lastOut + 0.045 * w) / 1.045;
      brown[i] = Math.max(-1, Math.min(1, lastOut * 4.2));
    }

    // Helicopter sub-bus (fades smoothly between idle/paused and active flight)
    this.heliBus = ctx.createGain();
    this.heliBus.gain.value = 0.0001;
    this.heliBus.connect(this.masterGain);

    // =========================================================================
    // LAYER 1 & 2: MAIN ROTOR BLADE-PASS THUMP + AERODYNAMIC BVI CHOP ("WHOP-WHOP")
    // =========================================================================
    // Unipolar asymmetric blade-pass pulse curve: turns a [-1..1] sawtooth wave
    // into a crisp [0.12..1.0] percussive aerodynamic rotor blade slap envelope!
    const slapCurve = new Float32Array(512);
    for (let i = 0; i < 512; i++) {
      // i = 0..511 corresponds to input x = -1..+1
      const phase = i / 511; // 0..1 across one blade pass
      // Fast aerodynamic compression attack followed by rolling vortex decay
      const attack = Math.min(1, phase / 0.16);
      const decay = Math.pow(1 - Math.max(0, (phase - 0.16) / 0.84), 2.1);
      const env = phase < 0.16 ? attack : decay;
      slapCurve[i] = 0.12 + 0.88 * env;
    }
    const slapShaper = ctx.createWaveShaper();
    slapShaper.curve = slapCurve;
    slapShaper.oversample = '2x';

    // Master blade-pass frequency (~8.6 Hz for heavy military 4-blade gunship main rotor)
    this.bladeLfo = ctx.createOscillator();
    this.bladeLfo.type = 'sawtooth';
    this.bladeLfo.frequency.value = 8.6;
    this.bladeLfo.connect(slapShaper);

    // 1A: Deep Sub-Bass Rotor Pressure Wave (felt inside cockpit chest)
    const subNoise = ctx.createBufferSource();
    subNoise.buffer = this.brownNoiseBuffer;
    subNoise.loop = true;

    const subLowpass = ctx.createBiquadFilter();
    subLowpass.type = 'lowpass';
    subLowpass.frequency.value = 95;
    subLowpass.Q.value = 2.4;

    const subAmp = ctx.createGain();
    subAmp.gain.value = 0; // Driven strictly by unipolar slapShaper (0.12..1.0)
    const subModDepth = ctx.createGain();
    subModDepth.gain.value = 1.15;
    slapShaper.connect(subModDepth);
    subModDepth.connect(subAmp.gain);

    // Low resonant rotor-mast thump sine (44 Hz) pulsing in lockstep with blades
    this.bladeSubOsc = ctx.createOscillator();
    this.bladeSubOsc.type = 'triangle';
    this.bladeSubOsc.frequency.value = 44;
    const subOscMix = ctx.createGain();
    subOscMix.gain.value = 0.34;
    this.bladeSubOsc.connect(subOscMix);

    subNoise.connect(subLowpass);
    subLowpass.connect(subAmp);
    subOscMix.connect(subAmp);
    subAmp.connect(this.heliBus);

    // 1B: Mid-Low Blade-Vortex Interaction (BVI) Air-Shear Slap ("CHOP-CHOP-CHOP")
    const chopNoise = ctx.createBufferSource();
    chopNoise.buffer = this.whiteNoiseBuffer;
    chopNoise.loop = true;

    this.bladeChopFilter = ctx.createBiquadFilter();
    this.bladeChopFilter.type = 'bandpass';
    this.bladeChopFilter.frequency.value = 235;
    this.bladeChopFilter.Q.value = 1.35;

    const chopAmp = ctx.createGain();
    chopAmp.gain.value = 0;
    const chopModDepth = ctx.createGain();
    chopModDepth.gain.value = 0.62;
    slapShaper.connect(chopModDepth);
    chopModDepth.connect(chopAmp.gain);

    this.bladeSlapGain = ctx.createGain();
    this.bladeSlapGain.gain.value = 0.72;

    chopNoise.connect(this.bladeChopFilter);
    this.bladeChopFilter.connect(chopAmp);
    chopAmp.connect(this.bladeSlapGain);
    this.bladeSlapGain.connect(this.heliBus);

    // =========================================================================
    // LAYER 3: ANTI-TORQUE TAIL ROTOR BUZZ (~29 Hz rapid air pulse)
    // =========================================================================
    const tailNoise = ctx.createBufferSource();
    tailNoise.buffer = this.whiteNoiseBuffer;
    tailNoise.loop = true;

    const tailBand = ctx.createBiquadFilter();
    tailBand.type = 'bandpass';
    tailBand.frequency.value = 460;
    tailBand.Q.value = 2.1;

    const tailAmp = ctx.createGain();
    tailAmp.gain.value = 0.55;

    this.tailLfo = ctx.createOscillator();
    this.tailLfo.type = 'sine';
    this.tailLfo.frequency.value = 29.5;
    const tailLfoDepth = ctx.createGain();
    tailLfoDepth.gain.value = 0.42;
    this.tailLfo.connect(tailLfoDepth);
    tailLfoDepth.connect(tailAmp.gain);

    this.tailGain = ctx.createGain();
    this.tailGain.gain.value = 0.14;

    tailNoise.connect(tailBand);
    tailBand.connect(tailAmp);
    tailAmp.connect(this.tailGain);
    this.tailGain.connect(this.heliBus);

    // =========================================================================
    // LAYER 4: TWIN TURBOSHAFT ENGINE & TRANSMISSION GEARBOX WHINE
    // =========================================================================
    this.turbineMainOsc = ctx.createOscillator();
    this.turbineMainOsc.type = 'sawtooth';
    this.turbineMainOsc.frequency.value = 640;

    this.turbineHarmOsc = ctx.createOscillator();
    this.turbineHarmOsc.type = 'triangle';
    this.turbineHarmOsc.frequency.value = 1310;

    const turbineFilter = ctx.createBiquadFilter();
    turbineFilter.type = 'bandpass';
    turbineFilter.frequency.value = 920;
    turbineFilter.Q.value = 1.6;

    this.turbineGain = ctx.createGain();
    this.turbineGain.gain.value = 0.042;

    const harmMix = ctx.createGain();
    harmMix.gain.value = 0.45;
    this.turbineMainOsc.connect(turbineFilter);
    this.turbineHarmOsc.connect(harmMix);
    harmMix.connect(turbineFilter);
    turbineFilter.connect(this.turbineGain);
    this.turbineGain.connect(this.heliBus);

    // =========================================================================
    // LAYER 5: COCKPIT AIRFRAME WIND RUSH & CANOPY BUFFETING
    // =========================================================================
    const windNoise = ctx.createBufferSource();
    windNoise.buffer = this.brownNoiseBuffer;
    windNoise.loop = true;

    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 340;
    this.windFilter.Q.value = 0.7;

    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.14;

    windNoise.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.heliBus);

    // Start all continuous cockpit sources
    subNoise.start();
    chopNoise.start();
    tailNoise.start();
    windNoise.start();
    this.bladeLfo.start();
    this.bladeSubOsc.start();
    this.tailLfo.start();
    this.turbineMainOsc.start();
    this.turbineHarmOsc.start();
  }

  public setFlightActive(active: boolean): void {
    this.active = active;
    if (!this.ctx || !this.heliBus || !this.bladeLfo || !this.turbineMainOsc || !this.turbineHarmOsc) {
      return;
    }
    const now = this.ctx.currentTime;
    if (active) {
      // Realistic rapid combat spool-up from idle into full flight RPM
      this.heliBus.gain.cancelScheduledValues(now);
      this.heliBus.gain.setTargetAtTime(this.radioDucked ? 0.56 : 0.86, now, 0.22);
      this.bladeLfo.frequency.setValueAtTime(6.4, now);
      this.bladeLfo.frequency.exponentialRampToValueAtTime(8.7, now + 0.65);
      this.turbineMainOsc.frequency.setValueAtTime(490, now);
      this.turbineMainOsc.frequency.exponentialRampToValueAtTime(685, now + 0.7);
      this.turbineHarmOsc.frequency.setValueAtTime(980, now);
      this.turbineHarmOsc.frequency.exponentialRampToValueAtTime(1380, now + 0.7);
    } else {
      // Quiet idle / pause fade-down
      this.heliBus.gain.cancelScheduledValues(now);
      this.heliBus.gain.setTargetAtTime(0.0001, now, 0.18);
    }
  }

  public updateRotor(
    speedRatio: number,
    climbInput: number,
    missileWarning: boolean,
    bankIntensity = 0,
  ): void {
    if (
      !this.ctx ||
      !this.bladeLfo ||
      !this.bladeChopFilter ||
      !this.bladeSubOsc ||
      !this.bladeSlapGain ||
      !this.tailLfo ||
      !this.turbineMainOsc ||
      !this.turbineHarmOsc ||
      !this.windFilter ||
      !this.windGain
    ) {
      return;
    }

    const now = this.ctx.currentTime;
    const clampedSpeed = Math.max(0, Math.min(1, speedRatio));
    const clampedBank = Math.max(0, Math.min(1, bankIntensity));
    const climbTorque = Math.max(-0.5, Math.min(1, climbInput));
    const rotorLoad = Math.min(
      1,
      clampedSpeed * 0.55 + Math.abs(climbTorque) * 0.35 + clampedBank * 0.45,
    );

    if (this.active) {
      // Main rotor blade-pass frequency tightens slightly under forward speed & climb torque
      this.bladeLfo.frequency.setTargetAtTime(8.6 + rotorLoad * 1.45, now, 0.1);
      this.bladeSubOsc.frequency.setTargetAtTime(42 + rotorLoad * 8.5, now, 0.1);

      // Blade-vortex slap opens up noticeably during hard banks, climbs, and high-speed runs
      this.bladeChopFilter.frequency.setTargetAtTime(
        215 + rotorLoad * 145 + clampedBank * 75,
        now,
        0.09,
      );
      this.bladeSlapGain.gain.setTargetAtTime(
        0.65 + clampedBank * 0.38 + Math.max(0, climbTorque) * 0.25,
        now,
        0.09,
      );

      // Tail rotor pitch rises under collective torque
      this.tailLfo.frequency.setTargetAtTime(29 + Math.abs(climbTorque) * 4.5 + clampedBank * 3, now, 0.1);

      // Turboshaft engine whine responds to collective pull & forward thrust
      const turbBase = 675 + Math.max(0, climbTorque) * 95 + clampedSpeed * 60;
      this.turbineMainOsc.frequency.setTargetAtTime(turbBase, now, 0.12);
      this.turbineHarmOsc.frequency.setTargetAtTime(turbBase * 2.02, now, 0.12);

      // Cockpit wind rush intensifies with airspeed
      this.windFilter.frequency.setTargetAtTime(260 + clampedSpeed * 620, now, 0.12);
      this.windGain.gain.setTargetAtTime(0.09 + clampedSpeed * 0.32, now, 0.12);
    }

    if (this.active && missileWarning && !this.muted) {
      if (now - this.lastWarningBeep > 0.28) {
        this.lastWarningBeep = now;
        this.playMissileBeep();
      }
    }
  }

  public playCannonShot(): void {
    if (!this.ctx || !this.masterGain || !this.whiteNoiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;

    // Punchy low 30mm autocannon thump
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160 + Math.random() * 20, now);
    osc.frequency.exponentialRampToValueAtTime(44, now + 0.075);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.28, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.09);

    // Mechanical breach & muzzle crack
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.whiteNoiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1500, now);
    filter.Q.value = 0.85;

    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.24, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.068);

    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.masterGain);
    noise.start(now, Math.random() * 1.8, 0.075);
  }

  public playRocketLaunch(): void {
    if (!this.ctx || !this.masterGain || !this.whiteNoiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.whiteNoiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(520, now);
    filter.frequency.exponentialRampToValueAtTime(2000, now + 0.12);
    filter.frequency.exponentialRampToValueAtTime(340, now + 0.5);
    filter.Q.value = 1.3;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.45, now + 0.045);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.54);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(now, Math.random() * 1.4, 0.56);
  }

  public playFlareDeploy(): void {
    if (!this.ctx || !this.masterGain || !this.whiteNoiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(540, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.14);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.2, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.16);

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.whiteNoiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2400;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.18, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    noise.connect(hp);
    hp.connect(ng);
    ng.connect(this.masterGain);
    noise.start(now, Math.random() * 1.4, 0.28);
  }

  public playHitConfirm(isKill = false): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isKill ? 980 : 1480, now);
    if (isKill) {
      osc.frequency.setValueAtTime(1320, now + 0.055);
    }

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(isKill ? 0.24 : 0.13, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + (isKill ? 0.18 : 0.055));

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + (isKill ? 0.19 : 0.06));
  }

  public playExplosion(scale = 1.0): void {
    if (!this.ctx || !this.masterGain || !this.brownNoiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const dur = 0.55 + scale * 0.65;

    // Sub-bass shockwave
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(92, now);
    sub.frequency.exponentialRampToValueAtTime(24, now + dur * 0.75);

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(Math.min(0.6, 0.36 * scale), now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.8);

    sub.connect(subGain);
    subGain.connect(this.masterGain);
    sub.start(now);
    sub.stop(now + dur);

    // Broadband blast rumble
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.brownNoiseBuffer;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(950, now);
    lp.frequency.exponentialRampToValueAtTime(110, now + dur);

    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(Math.min(0.62, 0.38 * scale), now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(lp);
    lp.connect(nGain);
    nGain.connect(this.masterGain);
    noise.start(now, Math.random() * 1.2, dur + 0.05);
  }

  public playHullImpact(): void {
    if (!this.ctx || !this.masterGain || !this.whiteNoiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(210, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.22);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.36, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.25);

    this.playExplosion(0.55);
  }

  private playMissileBeep(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1760, now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.09, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  public dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
