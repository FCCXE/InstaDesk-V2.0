import React from "react";

/**
 * LayoutCard (placeholder only)
 * Will be used next block to render each layout row.
 */
export default function LayoutCard() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
      <div className="text-base font-semibold text-slate-700">Sample Layout</div>
      <div className="mt-1 inline-flex h-5 items-center rounded-full border border-amber-200 bg-amber-50 px-2 text-xs font-medium text-amber-700">
        Preset
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="inline-flex h-5 items-center rounded-full border border-sky-200 bg-sky-50 px-2 text-xs font-medium text-sky-700">
          M1
        </span>
        <span className="inline-flex h-5 items-center rounded-full border border-sky-200 bg-sky-50 px-2 text-xs font-medium text-sky-700">
          M2
        </span>
      </div>
      <div className="mt-2 text-xs text-slate-500">Updated: 2025-09-07 02:41</div>
      <div className="mt-3 flex flex-wrap gap-x-2 gap-y-2">
        <button className="h-7 rounded-md bg-slate-200 px-3 text-xs font-medium text-slate-500 cursor-not-allowed">
          Apply
        </button>
        <button className="h-7 rounded-md bg-slate-200 px-3 text-xs font-medium text-slate-500 cursor-not-allowed">
          Set Preset
        </button>
        <button className="h-7 rounded-md bg-slate-200 px-3 text-xs font-medium text-slate-500 cursor-not-allowed">
          Edit
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="h-7 rounded-md bg-slate-200 px-3 text-xs font-medium text-slate-500 cursor-not-allowed">
          ⋯
        </button>
        <button className="h-7 rounded-md bg-slate-200 px-3 text-xs font-medium text-slate-500 cursor-not-allowed">
          Delete
        </button>
      </div>
    </div>
  );
}
