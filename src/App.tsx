import { useCallback, useEffect, useRef, useState } from 'react';
import { CockpitHud } from './components/CockpitHud';
import { ActionShotBar, DebriefModal, PauseModal } from './components/Modals';
import { TitleOverlay } from './components/TitleOverlay';
import { HelicopterGameEngine, loadMissionRecord } from './game/engine';
import type { HudSnapshot, MissionRecord } from './game/types';

const INITIAL_HUD: HudSnapshot = {
  phase: 'title',
  strikeStage: 1,
  objectiveText: 'Destroy flanking AA batteries & twin basal nodes',
  hull: 100,
  maxHull: 100,
  altitude: 120,
  airspeed: 0,
  headingDeg: 0,
  pitchDeg: 0,
  rollDeg: 0,
  heliX: -16,
  heliZ: 128,
  cannonHeat: 0,
  cannonOverheated: false,
  rockets: 16,
  maxRockets: 16,
  rocketReloadPct: 1,
  flares: 6,
  maxFlares: 6,
  flareCooldownPct: 1,
  missileWarning: false,
  incomingMissiles: 0,
  hitMarkerTimer: 0,
  killMarkerTimer: 0,
  damageFlash: 0,
  pointerLocked: false,
  score: 0,
  elapsedSec: 0,
  shotsFired: 0,
  shotsHit: 0,
  targetsDestroyed: 0,
  totalTargets: 7,
  targets: [],
  stageBanner: null,
  activeRadio: null,
  radioEnabled: true,
  isMuted: false,
  sensitivity: 1.0,
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<HelicopterGameEngine | null>(null);

  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [record, setRecord] = useState<MissionRecord>(() => loadMissionRecord());
  const [contextError, setContextError] = useState<string>('');

  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const engine = new HelicopterGameEngine(mountEl, {
      onHudUpdate: (snapshot) => setHud(snapshot),
      onRecordUpdate: (nextRecord) => setRecord(nextRecord),
      onContextError: (msg) => setContextError(msg),
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleStart = useCallback(() => engineRef.current?.startMission(), []);
  const handleResume = useCallback(() => engineRef.current?.resumeMission(), []);
  const handlePause = useCallback(() => engineRef.current?.pauseMission(), []);
  const handleActionShot = useCallback(() => engineRef.current?.toggleActionShot(), []);
  const handleReturnTitle = useCallback(() => engineRef.current?.returnToTitle(), []);
  const handleToggleMute = useCallback(() => engineRef.current?.toggleMute(), []);
  const handleToggleRadio = useCallback(() => engineRef.current?.toggleRadio(), []);
  const handleSensitivityChange = useCallback(
    (val: number) => engineRef.current?.setSensitivity(val),
    [],
  );

  const handleSaveShot = useCallback(() => {
    const dataUrl = engineRef.current?.captureActionShot();
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `operation-ossuary-action-shot-${Date.now()}.png`;
    link.click();
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#12100d]">
      {/* Isolated WebGL canvas mount container (never re-rendered by HUD state) */}
      <div
        ref={canvasMountRef}
        className={`fixed inset-0 h-full w-full ${
          hud.phase === 'playing' ? 'cursor-none' : 'cursor-default'
        }`}
        aria-label="Operation Ossuary 3D Helicopter Cockpit Viewport"
      />

      {contextError && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#12100d]/95 p-8 text-center">
          <div className="max-w-md border border-[#f3ece0]/20 bg-[#181a17] p-6">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-[#fbbf24]">
              3D Graphics Unavailable
            </h2>
            <p className="mt-2 text-sm text-[#d6cbb6]">{contextError}</p>
          </div>
        </div>
      )}

      {hud.phase === 'title' && (
        <TitleOverlay
          record={record}
          isMuted={hud.isMuted}
          onStart={handleStart}
          onToggleMute={handleToggleMute}
        />
      )}

      {hud.phase === 'playing' && (
        <CockpitHud
          hud={hud}
          onPause={handlePause}
          onActionShot={handleActionShot}
          onToggleMute={handleToggleMute}
          onToggleRadio={handleToggleRadio}
          onSensitivityChange={handleSensitivityChange}
        />
      )}

      {hud.phase === 'paused' && (
        <PauseModal
          hud={hud}
          onResume={handleResume}
          onRestart={handleStart}
          onActionShot={handleActionShot}
          onReturnTitle={handleReturnTitle}
          onToggleMute={handleToggleMute}
          onToggleRadio={handleToggleRadio}
          onSensitivityChange={handleSensitivityChange}
        />
      )}

      {hud.phase === 'photo' && (
        <ActionShotBar onSaveShot={handleSaveShot} onResume={handleResume} />
      )}

      {(hud.phase === 'victory' || hud.phase === 'gameover') && (
        <DebriefModal
          hud={hud}
          record={record}
          isVictory={hud.phase === 'victory'}
          onRestart={handleStart}
          onReturnTitle={handleReturnTitle}
        />
      )}
    </main>
  );
}
