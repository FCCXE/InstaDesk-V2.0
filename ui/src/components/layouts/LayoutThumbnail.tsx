import { useMemo } from "react";
import type { Assignment } from "../../services/api";
import type { Monitor } from "../../state/AppState";

/**
 * LayoutThumbnail — small SVG preview of a saved Layout.
 *
 * Design priority per operator 2026-06-09: "very clean, clear and
 * completely readable." Initial v1 (commit 9d5e5bd) failed that bar
 * because it (a) used fixed-pixel SVG widths that overflowed narrow
 * cards and (b) tried to fit all monitors in a single horizontal row,
 * which made each monitor tiny when 3+ were present. This rewrite
 * fixes both:
 *
 *  - Responsive SVG: width: 100%, height auto via viewBox aspect.
 *    Fits whatever card width is available, scales down (or up) to
 *    fit, never overflows.
 *  - Adaptive grid: 1 monitor renders full-area, 2 side-by-side,
 *    3 in a row, 4 in 2×2, 5-6 in 3×2, more in roughly-sqrt(N).
 *    Each monitor gets a fixed-size "slot" so individual rendering
 *    is consistent regardless of N.
 *  - Real aspect ratios within slots, but CLAMPED to [0.5, 2.5] so
 *    portrait monitors don't render as ultra-narrow slivers and
 *    extreme ultrawides don't dominate the row.
 *  - Stronger colors at thumbnail scale: sky-300 fill + sky-500
 *    border for windows; slate-400 monitor outline; slate-700 bold
 *    labels. The previous sky-200/300 + slate-300 was too washed-out
 *    to read at 50px-per-monitor.
 *  - No grid lines inside monitors — at thumbnail scale even a 6×6
 *    grid produces too many tiny lines. Each Assignment renders as a
 *    single filled rectangle at its grid coordinates (multi-cell
 *    windows look like windows, not checkerboards).
 *  - Single neutral color for ALL assigned regions. Goal is
 *    "recognize the shape," not "identify each app."
 */

type Props = {
  assignments: Assignment[];
  /** Optional: current physical monitors for aspect-ratio lookup. */
  monitorsContext?: Monitor[];
};

// All units below are viewBox units. The SVG itself scales to fit its
// container via width="100%", so these values control the INTERNAL
// proportions of the thumbnail, not its rendered pixel size.
const SLOT_W = 100;
const SLOT_H = 70;
const LABEL_BAND = 14;
const SLOT_GAP = 8;
const OUTER_PAD = 6;
const MIN_ASPECT = 0.5;
const MAX_ASPECT = 2.5;
const DEFAULT_ASPECT = 16 / 9;

/** Pick a grid arrangement that maximizes each monitor's size while
 *  staying compact enough for narrow cards. */
function chooseGrid(n: number): { cols: number; rows: number } {
  if (n <= 1) return { cols: 1, rows: 1 };
  if (n === 2) return { cols: 2, rows: 1 };
  if (n === 3) return { cols: 3, rows: 1 };
  if (n === 4) return { cols: 2, rows: 2 };
  if (n <= 6) return { cols: 3, rows: 2 };
  const cols = Math.ceil(Math.sqrt(n));
  return { cols, rows: Math.ceil(n / cols) };
}

export default function LayoutThumbnail({
  assignments,
  monitorsContext = [],
}: Props) {
  const data = useMemo(() => {
    const byMonitor = new Map<number, Assignment[]>();
    for (const a of assignments) {
      if (!byMonitor.has(a.monitor)) byMonitor.set(a.monitor, []);
      byMonitor.get(a.monitor)!.push(a);
    }
    const indices = [...byMonitor.keys()].sort((a, b) => a - b);
    if (indices.length === 0) return null;

    const { cols: gridCols, rows: gridRows } = chooseGrid(indices.length);
    const slotInternalH = SLOT_H - LABEL_BAND;

    const monitors = indices.map((idx, i) => {
      const monA = byMonitor.get(idx)!;
      const firstGS = (monA[0].gridSize ?? "6x6").toLowerCase();
      const [colsStr, rowsStr] = firstGS.split("x");
      const cols = Math.max(1, parseInt(colsStr, 10) || 6);
      const rows = Math.max(1, parseInt(rowsStr, 10) || 6);

      // Real aspect, clamped so portrait isn't a sliver and ultrawide
      // isn't a row-dominating bar.
      let aspect = DEFAULT_ASPECT;
      const live = monitorsContext.find((m) => m.id === `m${idx}`);
      if (live && live.w > 0 && live.h > 0) {
        aspect = Math.max(MIN_ASPECT, Math.min(MAX_ASPECT, live.w / live.h));
      }

      // Slot position in the grid.
      const gridX = i % gridCols;
      const gridY = Math.floor(i / gridCols);
      const slotX = OUTER_PAD + gridX * (SLOT_W + SLOT_GAP);
      const slotY = OUTER_PAD + gridY * (SLOT_H + SLOT_GAP);

      // Monitor rect FIT inside the slot, preserving aspect.
      let rectW: number;
      let rectH: number;
      if (aspect >= SLOT_W / slotInternalH) {
        rectW = SLOT_W;
        rectH = SLOT_W / aspect;
      } else {
        rectH = slotInternalH;
        rectW = slotInternalH * aspect;
      }
      const rectX = slotX + (SLOT_W - rectW) / 2;
      const rectY = slotY + (slotInternalH - rectH) / 2;
      const labelX = slotX + SLOT_W / 2;
      const labelY = slotY + slotInternalH + 11;

      return {
        idx,
        assignments: monA,
        cols,
        rows,
        rectX,
        rectY,
        rectW,
        rectH,
        labelX,
        labelY,
      };
    });

    const viewBoxW = gridCols * SLOT_W + (gridCols - 1) * SLOT_GAP + OUTER_PAD * 2;
    const viewBoxH = gridRows * SLOT_H + (gridRows - 1) * SLOT_GAP + OUTER_PAD * 2;

    return { monitors, viewBoxW, viewBoxH };
  }, [assignments, monitorsContext]);

  if (!data) {
    return (
      <div className="rounded-md bg-slate-50 px-3 py-3 text-center text-[10px] text-slate-400">
        Empty Layout
      </div>
    );
  }

  return (
    <svg
      style={{ width: "100%", height: "auto", display: "block" }}
      viewBox={`0 0 ${data.viewBoxW} ${data.viewBoxH}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Layout preview: ${data.monitors.length} monitor${data.monitors.length === 1 ? "" : "s"}`}
    >
      {data.monitors.map(
        ({ idx, assignments: monA, cols, rows, rectX, rectY, rectW, rectH, labelX, labelY }) => (
          <g key={idx}>
            {/* Monitor outline — stronger slate border for readability. */}
            <rect
              x={rectX}
              y={rectY}
              width={rectW}
              height={rectH}
              rx={2.5}
              ry={2.5}
              fill="#ffffff"
              stroke="#94a3b8" /* slate-400 */
              strokeWidth={1.2}
            />

            {/* Assignments as filled rectangles. Stronger color than v1. */}
            {monA.map((a, ai) => {
              const parts = (a.grid || "")
                .split(",")
                .map((s) => parseInt(s.trim(), 10));
              if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n <= 0)) {
                return null;
              }
              const [gx, gy, gw, gh] = parts;
              const cellW = rectW / cols;
              const cellH = rectH / rows;
              const ax = rectX + (gx - 1) * cellW;
              const ay = rectY + (gy - 1) * cellH;
              const aw = gw * cellW;
              const ah = gh * cellH;

              return (
                <rect
                  key={ai}
                  x={ax + 0.8}
                  y={ay + 0.8}
                  width={Math.max(0, aw - 1.6)}
                  height={Math.max(0, ah - 1.6)}
                  rx={1.5}
                  ry={1.5}
                  fill="#7dd3fc" /* sky-300 — stronger than v1 sky-200 */
                  stroke="#0284c7" /* sky-600 — stronger border */
                  strokeWidth={0.8}
                />
              );
            })}

            {/* Monitor label — bolder + darker for readability at small size. */}
            <text
              x={labelX}
              y={labelY}
              fontSize={10}
              fill="#334155" /* slate-700 — was slate-500 in v1 */
              textAnchor="middle"
              style={{
                fontFamily: "system-ui, -apple-system, sans-serif",
                fontWeight: 600,
              }}
            >
              M{idx}
            </text>
          </g>
        )
      )}
    </svg>
  );
}
