// C:\FcXe Studios\Instadesk\instadesk-tauri\ui\src\components\common\BrowseAppModal.tsx
import React, { useState, useMemo } from "react";
import { addHistory, type AppHistoryItem } from "../../services/AppsHistoryService";

/** Tauri-aware dynamic loader (safe in web preview). */
type OpenDialogFn = (opts?: any) => Promise<string | string[] | null>;
async function loadTauriOpen(): Promise<OpenDialogFn | null> {
  const isTauri = typeof window !== "undefined" && (window as any).__TAURI__ != null;
  if (!isTauri) return null;
  try {
    const base = "@tauri-apps/api";
    // @vite-ignore
    const mod: any = await import(/* @vite-ignore */ (base + "/dialog"));
    return (mod?.open ?? null) as OpenDialogFn | null;
  } catch {
    const globalOpen = (window as any).__TAURI__?.dialog?.open;
    return typeof globalOpen === "function" ? (globalOpen as OpenDialogFn) : null;
  }
}

export default function BrowseAppModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (item: AppHistoryItem) => void;
}) {
  const [title, setTitle] = useState("");
  const [path, setPath] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSave = useMemo(() => title.trim().length > 0 && path.trim().length > 0, [title, path]);

  if (!open) return null;

  const reset = () => {
    setTitle("");
    setPath("");
    setErr(null);
  };

  const onCancel = () => {
    reset();
    onClose();
  };

  const onBrowse = async () => {
    const openFn = await loadTauriOpen();
    if (!openFn) {
      setErr("Native picker unavailable in web preview. Type the path manually.");
      return;
    }
    const picked = await openFn({
      title: "Select an application",
      multiple: false,
      directory: false,
      filters: [
        { name: "Executables", extensions: ["exe", "lnk", "bat", "cmd"] },
        { name: "All files", extensions: ["*"] },
      ],
    });
    if (!picked || Array.isArray(picked)) return;
    setPath(String(picked));
    setErr(null);
    if (!title.trim()) {
      const base = String(picked).replace(/\\/g, "/").split("/").pop() || "Custom App";
      const inferred = base.replace(/\.(exe|lnk|bat|cmd)$/i, "").trim() || "Custom App";
      setTitle(inferred);
    }
  };

  const onSave = async () => {
    setErr(null);
    const t = title.trim();
    const p = path.trim();
    if (!t || !p) return;
    if (!/\.(exe|lnk|bat|cmd)$/i.test(p)) {
      const proceed = confirm("Path does not end with .exe/.lnk/.bat/.cmd. Save anyway?");
      if (!proceed) return;
    }
    try {
      setBusy(true);
      const item = addHistory({ title: t, path: p });
      reset();
      onSaved(item);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3">
      <div className="w-[520px] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-base font-semibold text-slate-800">Add Application</div>
          <button
            className="h-7 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"
            onClick={onCancel}
          >
            Close
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="text-sm text-slate-700">Title</div>
            <input
              className="h-8 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-300"
              placeholder="e.g., Notepad"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="text-sm text-slate-700">Path</div>
            <input
              className="h-8 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-300"
              placeholder="C:\Program Files\App\app.exe"
              value={path}
              onChange={(e) => setPath(e.target.value)}
            />
            <button
              className="h-8 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"
              onClick={onBrowse}
              type="button"
            >
              Browse…
            </button>
          </div>

          <div className="text-[11px] text-slate-500">
            Web preview: type a path manually. Tauri build: Browse opens the native picker.
          </div>

          {err && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
              {err}
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            className="h-8 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="h-8 rounded-md bg-sky-600 px-3 text-xs font-medium text-white shadow hover:bg-sky-700 disabled:cursor-not-allowed"
            onClick={onSave}
            disabled={!canSave || busy}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
