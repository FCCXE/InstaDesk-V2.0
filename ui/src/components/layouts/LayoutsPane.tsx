import React, { useCallback, useEffect, useMemo, useState } from "react";
import EditLayoutDrawer from "./EditLayoutDrawer";
import type { EditLayoutModel, MonitorId } from "./EditLayoutDrawer";
import { api, type PresetListItem } from "../../services/api";
import { useAppState, GRID_COLS, GRID_ROWS } from "../../state/AppState";
import { buildSaveAssignments, nextFreeSlot } from "../../services/layoutBuilder";

/**
 * LayoutsPane
 * - Cards reflect real saved presets from the FastAPI server.
 * - Apply  → POST /presets/run
 * - Delete → DELETE /presets/delete
 * - Edit / Set Preset / + New Layout: deferred (kept disabled with tooltips).
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
  const { assignments, currentMonitorId } = useAppState();
  const monitorIndex = useMemo(() => {
    const n = parseInt((currentMonitorId || "").replace(/^m/, ""), 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }, [currentMonitorId]);

  const [layouts, setLayouts] = useState<LayoutCardModel[] | null>(null); // null = loading
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingNew, setSavingNew] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<LayoutCardModel | null>(null);

  // Count assigned cells, used for enabling/disabling "+ New Layout".
  const assignedCount = useMemo(
    () => Object.values(assignments).filter(Boolean).length,
    [assignments]
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

  function openEdit(l: LayoutCardModel) {
    setEditing(l);
    setDrawerOpen(true);
  }
  function closeDrawer() {
    setDrawerOpen(false);
    setEditing(null);
  }
  function saveEdit(_updated: EditLayoutModel) {
    // Edit drawer is currently visuals-only; deferring real save to a later step.
    flash({ kind: "ok", msg: "Edit saved locally only — server-side rename coming soon." });
    closeDrawer();
  }

  const onApply = async (m: LayoutCardModel) => {
    setBusyId(m.id);
    try {
      const res = await api.presetsRun(m.preset.kind, m.preset.slot);
      const failures = res.results.filter(r => r.exitCode !== 0);
      if (failures.length === 0) {
        flash({ kind: "ok", msg: `Applied "${m.name}" • ${res.results.length} window${res.results.length === 1 ? "" : "s"}` });
      } else {
        flash({ kind: "err", msg: `Applied with ${failures.length}/${res.results.length} failures: ${(failures[0].stderr || failures[0].stdout).slice(0, 160)}` });
      }
    } catch (e) {
      flash({ kind: "err", msg: (e as Error).message });
    } finally {
      setBusyId(null);
    }
  };

  const onNewLayout = async () => {
    if (assignedCount === 0) {
      flash({ kind: "err", msg: "Assign apps to cells first (Apps tab → pick app → Assign to Selection)." });
      return;
    }
    const built = buildSaveAssignments(assignments as Record<string, string | null>, monitorIndex, GRID_COLS, GRID_ROWS);
    if (built.errors.length > 0) {
      flash({ kind: "err", msg: built.errors[0] });
      return;
    }
    if (built.assignments.length === 0) {
      flash({ kind: "err", msg: "Nothing to save after target resolution." });
      return;
    }
    const takenSlots = (layouts ?? []).filter(l => l.preset.kind === "general").map(l => l.preset.slot);
    const suggested = nextFreeSlot(takenSlots, "general");
    const input = window.prompt(`Save layout to slot (A–Z). Suggested: ${suggested}`, suggested);
    if (input == null) return; // user cancelled
    const slot = input.trim().toUpperCase();
    if (!/^[A-Z]$/.test(slot)) {
      flash({ kind: "err", msg: `Invalid slot "${input}". Use a single letter A–Z.` });
      return;
    }
    if (takenSlots.map(s => s.toUpperCase()).includes(slot)) {
      if (!confirm(`Slot ${slot} already exists. Overwrite?`)) return;
    }
    setSavingNew(true);
    try {
      await api.presetsSave("general", slot, built.assignments);
      const summary = built.assignments
        .map(a => `${a.title ?? "?"}@M${a.monitor}/${a.grid}`)
        .join(" + ");
      flash({ kind: "ok", msg: `Saved Layout ${slot}: ${summary}` });
      window.dispatchEvent(new CustomEvent("insta:presets-changed"));
    } catch (e) {
      flash({ kind: "err", msg: (e as Error).message });
    } finally {
      setSavingNew(false);
    }
  };

  const onDelete = async (m: LayoutCardModel) => {
    if (!confirm(`Delete "${m.name}"? This removes ${m.preset.path}.`)) return;
    setBusyId(m.id);
    try {
      await api.presetsDelete(m.preset.kind, m.preset.slot);
      flash({ kind: "ok", msg: `Deleted "${m.name}"` });
      broadcastChanged();
    } catch (e) {
      flash({ kind: "err", msg: (e as Error).message });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-lg font-semibold text-slate-800">Layouts</div>
        <button
          type="button"
          onClick={refresh}
          className="h-7 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"
          title="GET /presets/list"
        >
          ↻ Refresh
        </button>
      </div>

      <div className="mb-2">
        <div className="flex items-center gap-3">
          <ScopePill active minW={148}>All Monitors</ScopePill>
          <ScopePill minW={168}>Current Monitor ▾</ScopePill>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={onNewLayout}
            disabled={savingNew || assignedCount === 0}
            className={[
              "h-9 min-w-[160px] rounded-full px-4 text-sm font-medium",
              assignedCount === 0
                ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                : "border border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100",
              savingNew ? "opacity-60 cursor-wait" : "",
            ].join(" ")}
            title={
              assignedCount === 0
                ? "Assign apps to grid cells first (Apps tab)"
                : `Save current grid as preset (${assignedCount} cells assigned, monitor ${monitorIndex})`
            }
          >
            {savingNew ? "Saving…" : "+ New Layout"}
          </button>
          <span className="text-xs text-slate-500">
            {assignedCount === 0
              ? "Assign apps to enable"
              : `${assignedCount} cell${assignedCount === 1 ? "" : "s"} on Monitor ${monitorIndex}`}
          </span>
        </div>
      </div>

      <div className="mb-3 h-px w-full bg-slate-200/80" />

      {toast && (
        <div className={[
          "mb-2 rounded-md px-3 py-1.5 text-xs",
          toast.kind === "ok"
            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
            : "bg-red-50 text-red-700 ring-1 ring-red-200",
        ].join(" ")}>
          {toast.msg}
        </div>
      )}

      <div
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-3"
        style={{ scrollbarGutter: "stable both-edges" as any }}
      >
        <div className="flex flex-col gap-3">
          {layouts === null && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
              Loading saved layouts…
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              Could not reach server: {error}
            </div>
          )}

          {layouts && layouts.length === 0 && !error && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              No saved layouts yet. Use the temporary <span className="font-medium text-slate-700">💾 Save Layout A</span> button at the bottom (or the new-layout flow coming in step 3).
            </div>
          )}

          {layouts?.map((m) => (
            <LayoutCard
              key={m.id}
              model={m}
              busy={busyId === m.id}
              onApply={() => onApply(m)}
              onDelete={() => onDelete(m)}
              onEdit={() => openEdit(m)}
            />
          ))}

          <div className="h-10" />
        </div>
      </div>

      <EditLayoutDrawer
        open={drawerOpen}
        model={editing ? { id: editing.id, name: editing.name, monitors: editing.monitors, notes: editing.notes } : null}
        onSave={saveEdit}
        onClose={closeDrawer}
      />
    </div>
  );
}

function LayoutCard({
  model, busy, onApply, onDelete, onEdit,
}: {
  model: LayoutCardModel;
  busy: boolean;
  onApply: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const updatedStr = useMemo(() => {
    const d = new Date(model.updatedISO);
    if (isNaN(d.getTime())) return `Updated: ${model.updatedISO}`;
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `Updated: ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, [model.updatedISO]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
      <div className="flex items-start gap-3">
        <DragDots />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="text-base font-semibold text-slate-800">{model.name}</div>
            <span className="inline-flex h-5 items-center rounded-full border border-slate-200 bg-slate-50 px-2 text-[10px] font-medium text-slate-600">
              {model.preset.kind}
            </span>
            <span className="inline-flex h-5 items-center rounded-full border border-sky-200 bg-sky-50 px-2 text-[10px] font-medium text-sky-700">
              slot {model.preset.slot.toUpperCase()}
            </span>
          </div>

          <div className="mt-2 truncate text-xs text-slate-500" title={model.preset.path}>
            {model.preset.path}
          </div>

          <div className="mt-1 text-xs text-slate-500">{updatedStr}</div>

          <div className="mt-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <PrimaryBtn className="min-w-[108px]" onClick={onApply} disabled={busy}>
                {busy ? "Applying…" : "Apply"}
              </PrimaryBtn>
            </div>
            <div className="flex items-center gap-2">
              <GhostBtn
                className="min-w-[116px] cursor-not-allowed opacity-60"
                title="Coming soon — promotes this layout to the Quick Presets dropdown."
              >
                Set Preset
              </GhostBtn>
              <GhostBtn className="min-w-[72px] px-2" onClick={onEdit} title="Edit (visuals-only for now)">
                Edit
              </GhostBtn>
            </div>
            <div className="flex items-center gap-2">
              <GhostBtn className="min-w-[56px] cursor-not-allowed opacity-60" title="Coming soon">…</GhostBtn>
              <GhostBtn className="min-w-[104px]" onClick={onDelete} disabled={busy}>
                {busy ? "Deleting…" : "Delete"}
              </GhostBtn>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScopePill({
  children,
  active,
  minW = 140,
}: {
  children: React.ReactNode;
  active?: boolean;
  minW?: number;
}) {
  return (
    <button
      className={[
        "h-9 rounded-full px-4 text-sm",
        `min-w-[${minW}px]`,
        active ? "bg-sky-50 text-sky-700 ring-1 ring-sky-200" : "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
      ].join(" ")}
      disabled
      aria-disabled
    >
      {children}
    </button>
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
        "h-8 rounded-md bg-sky-600 px-3 text-xs font-medium text-white shadow hover:bg-sky-700",
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
        "h-8 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100",
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
