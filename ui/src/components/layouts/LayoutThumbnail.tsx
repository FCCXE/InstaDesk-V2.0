import { useMemo } from "react";
import type { Assignment } from "../../services/api";
import type { Monitor } from "../../state/AppState";

/**
 * LayoutThumbnail — small SVG preview of a saved Layout.
 *
 * Design priority per operator 2026-06-09: "very clean, clear and
 * completely readable." That translates to:
 *
 *  - One small rectangle per monitor used in the Layout, in monitor-index
 *    order (M1 → MN, left to right).
 *  - Real monitor aspect ratios (looked up from AppState's `monitors` if
 *    available, falling back to 16:9 for monitors not currently
 *    connected). So an ultrawide rect looks wide, a portrait rect looks
 *    tall, and the user recognizes the shape immediately.
 *  - Each assignment rendered as a SINGLE filled rectangle at its (x, y,
 *    w, h) grid coordinates — NOT cell-by-cell. A 6-cell-wide window is
 *    one solid 6-wide rect, not six adjacent cells. That's what makes
 *    multi-cell windows look like "windows" instead of a checkerboard.
 *  - No grid lines drawn — at thumbnail scale (~50px per monitor), even
 *    a 6×6 grid produces too many tiny lines. The grid is implicit in
 *    how the windows are aligned. Cleaner read.
 *  - Single neutral sky color for ALL filled regions. Per-app coloring
 *    would make the thumbnail busy and harder to scan; the goal here is
 *    "recognize the shape," not "identify each app."
 *  - Tiny "M{N}" label beneath each monitor rect — useful when the
 *    Layout uses non-contiguous monitors (e.g., M1 + M3 but not M2).
 */

type Props = {
  assignments: Assignment[];
  /** Optional: current physical monitors for aspect-ratio lookup. When
   *  a Layout references a monitor not currently connected, we fall
   *  back to a 16:9 default. */
  monitorsContext?: Monitor[];
  /** Outer width budget. The component scales the full row to fit. */
  maxWidth?: number;
  /** Drawing area height for each monitor rect (label row is added on
   *  top of this). */
  monitorHeight?: number;
};

const MONITOR_GAP = 10;
const LABEL_SPACE = 14;
const ROW_PADDING = 4;
const DEFAULT_ASPECT = 16 / 9;

export default function LayoutThumbnail({
  assignments,
  monitorsContext = [],
  maxWidth = 280,
  monitorHeight = 60,
}: Props) {
  const layout = useMemo(() => {
    // Group assignments by monitor index.
    const byMonitor = new Map<number, Assignment[]>();
    for (const a of assignments) {
      if (!byMonitor.has(a.monitor)) byMonitor.set(a.monitor, []);
      byMonitor.get(a.monitor)!.push(a);
    }
    const indices = [...byMonitor.keys()].sort((a, b) => a - b);

    const monitors = indices.map((idx) => {
      const monAssignments = byMonitor.get(idx)!;

      // Per-monitor grid size: read from the first assignment's gridSize
      // (Step 3 of the grid-size build wrote the same value to every
      // assignment for a given monitor; first wins).
      const firstGS = (monAssignments[0].gridSize ?? "6x6").toLowerCase();
      const [colsStr, rowsStr] = firstGS.split("x");
      const cols = Math.max(1, parseInt(colsStr, 10) || 6);
      const rows = Math.max(1, parseInt(rowsStr, 10) || 6);

      // Aspect ratio: prefer the live monitor's, fall back to 16:9 if
      // the Layout references a monitor not currently connected.
      const liveMon = monitorsContext.find((m) => m.id === `m${idx}`);
      let aspect = DEFAULT_ASPECT;
      if (liveMon && liveMon.w > 0 && liveMon.h > 0) {
        aspect = liveMon.w / liveMon.h;
      }

      const rectW = monitorHeight * aspect;

      return { idx, assignments: monAssignments, cols, rows, rectW, aspect };
    });

    // Total width before scaling.
    const totalContentW =
      monitors.reduce((sum, m) => sum + m.rectW, 0) +
      (monitors.length > 0 ? (monitors.length - 1) * MONITOR_GAP : 0) +
      ROW_PADDING * 2;

    const totalContentH = monitorHeight + LABEL_SPACE + ROW_PADDING * 2;

    // Scale uniformly to fit within maxWidth (if needed).
    const scale = totalContentW > maxWidth ? maxWidth / totalContentW : 1;

    return {
      monitors,
      viewBoxW: totalContentW,
      viewBoxH: totalContentH,
      renderW: totalContentW * scale,
      renderH: totalContentH * scale,
    };
  }, [assignments, monitorsContext, monitorHeight]);

  if (layout.monitors.length === 0) {
    return (
      <div className="rounded-md bg-slate-50 px-3 py-2 text-center text-[10px] text-slate-400">
        Empty Layout
      </div>
    );
  }

  // Walking cursor for monitor x-positions in viewBox space.
  let xCursor = ROW_PADDING;

  return (
    <svg
      width={layout.renderW}
      height={layout.renderH}
      viewBox={`0 0 ${layout.viewBoxW} ${layout.viewBoxH}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Layout preview: ${layout.monitors.length} monitor${layout.monitors.length === 1 ? "" : "s"}`}
    >
      {layout.monitors.map(({ idx, assignments: monA, cols, rows, rectW }) => {
        const monX = xCursor;
        const monY = ROW_PADDING;
        const w = rectW;
        const h = monitorHeight;
        xCursor += w + MONITOR_GAP;

        return (
          <g key={idx}>
            {/* Monitor outline — soft slate border, white fill. */}
            <rect
              x={monX}
              y={monY}
              width={w}
              height={h}
              rx={2.5}
              ry={2.5}
              fill="#ffffff"
              stroke="#cbd5e1" /* slate-300 */
              strokeWidth={1}
            />

            {/* Assigned regions — each Assignment is drawn as a single
                filled rectangle spanning its (gx, gy, gw, gh) grid cells.
                This is what makes a 6×2 window look like one window
                rather than 12 individual cells. */}
            {monA.map((a, ai) => {
              const parts = (a.grid || "")
                .split(",")
                .map((s) => parseInt(s.trim(), 10));
              if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n <= 0)) {
                return null;
              }
              const [gx, gy, gw, gh] = parts;

              const cellW = w / cols;
              const cellH = h / rows;
              const ax = monX + (gx - 1) * cellW;
              const ay = monY + (gy - 1) * cellH;
              const aw = gw * cellW;
              const ah = gh * cellH;

              // Inset by 0.5px on each side to avoid the fill overlapping
              // the monitor outline at exact cell boundaries.
              return (
                <rect
                  key={ai}
                  x={ax + 0.5}
                  y={ay + 0.5}
                  width={Math.max(0, aw - 1)}
                  height={Math.max(0, ah - 1)}
                  rx={1.5}
                  ry={1.5}
                  fill="#bae6fd" /* sky-200 — InstaDesk brand-adjacent */
                  stroke="#7dd3fc" /* sky-300 */
                  strokeWidth={0.8}
                />
              );
            })}

            {/* Monitor label — small, centered below the rect. */}
            <text
              x={monX + w / 2}
              y={monY + h + 11}
              fontSize={9}
              fill="#64748b" /* slate-500 */
              textAnchor="middle"
              style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
            >
              M{idx}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
