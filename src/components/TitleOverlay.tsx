import { useEffect, useState } from 'react';
import { Download, Play, Volume2, VolumeX } from 'lucide-react';
import { downloadStandaloneHtml } from '../game/downloadStandalone';
import type { MissionRecord } from '../game/types';

interface TitleOverlayProps {
  record: MissionRecord;
  isMuted: boolean;
  onStart: () => void;
  onToggleMute: () => void;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function TitleOverlay({
  record,
  isMuted,
  onStart,
  onToggleMute,
}: TitleOverlayProps) {
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
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        onStart();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onStart]);

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-8 md:p-12">
      {/* Subtle directional gradient scrim strictly behind top-left title lockup for 4.5:1 legibility */}
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'linear-gradient(125deg, rgba(16, 14, 11, 0.78) 0%, rgba(16, 14, 11, 0.34) 38%, rgba(16, 14, 11, 0.05) 68%, rgba(16, 14, 11, 0.55) 100%)',
        }}
      />

      {/* Top Row: Bespoke SVG Military Title Lockup + Quiet Audio Control */}
      <div className="flex items-start justify-between gap-6">
        <div className="max-w-xl">
          {/* Bespoke inline SVG aviation stencil lockup */}
          <svg
            viewBox="0 0 540 124"
            className="h-auto w-full max-w-[470px] overflow-visible"
            aria-label="Operation Ossuary"
            role="img"
          >
            {/* Precision tactical corner ticks */}
            <path
              d="M2 16 L2 2 L24 2 M516 2 L538 2 L538 16 M2 108 L2 122 L24 122"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2"
              strokeOpacity="0.85"
            />
            {/* Minimal gunship rotor & crosshair emblem */}
            <g transform="translate(18, 22)" stroke="#f59e0b" strokeWidth="1.6" fill="none">
              <line x1="0" y1="8" x2="26" y2="8" />
              <circle cx="13" cy="8" r="3" fill="#f59e0b" />
              <path d="M5 18 L13 11 L21 18" />
            </g>
            <text
              x="56"
              y="36"
              fill="#f59e0b"
              fontFamily="JetBrains Mono, monospace"
              fontSize="13"
              fontWeight="600"
              letterSpacing="4.5"
            >
              FIRST-PERSON DESERT GUNSHIP STRIKE
            </text>
            <text
              x="16"
              y="98"
              fill="#f6efe2"
              fontFamily="Chakra Petch, sans-serif"
              fontSize="58"
              fontWeight="700"
              letterSpacing="2.5"
            >
              OSSUARY
            </text>
            <line
              x1="18"
              y1="112"
              x2="310"
              y2="112"
              stroke="#f3ece0"
              strokeOpacity="0.28"
              strokeWidth="1"
            />
          </svg>

          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[#e8decb]/90">
            Fly low into the golden-hour canyon from inside an armored attack
            cockpit. Circle the colossal monolith and engage its outer batteries
            and core chambers with precision fire.
          </p>

          {/* Primary Action CTA & Quiet Unboxed Record Metadata */}
          <div className="pointer-events-auto mt-7 flex flex-wrap items-center gap-6">
            <button
              type="button"
              onClick={onStart}
              className="group inline-flex cursor-pointer items-center gap-3 rounded-sm bg-[#f59e0b] px-7 py-3.5 font-[family-name:var(--font-display)] text-base font-bold tracking-wider text-[#14110c] transition-transform duration-150 hover:bg-[#fbbf24] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f59e0b] whitespace-nowrap shrink-0"
            >
              <Play className="h-4 w-4 fill-current" />
              Start Mission
            </button>

            <button
              type="button"
              onClick={onToggleMute}
              className="inline-flex cursor-pointer items-center gap-2 rounded-sm border border-[#f3ece0]/25 bg-[#121512]/80 px-4 py-3 text-xs font-medium text-[#e8decb] transition-colors hover:border-[#f3ece0]/50 hover:text-white whitespace-nowrap shrink-0"
              aria-label={isMuted ? 'Unmute Audio' : 'Mute Audio'}
            >
              {isMuted ? (
                <>
                  <VolumeX className="h-4 w-4 text-[#f59e0b]" />
                  Sound Off
                </>
              ) : (
                <>
                  <Volume2 className="h-4 w-4 text-[#4ade80]" />
                  Sound On
                </>
              )}
            </button>

            {!(window as unknown as { __STANDALONE_BUILD__?: boolean })
              .__STANDALONE_BUILD__ && (
              <button
                type="button"
                onClick={() => void handleDownload()}
                disabled={downloadState === 'busy'}
                className="inline-flex cursor-pointer items-center gap-2 rounded-sm border border-[#f3ece0]/25 bg-[#121512]/80 px-4 py-3 text-xs font-medium text-[#e8decb] transition-colors hover:border-[#f59e0b]/60 hover:text-white disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                <Download className="h-4 w-4 text-[#f59e0b]" />
                {downloadState === 'busy'
                  ? 'Preparing...'
                  : downloadState === 'done'
                    ? 'Downloaded'
                    : 'Download HTML'}
              </button>
            )}
          </div>

          {downloadError && (
            <p className="mt-3 max-w-md font-[family-name:var(--font-mono)] text-xs text-[#fca5a5]">
              {downloadError}
            </p>
          )}

          {record.bestScore > 0 && (
            <div className="mt-5 flex items-center gap-3 font-[family-name:var(--font-mono)] text-xs text-[#d6cbb6]/85 tabular-nums">
              <span>Best Score {record.bestScore.toLocaleString()}</span>
              {record.bestTimeSec !== null && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Fastest Sortie {formatTime(record.bestTimeSec)}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span>
                {record.victories}{' '}
                {record.victories === 1 ? 'Victory' : 'Victories'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Single Flat Control Hint Line */}
      <div className="flex items-center justify-between border-t border-[#f3ece0]/15 pt-4 font-[family-name:var(--font-mono)] text-xs tracking-wide text-[#e8decb]/80">
        <p className="truncate">
          WASD Maneuver · Space / Shift Altitude · Mouse Look &amp; Aim · LMB
          30mm Cannon · RMB / R Rockets · F Flares · P Action Shot
        </p>
        <span className="hidden shrink-0 pl-6 text-[#f59e0b] sm:inline">
          Press Enter to Launch
        </span>
      </div>
    </div>
  );
}
