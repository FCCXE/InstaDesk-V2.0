export default function RightPane() {
  return (
    <aside className="rounded-2xl border border-[rgb(var(--id-border))] bg-[rgb(var(--id-surface))] shadow-[var(--id-shadow)]">
      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-[rgb(var(--id-border))] px-4 pt-2">
        {['Apps', 'Layouts', 'Settings', 'Help'].map((t, i) => (
          <div
            key={t}
            className={[
              'cursor-default py-2 text-sm',
              i === 0
                ? 'border-b-2 border-blue-500 font-medium text-gray-900'
                : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            {t}
          </div>
        ))}
      </div>

      <div className="p-4">
        {/* Search */}
        <div className="mb-3">
          <input
            type="text"
            placeholder="Search applications..."
            className="w-full rounded-lg border border-[rgb(var(--id-border))] bg-white px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        {/* Filter chips */}
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          {['All', 'Communication', 'Browser', 'Development'].map((c, i) => (
            <button
              key={c}
              className={[
                'rounded-full border px-2.5 py-1',
                i === 2
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-[rgb(var(--id-border))] bg-white text-gray-600 hover:bg-gray-50',
              ].join(' ')}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Small tab strip */}
        <div className="mb-2 flex items-center gap-2 text-xs">
          {['Favorites', 'Apps', 'URLs'].map((t, i) => (
            <button
              key={t}
              className={[
                'rounded-md px-2 py-1',
                i === 0 ? 'bg-gray-100 font-medium text-gray-800' : 'text-gray-600 hover:bg-gray-50',
              ].join(' ')}
            >
              {t}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="space-y-2 text-sm">
          {[
            ['#10b981', 'Outlook', 'Communication'],
            ['#2563eb', 'Chrome', 'Browser'],
            ['#7c3aed', 'VS Code', 'Development'],
            ['#6b7280', 'Notepad', 'Text'],
            ['#111827', 'GitHub', 'Development'],
            ['#f97316', 'Stack Overflow', 'Development'],
          ].map(([color, name, tag]) => (
            <div
              key={name}
              className="flex items-center justify-between rounded-lg border border-[rgb(var(--id-border))] bg-white px-3 py-2 shadow-sm hover:bg-gray-50"
            >
              <div className="flex items-center gap-2">
                <span className="inline-block size-2 rounded-full" style={{ backgroundColor: color as string }} />
                <span>{name}</span>
              </div>
              <span className="text-[11px] text-[rgb(var(--id-text-muted))]">{tag}</span>
            </div>
          ))}
        </div>

        {/* Add custom */}
        <div className="mt-4">
          <button className="w-full rounded-lg border border-[rgb(var(--id-border))] bg-white px-3 py-2 text-sm shadow-sm hover:bg-gray-50">
            + Add Custom App/URL
          </button>
        </div>
      </div>
    </aside>
  )
}
