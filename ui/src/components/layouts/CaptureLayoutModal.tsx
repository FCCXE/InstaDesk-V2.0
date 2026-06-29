import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { Assignment, CapturedWindow } from "../../services/api";

/**
 * CaptureLayoutModal — review step for the auto-capture feature.
 * Shows the windows the agent read off the screen, grouped by monitor, lets the
 * user include/exclude each, attach URLs to browser windows (which can't expose
 * their own pages), name the Layout, and save. Building the Assignment[] here
 * mirrors the manual save path exactly, so a captured Layout is a normal Layout.
 */

type Props = {
  windows: CapturedWindow[];
  monitorLabel: (monitorIndex: number) => string;
  onCancel: () => void;
  onSave: (assignments: Assignment[], name: string) => Promise<void>;
};

// Friendly app label from an exe path ("…\chrome.exe" → "Chrome",
// "NOTEPAD.EXE" → "Notepad"); falls back to the window title when unidentified.
function appName(w: CapturedWindow): string {
  if (!w.exe) return w.title || "Unknown app";
  const base = (w.exe.split(/[\\/]/).pop() || w.exe).replace(/\.exe$/i, "");
  let n = base;
  if (/^[A-Z0-9]+$/.test(n)) n = n.charAt(0) + n.slice(1).toLowerCase(); // NOTEPAD → Notepad
  return n.charAt(0).toUpperCase() + n.slice(1);
}

// The "open a new window" flag for a browser, so each captured browser window
// becomes its OWN window instead of merging its URLs as tabs into an already-open
// window. Mirrors the built-in app catalog (Chromium family → "--new-window",
// Firefox → "-new-window"). Returns undefined for unknown browsers.
function browserNewWindowArg(exe: string | null): string | undefined {
  if (!exe) return undefined;
  const n = (exe.split(/[\\/]/).pop() || "").replace(/\.exe$/i, "").toLowerCase();
  if (n === "firefox") return "-new-window";
  if (["chrome", "msedge", "brave", "chromium", "opera", "vivaldi", "arc"].includes(n)) return "--new-window";
  return undefined;
}

// Human description of a captured grid region, e.g. "full screen", "left half",
// "top-right quadrant", else "3×6 region".
function zoneLabel(grid: string, gridSize: string): string {
  const [x, y, w, h] = grid.split(",").map((n) => parseInt(n, 10));
  const [cols, rows] = gridSize.split("x").map((n) => parseInt(n, 10));
  if (![x, y, w, h, cols, rows].every(Number.isFinite)) return grid;
  const full = w === cols && h === rows;
  if (full) return "full screen";
  const leftH = x === 1 && w * 2 === cols;
  const rightH = x - 1 === cols / 2 && w * 2 === cols;
  const topH = y === 1 && h * 2 === rows;
  const botH = y - 1 === rows / 2 && h * 2 === rows;
  if (h === rows && leftH) return "left half";
  if (h === rows && rightH) return "right half";
  if (w === cols && topH) return "top half";
  if (w === cols && botH) return "bottom half";
  const v = topH ? "top" : botH ? "bottom" : "";
  const hh = leftH ? "left" : rightH ? "right" : "";
  if (v && hh) return `${v}-${hh} quadrant`;
  return `${w}×${h} region`;
}

export default function CaptureLayoutModal({ windows, monitorLabel, onCancel, onSave }: Props) {
  const { t } = useTranslation();
  // Per-window UI state, keyed by index. Identifiable windows default included;
  // unidentified (no exe) ones can't become a launchable assignment → disabled.
  const [included, setIncluded] = useState<boolean[]>(() => windows.map((w) => !!w.exe));
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Esc closes the modal (unless a save is in flight) — a guaranteed exit even if
  // the footer is ever scrolled or clipped out of view.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  // Group window indices by monitor for display.
  const byMonitor = useMemo(() => {
    const m = new Map<number, number[]>();
    windows.forEach((w, i) => {
      const list = m.get(w.monitor) ?? [];
      list.push(i);
      m.set(w.monitor, list);
    });
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [windows]);

  const includedCount = included.filter(Boolean).length;

  const buildAssignments = (): Assignment[] => {
    const out: Assignment[] = [];
    windows.forEach((w, i) => {
      if (!included[i] || !w.exe) return;
      const raw = (urls[i] ?? "").split(/[\s\n]+/).map((s) => s.trim()).filter(Boolean);
      const a: Assignment = {
        type: "program",
        program: w.exe,
        title: appName(w),
        monitor: w.monitor,
        grid: w.grid,
        gridSize: w.gridSize,
        frameMode: "frameless",
      };
      if (w.isBrowser) {
        // Force a separate window so a captured browser window doesn't merge its
        // URLs into an already-open browser window.
        const nw = browserNewWindowArg(w.exe);
        if (nw) a.args = nw;
        if (raw.length > 0) a.urls = raw;
      }
      out.push(a);
    });
    return out;
  };

  const onSubmit = async () => {
    const assignments = buildAssignments();
    if (assignments.length === 0) {
      setErr(t("capture.nothingIncluded"));
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await onSave(assignments, name.trim());
    } catch (e) {
      setErr((e as Error)?.message ?? String(e));
      setBusy(false);
    }
  };

  // Rendered through a portal to document.body so it escapes the App's
  // `transform: scale()` construct (App.tsx). A transformed ancestor becomes the
  // containing block for this `position: fixed` overlay, which mis-sizes it and
  // pushes the header + footer (Cancel) out of view — the trap this fixes. The
  // backdrop (click outside the card) also closes.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={() => { if (!busy) onCancel(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-line bg-surface shadow-xl"
      >
        {/* Header */}
        <div className="border-b border-line px-5 py-3">
          <div className="text-base font-semibold text-fg">{t("capture.title")}</div>
          <div className="mt-0.5 text-[12px] text-muted">
            {t("capture.subtitle", { count: windows.length })}
          </div>
        </div>

        {/* Body — windows grouped by monitor */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {byMonitor.map(([mon, idxs]) => (
            <div key={mon} className="mb-4">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                {monitorLabel(mon)}
              </div>
              <div className="space-y-1.5">
                {idxs.map((i) => {
                  const w = windows[i];
                  const identifiable = !!w.exe;
                  return (
                    <div
                      key={i}
                      className={`rounded-lg border px-3 py-2 ${
                        identifiable ? "border-line bg-raised" : "border-amber-300/40 bg-amber-50/40 dark:bg-amber-500/5"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={included[i]}
                          disabled={!identifiable}
                          onChange={(e) =>
                            setIncluded((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))
                          }
                          className="size-4 shrink-0 accent-primary disabled:opacity-40"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 truncate text-[13px] font-medium text-fg">
                            <span className="truncate">{appName(w)}</span>
                            {w.isBrowser && (
                              <span className="shrink-0 rounded bg-sky-100 px-1.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                                {t("capture.browser")}
                              </span>
                            )}
                          </div>
                          <div className="truncate text-[11px] text-muted" title={w.title}>
                            {zoneLabel(w.grid, w.gridSize)} · {w.title}
                          </div>
                          {!identifiable && (
                            <div className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                              ⚠ {t("capture.unidentified")} {w.error ? `(${w.error})` : ""}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Browser URL attach — only when included */}
                      {identifiable && w.isBrowser && included[i] && (
                        <div className="mt-2 pl-6">
                          <textarea
                            value={urls[i] ?? ""}
                            onChange={(e) => setUrls((prev) => ({ ...prev, [i]: e.target.value }))}
                            placeholder={t("capture.urlsPlaceholder")}
                            rows={2}
                            className="w-full resize-y rounded-md border border-line bg-bg px-2 py-1 text-[12px] text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                          <div className="mt-0.5 text-[10px] text-muted">{t("capture.urlsHint")}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-line px-5 py-3">
          {err && <div className="mb-2 text-[12px] text-red-600 dark:text-red-400">{err}</div>}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("capture.namePlaceholder")}
              className="min-w-0 flex-1 rounded-lg border border-line bg-raised px-3 py-2 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="shrink-0 rounded-lg border border-line bg-raised px-3 py-2 text-xs font-medium text-fg hover:bg-line/60 disabled:opacity-50"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={busy || includedCount === 0}
              className="shrink-0 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-on-primary shadow hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? t("capture.saving") : t("capture.save", { count: includedCount })}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
