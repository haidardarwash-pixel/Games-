import type { HudSnapshot } from '../game/types';

interface TacticalMinimapProps {
  hud: HudSnapshot;
  northUp: boolean;
}

const MAX_RANGE = 195; // Meters matching desert canyon perimeter
const SIZE = 152;
const CENTER = SIZE / 2;
const RADIUS = 64;

/**
 * Top-down military TAD/HSD tactical minimap overlay.
 * Tracks the helicopter's live position & heading relative to the colossal monolith
 * and all active/shielded target nodes without obscuring the central viewport.
 */
export function TacticalMinimap({ hud, northUp }: TacticalMinimapProps) {
  const headingRad = (hud.headingDeg * Math.PI) / 180;
  // In Heading-Up mode, world rotates by -headingRad so helicopter nose always points UP (-Y)
  const mapRot = northUp ? 0 : -headingRad;
  const cosR = Math.cos(mapRot);
  const sinR = Math.sin(mapRot);

  const projectPoint = (wx: number, wz: number) => {
    const dx = wx - hud.heliX;
    const dz = wz - hud.heliZ;
    // Rotate into screen-local coordinates (+X right, +Y down == +Z south)
    const rx = dx * cosR - dz * sinR;
    const rz = dx * sinR + dz * cosR;
    const dist = Math.hypot(rx, rz);
    const clampedDist = Math.min(dist, MAX_RANGE);
    const scale = dist > 0.001 ? (clampedDist / MAX_RANGE) * RADIUS / dist : 0;
    return {
      x: CENTER + rx * scale,
      y: CENTER + rz * scale,
      clamped: dist > MAX_RANGE,
    };
  };

  // Monolith top-down footprint centered at (0, 0)
  const monoPos = projectPoint(0, 0);
  const monoDeg = (mapRot * 180) / Math.PI;
  const monoDist = Math.round(Math.hypot(hud.heliX, hud.heliZ));

  // North indicator position around outer radar rim
  const northX = CENTER + Math.sin(mapRot) * (RADIUS + 7);
  const northY = CENTER - Math.cos(mapRot) * (RADIUS + 7);

  // Own-ship rotation (0 in Heading-Up, +headingDeg in North-Up)
  const shipDeg = northUp ? hud.headingDeg : 0;

  return (
    <div
      className="pointer-events-none fixed right-5 top-4 flex flex-col border border-[#f3ece0]/18 bg-[#0e120f]/84 p-2.5 font-[family-name:var(--font-mono)] text-[10px] text-[#e8decb] tabular-nums"
      aria-label="Top-down tactical minimap"
    >
      <div className="mb-1 flex items-center justify-between gap-4 text-[10px] tracking-wider">
        <span className="font-semibold text-[#4ade80]">TACTICAL MAP</span>
        <span className="text-[#c7bca7]">{northUp ? 'N-UP' : 'HDG-UP'}</span>
      </div>

      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="block overflow-visible"
      >
        <defs>
          <clipPath id="minimap-scope-clip">
            <circle cx={CENTER} cy={CENTER} r={RADIUS} />
          </clipPath>
        </defs>

        {/* Radar scope background & range rings */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="#090e0a"
          stroke="#4ade80"
          strokeOpacity="0.38"
          strokeWidth="1.2"
        />
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS * 0.66}
          fill="none"
          stroke="#4ade80"
          strokeOpacity="0.18"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS * 0.33}
          fill="none"
          stroke="#4ade80"
          strokeOpacity="0.18"
          strokeWidth="1"
          strokeDasharray="2 3"
        />

        {/* Scope clipped world layer */}
        <g clipPath="url(#minimap-scope-clip)">
          {/* Faint orthogonal grid lines */}
          <line
            x1={CENTER - RADIUS}
            y1={CENTER}
            x2={CENTER + RADIUS}
            y2={CENTER}
            stroke="#4ade80"
            strokeOpacity="0.12"
            strokeWidth="1"
          />
          <line
            x1={CENTER}
            y1={CENTER - RADIUS}
            x2={CENTER}
            y2={CENTER + RADIUS}
            stroke="#4ade80"
            strokeOpacity="0.12"
            strokeWidth="1"
          />

          {/* Helicopter forward camera FOV cone (~60 deg) */}
          <g transform={`translate(${CENTER}, ${CENTER}) rotate(${shipDeg})`}>
            <path
              d={`M 0 0 L ${-RADIUS * 0.52} ${-RADIUS * 0.92} A ${RADIUS} ${RADIUS} 0 0 1 ${RADIUS * 0.52} ${-RADIUS * 0.92} Z`}
              fill="#4ade80"
              fillOpacity="0.09"
            />
            <line
              x1="0"
              y1="0"
              x2={-RADIUS * 0.5}
              y2={-RADIUS * 0.88}
              stroke="#4ade80"
              strokeOpacity="0.24"
              strokeWidth="1"
            />
            <line
              x1="0"
              y1="0"
              x2={RADIUS * 0.5}
              y2={-RADIUS * 0.88}
              stroke="#4ade80"
              strokeOpacity="0.24"
              strokeWidth="1"
            />
          </g>

          {/* Colossal Monolith top-down twin-arch silhouette */}
          <g
            transform={`translate(${monoPos.x}, ${monoPos.y}) rotate(${monoDeg})`}
          >
            {/* Outer sandstone wing arches */}
            <path
              d="M -15 3 C -17 -5, -10 -10, 0 -9 C 10 -10, 17 -5, 15 3 C 12 8, 5 9, 0 7 C -5 9, -12 8, -15 3 Z"
              fill="#d9ceb6"
              fillOpacity="0.28"
              stroke="#f59e0b"
              strokeWidth="1.3"
            />
            {/* Central monolith core axis */}
            <circle cx="0" cy="-1" r="2.2" fill="#f59e0b" fillOpacity="0.7" />
          </g>

          {/* Active & Shielded Target Nodes */}
          {hud.targets.map((t) => {
            if (t.destroyed) return null;
            const p = projectPoint(t.worldX, t.worldZ);
            if (t.shielded) {
              return (
                <rect
                  key={t.id}
                  x={p.x - 2.6}
                  y={p.y - 2.6}
                  width="5.2"
                  height="5.2"
                  transform={`rotate(45 ${p.x} ${p.y})`}
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="1.2"
                />
              );
            }
            const fill =
              t.kind === 'apex'
                ? '#fbbf24'
                : t.kind === 'copper'
                  ? '#f97316'
                  : '#ef4444';
            return (
              <g key={t.id}>
                <rect
                  x={p.x - 3.2}
                  y={p.y - 3.2}
                  width="6.4"
                  height="6.4"
                  transform={`rotate(45 ${p.x} ${p.y})`}
                  fill={fill}
                  stroke="#0e120f"
                  strokeWidth="1"
                />
              </g>
            );
          })}

          {/* Player Helicopter Position Chevron (Centered) */}
          <g transform={`translate(${CENTER}, ${CENTER}) rotate(${shipDeg})`}>
            <path
              d="M 0 -6.5 L 4.5 5 L 0 2.5 L -4.5 5 Z"
              fill="#4ade80"
              stroke="#090e0a"
              strokeWidth="1"
            />
          </g>
        </g>

        {/* True North Rim Marker */}
        <text
          x={northX}
          y={northY + 3}
          textAnchor="middle"
          fill="#fbbf24"
          fontSize="9"
          fontWeight="700"
        >
          N
        </text>
      </svg>

      {/* Compact distance & legend footer */}
      <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-[#f3ece0]/12 pt-1.5 text-[10px] text-[#c7bca7]">
        <span>MONO {monoDist}M</span>
        <span className="flex items-center gap-2">
          <span className="text-[#ef4444]">◆ TGT</span>
          <span className="text-[#94a3b8]">◇ SHLD</span>
        </span>
      </div>
    </div>
  );
}
