// C:\FcXe Studios\Instadesk\instadesk-tauri\ui\src\components\common\BrowseAppModal.tsx
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
        title: t("browseApp.pickerTitle"),
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
    const ttl = title.trim();
    const p = path.trim();
    if (!ttl || !p) return;

    // Reject shortcut files. .lnk targets resolve through the Windows shell
    // (COM IShellLink) which Process.Start doesn't do — the shortcut launches
    // in a way that ignores our --args and produces a window the agent can't
    // tile (e.g. the Quick Launch File Explorer.lnk).
    if (/\.lnk$/i.test(p)) {
      setErr(t("browseApp.errLnk"));
      return;
    }

    // Detect folders vs files. Heuristic: last path segment without an
    // extension OR a trailing slash → folder. Misidentifies the rare
    // extensionless exe (engine_next etc.) as a folder, which is a much
    // safer error than the inverse.
    const lastSeg = p.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "";
    const hasExtension = /\.[^.\\/]+$/.test(lastSeg);
    const isFolder = !hasExtension || /[\\/]$/.test(p);

    // Reject folders. Folders can't be launched directly — Process.Start on
    // a directory fails instantly. The user's intent is almost always 'open
    // this folder in File Explorer'; point them at the correct workflow.
    if (isFolder) {
      setErr(t("browseApp.errFolder", { name: lastSeg, path: p }));
      return;
    }

    // Reject non-executable files. They launch via Windows file association
    // (shell opens with the default app), which is unreliable for tiling —
    // the agent can't track which window belongs to which launch, and the
    // file might open in a single-instance app that consolidates into tabs.
    // Suggest the correct pattern: catalog app + per-cell args.
    if (!/\.(exe|bat|cmd)$/i.test(p)) {
      const ext = (lastSeg.match(/\.[^.]+$/) || [""])[0].toLowerCase();
      const textLike = /^\.(txt|md|json|log|csv|yml|yaml|ini|conf|cfg|xml|html|htm|js|ts|py|sh|sql|rs|go|java|c|cpp|h|hpp)$/.test(ext);
      const appHint = textLike
        ? t("browseApp.appHintText")
        : t("browseApp.appHintOther");
      setErr(t("browseApp.errNotExe", { name: lastSeg, hint: appHint, path: p }));
      return;
    }

    // .exe / .bat / .cmd accepted.
    try {
      setBusy(true);
      const item = addHistory({ title: ttl, path: p });
      reset();
      onSaved(item);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3">
      <div className="w-[560px] max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-surface p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-base font-semibold text-fg">{t("browseApp.title")}</div>
          <button
            className="h-7 rounded-md border border-line bg-raised px-3 text-xs font-medium text-fg hover:bg-raised"
            onClick={onCancel}
          >
            {t("browseApp.close")}
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="w-12 text-sm text-fg">{t("browseApp.fieldTitle")}</div>
            <input
              className="h-8 w-full rounded-md border border-line bg-raised px-3 text-xs text-fg focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder={t("browseApp.titlePlaceholder")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

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

          {/* In-app file browser */}
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
                {!browseLoading && entries.map((e) => {
                  // Files that aren't .exe/.bat/.cmd will be rejected at Save
                  // time. Mark them inline here so the user sees the
                  // 'pick the .exe instead' guidance before clicking.
                  const notLaunchable = !e.isDir && !e.isExe;
                  return (
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
                      title={
                        e.isDir ? t("browseApp.openFolder")
                          : e.isExe ? t("browseApp.pickExe")
                          : t("browseApp.notLaunchableTitle")
                      }
                    >
                      <span className="w-4 text-center">
                        {e.isDir ? "📁" : e.isExe ? "⚙️" : "📄"}
                      </span>
                      <span className="truncate">{e.name}</span>
                      {notLaunchable && (
                        <span className="ml-auto shrink-0 rounded-full border border-amber-200 bg-amber-50 px-1.5 text-[9px] uppercase tracking-wide text-amber-700">
                          {t("browseApp.notLaunchableBadge")}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {err && (
            <div className="dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 whitespace-pre-line">
              <span className="mr-1" aria-hidden>⚠</span>{err}
            </div>
          )}
        </div>

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
