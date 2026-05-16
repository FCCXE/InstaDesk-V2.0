import { useEffect, useMemo, useState } from "react";
import { addFavorite, seedEmoji, type Favorite } from "../../services/FavoritesService";
import { api, type BrowseEntry } from "../../services/api";

/** Tauri-aware dynamic loader that is safe in web preview (Vite). When
 *  available (Tauri build), prefer the OS-native picker. Otherwise the
 *  in-app server-driven file browser takes over. */
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

export default function AddFavoriteModal({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: (fav: Favorite) => void;
}) {
  const [tab, setTab] = useState<"url" | "app">("url");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [path, setPath] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /* In-app filesystem browser state (App tab only). */
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browsePath, setBrowsePath] = useState<string>("");
  const [browsePathDraft, setBrowsePathDraft] = useState<string>("");
  const [browseParent, setBrowseParent] = useState<string | null>(null);
  const [entries, setEntries] = useState<BrowseEntry[]>([]);
  const [browseErr, setBrowseErr] = useState<string | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);

  const isOpen = open;
  const canSave = useMemo(() => {
    if (!title.trim()) return false;
    if (tab === "url") return /^https?:\/\//i.test(url.trim());
    return path.trim().length > 0;
  }, [title, url, path, tab]);

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

  // When the in-app browser opens (App tab), start at the directory of
  // whatever the user has typed in the Path field, otherwise drive list.
  useEffect(() => {
    if (!browseOpen) return;
    if (entries.length > 0) return;
    const seed = path.trim();
    if (!seed) { navigateTo(""); return; }
    const looksLikeFile = /\.[a-z0-9]{1,5}$/i.test(seed);
    const startAt = looksLikeFile ? seed.replace(/[\\/][^\\/]*$/, "") : seed;
    navigateTo(startAt);
  }, [browseOpen]);

  const onPathDraftCommit = () => {
    const target = browsePathDraft.trim();
    if (!target) { navigateTo(""); return; }
    navigateTo(target);
  };

  // Close + reset the in-app browser when switching tabs (URL mode doesn't need it).
  useEffect(() => {
    if (tab === "url") setBrowseOpen(false);
  }, [tab]);

  if (!isOpen) return null;

  const reset = () => {
    setTitle("");
    setUrl("");
    setPath("");
    setErr(null);
    setTab("url");
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

  const onSave = async () => {
    try {
      setBusy(true);
      setErr(null);
      const t = title.trim();
      if (!t) {
        setErr("Please enter a title.");
        return;
      }

      if (tab === "url") {
        const u = url.trim();
        if (!/^https?:\/\//i.test(u)) {
          setErr("Enter a valid URL starting with http:// or https://");
          return;
        }
        const fav = addFavorite({ kind: "url", title: t, pathOrUrl: u, icon: seedEmoji(t) });
        window.dispatchEvent(new CustomEvent("insta:favorites-changed"));
        onAdded(fav);
        reset();
        onClose();
        return;
      } else {
        const p = path.trim();
        if (!p) {
          setErr("Enter an application path (e.g., C:\\Program Files\\App\\app.exe)");
          return;
        }
        if (!/\.(exe|lnk|bat|cmd)$/i.test(p)) {
          const proceed = confirm("Path does not end with .exe/.lnk/.bat/.cmd. Save anyway?");
          if (!proceed) return;
        }
        const fav = addFavorite({ kind: "app", title: t, pathOrUrl: p, icon: seedEmoji(t) });
        window.dispatchEvent(new CustomEvent("insta:favorites-changed"));
        onAdded(fav);
        reset();
        onClose();
        return;
      }
    } finally {
      setBusy(false);
    }
  };

  const onBrowse = async () => {
    setErr(null);
    const openFn = await loadTauriOpen();
    if (openFn) {
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
      const p = String(picked);
      setPath(p);
      if (!title.trim()) setTitle(inferTitle(p));
      return;
    }
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
    const fullPath = browsePath.endsWith("\\")
      ? browsePath + entry.name
      : browsePath + "\\" + entry.name;
    setPath(fullPath);
    if (!title.trim()) setTitle(inferTitle(fullPath));
    setBrowseOpen(false);
  };

  const onUp = () => {
    if (browseParent !== null) navigateTo(browseParent);
    else if (browsePath !== "") navigateTo("");
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3">
      <div className="w-[560px] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-base font-semibold text-slate-800">Add Favorite</div>
          <button
            className="h-7 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"
            onClick={onCancel}
          >
            Close
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-3 flex items-center gap-2">
          <button
            onClick={() => setTab("url")}
            className={[
              "h-8 rounded-full px-3 text-sm",
              tab === "url"
                ? "bg-sky-50 text-sky-700 ring-1 ring-sky-200"
                : "bg-slate-100 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200",
            ].join(" ")}
          >
            URL
          </button>
          <button
            onClick={() => setTab("app")}
            className={[
              "h-8 rounded-full px-3 text-sm",
              tab === "app"
                ? "bg-sky-50 text-sky-700 ring-1 ring-sky-200"
                : "bg-slate-100 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200",
            ].join(" ")}
          >
            App
          </button>
        </div>

        {/* Form fields */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="w-12 text-sm text-slate-700">Title</div>
            <input
              className="h-8 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-300"
              placeholder={tab === "url" ? "e.g., Research" : "e.g., Notepad"}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {tab === "url" ? (
            <div className="flex items-center gap-2">
              <div className="w-12 text-sm text-slate-700">URL</div>
              <input
                className="h-8 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-300"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
          ) : (
            <>
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
            </>
          )}

          {err && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
              {err}
            </div>
          )}
        </div>

        {/* Footer */}
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
