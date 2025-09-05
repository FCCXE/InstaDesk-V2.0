export default function MonitorSelector() {
  return (
    <aside className="h-full bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex flex-col">
      <h2 className="text-sm font-semibold text-gray-800">Monitors</h2>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {[1, 2, 3, 4].map((n) => (
          <button
            key={n}
            className="py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
            type="button"
          >
            {n}
          </button>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200">
        <h3 className="text-xs font-medium text-gray-600">Quick Presets</h3>
        <div className="mt-2 space-y-2">
          {['Balanced 2×2', 'Coding Focus', 'Presentation'].map((p) => (
            <div
              key={p}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700"
            >
              {p}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
