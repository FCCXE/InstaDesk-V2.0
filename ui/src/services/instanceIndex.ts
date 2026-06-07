// Per-cell instance numbering for the workspace grid.
//
// When two or more regions of the same app live on the same monitor —
// differentiated by per-cell args override (e.g., two File Explorer windows
// pointed at different folders) — each region needs a stable visual identity
// so the user can SEE that they're distinct launches, not one weird shape.
//
// This helper walks one monitor's grid in row-major order, groups cells by
// (app, args) tuple, and assigns each unique tuple a 0-based instance index
// within its app. Cells with the catalog default args (empty override) are
// instance 0 (the original color); the next distinct args is instance 1, etc.
//
// The 0-based index lines up directly with appsCatalog.instanceStyleFor's
// shade ladder: index 0 → base color, index 1+ → progressively darker.
//
// Stability: the first-seen-args order is the order returned for instance
// numbering. Two saves of the same layout yield identical numbers.

export type CellInstanceInfo = {
  instanceIndex: number;     // 0-based
  totalInstances: number;    // 1 = solo (no badge needed), 2+ = annotated
  args: string;              // the args this cell carries ("" = catalog default)
};

export function computeInstanceIndices(
  assignments: Record<string, string | null>,
  argsOverrides: Record<string, string> = {},
): Record<string, CellInstanceInfo> {
  // First pass: discover, per app, the ordered list of distinct args values.
  // Iterate in row-major cell order so the top-left distinct-args region of
  // an app always gets index 0.
  const orderedArgsByApp = new Map<string, string[]>();
  const cellKeysSorted = Object.keys(assignments).sort((a, b) => {
    const [ar, ac] = a.split(",").map(Number);
    const [br, bc] = b.split(",").map(Number);
    return ar !== br ? ar - br : ac - bc;
  });

  for (const k of cellKeysSorted) {
    const app = assignments[k];
    if (!app) continue;
    const args = argsOverrides[k] ?? "";
    let list = orderedArgsByApp.get(app);
    if (!list) {
      list = [];
      orderedArgsByApp.set(app, list);
    }
    if (!list.includes(args)) list.push(args);
  }

  // Second pass: emit per-cell info using the discovered orderings.
  const out: Record<string, CellInstanceInfo> = {};
  for (const [k, app] of Object.entries(assignments)) {
    if (!app) continue;
    const args = argsOverrides[k] ?? "";
    const list = orderedArgsByApp.get(app) ?? [];
    const idx = list.indexOf(args);
    out[k] = {
      instanceIndex: idx >= 0 ? idx : 0,
      totalInstances: list.length,
      args,
    };
  }
  return out;
}
