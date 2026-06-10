import type { ReactNode } from "react";
import { useAppState, GRID_SIZE_PRESETS, WINDOW_MARGIN_PRESETS } from "../../state/AppState";
import { useTheme, type ThemeSetting } from "../../state/ThemeProvider";

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

  // Currently-selected preset key, for the <select>'s value prop.
  const selectedKey = `${defaultGridSize.cols}x${defaultGridSize.rows}`;

  return (
    <div className="flex h-full flex-col overflow-hidden p-3">
      {/* Title */}
      <div className="mb-2 text-lg font-semibold text-slate-800">Settings</div>

      {/* Scrollable content */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-2">
        <div className="flex flex-col gap-4">
          <Section title="General">
            <Row>
              <Label>Launch on system start</Label>
              <Toggle on />
            </Row>
            <Row>
              <Label>Theme</Label>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as ThemeSetting)}
                className="h-7 min-w-[160px] rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-300"
                title="Light, Dark, or follow the operating system (System). Dark theme is still being built out, pane by pane."
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">System</option>
              </select>
            </Row>
            <Row>
              <Label>Language</Label>
              <Select value="English ▾" />
            </Row>
          </Section>

          <Section title="Grid &amp; Snapping">
            <Row>
              <Label>Default grid size</Label>
              <select
                value={selectedKey}
                onChange={(e) => {
                  const [c, r] = e.target.value.split("x").map((n) => parseInt(n, 10));
                  if (Number.isFinite(c) && Number.isFinite(r)) {
                    setDefaultGridSize({ cols: c, rows: r });
                  }
                }}
                className="h-7 min-w-[160px] rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-300"
                title="The grid size used for monitors InstaDesk hasn't seen before. Currently-configured monitors are auto-pinned to their existing size when this changes, so your assignments are never disturbed."
              >
                {GRID_SIZE_PRESETS.map((s) => (
                  <option key={`${s.cols}x${s.rows}`} value={`${s.cols}x${s.rows}`}>
                    {s.cols} × {s.rows}
                  </option>
                ))}
              </select>
            </Row>
            <Row>
              <Label>Window margin</Label>
              <select
                value={String(windowMargin)}
                onChange={(e) => setWindowMargin(parseInt(e.target.value, 10) || 0)}
                className="h-7 min-w-[160px] rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-300"
                title="Pixels of padding around each monitor's work area. Pulls snapped windows back from monitor edges to leave room for physical bezels. Adjacent windows on the same monitor still touch each other."
              >
                {WINDOW_MARGIN_PRESETS.map((m) => (
                  <option key={m} value={String(m)}>
                    {m === 0 ? "Off (0 px)" : `${m} px`}
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
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
      <div className="mb-3 text-base font-semibold text-slate-800">{title}</div>
      <div className="flex flex-col divide-y divide-slate-100/80">{children}</div>
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
  return <div className="text-sm text-slate-700">{children}</div>;
}

function Toggle({ on = true }: { on?: boolean }) {
  return (
    <div
      className={[
        "relative h-6 w-[46px] cursor-not-allowed rounded-full border",
        on ? "border-sky-200 bg-sky-100" : "border-slate-200 bg-slate-100",
      ].join(" ")}
      aria-disabled
    >
      <div
        className={[
          "absolute top-[2px] h-[20px] w-[22px] rounded-full border bg-white transition-all",
          on ? "right-[2px] border-sky-200" : "left-[2px] border-slate-200",
        ].join(" ")}
      />
    </div>
  );
}

function Select({ value }: { value: string }) {
  return (
    <button
      className="h-7 min-w-[160px] cursor-not-allowed rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"
      disabled
      aria-disabled
    >
      {value}
    </button>
  );
}
