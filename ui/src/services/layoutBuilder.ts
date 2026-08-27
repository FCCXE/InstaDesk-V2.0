// Convert the cell-by-cell assignments map into the server's Assignment[]
// schema. The product currently allows ONE rectangular region per app; a
// later iteration can split L-shapes via connected-components decomposition.

import { APP_CATALOG } from "./appsCatalog";
import { listHistory } from "./AppsHistoryService";
import { findUrlGroupByName } from "./UrlGroupsService";
import { findFavoriteByName } from "./FavoritesService";
import type { Assignment } from "./api";

export type AppTarget =
  | { kind: "program"; program: string; args?: string; singleInstance?: boolean; urls?: string[] }
  | { kind: "url"; url: string };

// Resolve a browser name to a real exe via the persisted browser registry
// (instadesk:browsers — populated by native detection + the Browse-for-exe
// picker). This is what makes the URL-Builder "Add Browser" choice actually
// launch that browser, instead of only the four hardcoded catalog browsers.
function findBrowserPathByName(name: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem("instadesk:browsers");
    if (!raw) return undefined;
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return undefined;
    const hit = list.find(
      (b: { name?: unknown; path?: unknown }) =>
        b && typeof b.name === "string" &&
        b.name.toLowerCase() === name.toLowerCase() &&
        typeof b.path === "string" && b.path.trim(),
    );
    return hit && typeof hit.path === "string" ? hit.path : undefined;
  } catch {
    return undefined;
  }
}

// New-window flag differs: Firefox uses "-new-window"; Chromium browsers
// (Chrome/Edge/Brave/Vivaldi/Opera/…) use "--new-window".
function browserNewWindowArg(exePath: string): string {
  return /firefox\.exe$/i.test(exePath) ? "-new-window" : "--new-window";
}

export function resolveAppTarget(app: string): AppTarget | null {
  // 1) URL groups — saved bundles of (browser, urls[]). Open the URLs as tabs
  //    in the chosen browser. Resolution order: the user's detected/added
  //    browser (real exe from the registry) FIRST, then the hardcoded catalog
  //    browser by id (legacy groups: Chrome/Edge/Firefox/Brave).
  const urlGroup = findUrlGroupByName(app);
  if (urlGroup) {
    const browserPath = findBrowserPathByName(urlGroup.browser);
    if (browserPath) {
      return {
        kind: "program",
        program: browserPath,
        args: browserNewWindowArg(browserPath),
        singleInstance: false,         // browser windows via --new-window are multi-window
        urls: urlGroup.urls,
      };
    }
    const browserSeed = APP_CATALOG.find(e => e.id === urlGroup.browser);
    if (browserSeed?.program) {
      return {
        kind: "program",
        program: browserSeed.program,
        args: browserSeed.args ?? "--new-window",
        singleInstance: false,
        urls: urlGroup.urls,
      };
    }
    // Browser path not resolvable (not in registry, no catalog seed) — return
    // null; buildSaveAssignments records it (now a skip-with-warning).
    return null;
  }

  // 2) Favorites — user-curated quick picks. App favorite = exe path.
  //    URL favorite = single-tab browser launch via the Chrome catalog seed
  //    (consistent with URL Groups; if you need a different browser, save
  //    a URL Group instead with that browser explicitly).
  const fav = findFavoriteByName(app);
  if (fav) {
    if (fav.kind === "app") {
      return { kind: "program", program: fav.pathOrUrl };
    }
    const browserSeed = APP_CATALOG.find(e => e.id === "Chrome");
    if (browserSeed?.program) {
      return {
        kind: "program",
        program: browserSeed.program,
        args: browserSeed.args ?? "--new-window",
        singleInstance: false,
        urls: [fav.pathOrUrl],
      };
    }
    return null;
  }

  // 3) Custom history paths win over catalog defaults — the user knows their
  //    exact install location, the catalog is just best-effort per-app guess.
  //    Custom apps default to multi-instance (no singleInstance flag).
  //
  //    EXCEPTION: when the Custom path is a Windows shortcut (.lnk) AND the
  //    catalog has the same app id with a real .exe, prefer the catalog. The
  //    .lnk resolves through the shell (COM IShellLink) which the agent's
  //    Process.Start can't replicate — the shortcut launches but ignores our
  //    --args and yields a window the agent can't track. This handles
  //    historical Custom entries that pre-date a catalog entry for the same
  //    title (e.g. File Explorer added via Browse before being shipped in
  //    the catalog).
  const custom = listHistory().find(h => h.title === app);
  const catalogSeed = APP_CATALOG.find(e => e.id === app);
  if (custom) {
    const isLnk = /\.lnk$/i.test(custom.path);
    const catalogHasExe = !!catalogSeed?.program && !/\.lnk$/i.test(catalogSeed.program);
    if (isLnk && catalogHasExe) {
      // Fall through to catalog (Step 4 below).
    } else {
      return { kind: "program", program: custom.path };
    }
  }

  // 4) Fall back to catalog defaults (may need %ENV% expansion server-side).
  if (catalogSeed?.program) return {
    kind: "program",
    program: catalogSeed.program,
    args: catalogSeed.args,
    singleInstance: catalogSeed.singleInstance,
  };
  if (catalogSeed?.url)     return { kind: "url",     url: catalogSeed.url };
  return null;
}

type Region = { app: string; args: string; x: number; y: number; w: number; h: number };

export type BuildResult = {
  assignments: Assignment[];
  errors: string[];   // hard problems — block save
  warnings: string[]; // soft problems — proceed but inform user
};

// Same-app cells get a per-cell args override (see AppState.argsOverridesByMonitor).
// Cells with DIFFERENT overrides count as distinct regions so two File Explorer
// rectangles can launch into two separate folders. Region grouping key is
// `${app}\0${args}` to disambiguate when args is empty vs. when it's omitted.
function regionGroupKey(app: string, args: string): string {
  return `${app}\0${args}`;
}

export function buildSaveAssignments(
  cellAssignments: Record<string, string | null>,
  monitorIndex: number,
  gridCols: number,
  gridRows: number,
  argsOverrides: Record<string, string> = {},
): BuildResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Group cells by (app, args) tuple. Two regions of the same app with
  // different overrides are intentionally distinct groups so they save as
  // separate Assignment entries → two windows, two folder paths.
  const byKey = new Map<string, { app: string; args: string; cells: Array<{ r: number; c: number }> }>();
  for (const [k, app] of Object.entries(cellAssignments)) {
    if (!app) continue;
    const args = argsOverrides[k] ?? "";
    const [rs, cs] = k.split(",");
    const r = parseInt(rs, 10);
    const c = parseInt(cs, 10);
    const gk = regionGroupKey(app, args);
    if (!byKey.has(gk)) byKey.set(gk, { app, args, cells: [] });
    byKey.get(gk)!.cells.push({ r, c });
  }

  if (byKey.size === 0) {
    errors.push("No apps assigned. Pick an app and click \"Assign to Selection\" first.");
    return { assignments: [], errors, warnings };
  }

  const regions: Region[] = [];
  for (const { app, args, cells } of byKey.values()) {
    const label = args ? `"${app}" (${args})` : `"${app}"`;
    const rs = cells.map(c => c.r);
    const cs = cells.map(c => c.c);
    const rMin = Math.min(...rs), rMax = Math.max(...rs);
    const cMin = Math.min(...cs), cMax = Math.max(...cs);
    const w = cMax - cMin + 1;
    const h = rMax - rMin + 1;

    if (cells.length !== w * h) {
      errors.push(`${label} isn't a single rectangle (${cells.length} cells in a ${w}×${h} bounding box). Either reshape it into one rectangle, or — if you meant TWO separate windows of this app — give each region a different value in "Launch args for selection" on the Apps tab. Regions of the same app with the same args are treated as one window.`);
      continue;
    }
    // The bounding box must contain only this (app, args) — no holes from
    // others. Cells of the same app but a DIFFERENT args override count as
    // "other" here, so two distinct File Explorer regions can be detected as
    // overlapping even though they share the app name.
    let pure = true;
    for (let r = rMin; r <= rMax && pure; r++) {
      for (let c = cMin; c <= cMax && pure; c++) {
        const cellApp = cellAssignments[`${r},${c}`];
        const cellArgs = argsOverrides[`${r},${c}`] ?? "";
        if (cellApp !== app || cellArgs !== args) pure = false;
      }
    }
    if (!pure) {
      errors.push(`${label} overlaps with another app or another args variant inside its bounding box. Use one rectangle per (app, args) pair.`);
      continue;
    }
    regions.push({ app, args, x: cMin + 1, y: rMin + 1, w, h });
  }

  if (errors.length > 0) {
    return { assignments: [], errors, warnings };
  }

  // Resolve each region's target (program / url). Per-cell args override
  // REPLACES the catalog default — the input pre-fills with the catalog value
  // when the user first opens it (RightPane), so what they see is what gets
  // saved. Round-trip safe: Save then Load then Save produces identical args.
  const assignments: Assignment[] = [];
  for (const region of regions) {
    const target = resolveAppTarget(region.app);
    if (!target) {
      // Not a hard error: one unconfigured app on any monitor must not block
      // saving the rest. Skip just this region and surface a warning so the
      // user knows it was dropped. (A blocking error here forced users to
      // manually clear the offending app from another monitor before they
      // could save — see the "skipped on apply" promise the message made.)
      warnings.push(`"${region.app}" has no executable path or URL configured — skipped. Add it via "Browse..." in the Apps tab to include it.`);
      continue;
    }
    const finalArgs = target.kind === "program"
      ? (region.args !== "" ? region.args : target.args)
      : undefined;
    assignments.push({
      type: target.kind,
      program: target.kind === "program" ? target.program : undefined,
      url:     target.kind === "url"     ? target.url     : undefined,
      args:    finalArgs,
      singleInstance: target.kind === "program" ? target.singleInstance : undefined,
      urls:    target.kind === "program" ? target.urls    : undefined,
      title: region.app,
      monitor: monitorIndex,
      grid: `${region.x},${region.y},${region.w},${region.h}`,
      gridSize: `${gridCols}x${gridRows}`,
    });
  }

  return { assignments, errors, warnings };
}

/** Multi-monitor variant of buildSaveAssignments. Takes a per-monitor
 *  cell-map keyed by AppState's monitor id ("m1", "m2", ...) and resolves
 *  each id to the agent's 1-based monitor index via the supplied resolver.
 *
 *  Per-monitor grid size (Step 3 of the grid-size build, 2026-06-09): each
 *  monitor's saved assignments record THAT monitor's grid size, not a
 *  single global value. The caller supplies gridSizeByMonitorId for every
 *  monitor with explicit overrides; monitors without an entry fall back to
 *  defaultGridSize. This is what makes one Layout viable on a mixed
 *  multi-monitor setup (e.g. ultrawide 8×8 + 4K 6×6 + vertical 4×4).
 *
 *  Emits one Assignment[] containing entries from every monitor with a
 *  non-empty grid. Errors from any monitor are tagged with that monitor's
 *  label and propagated. */
export type GridSize = { cols: number; rows: number };

export function buildSaveAssignmentsMulti(
  cellsByMonitorId: Record<string, Record<string, string | null>>,
  monitorIdToIndex: (id: string) => number,
  monitorIdToLabel: (id: string) => string,
  gridSizeByMonitorId: Record<string, GridSize>,
  defaultGridSize: GridSize,
  argsByMonitorId: Record<string, Record<string, string>> = {},
): BuildResult {
  const allAssignments: Assignment[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  // Stable iteration: by monitor index ascending.
  const entries = Object.entries(cellsByMonitorId)
    .filter(([, cells]) => Object.values(cells).some(Boolean))
    .sort(([a], [b]) => monitorIdToIndex(a) - monitorIdToIndex(b));

  if (entries.length === 0) {
    errors.push("No apps assigned on any monitor. Pick an app and assign it to cells first.");
    return { assignments: [], errors, warnings };
  }

  for (const [monitorId, cells] of entries) {
    const index = monitorIdToIndex(monitorId);
    const label = monitorIdToLabel(monitorId);
    // Per-monitor size — override → default fallback. Missing entries are
    // legitimate (monitor inherits the global default).
    const size = gridSizeByMonitorId[monitorId] ?? defaultGridSize;
    const r = buildSaveAssignments(cells, index, size.cols, size.rows, argsByMonitorId[monitorId] ?? {});
    if (r.errors.length > 0) {
      errors.push(...r.errors.map(e => `[${label}] ${e}`));
      continue;
    }
    if (r.warnings.length > 0) {
      warnings.push(...r.warnings.map(w => `[${label}] ${w}`));
    }
    allAssignments.push(...r.assignments);
  }

  if (errors.length > 0) {
    return { assignments: [], errors, warnings };
  }
  return { assignments: allAssignments, errors, warnings };
}

/** Reverse of buildSaveAssignments: take a saved Assignment[] and produce a
 *  cell-by-cell map suitable for AppState.assignments, plus the suggested
 *  monitor index. The assignment grid format is "x,y,w,h" 1-based with x as
 *  column and y as row. */
export type ParsedPreset = {
  cells: Record<string, string>;       // "r,c" -> app id (title)
  monitorIndex: number;                 // first assignment's monitor (1-based)
  monitorsUsed: number[];               // distinct monitors referenced
  warnings: string[];
};

export function parsePresetIntoCells(
  assignments: Array<{ title?: string; monitor: number; grid: string; gridSize?: string }>,
  gridCols: number,
  gridRows: number,
): ParsedPreset {
  const warnings: string[] = [];
  const cells: Record<string, string> = {};
  const monitorsUsed = new Set<number>();
  let firstMonitor: number | null = null;

  for (const a of assignments) {
    if (!a.title) {
      warnings.push("An assignment is missing its title; skipped.");
      continue;
    }
    monitorsUsed.add(a.monitor);
    if (firstMonitor === null) firstMonitor = a.monitor;

    const parts = (a.grid || "").split(",").map(s => parseInt(s.trim(), 10));
    if (parts.length !== 4 || parts.some(n => !Number.isFinite(n) || n <= 0)) {
      warnings.push(`Skipping "${a.title}": invalid grid "${a.grid}".`);
      continue;
    }
    const [x, y, w, h] = parts;       // 1-based: x=col, y=row
    // Fill cells (r,c) inclusive of the rectangle. Cap at the active grid size.
    for (let r = y - 1; r < Math.min(y - 1 + h, gridRows); r++) {
      for (let c = x - 1; c < Math.min(x - 1 + w, gridCols); c++) {
        if (r < 0 || c < 0) continue;
        cells[`${r},${c}`] = a.title;
      }
    }
  }

  if (monitorsUsed.size > 1) {
    warnings.push(`Layout spans ${monitorsUsed.size} monitors (${[...monitorsUsed].sort((a, b) => a - b).join(", ")}). The grid only shows one monitor at a time — switching to monitor ${firstMonitor}. Other monitors' assignments are loaded too; switch the monitor selector to see them.`);
  }

  return {
    cells,
    monitorIndex: firstMonitor ?? 1,
    monitorsUsed: [...monitorsUsed].sort((a, b) => a - b),
    warnings,
  };
}

/** Multi-monitor variant: split a saved Assignment[] by monitor index and
 *  produce a per-monitor cell map keyed by AppState monitor id ("m{N}").
 *  Used by Load to populate every monitor's grid at once.
 *
 *  Per-monitor grid size recovery (Step 3 of the grid-size build,
 *  2026-06-09): each monitor's `gridSize` is read from the FIRST
 *  assignment for that monitor — the save flow writes the same size to
 *  every assignment for a given monitor, so the first one is authoritative.
 *  If assignments for the same monitor disagree (legacy data, manual
 *  preset editing), the first wins and a warning is emitted.
 *
 *  Cell clipping is done at the recovered per-monitor size, NOT at a
 *  single global value. Legacy presets that pre-date this code path
 *  (no `gridSize` field) fall back to defaultGridSize. */
export type ParsedPresetMulti = {
  cellsByMonitorId: Record<string, Record<string, string>>;  // "m1" -> {"r,c": app}
  argsByMonitorId: Record<string, Record<string, string>>;   // "m1" -> {"r,c": args}
  gridSizeByMonitorId: Record<string, GridSize>;             // "m1" -> {cols, rows}
  monitorsUsed: number[];                                     // sorted ascending
  firstMonitorId: string | null;                              // "m{N}" of the first monitor with assignments
  warnings: string[];
};

// Parse a "NxM" gridSize string into a GridSize. Tolerates legacy "6x6"
// defaults and rejects nonsense by returning null so the caller can fall
// back to defaultGridSize.
function parseGridSizeString(s: string | undefined): GridSize | null {
  if (!s) return null;
  const m = s.toLowerCase().match(/^\s*(\d+)\s*x\s*(\d+)\s*$/);
  if (!m) return null;
  const cols = parseInt(m[1], 10);
  const rows = parseInt(m[2], 10);
  if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols <= 0 || rows <= 0) return null;
  return { cols, rows };
}

export function parsePresetIntoCellsMulti(
  assignments: Array<{ title?: string; monitor: number; grid: string; gridSize?: string; args?: string }>,
  defaultGridSize: GridSize,
): ParsedPresetMulti {
  const warnings: string[] = [];
  const cellsByMonitorId: Record<string, Record<string, string>> = {};
  const argsByMonitorId: Record<string, Record<string, string>> = {};
  const gridSizeByMonitorId: Record<string, GridSize> = {};
  const monitorsUsedSet = new Set<number>();
  let firstMonitorId: string | null = null;

  for (const a of assignments) {
    if (!a.title) {
      warnings.push("An assignment is missing its title; skipped.");
      continue;
    }
    const parts = (a.grid || "").split(",").map(s => parseInt(s.trim(), 10));
    if (parts.length !== 4 || parts.some(n => !Number.isFinite(n) || n <= 0)) {
      warnings.push(`Skipping "${a.title}" on M${a.monitor}: invalid grid "${a.grid}".`);
      continue;
    }
    const [x, y, w, h] = parts;
    const monitorId = `m${a.monitor}`;
    if (!cellsByMonitorId[monitorId]) cellsByMonitorId[monitorId] = {};
    if (!argsByMonitorId[monitorId]) argsByMonitorId[monitorId] = {};
    if (firstMonitorId === null) firstMonitorId = monitorId;
    monitorsUsedSet.add(a.monitor);

    // Resolve this monitor's grid size: first assignment for the monitor
    // wins. Legacy / malformed gridSize → defaultGridSize fallback.
    if (!gridSizeByMonitorId[monitorId]) {
      const parsed = parseGridSizeString(a.gridSize);
      gridSizeByMonitorId[monitorId] = parsed ?? defaultGridSize;
    } else {
      // Sanity check: warn on inconsistency. We could pick the larger
      // value to avoid clipping, but the spec is "first wins" — surfacing
      // the conflict gives the operator a chance to clean up the preset.
      const parsed = parseGridSizeString(a.gridSize);
      const recorded = gridSizeByMonitorId[monitorId];
      if (parsed && (parsed.cols !== recorded.cols || parsed.rows !== recorded.rows)) {
        warnings.push(
          `M${a.monitor} has inconsistent gridSize across assignments ` +
          `(${recorded.cols}×${recorded.rows} vs ${parsed.cols}×${parsed.rows}). ` +
          `Using ${recorded.cols}×${recorded.rows} (first seen).`
        );
      }
    }

    const size = gridSizeByMonitorId[monitorId];

    // Recover the saved per-region args as a per-cell override so that
    // a Save → Load → Save cycle produces an identical artifact.
    const savedArgs = (a.args ?? "").trim();

    // Clip at the recovered per-monitor size — out-of-range cells from
    // legacy presets are dropped silently (consistent with prior behavior).
    for (let r = y - 1; r < Math.min(y - 1 + h, size.rows); r++) {
      for (let c = x - 1; c < Math.min(x - 1 + w, size.cols); c++) {
        if (r < 0 || c < 0) continue;
        cellsByMonitorId[monitorId][`${r},${c}`] = a.title;
        if (savedArgs) argsByMonitorId[monitorId][`${r},${c}`] = savedArgs;
      }
    }
  }

  return {
    cellsByMonitorId,
    argsByMonitorId,
    gridSizeByMonitorId,
    monitorsUsed: [...monitorsUsedSet].sort((a, b) => a - b),
    firstMonitorId,
    warnings,
  };
}

/** Pick the first slot letter A..Z that isn't already taken. */
export function nextFreeSlot(taken: string[], kind: "general" | "single" = "general"): string {
  void kind; // kind reserved for future asymmetric slot pools
  const used = new Set(taken.map(s => s.toUpperCase()));
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode("A".charCodeAt(0) + i);
    if (!used.has(letter)) return letter;
  }
  return "A"; // 26 slots all taken — fall back to A (overwrite)
}
