import { useEffect, useState, type ReactNode } from "react";
import { useAppState, GRID_SIZE_PRESETS, WINDOW_MARGIN_PRESETS } from "../../state/AppState";
import { useTheme, type ThemeSetting } from "../../state/ThemeProvider";
import { useTranslation } from "react-i18next";
import { setLang, type Lang } from "../../i18n";
import { api } from "../../services/api";

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

function Label({ children }: { children: ReactNode }) {
  return <div className="text-sm text-fg">{children}</div>;
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
