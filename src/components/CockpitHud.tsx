import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  ChevronDown,
  ChevronUp,
  Compass,
  Pause,
  Radio,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { HudSnapshot } from '../game/types';
import { TacticalMinimap } from './TacticalMinimap';

interface CockpitHudProps {
  hud: HudSnapshot;
  onPause: () => void;
  onActionShot: () => void;
  onToggleMute: () => void;
  onToggleRadio: () => void;
  onSensitivityChange: (value: number) => void;
}

const COMPASS_LABELS: Array<{ deg: number; label: string }> = [
  { deg: 0, label: 'N' },
  { deg: 45, label: 'NE' },
  { deg: 90, label: 'E' },
  { deg: 135, label: 'SE' },
  { deg: 180, label: 'S' },
  { deg: 225, label: 'SW' },
  { deg: 270, label: 'W' },
  { deg: 315, label: 'NW' },
];

function shortestAngleDiff(a: number, b: number): number {
  let d = ((b - a + 540) % 360) - 180;
  if (d < -180) d += 360;
  return d;
}

export function CockpitHud({
  hud,
  onPause,
  onActionShot,
  onToggleMute,
  onToggleRadio,
  onSensitivityChange,
}: CockpitHudProps) {
  const [dockOpen, setDockOpen] = useState(false);
  const [northUpMap, setNorthUpMap] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.repeat && e.code === 'KeyH') {
        setDockOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const hullPct = Math.max(0, Math.min(100, (hud.hull / hud.maxHull) * 100));
  const hullCritical = hullPct <= 30;

  return (
    <div className="pointer-events-none fixed inset-0 z-10 overflow-hidden select-none">
      {/* Subtle red radial damage vignette when struck */}
      {hud.damageFlash > 0.02 && (
        <div
          className="pointer-events-none fixed inset-0"
          style={{
            background: `radial-gradient(circle, transparent 48%, rgba(220, 38, 38, ${Math.min(0.55, hud.damageFlash * 0.55)}) 100%)`,
          }}
        />
      )}

      {/* Single Gunship Optical Aiming Crosshair & Hit-Confirm Ticks */}
      <div className="pointer-events-none fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <svg
          width="64"
          height="64"
          viewBox="0 0 64 64"
          fill="none"
          className="overflow-visible"
        >
          {/* Crisp single center crosshair */}
          <line x1="14" y1="32" x2="26" y2="32" stroke="#4ade80" strokeWidth="1.6" />
          <line x1="38" y1="32" x2="50" y2="32" stroke="#4ade80" strokeWidth="1.6" />
          <line x1="32" y1="14" x2="32" y2="26" stroke="#4ade80" strokeWidth="1.6" />
          <line x1="32" y1="38" x2="32" y2="50" stroke="#4ade80" strokeWidth="1.6" />
          <circle cx="32" cy="32" r="2" fill="#4ade80" />

          {/* Hit / Kill confirmation diagonal ticks */}
          {(hud.hitMarkerTimer > 0 || hud.killMarkerTimer > 0) && (
            <g
              stroke={hud.killMarkerTimer > 0 ? '#ef4444' : '#fbbf24'}
              strokeWidth={hud.killMarkerTimer > 0 ? '2.5' : '2'}
            >
              <line x1="21" y1="21" x2="27" y2="27" />
              <line x1="43" y1="21" x2="37" y2="27" />
              <line x1="21" y1="43" x2="27" y2="37" />
              <line x1="43" y1="43" x2="37" y2="37" />
            </g>
          )}
        </svg>
      </div>

      {/* Top-Center Magnetic Heading Compass Tape & Current Objective */}
      <div className="fixed left-1/2 top-4 flex -translate-x-1/2 flex-col items-center">
        <div className="relative h-7 w-72 overflow-hidden border-b border-[#4ade80]/45 bg-[#0e120f]/75 px-2">
          {/* Center lubber triangle */}
          <div className="absolute left-1/2 top-0 h-2 w-0 -translate-x-1/2 border-l-[4px] border-r-[4px] border-t-[5px] border-l-transparent border-r-transparent border-t-[#f59e0b]" />
          {COMPASS_LABELS.map((item) => {
            const diff = shortestAngleDiff(hud.headingDeg, item.deg);
            if (Math.abs(diff) > 62) return null;
            const xPct = 50 + (diff / 60) * 46;
            return (
              <span
                key={item.label}
                className="absolute top-2 -translate-x-1/2 font-[family-name:var(--font-mono)] text-[11px] font-semibold text-[#4ade80] tabular-nums"
                style={{ left: `${xPct}%` }}
              >
                {item.label}
              </span>
            );
          })}
        </div>

        <div className="mt-1 flex items-center gap-3 font-[family-name:var(--font-mono)] text-[11px] text-[#e8decb] tabular-nums">
          <span className="font-semibold text-[#4ade80]">
            HDG {hud.headingDeg.toString().padStart(3, '0')}°
          </span>
          <span aria-hidden="true" className="text-[#e8decb]/40">
            ·
          </span>
          <span>
            Stage {hud.strikeStage}/3 · {hud.objectiveText}
          </span>
          <span aria-hidden="true" className="text-[#e8decb]/40">
            ·
          </span>
          <span className="text-[#f59e0b]">
            {hud.targetsDestroyed}/{hud.totalTargets} Neutralized
          </span>
        </div>
      </div>

      {/* Top-Left Diegetic VHF/UHF Pilot Radio Comms Strip (Visible Only While Transmitting) */}
      {hud.activeRadio && (
        <div
          className={`fixed left-5 top-5 w-72 border bg-[#0e120f]/88 px-3.5 py-2.5 ${
            hud.activeRadio.priority === 'critical'
              ? 'border-[#ef4444]/85'
              : hud.activeRadio.priority === 'caution'
                ? 'border-[#f59e0b]/80'
                : 'border-[#4ade80]/55'
          }`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-2 font-[family-name:var(--font-mono)] text-[10px] tracking-wider">
            <div className="flex items-center gap-1.5">
              <Radio
                className={`h-3.5 w-3.5 ${
                  hud.activeRadio.priority === 'critical'
                    ? 'text-[#ef4444]'
                    : hud.activeRadio.priority === 'caution'
                      ? 'text-[#f59e0b]'
                      : 'text-[#4ade80]'
                }`}
              />
              <span
                className={`font-bold ${
                  hud.activeRadio.priority === 'critical'
                    ? 'text-[#fca5a5]'
                    : hud.activeRadio.priority === 'caution'
                      ? 'text-[#fbbf24]'
                      : 'text-[#4ade80]'
                }`}
              >
                {hud.activeRadio.callsign}
              </span>
              <span className="text-[#a99e8a]">{hud.activeRadio.frequency}</span>
            </div>

            {/* Active VHF signal equalizer bars */}
            <div className="flex h-3 items-end gap-0.5" aria-hidden="true">
              {[0, 0.14, 0.28, 0.08].map((delay, idx) => (
                <span
                  key={idx}
                  className={`radio-eq-bar w-[2px] ${
                    hud.activeRadio?.priority === 'critical'
                      ? 'bg-[#ef4444]'
                      : hud.activeRadio?.priority === 'caution'
                        ? 'bg-[#f59e0b]'
                        : 'bg-[#4ade80]'
                  }`}
                  style={{
                    height: idx % 2 === 0 ? '11px' : '8px',
                    animationDelay: `${delay}s`,
                  }}
                />
              ))}
            </div>
          </div>

          <p className="mt-1.5 font-[family-name:var(--font-mono)] text-[11px] leading-snug text-[#f3ece0]">
            &ldquo;{hud.activeRadio.text}&rdquo;
          </p>
        </div>
      )}

      {/* Top-Right Top-Down Tactical Minimap */}
      <TacticalMinimap hud={hud} northUp={northUpMap} />

      {/* Stage Transition Banner */}
      {hud.stageBanner && (
        <div className="fixed left-1/2 top-24 -translate-x-1/2 border border-[#f59e0b]/60 bg-[#121410]/88 px-5 py-2 font-[family-name:var(--font-display)] text-sm font-semibold tracking-widest text-[#fbbf24]">
          {hud.stageBanner}
        </div>
      )}

      {/* Missile Lock Alert (Explicit Icon + Text, Never Hue-Only) */}
      {hud.missileWarning && (
        <div className="fixed left-1/2 top-36 flex -translate-x-1/2 items-center gap-2.5 border border-[#ef4444] bg-[#2a0c0c]/92 px-4 py-1.5 font-[family-name:var(--font-mono)] text-xs font-bold tracking-wider text-[#fecaca]">
          <AlertTriangle className="h-4 w-4 text-[#ef4444]" />
          <span>
            MISSILE LOCK ({hud.incomingMissiles}) — PRESS F TO DEPLOY FLARES
          </span>
        </div>
      )}

      {/* Subtle Pointer Lock Hint when unlocked */}
      {!hud.pointerLocked && (
        <div className="fixed left-1/2 bottom-20 -translate-x-1/2 bg-[#101310]/80 px-3 py-1 font-[family-name:var(--font-mono)] text-[11px] text-[#d6cbb6]">
          Click cockpit viewport to lock mouse aim · Esc to pause
        </div>
      )}

      {/* Bottom-Left Perimeter Cluster: Hull, Flight Telemetry & Flares */}
      <div className="fixed bottom-5 left-5 flex flex-col gap-2 border border-[#f3ece0]/15 bg-[#0e120f]/82 px-4 py-3 font-[family-name:var(--font-mono)] text-xs text-[#e8decb] tabular-nums">
        <div className="flex items-center justify-between gap-6">
          <span className={hullCritical ? 'font-bold text-[#ef4444]' : 'text-[#4ade80]'}>
            {hullCritical ? 'HULL CRITICAL' : 'HULL INTEGRITY'}
          </span>
          <span className="font-semibold">{hud.hull}%</span>
        </div>
        <div className="h-1.5 w-44 bg-[#f3ece0]/15">
          <div
            className="h-full transition-all duration-150"
            style={{
              width: `${hullPct}%`,
              backgroundColor: hullCritical ? '#ef4444' : '#4ade80',
            }}
          />
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-[11px] text-[#d6cbb6]/90">
          <span>ALT {hud.altitude} FT</span>
          <span aria-hidden="true">·</span>
          <span>SPD {hud.airspeed} KT</span>
          <span aria-hidden="true">·</span>
          <span className={hud.flares > 0 ? 'text-[#fbbf24]' : 'text-[#ef4444]'}>
            FLARES [F] {hud.flares}/{hud.maxFlares}
          </span>
        </div>
      </div>

      {/* Bottom-Right Perimeter Cluster: 30mm Chain Gun & Hydra-70 Rockets */}
      <div className="fixed bottom-5 right-5 flex flex-col gap-2 border border-[#f3ece0]/15 bg-[#0e120f]/82 px-4 py-3 font-[family-name:var(--font-mono)] text-xs text-[#e8decb] tabular-nums">
        <div className="flex items-center justify-between gap-6">
          <span
            className={
              hud.cannonOverheated ? 'font-bold text-[#ef4444]' : 'text-[#4ade80]'
            }
          >
            {hud.cannonOverheated ? '30MM OVERHEAT' : '30MM M230 [LMB]'}
          </span>
          <span>{hud.cannonHeat}%</span>
        </div>
        <div className="h-1.5 w-44 bg-[#f3ece0]/15">
          <div
            className="h-full"
            style={{
              width: `${hud.cannonHeat}%`,
              backgroundColor:
                hud.cannonOverheated || hud.cannonHeat > 78
                  ? '#ef4444'
                  : '#f59e0b',
            }}
          />
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-3 text-[11px] text-[#d6cbb6]/90">
          <span>HYDRA ROCKETS [RMB]</span>
          <span className="font-semibold text-[#fbbf24]">
            {hud.rockets}/{hud.maxRockets}
          </span>
        </div>
      </div>

      {/* Unified Collapsible Bottom-Center Utility Dock (Zero Viewport Occlusion) */}
      <div className="pointer-events-auto fixed bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center">
        <button
          type="button"
          onClick={() => setDockOpen((prev) => !prev)}
          className="inline-flex cursor-pointer items-center gap-1.5 border border-[#f3ece0]/20 bg-[#0e120f]/85 px-3 py-1 font-[family-name:var(--font-mono)] text-[11px] text-[#d6cbb6] transition-colors hover:border-[#f59e0b]/60 hover:text-white whitespace-nowrap"
        >
          {dockOpen ? (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              Hide Controls [H]
            </>
          ) : (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              Controls [H]
            </>
          )}
        </button>

        {dockOpen && (
          <div className="mt-1.5 flex items-center gap-4 border border-[#f3ece0]/20 bg-[#0e120f]/92 px-4 py-2 font-[family-name:var(--font-mono)] text-xs text-[#e8decb]">
            <button
              type="button"
              onClick={() => setNorthUpMap((prev) => !prev)}
              className="inline-flex cursor-pointer items-center gap-1.5 px-2 py-1 text-[#e8decb] transition-colors hover:text-white whitespace-nowrap shrink-0"
            >
              <Compass className="h-3.5 w-3.5 text-[#4ade80]" />
              Map: {northUpMap ? 'N-Up' : 'Hdg-Up'}
            </button>

            <span className="h-3.5 w-px bg-[#f3ece0]/20" aria-hidden="true" />

            <button
              type="button"
              onClick={onActionShot}
              className="inline-flex cursor-pointer items-center gap-1.5 px-2 py-1 text-[#fbbf24] transition-colors hover:text-white whitespace-nowrap shrink-0"
            >
              <Camera className="h-3.5 w-3.5" />
              Action Shot [P]
            </button>

            <span className="h-3.5 w-px bg-[#f3ece0]/20" aria-hidden="true" />

            <button
              type="button"
              onClick={onToggleMute}
              className="inline-flex cursor-pointer items-center gap-1.5 px-2 py-1 text-[#e8decb] transition-colors hover:text-white whitespace-nowrap shrink-0"
            >
              {hud.isMuted ? (
                <>
                  <VolumeX className="h-3.5 w-3.5 text-[#ef4444]" />
                  Unmute [M]
                </>
              ) : (
                <>
                  <Volume2 className="h-3.5 w-3.5 text-[#4ade80]" />
                  Mute [M]
                </>
              )}
            </button>

            <span className="h-3.5 w-px bg-[#f3ece0]/20" aria-hidden="true" />

            <button
              type="button"
              onClick={onToggleRadio}
              className="inline-flex cursor-pointer items-center gap-1.5 px-2 py-1 text-[#e8decb] transition-colors hover:text-white whitespace-nowrap shrink-0"
            >
              <Radio
                className={`h-3.5 w-3.5 ${
                  hud.radioEnabled && !hud.isMuted ? 'text-[#4ade80]' : 'text-[#a99e8a]'
                }`}
              />
              Radio: {hud.radioEnabled ? 'On' : 'Off'} [V]
            </button>

            <span className="h-3.5 w-px bg-[#f3ece0]/20" aria-hidden="true" />

            <label className="flex items-center gap-2 whitespace-nowrap">
              <span className="text-[11px] text-[#d6cbb6]">Mouse Sens</span>
              <input
                type="range"
                min={0.4}
                max={2.0}
                step={0.1}
                value={hud.sensitivity}
                onChange={(e) => onSensitivityChange(parseFloat(e.target.value))}
                className="tactical-range w-20"
              />
              <span className="w-7 text-right text-[11px] tabular-nums">
                {hud.sensitivity.toFixed(1)}
              </span>
            </label>

            <span className="h-3.5 w-px bg-[#f3ece0]/20" aria-hidden="true" />

            <button
              type="button"
              onClick={onPause}
              className="inline-flex cursor-pointer items-center gap-1.5 px-2 py-1 text-[#e8decb] transition-colors hover:text-white whitespace-nowrap shrink-0"
            >
              <Pause className="h-3.5 w-3.5" />
              Pause [Esc]
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
