import { useState } from 'react';
import {
  Camera,
  Download,
  Home,
  Play,
  Radio,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { downloadStandaloneHtml } from '../game/downloadStandalone';
import type { HudSnapshot, MissionRecord } from '../game/types';

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface PauseModalProps {
  hud: HudSnapshot;
  onResume: () => void;
  onRestart: () => void;
  onActionShot: () => void;
  onReturnTitle: () => void;
  onToggleMute: () => void;
  onToggleRadio: () => void;
  onSensitivityChange: (value: number) => void;
}

export function PauseModal({
  hud,
  onResume,
  onRestart,
  onActionShot,
  onReturnTitle,
  onToggleMute,
  onToggleRadio,
  onSensitivityChange,
}: PauseModalProps) {
  const [downloadState, setDownloadState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownload = async () => {
    if (downloadState === 'busy') return;
    setDownloadState('busy');
    setDownloadError(null);
    const res = await downloadStandaloneHtml();
    if (res.ok) {
      setDownloadState('done');
      window.setTimeout(() => setDownloadState('idle'), 2500);
    } else {
      setDownloadState('idle');
      setDownloadError(res.error ?? 'Download failed.');
    }
  };
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#0c0e0c]/72 p-6">
      <div className="w-full max-w-md border border-[#f3ece0]/20 bg-[#141713] p-7 text-[#f3ece0]">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-wide text-[#f6efe2]">
          Mission Paused
        </h2>
        <p className="mt-1.5 text-sm text-[#d6cbb6]/85">
          Stage {hud.strikeStage}/3 · {hud.objectiveText}
        </p>

        {/* Settings */}
        <div className="mt-6 space-y-4 border-y border-[#f3ece0]/12 py-4 font-[family-name:var(--font-mono)] text-xs">
          <div className="flex items-center justify-between gap-4">
            <span className="text-[#d6cbb6]">Mouse Look Sensitivity</span>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0.4}
                max={2.0}
                step={0.1}
                value={hud.sensitivity}
                onChange={(e) => onSensitivityChange(parseFloat(e.target.value))}
                className="tactical-range w-28"
              />
              <span className="w-8 text-right tabular-nums">
                {hud.sensitivity.toFixed(1)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <span className="text-[#d6cbb6]">Cockpit &amp; Combat Audio</span>
            <button
              type="button"
              onClick={onToggleMute}
              className="inline-flex cursor-pointer items-center gap-2 border border-[#f3ece0]/20 bg-[#1d221c] px-3 py-1.5 text-xs text-[#f3ece0] hover:border-[#f59e0b]/60"
            >
              {hud.isMuted ? (
                <>
                  <VolumeX className="h-3.5 w-3.5 text-[#ef4444]" />
                  Muted
                </>
              ) : (
                <>
                  <Volume2 className="h-3.5 w-3.5 text-[#4ade80]" />
                  Active
                </>
              )}
            </button>
          </div>

          <div className="flex items-center justify-between gap-4">
            <span className="text-[#d6cbb6]">Pilot Radio Comms [V]</span>
            <button
              type="button"
              onClick={onToggleRadio}
              className="inline-flex cursor-pointer items-center gap-2 border border-[#f3ece0]/20 bg-[#1d221c] px-3 py-1.5 text-xs text-[#f3ece0] hover:border-[#f59e0b]/60"
            >
              <Radio
                className={`h-3.5 w-3.5 ${
                  hud.radioEnabled ? 'text-[#4ade80]' : 'text-[#a99e8a]'
                }`}
              />
              {hud.radioEnabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>
        </div>

        {/* Controls Summary */}
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 font-[family-name:var(--font-mono)] text-[11px] text-[#c7bca7]">
          <span>WASD · Thrust / Strafe</span>
          <span>Space / Shift · Altitude</span>
          <span>Mouse · Look &amp; Aim</span>
          <span>Hold C · Cockpit Free-Look</span>
          <span>LMB · 30mm Autocannon</span>
          <span>RMB / R · Hydra Rockets</span>
          <span>F · Thermal Flares</span>
          <span>P · Action Shot Freeze</span>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onResume}
            className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-sm bg-[#f59e0b] px-5 py-3 font-[family-name:var(--font-display)] text-sm font-bold tracking-wider text-[#14110c] hover:bg-[#fbbf24]"
          >
            <Play className="h-4 w-4 fill-current" />
            Resume Flight
          </button>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={onActionShot}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-sm border border-[#f3ece0]/20 bg-[#1d221c] px-4 py-2.5 text-xs font-semibold text-[#f3ece0] hover:border-[#f59e0b]/60"
            >
              <Camera className="h-3.5 w-3.5 text-[#f59e0b]" />
              Action Shot
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-sm border border-[#f3ece0]/20 bg-[#1d221c] px-4 py-2.5 text-xs font-semibold text-[#f3ece0] hover:border-[#f3ece0]/45"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restart
            </button>
          </div>

          {!(window as unknown as { __STANDALONE_BUILD__?: boolean })
            .__STANDALONE_BUILD__ && (
            <>
              <button
                type="button"
                onClick={() => void handleDownload()}
                disabled={downloadState === 'busy'}
                className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-sm border border-[#f3ece0]/20 bg-[#1d221c] px-4 py-2.5 text-xs font-semibold text-[#e8decb] hover:border-[#f59e0b]/60 hover:text-white disabled:opacity-60"
              >
                <Download className="h-3.5 w-3.5 text-[#f59e0b]" />
                {downloadState === 'busy'
                  ? 'Preparing Standalone HTML...'
                  : downloadState === 'done'
                    ? 'Downloaded'
                    : 'Download Standalone HTML'}
              </button>
              {downloadError && (
                <p className="font-[family-name:var(--font-mono)] text-[11px] text-[#fca5a5]">
                  {downloadError}
                </p>
              )}
            </>
          )}

          <button
            type="button"
            onClick={onReturnTitle}
            className="inline-flex w-full cursor-pointer items-center justify-center gap-2 py-2 text-xs text-[#c7bca7] hover:text-white"
          >
            <Home className="h-3.5 w-3.5" />
            Return to Title
          </button>
        </div>
      </div>
    </div>
  );
}

interface ActionShotBarProps {
  onSaveShot: () => void;
  onResume: () => void;
}

export function ActionShotBar({ onSaveShot, onResume }: ActionShotBarProps) {
  return (
    <div className="fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 border border-[#f3ece0]/25 bg-[#0f120f]/88 px-4 py-2 font-[family-name:var(--font-mono)] text-xs text-[#f3ece0]">
      <span className="text-[#fbbf24]">Action Shot Mode</span>
      <span className="h-3.5 w-px bg-[#f3ece0]/20" aria-hidden="true" />
      <button
        type="button"
        onClick={onSaveShot}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm bg-[#f59e0b] px-3 py-1.5 font-semibold text-[#14110c] hover:bg-[#fbbf24] whitespace-nowrap"
      >
        <Download className="h-3.5 w-3.5" />
        Save PNG
      </button>
      <button
        type="button"
        onClick={onResume}
        className="inline-flex cursor-pointer items-center gap-1.5 border border-[#f3ece0]/25 px-3 py-1.5 text-[#e8decb] hover:border-white hover:text-white whitespace-nowrap"
      >
        Resume [P]
      </button>
    </div>
  );
}

interface DebriefModalProps {
  hud: HudSnapshot;
  record: MissionRecord;
  isVictory: boolean;
  onRestart: () => void;
  onReturnTitle: () => void;
}

export function DebriefModal({
  hud,
  record,
  isVictory,
  onRestart,
  onReturnTitle,
}: DebriefModalProps) {
  const accuracy =
    hud.shotsFired > 0
      ? Math.min(100, Math.round((hud.shotsHit / hud.shotsFired) * 100))
      : 0;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#0c0e0c]/78 p-6">
      <div className="w-full max-w-md border border-[#f3ece0]/20 bg-[#141713] p-7 text-[#f3ece0]">
        <p
          className={`font-[family-name:var(--font-mono)] text-xs font-semibold tracking-widest ${
            isVictory ? 'text-[#4ade80]' : 'text-[#ef4444]'
          }`}
        >
          {isVictory ? 'MISSION ACCOMPLISHED' : 'AIRCRAFT LOST'}
        </p>
        <h2 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold tracking-wide text-[#f6efe2]">
          {isVictory ? 'Monolith Neutralized' : 'Gunship Downed'}
        </h2>
        <p className="mt-2 text-sm text-[#d6cbb6]/85">
          {isVictory
            ? 'All outer flak defenses, twin russet-copper cores, and the Apex Diamond Sanctum have been destroyed.'
            : 'Enemy flak and missile fire overwhelmed your hull. Bank sharply and deploy thermal flares [F] on SAM lock.'}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-4 border-y border-[#f3ece0]/12 py-4 font-[family-name:var(--font-mono)] tabular-nums">
          <div>
            <div className="text-[11px] text-[#a99e8a]">Tactical Score</div>
            <div className="mt-0.5 text-xl font-bold text-[#fbbf24]">
              {hud.score.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[#a99e8a]">Sortie Time</div>
            <div className="mt-0.5 text-xl font-bold text-[#f6efe2]">
              {formatTime(hud.elapsedSec)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[#a99e8a]">Targets Destroyed</div>
            <div className="mt-0.5 text-base font-semibold text-[#f6efe2]">
              {hud.targetsDestroyed} / {hud.totalTargets}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[#a99e8a]">Weapon Accuracy</div>
            <div className="mt-0.5 text-base font-semibold text-[#f6efe2]">
              {accuracy}%
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between font-[family-name:var(--font-mono)] text-xs text-[#c7bca7] tabular-nums">
          <span>Best Score: {record.bestScore.toLocaleString()}</span>
          {record.bestTimeSec !== null && (
            <span>Best Time: {formatTime(record.bestTimeSec)}</span>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onRestart}
            className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-sm bg-[#f59e0b] px-5 py-3 font-[family-name:var(--font-display)] text-sm font-bold tracking-wider text-[#14110c] hover:bg-[#fbbf24]"
          >
            <RotateCcw className="h-4 w-4" />
            Fly Again
          </button>
          <button
            type="button"
            onClick={onReturnTitle}
            className="inline-flex w-full cursor-pointer items-center justify-center gap-2 py-2 text-xs text-[#c7bca7] hover:text-white"
          >
            <Home className="h-3.5 w-3.5" />
            Return to Title
          </button>
        </div>
      </div>
    </div>
  );
}
