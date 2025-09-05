export default function MonitorSelector() {
  return (
    <aside className="rounded-2xl border border-[rgb(var(--id-border))] bg-[rgb(var(--id-surface))] p-4 shadow-[var(--id-shadow)]">
      {/* Monitor Selection */}
      <div>
        <div className="mb-2 text-[13px] font-semibold text-gray-700">Monitor Selection</div>

        <div className="mb-2">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg border border-[rgb(var(--id-border))] bg-white px-3 py-2 text-sm shadow-sm hover:bg-gray-50"
          >
            <span>Monitor 1</span>
            <span aria-hidden>▾</span>
          </button>
        </div>

        <div className="text-[12px] text-[rgb(var(--id-text-muted))]">2560×1440 Primary</div>

        <div className="mt-3 rounded-xl border border-[rgb(var(--id-border))] bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between text-[13px]">
            <div className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-emerald-500" />
              <span>Monitor 1</span>
            </div>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">Active</span>
          </div>

          <dl className="mt-3 space-y-1 text-[12px] text-[rgb(var(--id-text-muted))]">
            <div className="flex justify-between">
              <dt>Role:</dt>
              <dd>Primary</dd>
            </div>
            <div className="flex justify-between">
              <dt>Resolution:</dt>
              <dd>2560×1440</dd>
            </div>
          </dl>
        </div>

        <div className="mt-2 text-[11px] text-[rgb(var(--id-text-muted))]">Active Monitors: 3/4</div>
      </div>

      {/* Quick Presets */}
      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[13px] font-semibold text-gray-700">Quick Presets</div>
          <button className="text-[11px] text-gray-500 hover:text-gray-700">Manage</button>
        </div>

        <div>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg border border-[rgb(var(--id-border))] bg-white px-3 py-2 text-sm shadow-sm hover:bg-gray-50"
          >
            <span>Choose a preset (up to 6)</span>
            <span aria-hidden>▾</span>
          </button>
        </div>
      </div>
    </aside>
  )
}
