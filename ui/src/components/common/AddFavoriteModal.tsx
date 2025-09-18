import React, { useMemo, useState } from "react";
import { addFavorite, seedEmoji, type Favorite } from "../../services/FavoritesService";

/** Tauri-aware dynamic loader that is safe in web preview (Vite). */
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

  const isOpen = open;
  const canSave = useMemo(() => {
    if (!title.trim()) return false;
    if (tab === "url") return /^https?:\/\//i.test(url.trim());
    return path.trim().length > 0;
  }, [title, url, path, tab]);

  if (!isOpen) return null;

  const reset = () => {
    setTitle("");
    setUrl("");
    setPath("");
    setErr(null);
    setTab("url");
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
    const open = await loadTauriOpen();
    if (!open) {
      setErr("Native picker unavailable in web preview. Type the path manually.");
      return;
    }
    const picked = await open({
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
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3">
      <div className="w-[520px] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
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
            <div className="text-sm text-slate-700">Title</div>
            <input
              className="h-8 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-300"
              placeholder={tab === "url" ? "e.g., Research" : "e.g., Notepad"}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {tab === "url" ? (
            <div className="flex items-center gap-2">
              <div className="text-sm text-slate-700">URL</div>
              <input
                className="h-8 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-300"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
          ) : (
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
