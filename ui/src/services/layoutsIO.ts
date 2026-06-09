// Layout file export / import helpers.
//
// Operator decision 2026-06-09: Export/Import Layouts as the cheapest
// high-value win from the competitive analysis — FancyZones offers this
// and users love it for sharing setups, backups, and version-controlling
// personal configurations. Format mirrors the server-side preset JSON
// shape (kind / slot / assignments) with a small _meta header so future
// versions can detect schema migrations.
//
// Export → fetch via api.presetsGet → wrap with _meta → trigger browser
// download. Import → File picker → parse + validate → slot prompt
// (auto-suggest free slot) → api.presetsSave. Same overwrite-confirm
// pattern as + New Layout.

import type { PresetKind, SavedPreset, Assignment } from "./api";

/** Bump this if the export schema changes incompatibly. Backward-compat
 *  reads can branch on it. */
export const EXPORT_FORMAT_VERSION = 1;

export type ExportedLayout = {
  _meta: {
    exportedBy: "InstaDesk";
    exportedFormat: number;
  };
  kind: PresetKind;
  slot: string;
  assignments: Assignment[];
};

/** Wrap a SavedPreset for export. Adds _meta header so the import path
 *  can verify the file originated from InstaDesk and matches a known
 *  format version. */
export function buildExportPayload(preset: SavedPreset): ExportedLayout {
  return {
    _meta: {
      exportedBy: "InstaDesk",
      exportedFormat: EXPORT_FORMAT_VERSION,
    },
    kind: preset.kind,
    slot: preset.slot,
    assignments: preset.assignments,
  };
}

/** Trigger a browser download of the given preset as `instadesk-layout-
 *  <kind>-<slot>.json`. Uses a transient blob URL revoked after the click
 *  to avoid leaking object URLs. */
export function exportLayoutAsFile(preset: SavedPreset): void {
  const payload = buildExportPayload(preset);
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `instadesk-layout-${preset.kind}-${preset.slot}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revocation by a tick — Safari and some older browsers race the
  // download fetch if the URL is revoked synchronously after click().
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export type ParsedImport =
  | { ok: true; preset: { kind: PresetKind; slot: string; assignments: Assignment[] } }
  | { ok: false; error: string };

/** Parse + lightly validate an imported JSON file. Errors are surfaced
 *  to the user via a toast — we want messages that suggest a fix, not
 *  just "invalid". Lenient about _meta (older or hand-edited files may
 *  not have it). The server's Pydantic schema is the final authority
 *  for assignment-level validation; we only do enough here to reject
 *  obvious mistakes (wrong file type, empty file, missing required
 *  top-level fields). */
export function parseImportedLayout(jsonText: string): ParsedImport {
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return {
      ok: false,
      error: "Not a valid JSON file. Please pick a file exported from InstaDesk.",
    };
  }

  if (!data || typeof data !== "object") {
    return { ok: false, error: "Layout file is empty or malformed." };
  }

  const obj = data as Record<string, unknown>;
  const meta = obj._meta as Record<string, unknown> | undefined;

  // If _meta is present, sanity-check the source. If absent, allow —
  // hand-edited or pre-versioned files should still import.
  if (meta && meta.exportedBy && meta.exportedBy !== "InstaDesk") {
    return {
      ok: false,
      error: `File marked as exported from "${String(meta.exportedBy)}", not InstaDesk.`,
    };
  }

  const kind = obj.kind;
  if (kind !== "general" && kind !== "single") {
    return {
      ok: false,
      error: `Layout kind must be "general" or "single", got "${String(kind)}".`,
    };
  }

  const slotRaw = obj.slot;
  if (typeof slotRaw !== "string" || slotRaw.trim() === "") {
    return { ok: false, error: "Layout slot is missing." };
  }

  const assignments = obj.assignments;
  if (!Array.isArray(assignments)) {
    return { ok: false, error: "Layout assignments must be an array." };
  }

  if (assignments.length === 0) {
    return { ok: false, error: "Layout has no assignments — nothing to import." };
  }

  // Per-assignment sanity check. Surface the index so the operator can
  // find the offending entry in the source file if they hand-edited it.
  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i] as Record<string, unknown> | null;
    if (!a || typeof a !== "object") {
      return { ok: false, error: `Assignment #${i + 1} is malformed.` };
    }
    if (typeof a.monitor !== "number" || !Number.isFinite(a.monitor) || a.monitor <= 0) {
      return { ok: false, error: `Assignment #${i + 1} has invalid monitor index "${String(a.monitor)}".` };
    }
    if (typeof a.grid !== "string" || a.grid.trim() === "") {
      return { ok: false, error: `Assignment #${i + 1} is missing its grid coordinate.` };
    }
    if (!a.program && !a.url) {
      return { ok: false, error: `Assignment #${i + 1} has no program or URL target.` };
    }
  }

  return {
    ok: true,
    preset: {
      kind: kind as PresetKind,
      slot: slotRaw.toString().toUpperCase(),
      assignments: assignments as Assignment[],
    },
  };
}
