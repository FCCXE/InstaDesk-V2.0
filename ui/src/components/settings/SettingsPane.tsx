import React from "react";

/**
 * SettingsPane — visuals only (state-only)
 * Matches the approved v1 mock:
 * - Tabs exist in RightPane; this component renders only the Settings body.
 * - Three groups: General / Grid & Snapping / Shortcuts
 * - All controls are inert (disabled visuals), consistent Tailwind v4 styling
 */

export default function SettingsPane() {
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
              <Label>Show status line</Label>
              <Toggle on />
            </Row>
            <Row>
              <Label>Theme</Label>
              <Select value="Light ▾" />
            </Row>
            <Row>
              <Label>Language</Label>
              <Select value="English ▾" />
            </Row>
          </Section>

          <Section title="Grid &amp; Snapping">
            <Row>
              <Label>Snap to grid</Label>
              <Toggle on />
            </Row>
            <Row>
              <Label>Default grid size</Label>
              <Select value="6 × 6 ▾" />
            </Row>
            <Row>
              <Label>Cell spacing</Label>
              <Select value="4 px ▾" />
            </Row>
            <Row>
              <Label>Show cell outlines</Label>
              <Toggle on={false} />
            </Row>
          </Section>

          <Section title="Shortcuts">
            <Row>
              <Label>Open Dashboard</Label>
              <Select value="Ctrl + Alt + D" />
            </Row>
            <Row>
              <Label>Apply Layout</Label>
              <Select value="Ctrl + Alt + L" />
            </Row>
              <Row>
              <Label>Toggle Selection</Label>
              <Select value="Ctrl + Alt + S" />
            </Row>
            <Row>
              <Label>Quick Preset</Label>
              <Select value="Ctrl + Alt + 1" />
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
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
      <div className="mb-3 text-base font-semibold text-slate-800">{title}</div>
      <div className="flex flex-col divide-y divide-slate-100/80">
        {children}
      </div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-slate-700">{children}</div>;
}

function Toggle({ on = true }: { on?: boolean }) {
  return (
    <div
      className={[
        "relative h-6 w-[46px] cursor-not-allowed rounded-full border",
        on
          ? "border-sky-200 bg-sky-100"
          : "border-slate-200 bg-slate-100",
      ].join(" ")}
      aria-disabled
    >
      <div
        className={[
          "absolute top-[2px] h-[20px] w-[22px] rounded-full border bg-white transition-all",
          on
            ? "right-[2px] border-sky-200"
            : "left-[2px] border-slate-200",
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
