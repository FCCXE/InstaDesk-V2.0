// C:\FcXe Studios\Instadesk\instadesk-tauri\ui\src\components\common\BrowseAppModal.tsx
import { useEffect, useMemo, useState } from "react";
import { addHistory, type AppHistoryItem } from "../../services/AppsHistoryService";
import { api, type BrowseEntry } from "../../services/api";

/** Tauri-aware dynamic loader (safe in web preview). When InstaDesk runs as
 *  a Tauri desktop app, prefer the OS-native picker. In web/dev the loader
 *  returns null and we fall back to the in-app server-driven browser. */
type OpenDialogFn = (opts?: any) => Promise<string | string[] | null>;
async function loadTauriOpen(): Promise<OpenDialogFn | null> {
  const isTauri = typeof window !== "undefined" && (window as any).__TAURI__ != null;
  if (!isTauri) return null;
  try {
    const base = "@tauri-apps/api";
    const mod: any = await import(/* @vite-ignore */ (base + "/dialog"));
    return (mod?.open ?? null) as OpenDialogFn | null;
  } catch {
    const globalOpen = (window as any).__TAURI__?.dialog?.open;
    return typeof globalOpen === "function" ? (globalOpen as OpenDialogFn) : null;
  }
}

function inferTitle(p: string): string {
  const base = p.replace(/\\/g, "/").split("/").pop() || "Custom App";
  return base.replace(/\.(exe|lnk|bat|cmd)$/i, "").trim() || "Custom App";
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

  /* In-app filesystem browser state (used when Tauri picker unavailable). */
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browsePath, setBrowsePath] = useState<string>("");      // "" = drive list
  const [browsePathDraft, setBrowsePathDraft] = useState<string>("");  // editable input; commits on Enter / Go
  const [browseParent, setBrowseParent] = useState<string | null>(null);
  const [entries, setEntries] = useState<BrowseEntry[]>([]);
  const [browseErr, setBrowseErr] = useState<string | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);

  const canSave = useMemo(() => title.trim().length > 0 && path.trim().length > 0, [title, path]);

  const navigateTo = async (target: string) => {
    setBrowseErr(null);
    setBrowseLoading(true);
    try {
      const res = await api.browse(target);
      setBrowsePath(res.path);
      setBrowsePathDraft(res.path);
      setBrowseParent(res.parent);
      setEntries(res.entries);
    } catch (e) {
      setBrowseErr((e as Error).message);
    } finally {
      setBrowseLoading(false);
    }
  };

  // When the in-app browser opens, start at the directory of whatever the
  // user has typed in the main Path field (if any), otherwise at the drive
  // list. Lets the user type "C:\ProgramData\Microsoft\Windows\Start Menu"
  // in Path and click Browse to drill in from there.
  useEffect(() => {
    if (!browseOpen) return;
    if (entries.length > 0) return;
    const seed = path.trim();
    if (!seed) { navigateTo(""); return; }
    // If the typed path includes a filename, strip to the parent directory.
    const looksLikeFile = /\.[a-z0-9]{1,5}$/i.test(seed);
    const startAt = looksLikeFile ? seed.replace(/[\\/][^\\/]*$/, "") : seed;
    navigateTo(startAt);
  }, [browseOpen]);

  const onPathDraftCommit = () => {
    const target = browsePathDraft.trim();
    if (!target) { navigateTo(""); return; }
    navigateTo(target);
  };

  if (!open) return null;

  const reset = () => {
    setTitle("");
    setPath("");
    setErr(null);
    setBrowseOpen(false);
    setEntries([]);
    setBrowsePath("");
    setBrowsePathDraft("");
    setBrowseParent(null);
    setBrowseErr(null);
  };

  const onCancel = () => {
    reset();
    onClose();
  };

  const onBrowse = async () => {
    setErr(null);
    const openFn = await loadTauriOpen();
    if (openFn) {
      // Tauri build — defer to native picker.
      const picked = await openFn({
        title: "Select an application",
        multiple: false,
        directory: false,
        filters: [
          { name: "Executables", extensions: ["exe", "bat", "cmd"] },
          { name: "All files", extensions: ["*"] },
        ],
      });
      if (!picked || Array.isArray(picked)) return;
      const p = String(picked);
      setPath(p);
      if (!title.trim()) setTitle(inferTitle(p));
      return;
    }
    // Web/dev — open the in-app browser.
    setBrowseOpen(true);
  };

  const onPickEntry = (entry: BrowseEntry) => {
    if (entry.isDir) {
      const next = browsePath
        ? (browsePath.endsWith("\\") ? browsePath + entry.name : browsePath + "\\" + entry.name)
        : entry.name;
      navigateTo(next);
      return;
    }
    // File: select.
    const fullPath = browsePath.endsWith("\\")
      ? browsePath + entry.name
      : browsePath + "\\" + entry.name;
    setPath(fullPath);
    if (!title.trim()) setTitle(inferTitle(fullPath));
    setBrowseOpen(false);
  };

  const onUp = () => {
    if (browseParent !== null) navigateTo(browseParent);
    else if (browsePath !== "") navigateTo("");   // drop back to drive list
  };

  const onSave = async () => {
    setErr(null);
    const t = title.trim();
    const p = path.trim();
    if (!t || !p) return;
    // Reject shortcut files. .lnk targets resolve through the Windows shell
    // (COM IShellLink), which Process.Start in the agent does NOT do — the
    // shortcut launches in a way that ignores our --args and produces
    // unpredictable results (e.g., the Quick Launch File Explorer.lnk opens
    // a window the agent can't tile). Force the user to pick the actual exe.
    if (/\.lnk$/i.test(p)) {
      setErr(
        "Shortcut files (.lnk) aren't supported — pick the underlying .exe instead. " +
        "For File Explorer, use C:\\Windows\\explorer.exe (or just delete this Custom entry to fall back to the built-in catalog)."
      );
      return;
    }
    if (!/\.(exe|bat|cmd)$/i.test(p)) {
      const proceed = confirm("Path does not end with .exe/.bat/.cmd. Save anyway?");
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
      <div className="w-[560px] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
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
            <div className="w-12 text-sm text-slate-700">Title</div>
            <input
              className="h-8 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-300"
              placeholder="e.g., Notepad"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="w-12 text-sm text-slate-700">Path</div>
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
            Browse opens an in-app folder picker (server-routed). Tauri build: native OS picker is used automatically.
          </div>

          {/* In-app file browser */}
          {browseOpen && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
              <div className="mb-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={onUp}
                  disabled={browsePath === ""}
                  className="h-7 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  title={browseParent !== null ? `Up to ${browseParent}` : browsePath !== "" ? "Up to drive list" : "Already at top"}
                >
                  ↑ Up
                </button>
                <input
                  type="text"
                  className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300"
                  placeholder="<drives> — or type a path and press Enter"
                  value={browsePathDraft}
                  onChange={(e) => setBrowsePathDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onPathDraftCommit(); } }}
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={onPathDraftCommit}
                  disabled={browsePathDraft === browsePath}
                  className="h-7 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Navigate to the path you typed"
                >
                  Go
                </button>
                <button
                  type="button"
                  onClick={() => setBrowseOpen(false)}
                  className="h-7 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  Hide
                </button>
              </div>

              {/* Quick jumps to common app-launcher locations */}
              <div className="mb-2 flex flex-wrap items-center gap-1">
                <span className="text-[10px] uppercase tracking-wide text-slate-400 mr-1">Jump:</span>
                {[
                  { label: "Start Menu (all users)", path: "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs" },
                  { label: "Start Menu (user)",      path: "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs" },
                  { label: "Program Files",           path: "C:\\Program Files" },
                  { label: "Program Files (x86)",     path: "C:\\Program Files (x86)" },
                  { label: "LocalAppData\\Programs",  path: "%LOCALAPPDATA%\\Programs" },
                ].map(j => (
                  <button
                    key={j.label}
                    type="button"
                    onClick={() => navigateTo(j.path)}
                    className="h-6 rounded-full border border-slate-200 bg-white px-2 text-[10px] text-slate-600 hover:bg-sky-50 hover:text-sky-700 hover:border-sky-200"
                    title={j.path}
                  >
                    {j.label}
                  </button>
                ))}
              </div>

              {browseErr && (
                <div className="mb-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
                  {browseErr}
                </div>
              )}

              <div className="max-h-[260px] overflow-y-auto rounded-md border border-slate-200 bg-white">
                {browseLoading && (
                  <div className="p-3 text-center text-xs text-slate-500">Loading…</div>
                )}
                {!browseLoading && entries.length === 0 && !browseErr && (
                  <div className="p-3 text-center text-xs text-slate-500">(empty)</div>
                )}
                {!browseLoading && entries.map((e) => (
                  <button
                    key={e.name}
                    type="button"
                    onClick={() => onPickEntry(e)}
                    className={[
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs",
                      e.isDir ? "text-slate-800 hover:bg-sky-50" :
                      e.isExe ? "text-emerald-700 hover:bg-emerald-50" :
                      "text-slate-500 hover:bg-slate-50",
                    ].join(" ")}
                    title={e.isDir ? "Open folder" : "Pick this file"}
                  >
                    <span className="w-4 text-center">
                      {e.isDir ? "📁" : e.isExe ? "⚙️" : "📄"}
                    </span>
                    <span className="truncate">{e.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

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
            className="h-8 rounded-md bg-sky-600 px-3 text-xs font-medium text-white shadow hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
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
