export default function RightPane() {
  return (
    <aside className="h-full bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
      {/* Tabs header */}
      <div className="border-b border-gray-200">
        <div className="grid grid-cols-4 text-sm">
          {['Apps', 'Layouts', 'Settings', 'Help'].map((t, i) => (
            <div
              key={t}
              className={
                'px-3 py-2 text-center select-none ' +
                (i === 0 ? 'font-semibold text-gray-800 border-b-2 border-gray-700' : 'text-gray-500')
              }
            >
              {t}
            </div>
          ))}
        </div>
      </div>

      {/* Body: show Apps tab only in Phase 0 */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 text-sm leading-6 text-gray-700">
        <p className="mb-2 font-medium text-gray-800">Installed Apps</p>
        <p>
          This is a placeholder for the Apps tab. Future phases will list available apps and allow assigning
          them to grid cells.
        </p>
        <p className="mt-3">
          Use this area to explore integrations, app permissions, and quick actions. Content is static in Phase 0.
        </p>
      </div>
    </aside>
  );
}
