import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MonitorId } from "./EditLayoutDrawer";
import { api, type PresetListItem } from "../../services/api";
import { useAppState } from "../../state/AppState";
import {
  buildSaveAssignmentsMulti,
  nextFreeSlot,
  parsePresetIntoCellsMulti,
} from "../../services/layoutBuilder";
import { exportLayoutAsFile, parseImportedLayout } from "../../services/layoutsIO";

/**
 * LayoutsPane
 * - Cards reflect real saved presets from the FastAPI server.
 * - Apply  → POST /presets/run
 * - Edit   → GET /presets/get → parsePresetIntoCellsMulti → replaceGridMulti
 *           (loads every monitor's slice; user modifies in Apps tab, saves via
 *            + New Layout reusing the same slot to overwrite).
 * - Delete → DELETE /presets/delete
 * - + New Layout → buildSaveAssignmentsMulti → POST /presets/save (multi-monitor).
 */

type LayoutCardModel = {
  id: string;            // `${kind}_${slot}` (matches server filename minus .json)
  name: string;
  monitors: MonitorId[]; // filled later when we render assignments
  preset: PresetListItem;
  notes?: string;
  updatedISO: string;
};

function presetToCard(p: PresetListItem): LayoutCardModel | null {
  // The server should always return kind+slot, but defensively guard against
  // legacy files that lacked them.
  const kind = p.kind;
  const slot = (p.slot ?? "").toString().toUpperCase();
  if (!kind || !slot) return null;
  return {
    id: `${kind}_${slot}`,
    name: `${kind === "general" ? "Layout" : "Single"} ${slot}`,
    monitors: [], // populated later when we read the preset's assignments
    preset: { ...p, slot },
    updatedISO: p.updatedAt,
  };
}

type Toast = { kind: "ok" | "err"; msg: string };

export default function LayoutsPane() {
  const { t } = useTranslation();
  const {
    monitors, replaceGridMulti,
    assignmentsByMonitor, assignedCountTotal,
    argsOverridesByMonitor,
    editingLayoutId, setEditingLayoutId,
    // Per-monitor grid sizes (Step 3 of the grid-size build, 2026-06-09):
    // save flow captures gridSizeByMonitor into each assignment; load flow
    // restores per-monitor sizes via setGridSizeForMonitor for each monitor
    // in the loaded preset.
    gridSizeByMonitor, defaultGridSize, setGridSizeForMonitor,
    // Window margin (bezel-aware): passed to presetsRun so every Layout
    // Apply honors the operator's edge-padding preference.
    windowMargin,
    // Layout content preview overlay (2026-06-09 redesign): operator
    // toggles via the Show/Hide content button on each card; overlay
    // mounted in App.tsx (sibling of WorkspaceGrid) reads this state.
    previewedLayoutId, setPreviewedLayout,
  } = useAppState();
  // Resolve a monitor id ("m{N}") to the agent's 1-based index N.
  const monitorIdToIndex = (id: string) => {
    const n = parseInt((id || "").replace(/^m/, ""), 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  };
  // Friendly label for toasts: prefer Monitor.name, fall back to "M{N}".
  const monitorIdToLabel = (id: string) =>
    monitors.find(m => m.id === id)?.name ?? `M${monitorIdToIndex(id)}`;

  // Localized display name for a card. Cards are stored with their raw
  // English name (presetToCard runs outside the component, with no t in
  // scope); we re-derive the display name here so it tracks the active
  // language without a server refetch on every toggle.
  const displayName = useCallback(
    (kind: string, slot: string) =>
      `${kind === "general" ? t("layouts.layout") : t("layouts.single")} ${(slot || "").toUpperCase()}`,
    [t]
  );

  const [layouts, setLayouts] = useState<LayoutCardModel[] | null>(null); // null = loading
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingNew, setSavingNew] = useState(false);
  const [savingEdits, setSavingEdits] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  // editingLayoutId now lives in AppState (lifted from local useState so it
  // survives Apps↔Layouts tab toggles — RightPane unmounts the inactive
  // pane on switch, which previously wiped local state on every toggle).
  // Drives the amber "Save changes to Layout X" banner.
  // Layout cards with their display name re-localized to the active language.
  // All rendering and toast construction reads from this list so a language
  // switch updates names everywhere (card titles AND flash messages) without
  // a refetch. State checks (loading / empty) still use raw `layouts`.
  const localizedLayouts = useMemo(
    () => layouts?.map(m => ({ ...m, name: displayName(m.preset.kind, m.preset.slot) })) ?? null,
    [layouts, displayName]
  );

  const editingLayout = useMemo(
    () => (editingLayoutId && localizedLayouts) ? localizedLayouts.find(l => l.id === editingLayoutId) ?? null : null,
    [editingLayoutId, localizedLayouts]
  );

  // Total assigned cells across ALL monitors. Drives + New Layout enable.
  const assignedCount = assignedCountTotal;
  // Monitor ids that have at least one assigned cell (sorted by index).
  const monitorsWithAssignments = useMemo(
    () => Object.entries(assignmentsByMonitor)
      .filter(([, m]) => Object.values(m).some(Boolean))
      .map(([id]) => id)
      .sort((a, b) => monitorIdToIndex(a) - monitorIdToIndex(b)),
    [assignmentsByMonitor]
  );

  const flash = (t: Toast) => {
    setToast(t);
    window.setTimeout(() => setToast(null), 2200);
  };

  const refresh = useCallback(async () => {
    try {
      const res = await api.presetsList();
      const cards = res.presets
        .map(presetToCard)
        .filter((c): c is LayoutCardModel => c !== null);
      setLayouts(cards);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setLayouts([]);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onChanged = () => refresh();
    window.addEventListener("insta:presets-changed", onChanged);
    return () => window.removeEventListener("insta:presets-changed", onChanged);
  }, [refresh]);

  const broadcastChanged = () => {
    window.dispatchEvent(new CustomEvent("insta:presets-changed"));
  };

  const onLoad = async (m: LayoutCardModel) => {
    setBusyId(m.id);
    try {
      const res = await api.presetsGet(m.preset.kind, m.preset.slot);
      const parsed = parsePresetIntoCellsMulti(res.preset.assignments, defaultGridSize);
      // Restore each monitor's grid size from the saved preset BEFORE
      // replacing the cells (Step 3 of grid-size build). Without this, the
      // dashboard would render the loaded assignments against whatever
      // grid sizes the monitors happened to have at load time, not the
      // sizes the Layout was authored at.
      for (const [monitorId, size] of Object.entries(parsed.gridSizeByMonitorId)) {
        setGridSizeForMonitor(monitorId, size);
      }
      // Switch the grid to the first monitor that has assignments, so the user
      // immediately sees something. They can navigate to others via the
      // monitor selector — each monitor's assignments are loaded independently.
      const switchTo = parsed.firstMonitorId && monitors.some(mm => mm.id === parsed.firstMonitorId)
        ? parsed.firstMonitorId
        : undefined;
      replaceGridMulti(parsed.cellsByMonitorId, switchTo, parsed.argsByMonitorId);
      // Remember which Layout the user is editing so the inline 'Save changes'
      // button knows which slot to overwrite without re-prompting.
      setEditingLayoutId(m.id);
      const totalCells = Object.values(parsed.cellsByMonitorId)
        .reduce((sum, c) => sum + Object.keys(c).length, 0);
      const monList = parsed.monitorsUsed.map(n => `M${n}`).join(", ");
      const monMsg = parsed.monitorsUsed.length > 1
        ? t("layouts.monitorsCount", { count: parsed.monitorsUsed.length, list: monList })
        : monList;
      flash({
        kind: "ok",
        msg: t("layouts.editingFlash", { name: m.name, count: totalCells, monitors: monMsg }),
      });
      if (parsed.warnings.length > 0) {
        window.setTimeout(() => flash({ kind: "err", msg: parsed.warnings.join(" ") }), 200);
      }
    } catch (e) {
      flash({ kind: "err", msg: (e as Error).message });
    } finally {
      setBusyId(null);
    }
  };

  // One-click overwrite for the Layout currently being edited. Same save
  // pipeline as onNewLayout, but skips the slot-letter prompt and the
  // overwrite-confirmation dialog because the user already chose this
  // slot when they clicked Edit. Success clears editingLayoutId so the
  // UI returns to its idle state (no orange banner).
  const onSaveEditedLayout = async () => {
    if (!editingLayout) return;
    const { kind, slot } = editingLayout.preset;
    const name = editingLayout.name;

    if (assignedCount === 0) {
      flash({ kind: "err", msg: t("layouts.saveEmptyFlash", { name }) });
      return;
    }
    const cellsByMonitorIdAny = assignmentsByMonitor as Record<string, Record<string, string | null>>;
    const built = buildSaveAssignmentsMulti(
      cellsByMonitorIdAny, monitorIdToIndex, monitorIdToLabel,
      gridSizeByMonitor, defaultGridSize,
      argsOverridesByMonitor,
    );
    if (built.errors.length > 0) {
      flash({ kind: "err", msg: built.errors[0] });
      return;
    }
    if (built.assignments.length === 0) {
      flash({ kind: "err", msg: t("layouts.nothingToSave") });
      return;
    }
    setSavingEdits(true);
    try {
      await api.presetsSave(kind, slot, built.assignments);
      const perMonitor = new Map<number, string[]>();
      for (const a of built.assignments) {
        const list = perMonitor.get(a.monitor) ?? [];
        list.push(a.title ?? "?");
        perMonitor.set(a.monitor, list);
      }
      const summary = [...perMonitor.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([m, titles]) => `M${m}: ${titles.join(", ")}`)
        .join(" • ");
      flash({ kind: "ok", msg: t("layouts.savedChanges", { name, count: perMonitor.size, summary }) });
      setEditingLayoutId(null);
      window.dispatchEvent(new CustomEvent("insta:presets-changed"));
    } catch (e) {
      flash({ kind: "err", msg: (e as Error).message });
    } finally {
      setSavingEdits(false);
    }
  };

  const onCancelEdit = () => {
    setEditingLayoutId(null);
    flash({ kind: "ok", msg: t("layouts.editCleared") });
  };

  const onApply = async (m: LayoutCardModel) => {
    setBusyId(m.id);
    try {
      const res = await api.presetsRun(m.preset.kind, m.preset.slot, windowMargin);
      const failures = res.results.filter(r => r.exitCode !== 0);
      if (failures.length === 0) {
        flash({ kind: "ok", msg: t("layouts.applied", { name: m.name, count: res.results.length }) });
      } else {
        flash({ kind: "err", msg: t("layouts.appliedFailures", { failed: failures.length, total: res.results.length, detail: (failures[0].stderr || failures[0].stdout).slice(0, 160) }) });
      }
    } catch (e) {
      flash({ kind: "err", msg: (e as Error).message });
    } finally {
      setBusyId(null);
    }
  };

  const onNewLayout = async () => {
    if (assignedCount === 0) {
      flash({ kind: "err", msg: t("layouts.assignFirst") });
      return;
    }
    const cellsByMonitorIdAny = assignmentsByMonitor as Record<string, Record<string, string | null>>;
    const built = buildSaveAssignmentsMulti(
      cellsByMonitorIdAny, monitorIdToIndex, monitorIdToLabel,
      gridSizeByMonitor, defaultGridSize,
      argsOverridesByMonitor,
    );
    if (built.errors.length > 0) {
      flash({ kind: "err", msg: built.errors[0] });
      return;
    }
    if (built.assignments.length === 0) {
      flash({ kind: "err", msg: t("layouts.nothingToSave") });
      return;
    }
    const takenSlots = (layouts ?? []).filter(l => l.preset.kind === "general").map(l => l.preset.slot);
    const suggested = nextFreeSlot(takenSlots, "general");
    const input = window.prompt(t("layouts.slotPrompt", { suggested }), suggested);
    if (input == null) return; // user cancelled
    const slot = input.trim().toUpperCase();
    if (!/^[A-Z]$/.test(slot)) {
      flash({ kind: "err", msg: t("layouts.invalidSlot", { input }) });
      return;
    }
    if (takenSlots.map(s => s.toUpperCase()).includes(slot)) {
      if (!confirm(t("layouts.slotExists", { slot }))) return;
    }
    setSavingNew(true);
    try {
      await api.presetsSave("general", slot, built.assignments);
      // Group assignments by monitor for a friendly summary.
      const perMonitor = new Map<number, string[]>();
      for (const a of built.assignments) {
        const list = perMonitor.get(a.monitor) ?? [];
        list.push(a.title ?? "?");
        perMonitor.set(a.monitor, list);
      }
      const summary = [...perMonitor.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([m, titles]) => `M${m}: ${titles.join(", ")}`)
        .join(" • ");
      flash({ kind: "ok", msg: t("layouts.savedLayout", { slot, count: perMonitor.size, summary }) });
      // Saving a NEW layout (via the explicit slot prompt) ends any prior
      // edit session, since the user has just committed to a different slot.
      setEditingLayoutId(null);
      window.dispatchEvent(new CustomEvent("insta:presets-changed"));
    } catch (e) {
      flash({ kind: "err", msg: (e as Error).message });
    } finally {
      setSavingNew(false);
    }
  };

  const onDelete = async (m: LayoutCardModel) => {
    if (!confirm(t("layouts.deleteConfirm", { name: m.name, path: m.preset.path }))) return;
    setBusyId(m.id);
    try {
      await api.presetsDelete(m.preset.kind, m.preset.slot);
      flash({ kind: "ok", msg: t("layouts.deleted", { name: m.name }) });
      broadcastChanged();
    } catch (e) {
      flash({ kind: "err", msg: (e as Error).message });
    } finally {
      setBusyId(null);
    }
  };

  // Export — fetch the preset's full content and trigger a browser
  // download. Adds an _meta header so import can verify origin/format.
  const onExport = async (m: LayoutCardModel) => {
    setBusyId(m.id);
    try {
      const res = await api.presetsGet(m.preset.kind, m.preset.slot);
      exportLayoutAsFile(res.preset);
      flash({
        kind: "ok",
        msg: t("layouts.exported", { name: m.name, kind: m.preset.kind, slot: m.preset.slot }),
      });
    } catch (e) {
      flash({ kind: "err", msg: (e as Error).message });
    } finally {
      setBusyId(null);
    }
  };

  // Import — file picker → parse + validate → slot prompt → save. Uses
  // a hidden <input type="file"> triggered by the visible Import button
  // (lets us style the button freely while keeping native file UX).
  const fileInputRef = useRef<HTMLInputElement>(null);
  const triggerImport = () => fileInputRef.current?.click();
  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so picking the same file twice still fires onChange.
    e.target.value = "";

    let text: string;
    try {
      text = await file.text();
    } catch (err) {
      flash({ kind: "err", msg: t("layouts.readFileError", { error: (err as Error).message }) });
      return;
    }

    const parsed = parseImportedLayout(text);
    if (!parsed.ok) {
      flash({ kind: "err", msg: parsed.error });
      return;
    }

    // Suggest the file's original slot if free, otherwise the next free
    // slot for that kind. Same overwrite-confirm pattern as onNewLayout
    // so the UX vocabulary is consistent across the two save paths.
    const sameKindSlots = (layouts ?? [])
      .filter(l => l.preset.kind === parsed.preset.kind)
      .map(l => l.preset.slot.toUpperCase());
    const originalSlot = parsed.preset.slot.toUpperCase();
    const suggested = sameKindSlots.includes(originalSlot)
      ? nextFreeSlot(sameKindSlots, parsed.preset.kind)
      : originalSlot;
    const input = window.prompt(
      t("layouts.importPrompt", { file: file.name, suggested }),
      suggested,
    );
    if (input == null) return; // cancelled
    const slot = input.trim().toUpperCase();
    if (!/^[A-Z]$/.test(slot)) {
      flash({ kind: "err", msg: t("layouts.invalidSlot", { input }) });
      return;
    }
    if (sameKindSlots.includes(slot)) {
      if (!confirm(t("layouts.slotExists", { slot }))) return;
    }

    try {
      await api.presetsSave(parsed.preset.kind, slot, parsed.preset.assignments);
      flash({
        kind: "ok",
        msg: t("layouts.imported", {
          file: file.name,
          type: parsed.preset.kind === "general" ? t("layouts.layout") : t("layouts.single"),
          slot,
          count: parsed.preset.assignments.length,
        }),
      });
      broadcastChanged();
    } catch (err) {
      flash({ kind: "err", msg: (err as Error).message });
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden px-3 pt-3">
      <div className="mb-2">
        <div className="text-lg font-semibold text-fg">{t("layouts.title")}</div>
      </div>

      <div className="mb-2">
        {/* Editing banner — visible only after the user clicks Edit on a card.
            Gives a one-click overwrite affordance for that specific slot
            (no slot-letter retyping, no overwrite-confirmation prompt). */}
        {editingLayout && (
          <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 dark:border-amber-500/40 dark:bg-amber-500/10">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-amber-900 dark:text-amber-200">
                {t("layouts.editingName", { name: editingLayout.name })}
              </span>
              <span className="text-[11px] text-amber-700">
                {t("layouts.editingHint")}
              </span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={onSaveEditedLayout}
                disabled={savingEdits || assignedCount === 0}
                className={[
                  "h-8 rounded-lg px-3 text-xs font-semibold shadow",
                  assignedCount === 0
                    ? "cursor-not-allowed bg-amber-200 text-amber-700"
                    : "bg-amber-600 text-white hover:bg-amber-700",
                  savingEdits ? "opacity-60 cursor-wait" : "",
                ].join(" ")}
                title={
                  assignedCount === 0
                    ? t("layouts.saveEmptyTitle")
                    : t("layouts.saveOverwriteTitle", { path: editingLayout.preset.path })
                }
              >
                {savingEdits ? t("layouts.saving") : t("layouts.saveChangesTo", { name: editingLayout.name })}
              </button>
              <button
                type="button"
                onClick={onCancelEdit}
                disabled={savingEdits}
                className="h-8 rounded-lg border border-amber-300 bg-raised px-3 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-500/40 dark:text-amber-200 dark:hover:bg-amber-500/15"
                title={t("layouts.cancelTitle")}
              >
                {t("layouts.cancel")}
              </button>
            </div>
          </div>
        )}

        {/* New Layout / Import — two equal-width buttons justified on one
            row, with the contextual status text on its OWN line below (it
            used to share the row and wrap into a cramped vertical stack). */}
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onNewLayout}
              disabled={savingNew || assignedCount === 0}
              className={[
                "h-9 flex-1 rounded-lg px-4 text-sm font-medium",
                assignedCount === 0
                  ? "cursor-not-allowed border border-line bg-raised text-muted"
                  : "border border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-primary/40 dark:bg-primary/10 dark:text-sky-300 dark:hover:bg-primary/20",
                savingNew ? "opacity-60 cursor-wait" : "",
              ].join(" ")}
              title={
                assignedCount === 0
                  ? t("layouts.newLayoutTitleDisabled")
                  : editingLayout
                  ? t("layouts.newLayoutTitleEditing", { name: editingLayout.name })
                  : t("layouts.newLayoutTitleReady", { count: monitorsWithAssignments.length, cells: assignedCount })
              }
            >
              {savingNew ? t("layouts.saving") : t("layouts.newLayout")}
            </button>
            {/* Import — hidden native file input triggered by the visible
                button. Accepts only .json to keep the picker focused. */}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={onFileChosen}
              className="hidden"
            />
            <button
              type="button"
              onClick={triggerImport}
              className="h-9 flex-1 rounded-lg px-4 text-sm font-medium border border-line bg-raised text-fg hover:bg-raised"
              title={t("layouts.importTitle")}
            >
              {t("layouts.import")}
            </button>
          </div>
          <span className="text-xs text-muted">
            {assignedCount === 0
              ? t("layouts.statusAssignToEnable")
              : monitorsWithAssignments.length === 1
              ? t("layouts.statusOneMonitor", { count: assignedCount, monitor: monitorIdToLabel(monitorsWithAssignments[0]) })
              : t("layouts.statusMultiMonitor", { count: assignedCount, monitors: monitorsWithAssignments.length, list: monitorsWithAssignments.map(monitorIdToLabel).join(", ") })}
          </span>
        </div>
      </div>

      <div className="mb-3 h-px w-full bg-line/80" />

      {toast && (
        <div className={[
          "mb-2 rounded-md px-3 py-1.5 text-xs",
          toast.kind === "ok"
            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30"
            : "bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30",
        ].join(" ")}>
          {toast.msg}
        </div>
      )}

      {/* Back plane — one bounded card framing the scrolling Layout cards
          (the App History pattern): the list reads as a closed, contained
          pane instead of loose cards that crop on scroll. Full-width so it
          aligns with the header buttons; flex-1 reaches the grid bottom.
          The old `scrollbarGutter: stable both-edges` reserved gutter space
          on BOTH sides, which is what made the cards look inset vs the
          buttons — gone now that the scroll lives inside the plane. */}
      <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-line bg-surface p-2">
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
          <div className="flex flex-col gap-3">
          {layouts === null && (
            <div className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">
              {t("layouts.loading")}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">
              {t("layouts.serverError", { error })}
            </div>
          )}

          {layouts && layouts.length === 0 && !error && (
            <div className="rounded-xl border border-dashed border-line bg-surface p-6 text-center text-sm text-muted">
              {t("layouts.emptyPre")} <span className="font-medium text-fg">{t("layouts.newLayout")}</span> {t("layouts.emptyPost")}
            </div>
          )}

          {localizedLayouts?.map((m) => (
            <LayoutCard
              key={m.id}
              model={m}
              busy={busyId === m.id}
              isEditing={editingLayoutId === m.id}
              isPreviewed={previewedLayoutId === m.id}
              onApply={() => onApply(m)}
              onDelete={() => onDelete(m)}
              onLoad={() => onLoad(m)}
              onExport={() => onExport(m)}
              onTogglePreview={() => setPreviewedLayout(previewedLayoutId === m.id ? null : m.id)}
            />
          ))}

          </div>
        </div>
      </div>
    </div>
  );
}

function LayoutCard({
  model, busy, isEditing, isPreviewed, onApply, onDelete, onLoad, onExport, onTogglePreview,
}: {
  model: LayoutCardModel;
  busy: boolean;
  isEditing: boolean;
  isPreviewed: boolean;
  onApply: () => void;
  onDelete: () => void;
  onLoad: () => void;
  onExport: () => void;
  onTogglePreview: () => void;
}) {
  const { t } = useTranslation();
  const updatedStr = useMemo(() => {
    const d = new Date(model.updatedISO);
    if (isNaN(d.getTime())) return t("layouts.updated", { date: model.updatedISO });
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return t("layouts.updated", { date });
  }, [model.updatedISO, t]);

  return (
    <div className={[
      "rounded-xl border bg-surface p-3",
      isEditing ? "border-amber-400 ring-1 ring-amber-300" : "border-line",
    ].join(" ")}>
      <div className="flex items-start gap-3">
        <DragDots />
        <div className="min-w-0 flex-1">
          {/* Title row — name on its own line (whitespace-nowrap), badges
              wrap below so a narrow pane + the 'editing' badge can't push
              the Layout name to a second line awkwardly. */}
          <div className="flex items-center gap-2">
            <div className="truncate text-base font-semibold text-fg" title={model.name}>
              {model.name}
            </div>
            {isEditing && (
              <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-amber-300 bg-amber-50 px-2 text-[10px] font-semibold text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200">
                {t("layouts.editingBadge")}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex h-5 items-center rounded-full border border-line bg-raised px-2 text-[10px] font-medium text-muted">
              {model.preset.kind}
            </span>
            <span className="inline-flex h-5 items-center rounded-full border border-sky-200 bg-sky-50 px-2 text-[10px] font-medium text-sky-700 dark:border-primary/40 dark:bg-primary/10 dark:text-sky-300">
              {t("layouts.slotBadge", { slot: model.preset.slot.toUpperCase() })}
            </span>
          </div>

          {/* Show / Hide content toggle — opens the LayoutPreviewOverlay
              over the central pane. Operator decision 2026-06-09:
              replaces the embedded mini-thumbnail with on-demand large
              previews that actually clearly show what each Layout
              contains. */}
          <div className="mt-2">
            <button
              type="button"
              onClick={onTogglePreview}
              className={[
                "inline-flex h-7 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition-colors",
                isPreviewed
                  ? "border-sky-300 bg-sky-100 text-sky-800 hover:bg-sky-200 dark:border-primary/50 dark:bg-primary/20 dark:text-sky-200 dark:hover:bg-primary/30"
                  : "border-line bg-raised text-fg hover:bg-raised",
              ].join(" ")}
              title={isPreviewed ? t("layouts.hideContentTitle") : t("layouts.showContentTitle")}
            >
              <span aria-hidden>{isPreviewed ? "✕" : "👁"}</span>
              <span>{isPreviewed ? t("layouts.hideContent") : t("layouts.showContent")}</span>
            </button>
          </div>

          <div className="mt-2 truncate text-xs text-muted" title={model.preset.path}>
            {model.preset.path}
          </div>

          <div className="mt-1 text-xs text-muted">{updatedStr}</div>

          {/* 2×2 button grid — 4 buttons in a single row crammed the
              text on narrow cards even at px-2 (operator screenshot
              showed "Del" instead of "Delete"). 2×2 gives each button
              ~50% width, plenty of room for full labels. Visual order:
              top row = common actions (Apply, Edit), bottom row =
              utility actions (Export, Delete). */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <PrimaryBtn onClick={onApply} disabled={busy}>
              {busy ? t("layouts.applying") : t("layouts.apply")}
            </PrimaryBtn>
            <GhostBtn
              className="border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-primary/40 dark:bg-primary/10 dark:text-sky-300 dark:hover:bg-primary/20"
              onClick={onLoad}
              disabled={busy}
              title={t("layouts.editTitle")}
            >
              {busy ? t("layouts.loadingShort") : t("layouts.edit")}
            </GhostBtn>
            <GhostBtn
              onClick={onExport}
              disabled={busy}
              title={t("layouts.exportTitle")}
            >
              {t("layouts.export")}
            </GhostBtn>
            <GhostBtn onClick={onDelete} disabled={busy}>
              {busy ? t("layouts.deleting") : t("layouts.delete")}
            </GhostBtn>
          </div>
        </div>
      </div>
    </div>
  );
}

function PrimaryBtn({
  children, className = "", onClick, disabled,
}: {
  children: React.ReactNode; className?: string; onClick?: () => void; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        // px-2 (was px-3) — narrower padding lets all 4 action buttons
        // (Apply / Edit / Export / Delete) fit in the card's tight
        // content area without clipping Delete off the right edge.
        "h-8 rounded-lg bg-primary px-2 text-xs font-medium text-on-primary shadow hover:bg-primary-hover",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function GhostBtn({
  children, className = "", onClick, disabled, title,
}: {
  children: React.ReactNode; className?: string; onClick?: () => void; disabled?: boolean; title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={[
        // px-2 (was px-3) — see PrimaryBtn comment.
        "h-8 rounded-lg border border-line bg-raised px-2 text-xs font-medium text-fg hover:bg-raised",
        "disabled:cursor-not-allowed",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function DragDots() {
  return (
    <div className="mt-2 flex w-3 flex-col items-center justify-start">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="mb-1 h-1 w-1 rounded bg-slate-300/80" />
      ))}
    </div>
  );
}
