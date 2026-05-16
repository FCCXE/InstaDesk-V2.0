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

export function resolveAppTarget(app: string): AppTarget | null {
  // 1) URL groups — saved bundles of (browser, urls[]). Resolve to the
  //    catalog's browser entry for the program path + --new-window arg,
  //    and carry the URL list so the agent opens them as tabs.
  const urlGroup = findUrlGroupByName(app);
  if (urlGroup) {
    const browserSeed = APP_CATALOG.find(e => e.id === urlGroup.browser);
    if (browserSeed?.program) {
      return {
        kind: "program",
        program: browserSeed.program,
        args: browserSeed.args ?? "--new-window",
        singleInstance: false,         // browser windows via --new-window are multi-window
        urls: urlGroup.urls,
      };
    }
    // Browser path not resolvable (catalog seed missing) — let the user know
    // by returning null; buildSaveAssignments will record an error.
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
  const custom = listHistory().find(h => h.title === app);
  if (custom) return { kind: "program", program: custom.path };

  // 4) Fall back to catalog defaults (may need %ENV% expansion server-side).
  const seed = APP_CATALOG.find(e => e.id === app);
  if (seed?.program) return {
    kind: "program",
    program: seed.program,
    args: seed.args,
    singleInstance: seed.singleInstance,
  };
  if (seed?.url)     return { kind: "url",     url: seed.url };
  return null;
}

type Region = { app: string; x: number; y: number; w: number; h: number };

export type BuildResult = {
  assignments: Assignment[];
  errors: string[];   // hard problems — block save
  warnings: string[]; // soft problems — proceed but inform user
};

export function buildSaveAssignments(
  cellAssignments: Record<string, string | null>,
  monitorIndex: number,
  gridCols: number,
  gridRows: number,
): BuildResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Group cells by app id.
  const byApp = new Map<string, Array<{ r: number; c: number }>>();
  for (const [k, app] of Object.entries(cellAssignments)) {
    if (!app) continue;
    const [rs, cs] = k.split(",");
    const r = parseInt(rs, 10);
    const c = parseInt(cs, 10);
    if (!byApp.has(app)) byApp.set(app, []);
    byApp.get(app)!.push({ r, c });
  }

  if (byApp.size === 0) {
    errors.push("No apps assigned. Pick an app and click \"Assign to Selection\" first.");
    return { assignments: [], errors, warnings };
  }

  const regions: Region[] = [];
  for (const [app, cells] of byApp) {
    const rs = cells.map(c => c.r);
    const cs = cells.map(c => c.c);
    const rMin = Math.min(...rs), rMax = Math.max(...rs);
    const cMin = Math.min(...cs), cMax = Math.max(...cs);
    const w = cMax - cMin + 1;
    const h = rMax - rMin + 1;

    if (cells.length !== w * h) {
      errors.push(`"${app}" isn't a single rectangle (${cells.length} cells in a ${w}×${h} bounding box). Reshape the assignment to a rectangle and try again.`);
      continue;
    }
    // The bounding box must contain only this app — no holes from others.
    let pure = true;
    for (let r = rMin; r <= rMax && pure; r++) {
      for (let c = cMin; c <= cMax && pure; c++) {
        if (cellAssignments[`${r},${c}`] !== app) pure = false;
      }
    }
    if (!pure) {
      errors.push(`"${app}" overlaps with another app inside its bounding box. Use one rectangle per app.`);
      continue;
    }
    regions.push({ app, x: cMin + 1, y: rMin + 1, w, h });
  }

  if (errors.length > 0) {
    return { assignments: [], errors, warnings };
  }

  // Resolve each region's target (program / url).
  const assignments: Assignment[] = [];
  for (const region of regions) {
    const target = resolveAppTarget(region.app);
    if (!target) {
      errors.push(`"${region.app}" has no executable path or URL configured. Add it via "Browse..." in the Apps tab, or it'll be skipped on apply.`);
      continue;
    }
    assignments.push({
      type: target.kind,
      program: target.kind === "program" ? target.program : undefined,
      url:     target.kind === "url"     ? target.url     : undefined,
      args:    target.kind === "program" ? target.args    : undefined,
      singleInstance: target.kind === "program" ? target.singleInstance : undefined,
      urls:    target.kind === "program" ? target.urls    : undefined,
      title: region.app,
      monitor: monitorIndex,
      grid: `${region.x},${region.y},${region.w},${region.h}`,
      gridSize: `${gridCols}x${gridRows}`,
      frameMode: "frameless",
    });
  }

  return { assignments, errors, warnings };
}

/** Multi-monitor variant of buildSaveAssignments. Takes a per-monitor
 *  cell-map keyed by AppState's monitor id ("m1", "m2", ...) and resolves
 *  each id to the agent's 1-based monitor index via the supplied resolver.
 *  Emits one Assignment[] containing entries from every monitor with a
 *  non-empty grid. Errors from any monitor are tagged with that monitor's
 *  label and propagated. */
export function buildSaveAssignmentsMulti(
  cellsByMonitorId: Record<string, Record<string, string | null>>,
  monitorIdToIndex: (id: string) => number,
  monitorIdToLabel: (id: string) => string,
  gridCols: number,
  gridRows: number,
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
    const r = buildSaveAssignments(cells, index, gridCols, gridRows);
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
    warnings.push(`Layout spans ${monitorsUsed.size} monitors (${[...monitorsUsed].sort().join(", ")}). The grid only shows one monitor at a time — switching to monitor ${firstMonitor}. Other monitors' assignments are loaded too; switch the monitor selector to see them.`);
  }

  return {
    cells,
    monitorIndex: firstMonitor ?? 1,
    monitorsUsed: [...monitorsUsed].sort(),
    warnings,
  };
}

/** Multi-monitor variant: split a saved Assignment[] by monitor index and
 *  produce a per-monitor cell map keyed by AppState monitor id ("m{N}").
 *  Used by Load to populate every monitor's grid at once. */
export type ParsedPresetMulti = {
  cellsByMonitorId: Record<string, Record<string, string>>;  // "m1" -> {"r,c": app}
  monitorsUsed: number[];                                     // sorted ascending
  firstMonitorId: string | null;                              // "m{N}" of the first monitor with assignments
  warnings: string[];
};

export function parsePresetIntoCellsMulti(
  assignments: Array<{ title?: string; monitor: number; grid: string; gridSize?: string }>,
  gridCols: number,
  gridRows: number,
): ParsedPresetMulti {
  const warnings: string[] = [];
  const cellsByMonitorId: Record<string, Record<string, string>> = {};
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
    if (firstMonitorId === null) firstMonitorId = monitorId;
    monitorsUsedSet.add(a.monitor);

    for (let r = y - 1; r < Math.min(y - 1 + h, gridRows); r++) {
      for (let c = x - 1; c < Math.min(x - 1 + w, gridCols); c++) {
        if (r < 0 || c < 0) continue;
        cellsByMonitorId[monitorId][`${r},${c}`] = a.title;
      }
    }
  }

  return {
    cellsByMonitorId,
    monitorsUsed: [...monitorsUsedSet].sort(),
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
