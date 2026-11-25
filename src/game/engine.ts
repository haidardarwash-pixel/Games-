import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HelicopterAudio } from './audio';
import { createCockpitRig, type CockpitRig } from './cockpit';
import {
  createDesertEnvironment,
  groundHeightAt,
  type DesertEnvironment,
} from './environment';
import {
  createMonolithAssembly,
  type MonolithAssembly,
  type TargetEntity,
} from './monolith';
import { PilotRadioSystem } from './pilotRadio';
import { createTexturePack, type ProceduralTexturePack } from './textures';
import type {
  GamePhase,
  HudSnapshot,
  MissionRecord,
  ProjectedTargetHud,
  RadioTransmission,
  StrikeStage,
} from './types';

// Pre-allocated scratch math helpers (zero per-frame GC in render loop)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _aimDir = new THREE.Vector3();
const _proj = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

const STORAGE_RECORD_KEY = 'operation_ossuary_record_v1';
const STORAGE_SETTINGS_KEY = 'operation_ossuary_settings_v1';

interface Projectile {
  active: boolean;
  kind: 'cannon' | 'rocket' | 'enemy_tracer' | 'enemy_flak' | 'enemy_sam' | 'flare';
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  maxAge: number;
  damage: number;
  splashRadius: number;
  detonateDist?: number;
  distractedByFlare?: boolean;
  mesh: THREE.Mesh;
}

interface Particle {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  maxAge: number;
  startScale: number;
  endScale: number;
  gravity: number;
  sprite: THREE.Sprite;
  baseOpacity: number;
}

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

export function loadMissionRecord(): MissionRecord {
  try {
    const raw = localStorage.getItem(STORAGE_RECORD_KEY);
    if (!raw) return { bestScore: 0, bestTimeSec: null, victories: 0 };
    const parsed = JSON.parse(raw) as Partial<MissionRecord>;
    return {
      bestScore: typeof parsed.bestScore === 'number' ? parsed.bestScore : 0,
      bestTimeSec: typeof parsed.bestTimeSec === 'number' ? parsed.bestTimeSec : null,
      victories: typeof parsed.victories === 'number' ? parsed.victories : 0,
    };
  } catch {
    return { bestScore: 0, bestTimeSec: null, victories: 0 };
  }
}

function saveMissionRecord(record: MissionRecord): void {
  try {
    localStorage.setItem(STORAGE_RECORD_KEY, JSON.stringify(record));
  } catch {
    // Ignore storage quota errors
  }
}

export interface EngineCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onRecordUpdate: (record: MissionRecord) => void;
  onContextError?: (message: string) => void;
}

export class HelicopterGameEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  private isSoftwareGl: boolean;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private textures: ProceduralTexturePack;
  private env: DesertEnvironment;
  private monolith: MonolithAssembly;
  private cockpit: CockpitRig;
  private audio: HelicopterAudio;
  private radio: PilotRadioSystem;
  private activeRadio: RadioTransmission | null = null;

  // Helicopter hierarchy
  private heliRig = new THREE.Group();
  private pilotHead = new THREE.Group();
  private heliPos = new THREE.Vector3(0, 36, 128);
  private heliVel = new THREE.Vector3();
  private headingYaw = 0; // 0 looks toward -Z (directly at the monolith from south)
  private viewYaw = 0;
  private viewPitch = 0.06;
  private bodyPitch = 0;
  private bodyRoll = 0;
  private shakeTrauma = 0;

  // Game state
  private phase: GamePhase = 'title';
  private strikeStage: StrikeStage = 1;
  private hull = 100;
  private readonly maxHull = 100;
  private cannonHeat = 0;
  private cannonOverheated = false;
  private cannonCooldown = 0;
  private rockets = 16;
  private readonly maxRockets = 16;
  private rocketCooldown = 0;
  private rocketRechargeTimer = 0;
  private rocketSideToggle = 1;
  private flares = 6;
  private readonly maxFlares = 6;
  private flareCooldown = 0;
  private score = 0;
  private elapsedMissionSec = 0;
  private shotsFired = 0;
  private shotsHit = 0;
  private hitMarkerTimer = 0;
  private killMarkerTimer = 0;
  private damageFlash = 0;
  private hitstopTimer = 0;
  private stageBanner: string | null = null;
  private stageBannerTimer = 0;
  private samSpawnTimer = 4.0;
  private rwrWarningTimer = 0;
  private rwrCooldown = 14.0;
  private record: MissionRecord;

  // Controls state
  private keys = new Set<string>();
  private mouseLeftDown = false;
  private mouseRightDown = false;
  private pointerLocked = false;
  private sensitivity = 1.0;
  private lastPointerX: number | null = null;
  private lastPointerY: number | null = null;
  private pointerDragging = false;

  // Pools
  private projectiles: Projectile[] = [];
  private particles: Particle[] = [];
  private poolDisposables: Array<{ dispose: () => void }> = [];

  // Loop state
  private disposed = false;
  private frameId = 0;
  private lastFrameMs = 0;
  private totalElapsed = 0;
  private hudEmitAccum = 0;

  constructor(container: HTMLElement, callbacks: EngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareGl();
    this.record = loadMissionRecord();
    this.audio = new HelicopterAudio();
    this.radio = new PilotRadioSystem(this.audio, (tx) => {
      this.activeRadio = tx;
      if (!this.disposed && this.camera) {
        this.emitHud();
      }
    });

    // Restore user audio/radio/sensitivity settings
    try {
      const saved = localStorage.getItem(STORAGE_SETTINGS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          muted?: boolean;
          sensitivity?: number;
          radioEnabled?: boolean;
        };
        if (typeof parsed.muted === 'boolean') {
          this.audio.setMuted(parsed.muted);
          this.radio.setMuted(parsed.muted);
        }
        if (typeof parsed.radioEnabled === 'boolean') {
          this.radio.setEnabled(parsed.radioEnabled);
        }
        if (typeof parsed.sensitivity === 'number') {
          this.sensitivity = THREE.MathUtils.clamp(parsed.sensitivity, 0.35, 2.2);
        }
      }
    } catch {
      // Ignore storage errors
    }

    // 1. Renderer setup with Software-WebGL guard & studio PBR color pipeline
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const w = Math.max(container.clientWidth, window.innerWidth, 1);
    const h = Math.max(container.clientHeight, window.innerHeight, 1);
    this.renderer.setSize(w, h);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    // 2. Scene & Mandatory Studio Environment Reflections (RoomEnvironment)
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // 3. Camera
    this.camera = new THREE.PerspectiveCamera(64, w / h, 0.12, 950);

    // 4. Procedural PBR Textures + User Reference Artwork Relief
    this.textures = createTexturePack(this.renderer, (refTex) => {
      this.monolith?.applyReferenceTexture(refTex);
    });

    // 5. Golden-Hour Desert Warzone & Colossal Reference Monolith
    this.env = createDesertEnvironment(this.scene, this.textures, this.isSoftwareGl);
    this.monolith = createMonolithAssembly(this.scene, this.textures, this.isSoftwareGl);

    // 6. First-Person Attack Helicopter Cockpit Hierarchy
    this.cockpit = createCockpitRig(this.textures, this.isSoftwareGl);
    this.heliRig.add(this.cockpit.group);
    this.pilotHead.position.set(0, 0.05, -0.04);
    this.pilotHead.add(this.camera);
    this.heliRig.add(this.pilotHead);
    this.heliRig.position.copy(this.heliPos);
    this.scene.add(this.heliRig);

    // 7. Pooled Combat Projectiles & Volumetric Particle Systems
    this.initPools();

    // Pre-warm shaders on GPU
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.emitHud();

    this.lastFrameMs = performance.now();
    this.scheduleNextFrame();
  }

  private initPools(): void {
    const cannonGeo = new THREE.CylinderGeometry(0.12, 0.12, 5.2, 6);
    cannonGeo.rotateX(Math.PI / 2);
    const cannonMat = new THREE.MeshBasicMaterial({ color: '#ffe699' });

    const rocketGeo = new THREE.CylinderGeometry(0.16, 0.2, 2.2, 8);
    rocketGeo.rotateX(Math.PI / 2);
    const rocketMat = new THREE.MeshStandardMaterial({
      color: '#4c5248',
      emissive: '#ff8a1f',
      emissiveIntensity: 1.5,
      roughness: 0.4,
    });

    const tracerGeo = new THREE.CylinderGeometry(0.18, 0.18, 5.8, 6);
    tracerGeo.rotateX(Math.PI / 2);
    const tracerMat = new THREE.MeshBasicMaterial({ color: '#ff492e' });

    const flakGeo = new THREE.SphereGeometry(0.55, 8, 8);
    const flakMat = new THREE.MeshBasicMaterial({ color: '#ff9632' });

    const samGeo = new THREE.ConeGeometry(0.42, 3.2, 8);
    samGeo.rotateX(Math.PI / 2);
    const samMat = new THREE.MeshStandardMaterial({
      color: '#d9d4c7',
      emissive: '#ff3b1f',
      emissiveIntensity: 1.9,
    });

    const flareGeo = new THREE.SphereGeometry(0.42, 8, 8);
    const flareMat = new THREE.MeshBasicMaterial({ color: '#fff8d6' });

    this.poolDisposables.push(
      cannonGeo,
      cannonMat,
      rocketGeo,
      rocketMat,
      tracerGeo,
      tracerMat,
      flakGeo,
      flakMat,
      samGeo,
      samMat,
      flareGeo,
      flareMat,
    );

    const spawnPool = (
      count: number,
      kind: Projectile['kind'],
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
    ) => {
      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.visible = false;
        this.scene.add(mesh);
        this.projectiles.push({
          active: false,
          kind,
          pos: new THREE.Vector3(),
          vel: new THREE.Vector3(),
          age: 0,
          maxAge: 2,
          damage: 10,
          splashRadius: 0,
          mesh,
        });
      }
    };

    spawnPool(44, 'cannon', cannonGeo, cannonMat);
    spawnPool(20, 'rocket', rocketGeo, rocketMat);
    spawnPool(34, 'enemy_tracer', tracerGeo, tracerMat);
    spawnPool(18, 'enemy_flak', flakGeo, flakMat);
    spawnPool(10, 'enemy_sam', samGeo, samMat);
    spawnPool(24, 'flare', flareGeo, flareMat);

    // Pooled Explosion / Smoke / Spark / Dust Sprites
    for (let i = 0; i < 140; i++) {
      const isGlow = i < 65;
      const mat = new THREE.SpriteMaterial({
        map: isGlow ? this.textures.glowSprite : this.textures.smokeSprite,
        color: '#ffffff',
        transparent: true,
        opacity: 0,
        blending: isGlow ? THREE.AdditiveBlending : THREE.NormalBlending,
        depthWrite: false,
      });
      this.poolDisposables.push(mat);
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      this.scene.add(sprite);
      this.particles.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        age: 0,
        maxAge: 1,
        startScale: 1,
        endScale: 5,
        gravity: 0,
        sprite,
        baseOpacity: 0.9,
      });
    }
  }

  private spawnParticle(opts: {
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    color: string;
    startScale: number;
    endScale: number;
    maxAge: number;
    glow?: boolean;
    gravity?: number;
    opacity?: number;
  }): void {
    const startIdx = opts.glow ? 0 : 65;
    const endIdx = opts.glow ? 65 : this.particles.length;
    for (let i = startIdx; i < endIdx; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.pos.copy(opts.pos);
        p.vel.copy(opts.vel);
        p.age = 0;
        p.maxAge = opts.maxAge;
        p.startScale = opts.startScale;
        p.endScale = opts.endScale;
        p.gravity = opts.gravity ?? 0;
        p.baseOpacity = opts.opacity ?? 0.85;
        const mat = p.sprite.material as THREE.SpriteMaterial;
        mat.color.set(opts.color);
        mat.opacity = p.baseOpacity;
        mat.rotation = Math.random() * Math.PI * 2;
        p.sprite.position.copy(p.pos);
        p.sprite.scale.set(p.startScale, p.startScale, 1);
        p.sprite.visible = true;
        return;
      }
    }
  }

  private spawnExplosion(pos: THREE.Vector3, scale = 1.0): void {
    // Bright incandescent flash core
    for (let i = 0; i < 4; i++) {
      _v1.set(
        (Math.random() - 0.5) * 6 * scale,
        (Math.random() - 0.3) * 6 * scale,
        (Math.random() - 0.5) * 6 * scale,
      );
      this.spawnParticle({
        pos,
        vel: _v1,
        color: i === 0 ? '#fff2cc' : '#ff8c24',
        startScale: 4 * scale,
        endScale: 16 * scale,
        maxAge: 0.32 + Math.random() * 0.25,
        glow: true,
        opacity: 0.95,
      });
    }
    // Dark desert smoke billows
    for (let i = 0; i < 6; i++) {
      _v1.set(
        (Math.random() - 0.5) * 9 * scale,
        3 + Math.random() * 7 * scale,
        (Math.random() - 0.5) * 9 * scale,
      );
      this.spawnParticle({
        pos,
        vel: _v1,
        color: i % 2 === 0 ? '#2b221a' : '#705842',
        startScale: 3.5 * scale,
        endScale: 18 * scale,
        maxAge: 0.9 + Math.random() * 0.75,
        glow: false,
        gravity: -1.5,
        opacity: 0.65,
      });
    }
  }

  private getFreeProjectile(kind: Projectile['kind']): Projectile | null {
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      if (!p.active && p.kind === kind) return p;
    }
    return null;
  }

  // =========================================================================
  // PUBLIC CONTROLS API (Called by React Shell)
  // =========================================================================

  public startMission(): void {
    this.audio.init();
    this.radio.cancelAll();
    this.resetSimulation();
    this.phase = 'playing';
    this.audio.setFlightActive(true);
    this.requestPointerLockSafe();
    this.showBanner('STAGE 1 · NEUTRALIZE OUTER AA & BASAL NODES');
    this.radio.trigger('mission_start');
    this.emitHud();
  }

  public resumeMission(): void {
    if (this.phase === 'paused' || this.phase === 'photo') {
      this.phase = 'playing';
      this.audio.setFlightActive(true);
      this.requestPointerLockSafe();
      this.emitHud();
    }
  }

  public pauseMission(): void {
    if (this.phase === 'playing') {
      this.phase = 'paused';
      this.keys.clear();
      this.mouseLeftDown = false;
      this.mouseRightDown = false;
      this.audio.setFlightActive(false);
      this.radio.cancelAll();
      this.exitPointerLockSafe();
      this.emitHud();
    }
  }

  public toggleActionShot(): void {
    if (this.phase === 'playing') {
      this.phase = 'photo';
      this.keys.clear();
      this.mouseLeftDown = false;
      this.mouseRightDown = false;
      this.audio.setFlightActive(false);
      this.radio.cancelAll();
      this.exitPointerLockSafe();
      this.emitHud();
    } else if (this.phase === 'photo') {
      this.resumeMission();
    }
  }

  public returnToTitle(): void {
    this.phase = 'title';
    this.keys.clear();
    this.mouseLeftDown = false;
    this.mouseRightDown = false;
    this.audio.setFlightActive(false);
    this.radio.cancelAll();
    this.exitPointerLockSafe();
    this.resetSimulation();
    this.emitHud();
  }

  public toggleMute(): void {
    this.audio.init();
    const next = !this.audio.isMuted();
    this.audio.setMuted(next);
    this.radio.setMuted(next);
    this.saveSettings();
    this.emitHud();
  }

  public toggleRadio(): void {
    this.audio.init();
    this.radio.setEnabled(!this.radio.isEnabled());
    this.saveSettings();
    this.emitHud();
  }

  public setSensitivity(val: number): void {
    this.sensitivity = THREE.MathUtils.clamp(val, 0.35, 2.2);
    this.saveSettings();
    this.emitHud();
  }

  public captureActionShot(): string {
    // Render a fresh frame immediately prior to capture so the drawing buffer is populated
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(
        STORAGE_SETTINGS_KEY,
        JSON.stringify({
          muted: this.audio.isMuted(),
          radioEnabled: this.radio.isEnabled(),
          sensitivity: this.sensitivity,
        }),
      );
    } catch {
      // Ignore storage errors
    }
  }

  private requestPointerLockSafe(): void {
    try {
      const el = this.renderer.domElement;
      if (document.pointerLockElement !== el && el.requestPointerLock) {
        const res = el.requestPointerLock() as unknown as Promise<void> | undefined;
        if (res && typeof res.catch === 'function') {
          res.catch(() => {
            // Iframe or gesture restriction — fallback cursor/drag aiming remains seamless
          });
        }
      }
    } catch {
      // Ignore pointer lock restrictions
    }
  }

  private exitPointerLockSafe(): void {
    try {
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    } catch {
      // Ignore
    }
  }

  private resetSimulation(): void {
    // Position gunship on an iconic golden-hour cinematic approach directly facing the monolith
    this.heliPos.set(-16, 38, 128);
    this.heliVel.set(0, 0, 0);
    this.headingYaw = -0.12;
    this.viewYaw = -0.12;
    this.viewPitch = 0.05;
    this.bodyPitch = 0;
    this.bodyRoll = 0;
    this.shakeTrauma = 0;

    this.strikeStage = 1;
    this.hull = this.maxHull;
    this.cannonHeat = 0;
    this.cannonOverheated = false;
    this.cannonCooldown = 0;
    this.rockets = this.maxRockets;
    this.rocketCooldown = 0;
    this.rocketRechargeTimer = 0;
    this.flares = this.maxFlares;
    this.flareCooldown = 0;
    this.score = 0;
    this.elapsedMissionSec = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.hitMarkerTimer = 0;
    this.killMarkerTimer = 0;
    this.damageFlash = 0;
    this.hitstopTimer = 0;
    this.samSpawnTimer = 5.0;
    this.rwrWarningTimer = 0;
    this.rwrCooldown = 14.0;

    this.monolith.resetTargets();

    for (const p of this.projectiles) {
      p.active = false;
      p.mesh.visible = false;
    }
    for (const pt of this.particles) {
      pt.active = false;
      pt.sprite.visible = false;
    }

    this.cockpit.group.visible = true;
    this.heliRig.position.copy(this.heliPos);
    this.heliRig.rotation.set(0, this.headingYaw, 0, 'YXZ');
    this.pilotHead.rotation.set(this.viewPitch, 0, 0, 'YXZ');
  }

  private showBanner(text: string): void {
    this.stageBanner = text;
    this.stageBannerTimer = 3.8;
  }

  // =========================================================================
  // EVENT LISTENERS (Keyboard, Mouse, Pointer Lock, Resize, Context Loss)
  // =========================================================================

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      if (this.phase === 'playing') e.preventDefault();
    }

    // Edge-triggered global shortcuts
    if (!e.repeat) {
      if (e.code === 'Escape') {
        if (this.phase === 'playing') {
          this.pauseMission();
          return;
        }
        if (this.phase === 'paused' || this.phase === 'photo') {
          this.resumeMission();
          return;
        }
      }
      if (e.code === 'KeyP' && (this.phase === 'playing' || this.phase === 'photo')) {
        this.toggleActionShot();
        return;
      }
      if (e.code === 'KeyM') {
        this.toggleMute();
        return;
      }
      if (e.code === 'KeyV') {
        this.toggleRadio();
        return;
      }
      if (this.phase === 'playing') {
        if (e.code === 'KeyF') this.deployFlares();
        if (e.code === 'KeyR') this.fireRocket();
      }
    }

    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onBlur = () => {
    this.keys.clear();
    this.mouseLeftDown = false;
    this.mouseRightDown = false;
    this.pointerDragging = false;
  };

  private onPointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    this.emitHud();
  };

  private onMouseMove = (e: MouseEvent) => {
    if (this.phase !== 'playing') return;

    const sens = 0.0022 * this.sensitivity;
    if (this.pointerLocked) {
      this.viewYaw -= e.movementX * sens;
      this.viewPitch = THREE.MathUtils.clamp(
        this.viewPitch - e.movementY * sens,
        -0.88,
        0.78,
      );
    } else if (this.pointerDragging || this.mouseLeftDown || this.mouseRightDown) {
      if (this.lastPointerX !== null && this.lastPointerY !== null) {
        const dx = e.clientX - this.lastPointerX;
        const dy = e.clientY - this.lastPointerY;
        this.viewYaw -= dx * sens * 1.35;
        this.viewPitch = THREE.MathUtils.clamp(
          this.viewPitch - dy * sens * 1.35,
          -0.88,
          0.78,
        );
      }
    } else {
      // Gentle unlocked free-look tracking when cursor moves over canvas
      if (this.lastPointerX !== null && this.lastPointerY !== null) {
        const dx = e.clientX - this.lastPointerX;
        const dy = e.clientY - this.lastPointerY;
        this.viewYaw -= dx * sens * 0.72;
        this.viewPitch = THREE.MathUtils.clamp(
          this.viewPitch - dy * sens * 0.72,
          -0.88,
          0.78,
        );
      }
    }
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.phase !== 'playing') return;
    if (e.target !== this.renderer.domElement) return;

    this.audio.init();
    if (!this.pointerLocked) {
      this.requestPointerLockSafe();
    }

    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.pointerDragging = true;

    if (e.button === 0) {
      this.mouseLeftDown = true;
    } else if (e.button === 2) {
      this.mouseRightDown = true;
      this.fireRocket();
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouseLeftDown = false;
    if (e.button === 2) this.mouseRightDown = false;
    if (!this.mouseLeftDown && !this.mouseRightDown) {
      this.pointerDragging = false;
    }
  };

  private onContextMenu = (e: MouseEvent) => {
    if (this.phase === 'playing') {
      e.preventDefault();
    }
  };

  private onResize = () => {
    const w = Math.max(this.container.clientWidth, window.innerWidth, 1);
    const h = Math.max(this.container.clientHeight, window.innerHeight, 1);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.callbacks.onContextError?.('WebGL rendering context lost. Attempting recovery...');
  };

  private onContextRestored = () => {
    this.callbacks.onContextError?.('');
  };

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  // =========================================================================
  // WEAPONS & COUNTERMEASURES
  // =========================================================================

  private fireCannon(): void {
    if (this.cannonOverheated || this.cannonCooldown > 0) return;
    const proj = this.getFreeProjectile('cannon');
    if (!proj) return;

    this.cannonCooldown = 0.088;
    this.cannonHeat = Math.min(100, this.cannonHeat + 4.4);
    if (this.cannonHeat >= 100) {
      this.cannonOverheated = true;
      this.radio.trigger('cannon_overheat');
    }

    this.shotsFired++;
    this.cockpit.triggerMuzzleFlash();
    this.audio.playCannonShot();
    this.shakeTrauma = Math.min(1, this.shakeTrauma + 0.08);

    // Converge chin cannon bolt cleanly onto exact center-screen camera crosshair at 135m
    this.camera.getWorldPosition(_v1);
    this.camera.getWorldDirection(_aimDir);
    _v2.copy(_v1).addScaledVector(_aimDir, 135);

    this.cockpit.muzzleWorldPos(proj.pos);
    proj.vel
      .subVectors(_v2, proj.pos)
      .normalize()
      .addScaledVector(
        _v3.set(
          (Math.random() - 0.5) * 0.012,
          (Math.random() - 0.5) * 0.012,
          (Math.random() - 0.5) * 0.012,
        ),
        1,
      )
      .normalize()
      .multiplyScalar(275);

    proj.active = true;
    proj.age = 0;
    proj.maxAge = 1.45;
    proj.damage = 16;
    proj.splashRadius = 2.5;
    proj.mesh.position.copy(proj.pos);
    proj.mesh.lookAt(_v3.copy(proj.pos).add(proj.vel));
    proj.mesh.visible = true;
  }

  private fireRocket(): void {
    if (this.rockets <= 0 || this.rocketCooldown > 0) return;
    const proj = this.getFreeProjectile('rocket');
    if (!proj) return;

    this.rockets--;
    this.rocketCooldown = 0.34;
    this.shotsFired++;
    this.audio.playRocketLaunch();
    this.shakeTrauma = Math.min(1, this.shakeTrauma + 0.22);

    if (this.rockets === 0) {
      this.radio.trigger('rockets_empty');
    } else if (this.rockets === 4 || this.rockets === 2) {
      this.radio.trigger('low_rockets');
    }

    this.camera.getWorldPosition(_v1);
    this.camera.getWorldDirection(_aimDir);
    _v2.copy(_v1).addScaledVector(_aimDir, 150);

    // Launch from alternating left/right stub-wing Hydra-70 pods
    _v3.set(this.rocketSideToggle * 1.55, -0.68, -1.6);
    this.rocketSideToggle *= -1;
    this.heliRig.localToWorld(_v3);

    proj.pos.copy(_v3);
    proj.vel.subVectors(_v2, proj.pos).normalize().multiplyScalar(155);
    proj.active = true;
    proj.age = 0;
    proj.maxAge = 3.2;
    proj.damage = 78;
    proj.splashRadius = 11.0;
    proj.mesh.position.copy(proj.pos);
    proj.mesh.lookAt(_v1.copy(proj.pos).add(proj.vel));
    proj.mesh.visible = true;
  }

  private deployFlares(): void {
    if (this.flares <= 0 || this.flareCooldown > 0) return;
    this.flares--;
    this.flareCooldown = 3.2;
    this.audio.playFlareDeploy();

    for (let i = 0; i < 4; i++) {
      const f = this.getFreeProjectile('flare');
      if (!f) break;
      const side = i % 2 === 0 ? -1 : 1;
      _v1.set(side * 1.6, -0.9, 1.2);
      this.heliRig.localToWorld(_v1);
      f.pos.copy(_v1);

      _v2.set(side * (12 + Math.random() * 8), -4 - Math.random() * 5, 10 + Math.random() * 6);
      _v2.applyQuaternion(this.heliRig.quaternion);
      f.vel.copy(this.heliVel).multiplyScalar(0.45).add(_v2);

      f.active = true;
      f.age = 0;
      f.maxAge = 3.6;
      f.damage = 0;
      f.splashRadius = 0;
      f.mesh.position.copy(f.pos);
      f.mesh.visible = true;
    }

    const hadThreatLock = this.rwrWarningTimer > 0 || this.countActiveSams() > 0;
    this.rwrWarningTimer = 0;

    // Distract all currently airborne enemy SAM missiles immediately
    for (const p of this.projectiles) {
      if (p.active && p.kind === 'enemy_sam') {
        p.distractedByFlare = true;
      }
    }

    this.radio.trigger(hadThreatLock ? 'flares_spoofed' : 'flares_deployed');
  }

  // =========================================================================
  // SIMULATION STEP
  // =========================================================================

  private stepSimulation(dt: number): void {
    this.totalElapsed += dt;

    // 1. Live Cinematic Orbital Showcase on Title Screen
    if (this.phase === 'title') {
      this.cockpit.group.visible = false;
      const orbitAngle = this.totalElapsed * 0.14 - 0.35;
      const radius = 122 + Math.sin(this.totalElapsed * 0.25) * 10;
      const camX = Math.sin(orbitAngle) * radius;
      const camZ = Math.cos(orbitAngle) * radius;
      const camY = 44 + Math.sin(this.totalElapsed * 0.32) * 9;

      this.heliRig.position.set(camX, camY, camZ);
      this.heliRig.rotation.set(0, 0, 0);
      this.pilotHead.rotation.set(0, 0, 0);
      this.camera.position.set(0, 0, 0);
      this.camera.lookAt(0, 44, 0);

      this.env.update(dt, this.totalElapsed, this.heliRig.position);
      this.monolith.update(dt, this.totalElapsed, this.heliRig.position);
      return;
    }

    // Frozen states (paused / action shot photo mode / victory / gameover)
    if (this.phase !== 'playing') {
      return;
    }

    // Brief tactical hitstop on heavy core detonations
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      return;
    }

    this.elapsedMissionSec += dt;

    if (this.stageBannerTimer > 0) {
      this.stageBannerTimer -= dt;
      if (this.stageBannerTimer <= 0) this.stageBanner = null;
    }
    if (this.hitMarkerTimer > 0) this.hitMarkerTimer = Math.max(0, this.hitMarkerTimer - dt);
    if (this.killMarkerTimer > 0) this.killMarkerTimer = Math.max(0, this.killMarkerTimer - dt);
    if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - dt * 2.4);

    // 2. Tactical Arcade Helicopter Flight Kinematics (WASD + Space/Shift + Mouse Look)
    const forwardIn =
      (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) -
      (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
    const rightIn =
      (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) -
      (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    const upIn =
      (this.keys.has('Space') || this.keys.has('KeyE') ? 1 : 0) -
      (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.keys.has('KeyQ')
        ? 1
        : 0);

    // Free-look while holding C/Alt lets head swivel inside cockpit without turning airframe
    const freeLookHeld =
      this.keys.has('KeyC') || this.keys.has('AltLeft') || this.keys.has('AltRight');
    if (!freeLookHeld) {
      // Smooth gunship yaw alignment toward pilot look direction (leaving crisp cockpit lead parallax!)
      const yawDiff = this.viewYaw - this.headingYaw;
      this.headingYaw += yawDiff * (1 - Math.exp(-5.4 * dt));
    }

    // Local cockpit head-look offset clamped cleanly inside canopy view
    const headLookYaw = THREE.MathUtils.clamp(
      this.viewYaw - this.headingYaw,
      -1.15,
      1.15,
    );
    const headLookPitch = this.viewPitch;

    // Thrust vectors aligned with helicopter heading
    _forward.set(-Math.sin(this.headingYaw), 0, -Math.cos(this.headingYaw));
    _right.set(Math.cos(this.headingYaw), 0, -Math.sin(this.headingYaw));

    const maxHorizSpeed = 48;
    const maxVertSpeed = 28;
    _v1
      .set(0, 0, 0)
      .addScaledVector(_forward, forwardIn * maxHorizSpeed)
      .addScaledVector(_right, rightIn * maxHorizSpeed * 0.85);
    _v1.y = upIn * maxVertSpeed;

    // Exponential velocity damping for weighty helicopter momentum
    const accelLambda = forwardIn !== 0 || rightIn !== 0 || upIn !== 0 ? 3.2 : 2.1;
    const dampT = 1 - Math.exp(-accelLambda * dt);
    this.heliVel.lerp(_v1, dampT);
    this.heliPos.addScaledVector(this.heliVel, dt);

    // Terrain clearance & soft desert canyon perimeter containment
    const groundY = groundHeightAt(this.heliPos.x, this.heliPos.z);
    const minAlt = groundY + 7.5;
    if (this.heliPos.y < minAlt) {
      this.heliPos.y = minAlt;
      if (this.heliVel.y < 0) this.heliVel.y = 0;
    }
    if (this.heliPos.y > 132) {
      this.heliPos.y = 132;
      if (this.heliVel.y > 0) this.heliVel.y = 0;
    }

    const horizDist = Math.hypot(this.heliPos.x, this.heliPos.z);
    if (horizDist > 192) {
      const pull = (horizDist - 192) * 0.5;
      this.heliPos.x -= (this.heliPos.x / horizDist) * pull;
      this.heliPos.z -= (this.heliPos.z / horizDist) * pull;
    }

    // Monolith collision pushback so gunship glides smoothly around arches without clipping
    for (const sphere of this.monolith.colliderSpheres) {
      _v2.subVectors(this.heliPos, sphere.center);
      const dist = _v2.length();
      const minDist = sphere.radius + 6.2;
      if (dist < minDist && dist > 0.001) {
        _v2.divideScalar(dist);
        this.heliPos.copy(sphere.center).addScaledVector(_v2, minDist);
        const vn = this.heliVel.dot(_v2);
        if (vn < 0) {
          this.heliVel.addScaledVector(_v2, -vn * 1.15);
        }
      }
    }

    // Authentic helicopter nose pitch & lateral bank roll linked to velocity + stick input
    const localForwardSpeed = this.heliVel.dot(_forward);
    const localRightSpeed = this.heliVel.dot(_right);
    const targetPitch = THREE.MathUtils.clamp(-localForwardSpeed * 0.0046, -0.24, 0.22);
    const targetRoll = THREE.MathUtils.clamp(-localRightSpeed * 0.0072, -0.34, 0.34);
    this.bodyPitch = THREE.MathUtils.damp(this.bodyPitch, targetPitch, 5.5, dt);
    this.bodyRoll = THREE.MathUtils.damp(this.bodyRoll, targetRoll, 5.5, dt);

    // Apply transforms + rotor micro-vibration + decaying trauma camera shake
    this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 1.9);
    const shakeAmt = this.shakeTrauma * this.shakeTrauma;
    const vibX = Math.sin(this.totalElapsed * 44) * 0.0025 + (Math.random() - 0.5) * 0.06 * shakeAmt;
    const vibY = Math.cos(this.totalElapsed * 37) * 0.0025 + (Math.random() - 0.5) * 0.06 * shakeAmt;

    this.cockpit.group.visible = true;
    this.heliRig.position.copy(this.heliPos);
    this.heliRig.rotation.set(this.bodyPitch, this.headingYaw, this.bodyRoll, 'YXZ');

    // Pilot head smoothly stabilizes horizon slightly while tracking mouse look
    this.pilotHead.rotation.set(
      headLookPitch - this.bodyPitch * 0.35 + vibY,
      headLookYaw + vibX,
      -this.bodyRoll * 0.28,
      'YXZ',
    );
    this.camera.position.set(vibX * 0.4, vibY * 0.4, 0);
    this.camera.rotation.set(0, 0, 0);

    // Subtle speed FOV widening
    const speedRatio = THREE.MathUtils.clamp(this.heliVel.length() / maxHorizSpeed, 0, 1);
    const targetFov = 64 + speedRatio * 5.5;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 5, dt);
      this.camera.updateProjectionMatrix();
    }

    // 3. Weapon Cooldowns, Cooling, Reloading & Continuous Trigger
    this.cannonCooldown = Math.max(0, this.cannonCooldown - dt);
    this.rocketCooldown = Math.max(0, this.rocketCooldown - dt);
    this.flareCooldown = Math.max(0, this.flareCooldown - dt);

    if (this.mouseLeftDown && !this.cannonOverheated) {
      this.fireCannon();
    } else {
      const coolRate = this.cannonOverheated ? 28 : 34;
      this.cannonHeat = Math.max(0, this.cannonHeat - coolRate * dt);
      if (this.cannonOverheated && this.cannonHeat <= 22) {
        this.cannonOverheated = false;
      }
    }

    // Auto-recharge Hydra rockets when below max
    if (this.rockets < this.maxRockets) {
      this.rocketRechargeTimer += dt;
      if (this.rocketRechargeTimer >= 2.6) {
        this.rocketRechargeTimer = 0;
        this.rockets++;
      }
    } else {
      this.rocketRechargeTimer = 0;
    }

    // Monolith non-damaging RWR missile-lock warning sweep (keeps helicopter-only combat)
    if (this.rwrWarningTimer > 0) {
      this.rwrWarningTimer = Math.max(0, this.rwrWarningTimer - dt);
    } else {
      this.rwrCooldown -= dt;
      if (this.rwrCooldown <= 0 && horizDist < 112) {
        this.rwrWarningTimer = 4.6;
        this.rwrCooldown = this.strikeStage >= 2 ? 19.0 : 25.0;
        this.radio.trigger('incoming_missile');
      }
    }

    // Low-altitude GPWS terrain callout when descending near canyon floor
    const altFt = (this.heliPos.y - groundY) * 3.28;
    if (altFt < 34 && this.heliVel.y < -5.5) {
      this.radio.trigger('low_altitude');
    }

    const missileWarningActive = this.countActiveSams() > 0 || this.rwrWarningTimer > 0;

    // 4. Update Environment, Monolith & Cockpit Rig
    this.env.update(dt, this.totalElapsed, this.heliPos);
    this.monolith.update(dt, this.totalElapsed, this.heliPos);
    this.cockpit.update({
      dt,
      elapsed: this.totalElapsed,
      moveForward: forwardIn,
      moveRight: rightIn,
      moveUp: upIn,
      pitchRad: this.bodyPitch,
      rollRad: this.bodyRoll,
      headingRad: this.headingYaw,
      lookYaw: headLookYaw,
      lookPitch: headLookPitch,
      missileWarning: missileWarningActive,
      hullPct: this.hull / this.maxHull,
      heliPos: this.heliPos,
      targets: this.monolith.targets,
    });

    // 5. Step Projectiles & Particles (only the player helicopter strikes)
    this.updateProjectiles(dt);
    this.updateParticles(dt);

    // 6. Update Procedural Rotor Audio (responds to airspeed, climb torque, and banking)
    const bankIntensity = THREE.MathUtils.clamp(
      (Math.abs(this.bodyRoll) + Math.abs(this.bodyPitch)) * 2.2,
      0,
      1,
    );
    this.audio.updateRotor(speedRatio, upIn, missileWarningActive, bankIntensity);
  }

  private countActiveSams(): number {
    let n = 0;
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      if (p.active && p.kind === 'enemy_sam' && !p.distractedByFlare) n++;
    }
    return n;
  }

  private updateEnemyFire(dt: number): void {
    for (const t of this.monolith.targets) {
      if (t.destroyed || t.shielded) continue;

      t.fireCooldown -= dt;
      if (t.fireCooldown > 0) continue;

      const dist = t.worldPos.distanceTo(this.heliPos);
      if (dist > 235) {
        t.fireCooldown = 1.0;
        continue;
      }

      if (t.kind === 'flak') {
        // Telegraphed flak airburst shell aimed slightly ahead of helicopter path
        t.fireCooldown = 2.4 + Math.random() * 1.4;
        const shell = this.getFreeProjectile('enemy_flak');
        if (shell) {
          shell.pos.copy(t.worldPos).add(_v1.set(0, 1.5, 0));
          const leadTime = THREE.MathUtils.clamp(dist / 92, 0.25, 1.4);
          _v2
            .copy(this.heliPos)
            .addScaledVector(this.heliVel, leadTime * 0.72)
            .add(
              _v3.set(
                (Math.random() - 0.5) * 14,
                (Math.random() - 0.5) * 9,
                (Math.random() - 0.5) * 14,
              ),
            );
          shell.vel.subVectors(_v2, shell.pos).normalize().multiplyScalar(92);
          shell.detonateDist = Math.max(18, shell.pos.distanceTo(_v2));
          shell.active = true;
          shell.age = 0;
          shell.maxAge = 3.2;
          shell.damage = 11;
          shell.splashRadius = 11.5;
          shell.mesh.position.copy(shell.pos);
          shell.mesh.visible = true;
        }
      } else if (t.kind === 'basal' || t.kind === 'copper' || t.kind === 'apex') {
        // Fast crimson tracer burst from monolith cores
        t.fireCooldown = t.kind === 'apex' ? 0.95 : 1.55 + Math.random() * 0.8;
        const bolt = this.getFreeProjectile('enemy_tracer');
        if (bolt) {
          bolt.pos.copy(t.worldPos);
          const leadTime = THREE.MathUtils.clamp(dist / 125, 0.2, 1.1);
          _v2
            .copy(this.heliPos)
            .addScaledVector(this.heliVel, leadTime * 0.55)
            .add(
              _v3.set(
                (Math.random() - 0.5) * 9,
                (Math.random() - 0.5) * 7,
                (Math.random() - 0.5) * 9,
              ),
            );
          bolt.vel.subVectors(_v2, bolt.pos).normalize().multiplyScalar(125);
          bolt.active = true;
          bolt.age = 0;
          bolt.maxAge = 2.6;
          bolt.damage = 7;
          bolt.splashRadius = 4.2;
          bolt.mesh.position.copy(bolt.pos);
          bolt.mesh.lookAt(_v3.copy(bolt.pos).add(bolt.vel));
          bolt.mesh.visible = true;
        }
      }
    }

    // Stage 2 & 3: Monolith central chasm launches Homing SAM Missiles!
    if (this.strikeStage >= 2) {
      this.samSpawnTimer -= dt;
      if (this.samSpawnTimer <= 0 && this.countActiveSams() < 2) {
        this.samSpawnTimer = this.strikeStage === 3 ? 6.2 : 8.5;
        const sam = this.getFreeProjectile('enemy_sam');
        if (sam) {
          const baseY = groundHeightAt(0, 0);
          sam.pos.set((Math.random() - 0.5) * 8, baseY + 41, 13);
          sam.vel.subVectors(this.heliPos, sam.pos).normalize().multiplyScalar(54);
          sam.active = true;
          sam.age = 0;
          sam.maxAge = 7.5;
          sam.damage = 22;
          sam.splashRadius = 7.5;
          sam.distractedByFlare = false;
          sam.mesh.position.copy(sam.pos);
          sam.mesh.visible = true;
        }
      }
    }
  }

  private updateProjectiles(dt: number): void {
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      if (!p.active) continue;

      p.age += dt;
      if (p.age >= p.maxAge) {
        if (p.kind === 'enemy_flak' || p.kind === 'enemy_sam') {
          this.spawnExplosion(p.pos, 0.7);
        }
        p.active = false;
        p.mesh.visible = false;
        continue;
      }

      // Homing SAM steering & smoke trails
      if (p.kind === 'enemy_sam') {
        if (p.distractedByFlare) {
          p.vel.y -= 18 * dt;
          p.vel.x += Math.sin(p.age * 9) * 28 * dt;
        } else {
          _v1.subVectors(this.heliPos, p.pos).normalize().multiplyScalar(58);
          p.vel.lerp(_v1, 1 - Math.exp(-2.1 * dt));
        }
        if (Math.random() < 0.65) {
          this.spawnParticle({
            pos: p.pos,
            vel: _v1.set((Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2),
            color: '#e5d4be',
            startScale: 1.4,
            endScale: 5.5,
            maxAge: 0.65,
            glow: false,
            opacity: 0.45,
          });
        }
      } else if (p.kind === 'rocket') {
        if (Math.random() < 0.75) {
          this.spawnParticle({
            pos: p.pos,
            vel: _v1.set(0, 1.0, 0),
            color: '#d9c5a8',
            startScale: 1.0,
            endScale: 4.5,
            maxAge: 0.5,
            glow: false,
            opacity: 0.4,
          });
        }
      } else if (p.kind === 'flare') {
        p.vel.y -= 9.5 * dt;
        p.vel.multiplyScalar(Math.pow(0.6, dt));
        if (Math.random() < 0.75) {
          this.spawnParticle({
            pos: p.pos,
            vel: _v1.set(0, 1.5, 0),
            color: '#fff4c2',
            startScale: 1.6,
            endScale: 4.2,
            maxAge: 0.42,
            glow: true,
            opacity: 0.85,
          });
        }
      }

      const stepDist = p.vel.length() * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);
      if (p.kind !== 'flare' && p.kind !== 'enemy_flak') {
        p.mesh.lookAt(_v1.copy(p.pos).add(p.vel));
      }

      // Ground impact check
      const gy = groundHeightAt(p.pos.x, p.pos.z);
      if (p.pos.y <= gy) {
        if (p.kind === 'rocket' || p.kind === 'enemy_sam') {
          this.spawnExplosion(p.pos, p.kind === 'rocket' ? 1.05 : 0.75);
          this.audio.playExplosion(0.6);
          if (p.kind === 'rocket') this.applySplashDamageToTargets(p.pos, p.splashRadius, p.damage);
        } else if (p.kind === 'cannon') {
          this.spawnParticle({
            pos: p.pos,
            vel: _v1.set(0, 5, 0),
            color: '#d9b584',
            startScale: 1.5,
            endScale: 5.0,
            maxAge: 0.45,
            glow: false,
            opacity: 0.5,
          });
        }
        p.active = false;
        p.mesh.visible = false;
        continue;
      }

      // Player projectiles -> Hit check against Mission Targets & Monolith Stone
      if (p.kind === 'cannon' || p.kind === 'rocket') {
        let hitTarget: TargetEntity | null = null;
        for (const t of this.monolith.targets) {
          if (t.destroyed) continue;
          const d = p.pos.distanceTo(t.worldPos);
          if (d <= t.hitRadius + (p.kind === 'rocket' ? 1.8 : 0.8)) {
            hitTarget = t;
            break;
          }
        }

        if (hitTarget) {
          this.shotsHit++;
          if (p.kind === 'rocket') {
            this.spawnExplosion(p.pos, 1.15);
            this.audio.playExplosion(0.75);
            this.applySplashDamageToTargets(p.pos, p.splashRadius, p.damage);
          } else {
            this.damageTarget(hitTarget, p.damage, p.pos);
          }
          p.active = false;
          p.mesh.visible = false;
          continue;
        }

        // Impact sparks on monolith stone body
        let hitStone = false;
        for (const s of this.monolith.colliderSpheres) {
          if (p.pos.distanceTo(s.center) < s.radius) {
            hitStone = true;
            break;
          }
        }
        if (hitStone) {
          if (p.kind === 'rocket') {
            this.spawnExplosion(p.pos, 1.0);
            this.audio.playExplosion(0.7);
            this.applySplashDamageToTargets(p.pos, p.splashRadius, p.damage);
          } else {
            this.spawnParticle({
              pos: p.pos,
              vel: _v1.set((Math.random() - 0.5) * 6, 4, (Math.random() - 0.5) * 6),
              color: '#ffcf7d',
              startScale: 1.4,
              endScale: 3.4,
              maxAge: 0.22,
              glow: true,
              opacity: 0.9,
            });
          }
          p.active = false;
          p.mesh.visible = false;
          continue;
        }
      }

      // Enemy projectiles -> Player Helicopter Proximity & Airburst Flak
      if (p.kind === 'enemy_flak') {
        p.detonateDist = (p.detonateDist ?? 100) - stepDist;
        const distToPlayer = p.pos.distanceTo(this.heliPos);
        if (p.detonateDist <= 0 || distToPlayer < 8.0) {
          // Black-orange military flak burst!
          this.spawnExplosion(p.pos, 0.92);
          if (distToPlayer < p.splashRadius) {
            const falloff = 1 - distToPlayer / p.splashRadius;
            this.applyPlayerDamage(Math.max(4, Math.round(p.damage * falloff)));
          } else if (distToPlayer < 26) {
            this.shakeTrauma = Math.min(1, this.shakeTrauma + 0.25);
            this.audio.playExplosion(0.45);
          }
          p.active = false;
          p.mesh.visible = false;
          continue;
        }
      } else if (p.kind === 'enemy_tracer' || p.kind === 'enemy_sam') {
        const distToPlayer = p.pos.distanceTo(this.heliPos);
        if (distToPlayer < (p.kind === 'enemy_sam' ? 6.5 : 5.2)) {
          this.spawnExplosion(p.pos, p.kind === 'enemy_sam' ? 1.1 : 0.55);
          this.applyPlayerDamage(p.damage);
          p.active = false;
          p.mesh.visible = false;
          continue;
        }
      }
    }
  }

  private applySplashDamageToTargets(origin: THREE.Vector3, radius: number, maxDmg: number): void {
    for (const t of this.monolith.targets) {
      if (t.destroyed) continue;
      const d = origin.distanceTo(t.worldPos);
      if (d <= radius + t.hitRadius) {
        const falloff = THREE.MathUtils.clamp(1 - d / (radius + t.hitRadius + 1), 0.35, 1);
        this.damageTarget(t, Math.round(maxDmg * falloff), origin);
      }
    }
  }

  private damageTarget(target: TargetEntity, amount: number, hitPos: THREE.Vector3): void {
    if (target.destroyed) return;

    if (target.shielded) {
      // Deflect off containment barrier with amber spark
      this.spawnParticle({
        pos: hitPos,
        vel: _v1.set((Math.random() - 0.5) * 8, 4, (Math.random() - 0.5) * 8),
        color: '#f59e0b',
        startScale: 2.2,
        endScale: 6.5,
        maxAge: 0.25,
        glow: true,
        opacity: 0.9,
      });
      this.radio.trigger('shielded_hit');
      return;
    }

    target.hp = Math.max(0, target.hp - amount);
    target.hitFlash = 1.0;
    this.hitMarkerTimer = 0.16;

    this.spawnParticle({
      pos: hitPos,
      vel: _v1.set((Math.random() - 0.5) * 10, 4 + Math.random() * 5, (Math.random() - 0.5) * 10),
      color: '#ffbe55',
      startScale: 1.8,
      endScale: 4.5,
      maxAge: 0.24,
      glow: true,
      opacity: 0.95,
    });

    if (target.hp <= 0) {
      target.destroyed = true;
      target.meshGroup.visible = false;
      this.killMarkerTimer = 0.45;
      this.hitstopTimer = 0.048; // Crisp 48ms impact hitstop
      this.shakeTrauma = Math.min(1, this.shakeTrauma + 0.62);
      this.score += target.kind === 'apex' ? 1500 : target.kind === 'copper' ? 750 : 350;

      this.spawnExplosion(target.worldPos, target.kind === 'apex' ? 2.6 : 1.75);
      this.audio.playHitConfirm(true);
      this.audio.playExplosion(target.kind === 'apex' ? 1.8 : 1.25);

      const stageChanged = this.checkStageProgression();
      if (!stageChanged) {
        this.radio.trigger('target_destroyed', { targetKind: target.kind });
      }
    } else {
      this.audio.playHitConfirm(false);
    }
  }

  private checkStageProgression(): boolean {
    const stage1Alive = this.monolith.targets.some((t) => t.stage === 1 && !t.destroyed);
    const stage2Alive = this.monolith.targets.some((t) => t.stage === 2 && !t.destroyed);
    const stage3Alive = this.monolith.targets.some((t) => t.stage === 3 && !t.destroyed);

    if (this.strikeStage === 1 && !stage1Alive) {
      this.strikeStage = 2;
      for (const t of this.monolith.targets) {
        if (t.stage === 2) t.shielded = false;
      }
      this.showBanner('STAGE 2 · TWIN COPPER CORES EXPOSED');
      this.audio.playExplosion(1.1);
      this.radio.trigger('stage_2');
      return true;
    } else if (this.strikeStage === 2 && !stage2Alive) {
      this.strikeStage = 3;
      for (const t of this.monolith.targets) {
        if (t.stage === 3) t.shielded = false;
      }
      this.showBanner('FINAL STAGE · APEX DIAMOND CORE EXPOSED');
      this.audio.playExplosion(1.3);
      this.radio.trigger('stage_3');
      return true;
    } else if (!stage3Alive) {
      // Mission Victory!
      const timeBonus = Math.max(0, Math.round(1200 - this.elapsedMissionSec * 5));
      const hullBonus = Math.round(this.hull * 10);
      this.score += timeBonus + hullBonus;

      this.record = {
        bestScore: Math.max(this.record.bestScore, this.score),
        bestTimeSec:
          this.record.bestTimeSec === null
            ? this.elapsedMissionSec
            : Math.min(this.record.bestTimeSec, this.elapsedMissionSec),
        victories: this.record.victories + 1,
      };
      saveMissionRecord(this.record);
      this.callbacks.onRecordUpdate(this.record);

      this.phase = 'victory';
      this.keys.clear();
      this.mouseLeftDown = false;
      this.mouseRightDown = false;
      this.audio.setFlightActive(false);
      this.rwrWarningTimer = 0;
      this.radio.trigger('victory');
      this.exitPointerLockSafe();
      this.emitHud();
      return true;
    }
    return false;
  }

  private applyPlayerDamage(amount: number): void {
    if (this.phase !== 'playing') return;
    this.hull = Math.max(0, this.hull - amount);
    this.damageFlash = Math.min(1, this.damageFlash + 0.65);
    this.shakeTrauma = Math.min(1, this.shakeTrauma + 0.55);
    this.audio.playHullImpact();

    if (this.hull <= 0) {
      if (this.score > this.record.bestScore) {
        this.record = { ...this.record, bestScore: this.score };
        saveMissionRecord(this.record);
        this.callbacks.onRecordUpdate(this.record);
      }
      this.phase = 'gameover';
      this.keys.clear();
      this.mouseLeftDown = false;
      this.mouseRightDown = false;
      this.audio.setFlightActive(false);
      this.exitPointerLockSafe();
      this.emitHud();
    }
  }

  private updateParticles(dt: number): void {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        p.sprite.visible = false;
        continue;
      }
      const t = p.age / p.maxAge;
      p.vel.y += p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.sprite.position.copy(p.pos);
      const scale = THREE.MathUtils.lerp(p.startScale, p.endScale, t);
      p.sprite.scale.set(scale, scale, 1);
      (p.sprite.material as THREE.SpriteMaterial).opacity =
        p.baseOpacity * (1 - t);
    }
  }

  // =========================================================================
  // HUD TELEMETRY PROJECTION & SNAPSHOT EMISSION
  // =========================================================================

  private emitHud(): void {
    const projectedTargets: ProjectedTargetHud[] = [];
    this.camera.updateMatrixWorld();
    this.camera.getWorldPosition(_v1);
    this.camera.getWorldDirection(_forward);

    for (const t of this.monolith.targets) {
      if (t.destroyed) continue;
      // Show active stage targets (plus dimmed shielded preview for next stage)
      const dist = _v1.distanceTo(t.worldPos);
      _v2.subVectors(t.worldPos, _v1).normalize();
      const inFront = _v2.dot(_forward) > 0.02;

      _proj.copy(t.worldPos).project(this.camera);
      const sx = (_proj.x + 1) * 0.5;
      const sy = (-_proj.y + 1) * 0.5;
      const onScreen = inFront && sx >= 0.04 && sx <= 0.96 && sy >= 0.05 && sy <= 0.92;

      // Off-screen directional indicator angle
      let dx = sx - 0.5;
      let dy = sy - 0.5;
      if (!inFront) {
        dx = -dx;
        dy = -dy;
      }
      const edgeAngle = Math.atan2(dy, dx);

      projectedTargets.push({
        id: t.id,
        label: t.label,
        kind: t.kind,
        hp: t.hp,
        maxHp: t.maxHp,
        shielded: t.shielded,
        destroyed: t.destroyed,
        screenX: THREE.MathUtils.clamp(sx, 0.04, 0.96),
        screenY: THREE.MathUtils.clamp(sy, 0.06, 0.92),
        inFront,
        onScreen,
        distance: Math.round(dist),
        edgeAngle,
        worldX: t.worldPos.x,
        worldZ: t.worldPos.z,
      });
    }

    const totalTargets = this.monolith.targets.length;
    const targetsDestroyed = this.monolith.targets.filter((t) => t.destroyed).length;
    const stageObjective =
      this.strikeStage === 1
        ? 'Destroy flanking AA batteries & twin basal nodes'
        : this.strikeStage === 2
          ? 'Destroy the twin russet-copper monolith cores'
          : 'Breach the exposed Apex Diamond Core';

    const rawDeg = ((-THREE.MathUtils.radToDeg(this.headingYaw) % 360) + 360) % 360;
    const altitude = Math.max(
      0,
      Math.round((this.heliPos.y - groundHeightAt(this.heliPos.x, this.heliPos.z)) * 3.28),
    );
    const airspeed = Math.round(this.heliVel.length() * 2.1);
    const incomingMissiles = this.countActiveSams() + (this.rwrWarningTimer > 0 ? 1 : 0);

    this.callbacks.onHudUpdate({
      phase: this.phase,
      strikeStage: this.strikeStage,
      objectiveText: stageObjective,
      hull: Math.round(this.hull),
      maxHull: this.maxHull,
      altitude,
      airspeed,
      headingDeg: Math.round(rawDeg) % 360,
      pitchDeg: Math.round(THREE.MathUtils.radToDeg(this.bodyPitch)),
      rollDeg: Math.round(THREE.MathUtils.radToDeg(this.bodyRoll)),
      heliX: this.heliPos.x,
      heliZ: this.heliPos.z,
      cannonHeat: Math.round(this.cannonHeat),
      cannonOverheated: this.cannonOverheated,
      rockets: this.rockets,
      maxRockets: this.maxRockets,
      rocketReloadPct:
        this.rockets < this.maxRockets
          ? Math.min(1, this.rocketRechargeTimer / 2.6)
          : 1,
      flares: this.flares,
      maxFlares: this.maxFlares,
      flareCooldownPct: this.flareCooldown > 0 ? 1 - this.flareCooldown / 3.2 : 1,
      missileWarning: incomingMissiles > 0,
      incomingMissiles,
      hitMarkerTimer: this.hitMarkerTimer,
      killMarkerTimer: this.killMarkerTimer,
      damageFlash: this.damageFlash,
      pointerLocked: this.pointerLocked,
      score: this.score,
      elapsedSec: this.elapsedMissionSec,
      shotsFired: this.shotsFired,
      shotsHit: this.shotsHit,
      targetsDestroyed,
      totalTargets,
      targets: projectedTargets,
      stageBanner: this.stageBanner,
      activeRadio: this.activeRadio,
      radioEnabled: this.radio.isEnabled(),
      isMuted: this.audio.isMuted(),
      sensitivity: this.sensitivity,
    });
  }

  // =========================================================================
  // RENDER LOOP (GPU rAF + Software-WebGL Fence-Sync Pacing)
  // =========================================================================

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 85);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private scheduleNextFrame(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  private tick = () => {
    if (this.disposed) return;
    const now = performance.now();
    const rawDt = (now - this.lastFrameMs) / 1000;
    this.lastFrameMs = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    this.stepSimulation(dt);
    this.renderer.render(this.scene, this.camera);

    // Emit HUD snapshot at ~20Hz while playing
    this.hudEmitAccum += dt;
    if (this.phase === 'playing' && this.hudEmitAccum >= 0.05) {
      this.hudEmitAccum = 0;
      this.emitHud();
    }

    this.scheduleNextFrame();
  };

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);

    this.radio.dispose();
    this.audio.dispose();
    this.cockpit.dispose();
    this.monolith.dispose();
    this.env.dispose();
    this.textures.dispose();
    for (const d of this.poolDisposables) d.dispose();

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
