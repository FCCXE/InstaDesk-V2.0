import React from "react";

/**
 * LayoutsPane (placeholder, state-only)
 * SAFE STEP: This file is not yet imported anywhere.
 * Next block will wire it into RightPane's Layouts tab.
 */
export default function LayoutsPane() {
  return (
    <div className="h-full overflow-y-auto p-3 pr-2">
      <div className="mb-2 text-lg font-semibold text-slate-700">Layouts</div>

      {/* Scope row (visual-only placeholder) */}
      <div className="mb-2 flex items-center gap-2">
        <button
          className="h-8 rounded-full bg-slate-100 px-3 text-sm text-slate-600 ring-1 ring-slate-200 cursor-default"
          disabled
        >
          All Monitors
        </button>
        <button
          className="h-8 rounded-full bg-slate-100 px-3 text-sm text-slate-600 ring-1 ring-slate-200 cursor-default"
          disabled
        >
          Current Monitor ▾
        </button>
        <div className="ml-1 text-sm text-slate-500">Monitor: M2</div>

        <div className="ml-auto">
          <button
            className="h-8 rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm text-slate-400 cursor-not-allowed"
            disabled
          >
            + New Layout
          </button>
        </div>
      </div>

      <div className="mb-3 h-px w-full bg-slate-200/80" />

      {/* Placeholder body */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        Layouts panel placeholder (safe step).<br />
        In the next block, this will become the vertical list of layout cards with
        two-row actions (Apply / Set Preset / Edit / ⋯ / Delete) and scrolling.
      </div>

      <div className="mt-3 text-xs text-slate-500">
        ⋯ = More (Rename • Duplicate • Export)
      </div>
    </div>
  );
}
