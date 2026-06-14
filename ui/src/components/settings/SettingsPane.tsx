import { useEffect, useState, type ReactNode } from "react";
import { useAppState, GRID_SIZE_PRESETS, WINDOW_MARGIN_PRESETS } from "../../state/AppState";
import { useTheme, type ThemeSetting } from "../../state/ThemeProvider";
import { useTranslation } from "react-i18next";
import { setLang, type Lang } from "../../i18n";
import { api, inTauri } from "../../services/api";
import { telemetryConfigured, isOptedOut, setOptedOut } from "../../services/telemetry";
import { checkForUpdate, installUpdate, type Update } from "../../services/updater";

/**
 * SettingsPane
 * - Tabs exist in RightPane; this component renders only the Settings body.
 * - General sub-pane: Launch / Theme / Language (placeholders awaiting their
 *   respective phases) + functional Default grid size picker (Step 2 of
 *   the 4-step grid-size build, 2026-06-09).
 * - Grid & Snapping sub-pane: only the Default grid size row.
 */

export default function SettingsPane() {
  const { defaultGridSize, setDefaultGridSize, windowMargin, setWindowMargin } = useAppState();
  const { theme, setTheme } = useTheme();
  const { t, i18n } = useTranslation();

  // Currently-selected preset key, for the <select>'s value prop.
  const selectedKey = `${defaultGridSize.cols}x${defaultGridSize.rows}`;

  // Launch-on-system-start: reflects the real Windows startup registration.
  // Reads the live state on mount; toggling writes it via the backend.
  const [autostartOn, setAutostartOn] = useState(true);
  const [autostartBusy, setAutostartBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    api.autostartGet().then(v => { if (alive) setAutostartOn(v); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const onToggleAutostart = async () => {
    if (autostartBusy) return;
    const next = !autostartOn;
    setAutostartBusy(true);
    try {
      await api.autostartSet(next);
      setAutostartOn(next); // only flip on success
    } catch {
      // leave the toggle as-is on failure (no silent false-positive)
    } finally {
      setAutostartBusy(false);
    }
  };

  // Anonymous-usage sharing (telemetry opt-out). Shown only when keys are
  // configured. "On" = sharing = NOT opted out.
  const showUsageToggle = telemetryConfigured();
  const [shareUsage, setShareUsage] = useState(!isOptedOut());
  const onToggleShareUsage = () => {
    const next = !shareUsage;
    setShareUsage(next);
    setOptedOut(!next); // sharing on → not opted out
  };

  // Auto-update (desktop only). Check → (if available) install + relaunch.
  const showUpdates = inTauri();
  const [updState, setUpdState] = useState<"idle" | "checking" | "available" | "latest" | "installing" | "error">("idle");
  const [update, setUpdate] = useState<Update | null>(null);
  const [updErr, setUpdErr] = useState("");
  const onCheckUpdates = async () => {
    setUpdState("checking");
    setUpdErr("");
    try {
      const u = await checkForUpdate();
      if (u) { setUpdate(u); setUpdState("available"); }
      else { setUpdState("latest"); }
    } catch (e) {
      setUpdErr(String((e as Error)?.message ?? e));
      setUpdState("error");
    }
  };
  const onInstallUpdate = async () => {
    if (!update) return;
    setUpdState("installing");
    setUpdErr("");
    try {
      await installUpdate(update); // downloads, installs, relaunches
    } catch (e) {
      setUpdErr(String((e as Error)?.message ?? e));
      setUpdState("error");
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden p-3">
      {/* Title */}
      <div className="mb-2 text-lg font-semibold text-fg">{t("settings.title")}</div>

      {/* Scrollable content */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-2">
        <div className="flex flex-col gap-4">
          <Section title={t("settings.general")}>
            <Row>
              <Label>{t("settings.launchOnStart")}</Label>
              <Toggle on={autostartOn} busy={autostartBusy} onToggle={onToggleAutostart} />
            </Row>
            <Row>
              <Label>{t("settings.theme")}</Label>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as ThemeSetting)}
                className="h-7 min-w-[160px] rounded-md border border-line bg-raised px-3 text-xs font-medium text-fg hover:bg-raised focus:outline-none focus:ring-2 focus:ring-ring"
                title={t("settings.themeHint")}
              >
                <option value="light">{t("settings.themeLight")}</option>
                <option value="dark">{t("settings.themeDark")}</option>
                <option value="system">{t("settings.themeSystem")}</option>
              </select>
            </Row>
            <Row>
              <Label>{t("settings.language")}</Label>
              <select
                value={i18n.language === "es" ? "es" : "en"}
                onChange={(e) => setLang(e.target.value as Lang)}
                className="h-7 min-w-[160px] rounded-md border border-line bg-raised px-3 text-xs font-medium text-fg hover:bg-line/60 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </Row>
            {showUsageToggle && (
              <Row>
                <Label title={t("settings.shareUsageHint")}>{t("settings.shareUsage")}</Label>
                <Toggle on={shareUsage} onToggle={onToggleShareUsage} />
              </Row>
            )}
          </Section>

          <Section title={t("settings.gridSnapping")}>
            <Row>
              <Label>{t("settings.defaultGridSize")}</Label>
              <select
                value={selectedKey}
                onChange={(e) => {
                  const [c, r] = e.target.value.split("x").map((n) => parseInt(n, 10));
                  if (Number.isFinite(c) && Number.isFinite(r)) {
                    setDefaultGridSize({ cols: c, rows: r });
                  }
                }}
                className="h-7 min-w-[160px] rounded-md border border-line bg-raised px-3 text-xs font-medium text-fg hover:bg-raised focus:outline-none focus:ring-2 focus:ring-ring"
                title={t("settings.defaultGridSizeHint")}
              >
                {GRID_SIZE_PRESETS.map((s) => (
                  <option key={`${s.cols}x${s.rows}`} value={`${s.cols}x${s.rows}`}>
                    {s.cols} × {s.rows}
                  </option>
                ))}
              </select>
            </Row>
            <Row>
              <Label>{t("settings.windowMargin")}</Label>
              <select
                value={String(windowMargin)}
                onChange={(e) => setWindowMargin(parseInt(e.target.value, 10) || 0)}
                className="h-7 min-w-[160px] rounded-md border border-line bg-raised px-3 text-xs font-medium text-fg hover:bg-raised focus:outline-none focus:ring-2 focus:ring-ring"
                title={t("settings.windowMarginHint")}
              >
                {WINDOW_MARGIN_PRESETS.map((m) => (
                  <option key={m} value={String(m)}>
                    {m === 0 ? t("settings.marginOff") : t("settings.marginPx", { n: m })}
                  </option>
                ))}
              </select>
            </Row>
          </Section>

          {showUpdates && (
            <Section title={t("settings.updates")}>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onCheckUpdates}
                    disabled={updState === "checking" || updState === "installing"}
                    className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50 dark:text-sky-300"
                  >
                    {updState === "checking" ? t("settings.updChecking") : t("settings.checkUpdates")}
                  </button>
                  {updState === "latest" && <span className="text-xs text-muted">{t("settings.updLatest")}</span>}
                </div>
                {(updState === "available" || updState === "installing") && update && (
                  <div className="rounded-md border border-line bg-raised p-2">
                    <div className="text-xs font-medium text-fg">{t("settings.updAvailable", { version: update.version })}</div>
                    {update.body && <div className="mt-1 whitespace-pre-line text-[11px] text-muted">{update.body}</div>}
                    <button
                      type="button"
                      onClick={onInstallUpdate}
                      disabled={updState === "installing"}
                      className="mt-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50 dark:text-sky-300"
                    >
                      {updState === "installing" ? t("settings.updInstalling") : t("settings.updInstall")}
                    </button>
                  </div>
                )}
                {updErr && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">
                    {updErr}
                  </div>
                )}
              </div>
            </Section>
          )}

          {inTauri() && (
            <Section title={t("settings.shortcuts")}>
              <Row>
                <Label title={t("settings.scHint")}>{t("settings.scShowDashboard")}</Label>
                <span className="rounded border border-line bg-raised px-2 py-0.5 font-mono text-[11px] text-fg">Ctrl + Alt + D</span>
              </Row>
              <Row>
                <Label title={t("settings.scHint")}>{t("settings.scSnap")}</Label>
                <span className="rounded border border-line bg-raised px-2 py-0.5 font-mono text-[11px] text-fg">Ctrl + Alt + S</span>
              </Row>
              <Row>
                <Label title={t("settings.scHint")}>{t("settings.scQuickPreset")}</Label>
                <span className="rounded border border-line bg-raised px-2 py-0.5 font-mono text-[11px] text-fg">Ctrl + Alt + 1…9</span>
              </Row>
            </Section>
          )}

          <div className="h-4" />
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- UI Bits ---------------------------- */

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
      <div className="mb-3 text-base font-semibold text-fg">{title}</div>
      <div className="flex flex-col divide-y divide-line">{children}</div>
    </div>
  );
}

function Row({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
      {children}
    </div>
  );
}

function Label({ children, title }: { children: ReactNode; title?: string }) {
  return <div className="text-sm text-fg" title={title}>{children}</div>;
}

function Toggle({
  on = true,
  busy = false,
  onToggle,
}: {
  on?: boolean;
  busy?: boolean;
  onToggle?: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={busy || !onToggle}
      onClick={onToggle}
      className={[
        "relative h-6 w-[46px] rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
        onToggle ? "cursor-pointer" : "cursor-not-allowed",
        busy ? "opacity-60" : "",
        on ? "border-sky-200 bg-sky-100 dark:border-primary/50 dark:bg-primary/40" : "border-line bg-raised",
      ].join(" ")}
    >
      <span
        className={[
          "absolute top-[2px] h-[20px] w-[22px] rounded-full border bg-white transition-all",
          on ? "right-[2px] border-sky-200" : "left-[2px] border-line",
        ].join(" ")}
      />
    </button>
  );
}
