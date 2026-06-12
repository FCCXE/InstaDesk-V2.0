import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { addFavorite, seedEmoji, type Favorite } from "../../services/FavoritesService";
import { api, inTauri, type BrowseEntry } from "../../services/api";

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
  const { t } = useTranslation();
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
      const ttl = title.trim();
      if (!ttl) {
        setErr(t("addFavorite.errTitle"));
        return;
      }

      if (tab === "url") {
        const u = url.trim();
        if (!/^https?:\/\//i.test(u)) {
          setErr(t("addFavorite.errUrl"));
          return;
        }
        const fav = addFavorite({ kind: "url", title: ttl, pathOrUrl: u, icon: seedEmoji(ttl) });
        window.dispatchEvent(new CustomEvent("insta:favorites-changed"));
        onAdded(fav);
        reset();
        onClose();
        return;
      } else {
        const p = path.trim();
        if (!p) {
          setErr(t("addFavorite.errPath"));
          return;
        }
        if (!/\.(exe|lnk|bat|cmd)$/i.test(p)) {
          const proceed = confirm(t("addFavorite.confirmExt"));
          if (!proceed) return;
        }
        const fav = addFavorite({ kind: "app", title: ttl, pathOrUrl: p, icon: seedEmoji(ttl) });
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
    if (inTauri()) {
      // Desktop — native OS file picker (rfd via pick_exe).
      const picked = await api.pickExe(t("browseApp.pickerTitle"), ["exe", "lnk", "bat", "cmd"]);
      if (!picked) return; // cancelled
      setPath(picked);
      if (!title.trim()) setTitle(inferTitle(picked));
      return;
    }
    // Web/dev — in-app server-driven file browser.
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
      <div className="w-[560px] max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-surface p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-base font-semibold text-fg">{t("addFavorite.title")}</div>
          <button
            className="h-7 rounded-md border border-line bg-raised px-3 text-xs font-medium text-fg hover:bg-raised"
            onClick={onCancel}
          >
            {t("browseApp.close")}
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-3 flex items-center gap-2">
          <button
            onClick={() => setTab("url")}
            className={[
              "h-8 rounded-full px-3 text-sm",
              tab === "url"
                ? "bg-sky-50 text-sky-700 ring-1 ring-sky-200 dark:bg-primary/15 dark:text-sky-300 dark:ring-primary/40"
                : "bg-raised text-fg ring-1 ring-slate-200 hover:bg-line",
            ].join(" ")}
          >
            URL
          </button>
          <button
            onClick={() => setTab("app")}
            className={[
              "h-8 rounded-full px-3 text-sm",
              tab === "app"
                ? "bg-sky-50 text-sky-700 ring-1 ring-sky-200 dark:bg-primary/15 dark:text-sky-300 dark:ring-primary/40"
                : "bg-raised text-fg ring-1 ring-slate-200 hover:bg-line",
            ].join(" ")}
          >
            App
          </button>
        </div>

        {/* Form fields */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="w-12 text-sm text-fg">{t("browseApp.fieldTitle")}</div>
            <input
              className="h-8 w-full rounded-md border border-line bg-raised px-3 text-xs text-fg focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder={tab === "url" ? t("urls.tabTitlePlaceholder") : t("browseApp.titlePlaceholder")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {tab === "url" ? (
            <div className="flex items-center gap-2">
              <div className="w-12 text-sm text-fg">URL</div>
              <input
                className="h-8 w-full rounded-md border border-line bg-raised px-3 text-xs text-fg focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <div className="w-12 text-sm text-fg">{t("browseApp.fieldPath")}</div>
                <input
                  className="h-8 w-full rounded-md border border-line bg-raised px-3 text-xs text-fg focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="C:\Program Files\App\app.exe"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                />
                <button
                  className="h-8 rounded-md border border-line bg-raised px-3 text-xs font-medium text-fg hover:bg-raised"
                  onClick={onBrowse}
                  type="button"
                >
                  {t("browseApp.browse")}
                </button>
              </div>

              <div className="text-[11px] text-muted">
                {t("browseApp.browseHint")}
              </div>

              {browseOpen && (
                <div className="rounded-lg border border-line bg-raised p-2">
                  <div className="mb-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onUp}
                      disabled={browsePath === ""}
                      className="h-7 rounded-md border border-line bg-raised px-2 text-xs font-medium text-fg hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"
                      title={browseParent !== null ? t("browseApp.upTo", { path: browseParent }) : browsePath !== "" ? t("browseApp.upToDrives") : t("browseApp.alreadyTop")}
                    >
                      {t("browseApp.up")}
                    </button>
                    <input
                      type="text"
                      className="min-w-0 flex-1 rounded-md border border-line bg-raised px-2 py-1 text-xs text-fg focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder={t("browseApp.pathInputPlaceholder")}
                      value={browsePathDraft}
                      onChange={(e) => setBrowsePathDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onPathDraftCommit(); } }}
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      onClick={onPathDraftCommit}
                      disabled={browsePathDraft === browsePath}
                      className="h-7 rounded-md border border-line bg-raised px-2 text-xs font-medium text-fg hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"
                      title={t("browseApp.goTitle")}
                    >
                      {t("browseApp.go")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setBrowseOpen(false)}
                      className="h-7 rounded-md border border-line bg-raised px-2 text-xs font-medium text-fg hover:bg-raised"
                    >
                      {t("browseApp.hide")}
                    </button>
                  </div>

                  {/* Quick jumps to common app-launcher locations */}
                  <div className="mb-2 flex flex-wrap items-center gap-1">
                    <span className="text-[10px] uppercase tracking-wide text-muted mr-1">{t("browseApp.jump")}</span>
                    {[
                      { label: t("browseApp.jumpStartAll"), path: "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs" },
                      { label: t("browseApp.jumpStartUser"),      path: "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs" },
                      { label: t("browseApp.jumpProgramFiles"),           path: "C:\\Program Files" },
                      { label: t("browseApp.jumpProgramFilesX86"),     path: "C:\\Program Files (x86)" },
                      { label: t("browseApp.jumpLocalAppData"),  path: "%LOCALAPPDATA%\\Programs" },
                    ].map(j => (
                      <button
                        key={j.label}
                        type="button"
                        onClick={() => navigateTo(j.path)}
                        className="h-6 rounded-full border border-line bg-raised px-2 text-[10px] text-muted hover:bg-sky-50 hover:text-sky-700 hover:border-sky-200"
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

                  <div className="max-h-[260px] overflow-y-auto rounded-md border border-line bg-raised">
                    {browseLoading && (
                      <div className="p-3 text-center text-xs text-muted">{t("browseApp.loading")}</div>
                    )}
                    {!browseLoading && entries.length === 0 && !browseErr && (
                      <div className="p-3 text-center text-xs text-muted">{t("browseApp.empty")}</div>
                    )}
                    {!browseLoading && entries.map((e) => (
                      <button
                        key={e.name}
                        type="button"
                        onClick={() => onPickEntry(e)}
                        className={[
                          "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs",
                          e.isDir ? "text-fg hover:bg-sky-50" :
                          e.isExe ? "text-emerald-700 hover:bg-emerald-50" :
                          "text-muted hover:bg-raised",
                        ].join(" ")}
                        title={e.isDir ? t("browseApp.openFolder") : t("addFavorite.pickFile")}
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
            <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              {err}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            className="h-8 rounded-md border border-line bg-raised px-3 text-xs font-medium text-fg hover:bg-raised"
            onClick={onCancel}
            disabled={busy}
          >
            {t("browseApp.cancel")}
          </button>
          <button
            className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-on-primary shadow hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onSave}
            disabled={!canSave || busy}
          >
            {t("browseApp.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
