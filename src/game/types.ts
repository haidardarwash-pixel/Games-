export type GamePhase =
  | 'title'
  | 'playing'
  | 'paused'
  | 'photo'
  | 'victory'
  | 'gameover';

export type StrikeStage = 1 | 2 | 3;

export type TargetKind = 'flak' | 'basal' | 'copper' | 'apex';

export interface ProjectedTargetHud {
  id: string;
  label: string;
  kind: TargetKind;
  hp: number;
  maxHp: number;
  shielded: boolean;
  destroyed: boolean;
  /** Normalized screen coordinates [0..1] */
  screenX: number;
  screenY: number;
  inFront: boolean;
  onScreen: boolean;
  distance: number;
  /** Angle in radians for off-screen edge arrow */
  edgeAngle: number;
  /** World X/Z coordinates for top-down tactical minimap */
  worldX: number;
  worldZ: number;
}

export type RadioPriority = 'normal' | 'caution' | 'critical';

export type RadioChannel = 'VIPER 1-1' | 'OVERLORD' | 'RWR BETTY';

export interface RadioTransmission {
  id: number;
  callsign: RadioChannel;
  frequency: string;
  text: string;
  priority: RadioPriority;
}

export interface HudSnapshot {
  phase: GamePhase;
  strikeStage: StrikeStage;
  objectiveText: string;
  hull: number;
  maxHull: number;
  altitude: number;
  airspeed: number;
  headingDeg: number;
  pitchDeg: number;
  rollDeg: number;
  heliX: number;
  heliZ: number;
  cannonHeat: number;
  cannonOverheated: boolean;
  rockets: number;
  maxRockets: number;
  rocketReloadPct: number;
  flares: number;
  maxFlares: number;
  flareCooldownPct: number;
  missileWarning: boolean;
  incomingMissiles: number;
  hitMarkerTimer: number;
  killMarkerTimer: number;
  damageFlash: number;
  pointerLocked: boolean;
  score: number;
  elapsedSec: number;
  shotsFired: number;
  shotsHit: number;
  targetsDestroyed: number;
  totalTargets: number;
  targets: ProjectedTargetHud[];
  stageBanner: string | null;
  activeRadio: RadioTransmission | null;
  radioEnabled: boolean;
  isMuted: boolean;
  sensitivity: number;
}

export interface MissionRecord {
  bestScore: number;
  bestTimeSec: number | null;
  victories: number;
}

export interface EngineSettings {
  muted: boolean;
  sensitivity: number;
  radioEnabled?: boolean;
}
