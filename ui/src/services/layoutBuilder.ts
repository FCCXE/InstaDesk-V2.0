// Convert the cell-by-cell assignments map into the server's Assignment[]
// schema. The product currently allows ONE rectangular region per app; a
// later iteration can split L-shapes via connected-components decomposition.

import { APP_CATALOG } from "./appsCatalog";
import { listHistory } from "./AppsHistoryService";
import type { Assignment } from "./api";

export type AppTarget =
  | { kind: "program"; program: string; args?: string }
  | { kind: "url"; url: string };

export function resolveAppTarget(app: string): AppTarget | null {
  // Custom history paths win over catalog defaults — the user knows their
  // exact install location, the catalog is just best-effort per-app guess.
  const custom = listHistory().find(h => h.title === app);
  if (custom) return { kind: "program", program: custom.path };
  // Fall back to catalog defaults (may need %ENV% expansion server-side).
  const seed = APP_CATALOG.find(e => e.id === app);
  if (seed?.program) return { kind: "program", program: seed.program, args: seed.args };
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
      title: region.app,
      monitor: monitorIndex,
      grid: `${region.x},${region.y},${region.w},${region.h}`,
      gridSize: `${gridCols}x${gridRows}`,
      frameMode: "frameless",
    });
  }

  return { assignments, errors, warnings };
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
