import React, { useMemo, useState } from 'react'
import { useAppState, APPS } from '../state/AppState'

type FilterChip = 'All' | 'Communication' | 'Browser' | 'Development' | 'Text'
type AppKey = string

// Display-only categorization
const CATEGORY_BY_APP: Record<AppKey, FilterChip> = {
  outlook: 'Communication',
  chrome: 'Browser',
  vscode: 'Development',
  notepad: 'Text',
  github: 'Development',
  stackoverflow: 'Development',
}

export default function RightPane() {
  const {
    selection,
    selectedApp,
    setSelectedApp,
    assignSelected,
    unassignSelected,
  } = useAppState()

  const [query, setQuery] = useState('')
  const [chip, setChip] = useState<FilterChip>('All')
  const [miniTab, setMiniTab] = useState<'Favorites' | 'Apps' | 'URLs'>('Apps')

  const selectionCount = selection.size

  const appList = useMemo(() => {
    const all = Object.values(APPS)
    const filteredByChip =
      chip === 'All' ? all : all.filter((a) => CATEGORY_BY_APP[a.id] === chip)
    const q = query.trim().toLowerCase()
    const filteredByQuery = q
      ? filteredByChip.filter((a) => a.name.toLowerCase().includes(q))
      : filteredByChip
    return filteredByQuery
  }, [chip, query])

  const onPick = (id: AppKey) => setSelectedApp(id as any)
  const canAssign = Boolean(selectedApp) && selectionCount > 0
  const canUnassign = selectionCount > 0

  return (
    <aside
      className="
        rounded-2xl border border-[rgb(var(--id-border))]
        bg-[rgb(var(--id-surface))] shadow-[var(--id-shadow)]
        h-full overflow-hidden flex flex-col
      "
    >
      {/* Fixed header tabs */}
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

      {/* Scrollable content area */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 pr-1">
        {/* Mini tab strip (strong highlight when active) */}
        <div className="mb-3 mt-3 flex items-center gap-2 text-xs">
          {(['Favorites', 'Apps', 'URLs'] as const).map((t) => {
            const active = miniTab === t
            const strong = active // stronger pill for the selected tab
            return (
              <button
                key={t}
                onClick={() => setMiniTab(t)}
                className={[
                  'rounded-full px-3 py-1 border',
                  strong
                    ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                    : 'border-[rgb(var(--id-border))] bg-white text-gray-600 hover:bg-gray-50',
                ].join(' ')}
              >
                {t}
              </button>
            )
          })}
        </div>

        {/* Search + filter chips — HIDDEN on URLs mini-tab */}
        {miniTab !== 'URLs' && (
          <>
            <div className="mb-3">
              <input
                type="text"
                placeholder="Search applications..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-lg border border-[rgb(var(--id-border))] bg-white px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>

            <div className="mb-3 flex flex-wrap gap-2 text-xs">
              {(['All', 'Communication', 'Browser', 'Development', 'Text'] as FilterChip[]).map((c) => {
                const active = chip === c
                return (
                  <button
                    key={c}
                    onClick={() => setChip(c)}
                    className={[
                      'rounded-full border px-2.5 py-1',
                      active
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-[rgb(var(--id-border))] bg-white text-gray-600 hover:bg-gray-50',
                    ].join(' ')}
                  >
                    {c}
                  </button>
                )
              })}
            </div>
          </>
        )}

        {/* Selection summary + actions (Apps sub-tab only) */}
        {miniTab !== 'URLs' && (
          <div className="mb-3 flex items-center justify-between text-xs">
            <div className="text-[11px] text-[rgb(var(--id-text-muted))]">
              Selection:&nbsp;<strong>{selectionCount}</strong> cell{selectionCount === 1 ? '' : 's'}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={assignSelected}
                disabled={!canAssign}
                className={[
                  'rounded-md px-3 py-1.5 text-xs shadow-sm border',
                  canAssign
                    ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                    : 'border-[rgb(var(--id-border))] bg-gray-100 text-gray-400 cursor-not-allowed',
                ].join(' ')}
                title={canAssign ? 'Assign selected app to selected cells' : 'Pick an app and select cells first'}
              >
                Assign to Selection
              </button>
              <button
                onClick={unassignSelected}
                disabled={!canUnassign}
                className={[
                  'rounded-md px-3 py-1.5 text-xs shadow-sm border',
                  canUnassign
                    ? 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    : 'border-[rgb(var(--id-border))] bg-gray-100 text-gray-400 cursor-not-allowed',
                ].join(' ')}
                title={canUnassign ? 'Remove assignments from selected cells' : 'Select cells first'}
              >
                Unassign Selection
              </button>
            </div>
          </div>
        )}

        {/* APPS LIST (Favorites/Apps mini-tabs) */}
        {miniTab !== 'URLs' && (
          <div className="space-y-2 text-sm">
            {appList.length === 0 && (
              <div className="rounded-lg border border-[rgb(var(--id-border))] bg-white px-3 py-3 text-[13px] text-gray-500">
                No apps match your filters.
              </div>
            )}
            {appList.map((app) => {
              const active = selectedApp === app.id
              return (
                <button
                  key={app.id}
                  onClick={() => onPick(app.id)}
                  className={[
                    'w-full flex items-center justify-between rounded-lg border px-3 py-2 shadow-sm',
                    active
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-[rgb(var(--id-border))] bg-white hover:bg-gray-50',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block size-2 rounded-full"
                      style={{ backgroundColor: app.color || '#9ca3af' }}
                    />
                    <span className={active ? 'font-medium text-gray-900' : ''}>{app.name}</span>
                  </div>
                  <span className="text-[11px] text-[rgb(var(--id-text-muted))]">
                    {CATEGORY_BY_APP[app.id as AppKey] || 'App'}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* URLs BUILDER (visual only) */}
        {miniTab === 'URLs' && <UrlsBuilderVisual />}
      </div>
    </aside>
  )
}

/** Visual-only URLs builder (title simplified). */
function UrlsBuilderVisual() {
  const [browser, setBrowser] = useState('Chrome')
  const [openBehavior, setOpenBehavior] = useState<'single'|'tabgroup'|'perurl'>('single')

  // Visual model for mock
  const [tabs, setTabs] = useState([
    { title: '', urls: ['', '', ''] },
    { title: '', urls: ['', '', ''] },
    { title: '', urls: ['', '', ''] },
    { title: '', urls: ['', '', ''] },
  ])

  const addTab = () => setTabs([...tabs, { title: '', urls: ['', '', ''] }])

  return (
    <div className="pb-6">
      <h3 className="mb-2 text-sm font-medium text-gray-900">URL Builder</h3>

      {/* Browser row */}
      <label className="block text-xs text-gray-600">Browser</label>
      <div className="mb-4 mt-1 flex items-center gap-2">
        <select
          value={browser}
          onChange={(e) => setBrowser(e.target.value)}
          className="w-[240px] rounded-lg border border-[rgb(var(--id-border))] bg-white px-3 py-2 text-sm shadow-sm"
        >
          <option>Chrome</option>
          <option>Edge</option>
          <option>Firefox</option>
        </select>
        <button
          className="rounded-lg border border-[rgb(var(--id-border))] bg-white px-3 py-2 text-xs shadow-sm hover:bg-gray-50"
          onClick={() => alert('Add Browser (not wired yet)')}
        >
          + Add Browser
        </button>
      </div>

      <div className="mb-2 text-xs text-gray-600">Tabs</div>

      {tabs.map((t, idx) => (
        <div key={idx} className="mb-5">
          <div className="rounded-xl border border-[rgb(var(--id-border))] bg-white p-3">
            <input
              type="text"
              placeholder={`Tab ${idx + 1} (optional title)`}
              className="mb-2 w-full rounded-md border border-[rgb(var(--id-border))] bg-white px-2 py-1 text-xs"
              value={t.title}
              onChange={() => {}}
              disabled
            />
            <div className="space-y-2">
              {t.urls.map((u, i) => (
                <input
                  key={i}
                  type="text"
                  placeholder="https://example.com"
                  className="w-full rounded-md border border-[rgb(var(--id-border))] bg-gray-50 px-2 py-1 text-xs"
                  value={u}
                  onChange={() => {}}
                  disabled
                />
              ))}
            </div>
          </div>
          {/* Add URL below the card, aligned right, with safe spacing */}
          <div className="mt-2 flex justify-end">
            <button
              className="rounded-lg border border-[rgb(var(--id-border))] bg-white px-3 py-1.5 text-xs shadow-sm hover:bg-gray-50"
              onClick={() => alert('+ Add URL (not wired yet)')}
            >
              + Add URL
            </button>
          </div>
        </div>
      ))}

      <button
        className="mb-4 rounded-lg border border-[rgb(var(--id-border))] bg-white px-3 py-1.5 text-xs shadow-sm hover:bg-gray-50"
        onClick={addTab}
      >
        + Add Tab
      </button>

      <hr className="my-3 border-[rgb(var(--id-border))]" />

      {/* Open behavior with more space */}
      <div className="mb-2 text-xs text-gray-600">Open behavior</div>
      <div className="mb-6 space-y-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" checked={openBehavior==='single'} onChange={()=>setOpenBehavior('single')} />
          <span>Single window</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={openBehavior==='tabgroup'} onChange={()=>setOpenBehavior('tabgroup')} />
          <span>Per tab group</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={openBehavior==='perurl'} onChange={()=>setOpenBehavior('perurl')} />
          <span>Per URL</span>
        </label>
      </div>

      {/* Footer buttons (disabled until Step 5B) */}
      <div className="mt-2 flex items-center gap-2 pb-4">
        <button
          className="rounded-md border border-[rgb(var(--id-border))] bg-gray-100 px-3 py-1.5 text-xs text-gray-400"
          disabled
          title="Will be enabled when wired to state in Step 5A/5B"
        >
          Assign to Selection
        </button>
        <button className="rounded-md border border-[rgb(var(--id-border))] bg-gray-100 px-3 py-1.5 text-xs text-gray-400" disabled>
          Save Draft
        </button>
        <button className="rounded-md border border-[rgb(var(--id-border))] bg-gray-100 px-3 py-1.5 text-xs text-gray-400" disabled>
          Clear Draft
        </button>
      </div>
    </div>
  )
}
