import { useEffect, useMemo, useState } from "react";
import { api, type Assignment, type SavedPreset } from "../../services/api";
import { useAppState, type Monitor } from "../../state/AppState";

/**
 * LayoutPreviewOverlay — large, detailed, semi-transparent preview of a
 * saved Layout, rendered as an absolute overlay over the central pane
 * (above WorkspaceGrid). Operator decision 2026-06-09: replaces the
 * embedded per-card thumbnails with on-demand large previews that
 * actually clearly show what each Layout contains.
 *
 * Behavior:
 *  - Reads `previewedLayoutId` from AppState. When null, renders nothing.
 *  - When set, fetches the full SavedPreset via api.presetsGet and
 *    renders monitors + assignments at large size with grid lines + app
 *    name labels in each region. Light loading state during fetch.
 *  - Closes via:
 *      (a) the Hide-content toggle button on the LayoutCard,
 *      (b) Esc keypress,
 *      (c) click on the semi-transparent backdrop (not the panel itself).
 *
 * Visual design priority "very clean, clear and completely readable":
 *  - Large monitor rectangles in real aspect ratios (clamped [0.5, 2.5])
 *  - Grid lines visible (space allows at large size)
 *  - Each Assignment drawn as a single filled rect with the app's TITLE
 *    written inside it. Multi-cell windows get one big rect with the
 *    title centered. The title is the assignment's `title` field (the
 *    app name the user assigned), e.g. "File Explorer", "Chrome — Crypto
 *    Utilities", etc.
 *  - Args shown as smaller secondary text under the title when the
 *    region is large enough to hold both (lets the operator see e.g.
 *    "File Explorer (E:\Capitalismo Soberano Productivo)").
 *  - Per-monitor metadata strip below: M1 — 2560×1080 (Primary), etc.
 */

const MIN_ASPECT = 0.5;
const MAX_ASPECT = 2.5;
const DEFAULT_ASPECT = 16 / 9;

export default function LayoutPreviewOverlay() {
  const { previewedLayoutId, setPreviewedLayout, monitors } = useAppState();
  const [preset, setPreset] = useState<SavedPreset | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch the preset when previewedLayoutId changes (or clear on close).
  useEffect(() => {
    if (!previewedLayoutId) {
      setPreset(null);
      setError(null);
      return;
    }
    // previewedLayoutId is "kind_slot" — split it.
    const underscore = previewedLayoutId.indexOf("_");
    if (underscore < 0) return;
    const kind = previewedLayoutId.slice(0, underscore) as "general" | "single";
    const slot = previewedLayoutId.slice(underscore + 1);

    let alive = true;
    setLoading(true);
    setError(null);
    api.presetsGet(kind, slot)
      .then((res) => {
        if (alive) {
          setPreset(res.preset);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (alive) {
          setError((err as Error).message);
          setLoading(false);
        }
      });
    return () => { alive = false; };
  }, [previewedLayoutId]);

  // Close on Esc.
  useEffect(() => {
    if (!previewedLayoutId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Esc") {
        setPreviewedLayout(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewedLayoutId, setPreviewedLayout]);

  if (!previewedLayoutId) return null;

  // Decode layout name for the header (best-effort from the id).
  const underscoreIx = previewedLayoutId.indexOf("_");
  const kindForHeader = underscoreIx > 0 ? previewedLayoutId.slice(0, underscoreIx) : "general";
  const slotForHeader = underscoreIx > 0 ? previewedLayoutId.slice(underscoreIx + 1) : previewedLayoutId;
  const titleForHeader = `${kindForHeader === "general" ? "Layout" : "Single"} ${slotForHeader.toUpperCase()}`;

  return (
    <div
      // Semi-transparent backdrop. Click here closes the overlay; clicks
      // INSIDE the panel are stopped from propagating.
      className="absolute inset-0 z-30 flex flex-col items-stretch bg-slate-900/40 backdrop-blur-[2px]"
      onClick={() => setPreviewedLayout(null)}
    >
      <div
        className="m-3 flex flex-1 flex-col rounded-2xl border border-slate-200 bg-white/95 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: layout name + close. */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="text-base font-semibold text-slate-800">{titleForHeader}</div>
            <span className="inline-flex h-5 items-center rounded-full border border-slate-200 bg-slate-50 px-2 text-[10px] font-medium text-slate-600">
              {kindForHeader}
            </span>
            <span className="inline-flex h-5 items-center rounded-full border border-sky-200 bg-sky-50 px-2 text-[10px] font-medium text-sky-700">
              slot {slotForHeader.toUpperCase()}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setPreviewedLayout(null)}
            className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            title="Close (Esc)"
          >
            ✕ Hide content
          </button>
        </div>

        {/* Body. */}
        <div className="flex-1 min-h-0 overflow-auto p-4">
          {loading && (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Loading…
            </div>
          )}
          {error && (
            <div className="flex h-full items-center justify-center text-sm text-red-600">
              Could not load layout: {error}
            </div>
          )}
          {!loading && !error && preset && (
            <PreviewBody preset={preset} monitors={monitors} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */

/** Pick a grid arrangement that maximizes visibility while keeping every
 *  monitor on-screen simultaneously (no scrolling required). */
function chooseGrid(n: number): { cols: number; rows: number } {
  if (n <= 1) return { cols: 1, rows: 1 };
  if (n === 2) return { cols: 2, rows: 1 };
  if (n === 3) return { cols: 3, rows: 1 };
  if (n === 4) return { cols: 2, rows: 2 };
  if (n <= 6) return { cols: 3, rows: 2 };
  const cols = Math.ceil(Math.sqrt(n));
  return { cols, rows: Math.ceil(n / cols) };
}

function PreviewBody({ preset, monitors }: { preset: SavedPreset; monitors: Monitor[] }) {
  const layout = useMemo(() => {
    const byMonitor = new Map<number, Assignment[]>();
    for (const a of preset.assignments) {
      if (!byMonitor.has(a.monitor)) byMonitor.set(a.monitor, []);
      byMonitor.get(a.monitor)!.push(a);
    }
    const indices = [...byMonitor.keys()].sort((a, b) => a - b);
    const items = indices.map((idx) => {
      const assignments = byMonitor.get(idx)!;
      const firstGS = (assignments[0].gridSize ?? "6x6").toLowerCase();
      const [colsStr, rowsStr] = firstGS.split("x");
      const cols = Math.max(1, parseInt(colsStr, 10) || 6);
      const rows = Math.max(1, parseInt(rowsStr, 10) || 6);
      const live = monitors.find((m) => m.id === `m${idx}`);
      let aspect = DEFAULT_ASPECT;
      if (live && live.w > 0 && live.h > 0) {
        aspect = Math.max(MIN_ASPECT, Math.min(MAX_ASPECT, live.w / live.h));
      }
      return { idx, assignments, cols, rows, aspect, live };
    });
    return items;
  }, [preset, monitors]);

  if (layout.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        This Layout has no assigned cells.
      </div>
    );
  }

  const grid = chooseGrid(layout.length);

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Monitors arranged in an adaptive CSS grid. 4 monitors → 2×2,
          3 → 3×1, etc. Each cell uses minmax(0, 1fr) so SVGs don't push
          rows wider than their share. This is what makes ALL monitors
          visible without scrolling — flex-wrap couldn't constrain the
          row count, so 4 mixed-aspect monitors overflowed downward. */}
      <div
        className="grid min-h-0 flex-1 gap-3"
        style={{
          gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`,
        }}
      >
        {layout.map((m) => (
          <MonitorPanel key={m.idx} monitor={m} />
        ))}
      </div>

      {/* Footer: per-monitor resolution + role metadata. Compact so the
          monitors get all available vertical space. */}
      <div className="shrink-0 border-t border-slate-200 pt-2 text-[11px] text-slate-600">
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {layout.map((m) => (
            <span key={m.idx} className="whitespace-nowrap">
              <span className="font-semibold text-slate-800">M{m.idx}</span>
              {m.live ? (
                <>
                  <span className="text-slate-500"> · </span>
                  <span>{m.live.resolution}</span>
                  <span className="text-slate-500"> · </span>
                  <span>{m.live.role}</span>
                </>
              ) : (
                <span className="text-slate-400"> · not currently connected</span>
              )}
              <span className="text-slate-500"> · </span>
              <span>
                {m.cols}×{m.rows} grid
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */

function MonitorPanel({
  monitor,
}: {
  monitor: {
    idx: number;
    assignments: Assignment[];
    cols: number;
    rows: number;
    aspect: number;
    live: Monitor | undefined;
  };
}) {
  const { idx, assignments, cols, rows, aspect } = monitor;

  // Normalized viewBox — aspect drives width vs. height. Font sizes /
  // strokes inside the SVG are in viewBox units, so they auto-scale
  // with however big the cell ends up rendering.
  const VB_H = 1000;
  const VB_W = aspect * VB_H;

  const cellW = VB_W / cols;
  const cellH = VB_H / rows;

  return (
    <div className="flex min-w-0 min-h-0 flex-col items-center gap-1 overflow-hidden">
      <div className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
        M{idx}
      </div>
      {/* Responsive-SVG pattern: the wrapping div is `relative` and
          fills the remaining cell height. The SVG is absolute-positioned
          to fill the wrapper EXACTLY (width: 100%, height: 100%), and
          preserveAspectRatio="xMidYMid meet" letterboxes the content
          inside that fixed-size SVG. This guarantees the SVG never
          pushes the cell taller than its grid allocation — which was
          the bug in the previous version (intrinsic SVG sizing from
          viewBox aspect overflowed the 1fr row). */}
      <div className="relative min-h-0 w-full flex-1">
        <svg
          className="absolute inset-0 h-full w-full rounded-md bg-white shadow ring-1 ring-slate-300"
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Grid lines — subtle but visible at large size. */}
          {Array.from({ length: cols - 1 }, (_, i) => i + 1).map((i) => (
            <line
              key={`vl-${i}`}
              x1={(VB_W * i) / cols}
              y1={0}
              x2={(VB_W * i) / cols}
              y2={VB_H}
              stroke="#e2e8f0" /* slate-200 */
              strokeWidth={1.5}
            />
          ))}
          {Array.from({ length: rows - 1 }, (_, i) => i + 1).map((i) => (
            <line
              key={`hl-${i}`}
              x1={0}
              y1={(VB_H * i) / rows}
              x2={VB_W}
              y2={(VB_H * i) / rows}
              stroke="#e2e8f0"
              strokeWidth={1.5}
            />
          ))}

          {/* Filled regions with title + optional args label. */}
          {assignments.map((a, ai) => {
            const parts = (a.grid || "")
              .split(",")
              .map((s) => parseInt(s.trim(), 10));
            if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n <= 0)) {
              return null;
            }
            const [gx, gy, gw, gh] = parts;
            const ax = (gx - 1) * cellW;
            const ay = (gy - 1) * cellH;
            const aw = gw * cellW;
            const ah = gh * cellH;

            const title = a.title ?? "?";
            const args = (a.args ?? "").trim();

            // Font sizes scale with the region's smaller dimension.
            // Bounds keep them legible at small regions and not absurd at
            // large ones.
            const minDim = Math.min(aw, ah);
            const titleFont = Math.max(28, Math.min(70, minDim * 0.16));
            const argsFont = titleFont * 0.7;
            // Show args only if the region is tall enough to host two
            // lines without overlap.
            const canShowArgs = ah >= titleFont * 3.2 && args.length > 0;

            // Crude char-width estimate (each char ~= 0.55 * fontSize).
            const titleMaxChars = Math.max(6, Math.floor(aw / (titleFont * 0.55)));
            const argsMaxChars = Math.max(6, Math.floor(aw / (argsFont * 0.55)));

            return (
              <g key={ai}>
                <rect
                  x={ax + 4}
                  y={ay + 4}
                  width={Math.max(0, aw - 8)}
                  height={Math.max(0, ah - 8)}
                  rx={8}
                  ry={8}
                  fill="#bae6fd" /* sky-200 */
                  stroke="#0284c7" /* sky-600 */
                  strokeWidth={2}
                />
                <text
                  x={ax + aw / 2}
                  y={
                    canShowArgs
                      ? ay + ah / 2 - argsFont * 0.2
                      : ay + ah / 2 + titleFont / 3
                  }
                  fontSize={titleFont}
                  fill="#0c4a6e" /* sky-900 */
                  textAnchor="middle"
                  style={{
                    fontFamily: "system-ui, -apple-system, sans-serif",
                    fontWeight: 600,
                  }}
                >
                  {truncate(title, titleMaxChars)}
                </text>
                {canShowArgs && (
                  <text
                    x={ax + aw / 2}
                    y={ay + ah / 2 + titleFont * 0.95}
                    fontSize={argsFont}
                    fill="#075985" /* sky-800 */
                    textAnchor="middle"
                    style={{
                      fontFamily: "system-ui, -apple-system, sans-serif",
                      fontWeight: 400,
                    }}
                  >
                    {truncate(args, argsMaxChars)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  if (max <= 1) return "…";
  return s.slice(0, max - 1) + "…";
}
