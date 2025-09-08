import React, { useMemo } from "react";

/**
 * LayoutsPane — visuals only (state-only)
 * v8.8: Slimmer Set Preset + narrow Edit for balanced row 2
 * - Row 1: Apply
 * - Row 2: Set Preset (116px), Edit (72px)
 * - Row 3: … , Delete
 * - List: overflow-x-hidden + scrollbar-gutter: stable both-edges
 */

type MonitorId = "M1" | "M2" | "M3" | "M4";

interface LayoutCardModel {
  id: string;
  name: string;
  monitors: MonitorId[];
  preset?: boolean;
  updatedISO: string;
}

const nowISO = () => new Date().toISOString();

const SAMPLE_LAYOUTS: LayoutCardModel[] = [
  { id: "dev",      name: "Dev - Daily", monitors: ["M1", "M2"], preset: true,  updatedISO: nowISO() },
  { id: "research", name: "Research",    monitors: ["M2", "M3", "M4"],          updatedISO: nowISO() },
  { id: "focus",    name: "Focus Mode",  monitors: ["M2"],                      updatedISO: nowISO() },
];

export default function LayoutsPane() {
  const layouts = useMemo(() => SAMPLE_LAYOUTS, []);

  return (
    <div className="flex h-full flex-col overflow-hidden p-3">
      <div className="mb-2 text-lg font-semibold text-slate-800">Layouts</div>

      {/* Scope */}
      <div className="mb-2">
        <div className="flex items-center gap-3">
          <ScopePill active minW={140}>All Monitors</ScopePill>
          <ScopePill minW={168}>Current Monitor ▾</ScopePill>
        </div>
        <div className="mt-2">
          <button
            className="h-9 min-w-[150px] cursor-not-allowed rounded-full border border-slate-200 bg-slate-100 px-4 text-sm text-slate-400"
            disabled
          >
            + New Layout
          </button>
        </div>
      </div>

      <div className="mb-3 h-px w-full bg-slate-200/80" />

      {/* Scroll list — keep gutter stable, hide horizontal */}
      <div
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-3"
        style={{ scrollbarGutter: "stable both-edges" }}
      >
        <div className="flex flex-col gap-3">
          {layouts.map((m) => (
            <LayoutCard key={m.id} model={m} />
          ))}

          {/* Empty slot */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
            <div className="flex items-start gap-3">
              <DragDots />
              <div className="flex-1">
                <div className="text-base font-semibold text-slate-700">(Empty slot)</div>
                <div className="mt-2 text-sm text-slate-500">Empty slot — create a new layout</div>
                <div className="mt-4">
                  <button
                    className="h-8 min-w-[150px] cursor-not-allowed rounded-md border border-slate-200 bg-slate-100 px-3 text-xs text-slate-400"
                    disabled
                  >
                    + New Layout
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="h-10" />
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- Card ---------------------------- */

function LayoutCard({ model }: { model: LayoutCardModel }) {
  const updatedStr = useMemo(() => {
    const d = new Date(model.updatedISO);
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `Updated: ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}`;
  }, [model.updatedISO]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
      <div className="flex items-start gap-3">
        <DragDots />
        <div className="flex-1">
          <div className="text-base font-semibold text-slate-800">{model.name}</div>

          {model.preset && (
            <span className="mt-1 inline-flex h-5 items-center rounded-full border border-amber-200 bg-amber-50 px-2 text-xs font-medium text-amber-700">
              Preset
            </span>
          )}

          {/* Monitor chips */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {model.monitors.map((m) => (
              <span
                key={m}
                className="inline-flex h-5 items-center rounded-full border border-sky-200 bg-sky-50 px-2 text-xs font-medium text-sky-700"
              >
                {m}
              </span>
            ))}
          </div>

          <div className="mt-2 text-xs text-slate-500">{updatedStr}</div>

          {/* Actions — three rows */}
          <div className="mt-3 flex flex-col gap-2">
            {/* Row 1: Apply */}
            <div className="flex items-center gap-2">
              <PrimaryBtn className="min-w-[108px]">Apply</PrimaryBtn>
            </div>

            {/* Row 2: slimmer Set Preset + narrow Edit */}
            <div className="flex items-center gap-2">
              <GhostBtn className="min-w-[116px]">Set Preset</GhostBtn>
              <GhostBtn className="min-w-[72px] px-2">Edit</GhostBtn>
            </div>

            {/* Row 3: ... + Delete */}
            <div className="flex items-center gap-2">
              <GhostBtn className="min-w-[56px]">…</GhostBtn>
              <GhostBtn className="min-w-[104px]">Delete</GhostBtn>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- Bits ---------------------------- */

function ScopePill({
  children,
  active,
  minW = 140,
}: {
  children: React.ReactNode;
  active?: boolean;
  minW?: number;
}) {
  return (
    <button
      className={[
        "h-9 rounded-full px-4 text-sm",
        `min-w-[${minW}px]`,
        active
          ? "bg-sky-50 text-sky-700 ring-1 ring-sky-200"
          : "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
      ].join(" ")}
      disabled
      aria-disabled
    >
      {children}
    </button>
  );
}

function PrimaryBtn({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`h-8 rounded-md bg-sky-600 px-3 text-xs font-medium text-white shadow hover:bg-sky-700 ${className}`}
    >
      {children}
    </button>
  );
}

function GhostBtn({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`h-8 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100 ${className}`}
    >
      {children}
    </button>
  );
}

function DragDots() {
  return (
    <div className="mt-2 flex w-3 flex-col items-center justify-start">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="mb-1 h-1 w-1 rounded bg-slate-300/80" />
      ))}
    </div>
  );
}
