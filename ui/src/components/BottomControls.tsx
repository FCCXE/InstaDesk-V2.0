export default function BottomControls() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[rgb(var(--id-border))] bg-[rgb(var(--id-surface))]/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1260px] items-center justify-between gap-3 px-3 py-2">
        <div className="text-[12px] text-[rgb(var(--id-text-muted))]">Layout Controls</div>

        <div className="flex flex-1 items-center gap-2">
          {['Clear All', 'Copy Grid', 'Fill Grid'].map((label) => (
            <button
              key={label}
              className="rounded-md border border-[rgb(var(--id-border))] bg-white px-3 py-1.5 text-sm shadow-sm hover:bg-gray-50"
              type="button"
            >
              {label}
            </button>
          ))}

          {/* Snap to grid toggle */}
          <div className="ml-2 flex items-center gap-2 rounded-md border border-[rgb(var(--id-border))] bg-white px-2 py-1.5 text-sm shadow-sm">
            <span className="text-gray-700">Snap to Grid</span>
            <label className="relative inline-flex cursor-pointer items-center">
              <input type="checkbox" className="peer sr-only" defaultChecked />
              <div className="peer h-5 w-9 rounded-full bg-gray-300 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-blue-500 peer-checked:after:translate-x-4" />
            </label>
          </div>

          {/* Spacing */}
          <div className="flex items-center gap-2 rounded-md border border-[rgb(var(--id-border))] bg-white px-2 py-1.5 text-sm shadow-sm">
            <span className="text-gray-700">Spacing</span>
            <input
              type="number"
              defaultValue={6}
              className="w-14 rounded-md border border-[rgb(var(--id-border))] bg-white px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-200"
            />
            <span className="text-gray-500">px</span>
          </div>

          {/* Grid size indicator */}
          <div className="rounded-full border border-[rgb(var(--id-border))] bg-white px-3 py-1.5 text-xs shadow-sm">
            6×6 Grid Active
          </div>
        </div>

        <div className="text-[12px] text-[rgb(var(--id-text-muted))]">Ready • 1280×820</div>
      </div>
    </div>
  )
}
