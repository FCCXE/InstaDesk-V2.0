import React, { useMemo, useState } from 'react'
import { useAppState, APPS } from '../state/AppState'

type MiniTab = 'Favorites' | 'Apps' | 'URLs'
type AppKey = string

// Simple mapping just for labels/colors; visuals only
const APP_NAMES: Record<AppKey, string> = Object.values(APPS).reduce((acc, a: any) => {
  acc[a.id] = a.name
  return acc
}, {} as Record<string, string>)

/** -------------------- Main Right Pane -------------------- */
export default function RightPane() {
  const [miniTab, setMiniTab] = useState<MiniTab>('Apps')

  return (
    <aside className="
      h-full flex flex-col overflow-hidden
      rounded-2xl border border-[rgb(var(--id-border))]
      bg-[rgb(var(--id-surface))] shadow-[var(--id-shadow)]
    ">
      {/* Top (primary) tabs – visuals only */}
      <div className="flex items-center gap-6 border-b border-[rgb(var(--id-border))] px-6 pt-2">
        <div className="py-2 text-sm font-medium text-gray-900 border-b-2 border-blue-500">Apps</div>
        <div className="py-2 text-sm text-gray-500">Layouts</div>
        <div className="py-2 text-sm text-gray-500">Settings</div>
        <div className="py-2 text-sm text-gray-500">Help</div>
      </div>

      {/* Scroll body */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-6 pb-6">
        {/* Mini tabs */}
        <div className="mt-3 mb-3 flex items-center gap-2 text-xs">
          {(['Favorites', 'Apps', 'URLs'] as const).map((t) => {
            const active = miniTab === t
            return (
              <button
                key={t}
                onClick={() => setMiniTab(t)}
                className={[
                  'rounded-full px-3 py-1 border',
                  active
                    ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                    : 'border-[rgb(var(--id-border))] bg-white text-gray-600 hover:bg-gray-50',
                ].join(' ')}
              >
                {t}
              </button>
            )
          })}
        </div>

        {miniTab === 'Favorites' && <FavoritesVisual />}
        {miniTab === 'Apps' && <AppsVisual />}
        {miniTab === 'URLs' && <UrlsBuilderVisual />}
      </div>
    </aside>
  )
}

/** -------------------- Apps (History) Visuals -------------------- */
function AppsVisual() {
  const { selection } = useAppState()

  const selectionCount =
    (selection as any)?.count ??
    (selection as any)?.size ??
    (Array.isArray((selection as any)?.cells) ? (selection as any).cells.length : 0)

  const [query, setQuery] = useState('')
  const [selectedAppId, setSelectedAppId] = useState<AppKey | null>(null)

  const rows = useMemo(() => {
    const all = Object.values(APPS) as any[]
    const q = query.trim().toLowerCase()
    return q ? all.filter((a) => a.name.toLowerCase().includes(q)) : all
  }, [query])

  const assignDisabled = selectionCount === 0 || !selectedAppId
  const unassignDisabled = selectionCount === 0

  return (
    <div className="pb-2">
      {/* Search */}
      <div className="mb-3">
        <input
          type="text"
          placeholder="Search applications …"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-lg border border-[rgb(var(--id-border))] bg-white px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      {/* Selection row (compact buttons) */}
      <div className="mb-2 grid grid-cols-[1fr_auto] items-center gap-3">
        <div className="min-w-0 truncate text-[11px] text-[rgb(var(--id-text-muted))]">
          Selection:&nbsp;{selectionCount > 0 ? <strong>{selectionCount}</strong> : 'none'}
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <MiniBtn
            label="Assign to Selection"
            primary
            disabled={assignDisabled}
            onClick={() => {}}
          />
          <MiniBtn
            label="Unassign Selection"
            disabled={unassignDisabled}
            onClick={() => {}}
          />
        </div>
      </div>

      <div className="mb-1.5 text-[11px] text-[rgb(var(--id-text-muted))]">
        Select cells and Pick an app to enable Assign
      </div>
      <div className="mb-3 w-full rounded-lg border border-[rgb(var(--id-border))] bg-[rgb(var(--id-surface))] px-3 py-1.5 text-sm opacity-70" />

      {/* App History */}
      <div className="mb-2 text-[13px] text-gray-500">App History:</div>

      <div className="space-y-3">
        {rows.map((app: any) => {
          const focused = selectedAppId === app.id
          return (
            <button
              key={app.id}
              onClick={() => setSelectedAppId(app.id)}
              className={[
                'w-full rounded-xl border px-3 py-3 text-left shadow-sm transition',
                focused
                  ? 'border-blue-400 bg-white ring-2 ring-blue-400 ring-offset-2'
                  : 'border-[rgb(var(--id-border))] bg-white hover:bg-gray-50',
              ].join(' ')}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-block size-2 rounded-full" style={{ backgroundColor: app.color || '#9ca3af' }} />
                  <span className="text-[14px] text-gray-900">{app.name}</span>
                </div>
                {/* Category removed intentionally in Favorites; kept here is fine, but you can remove if desired */}
                <span className="text-[12px] text-gray-500">{app.category || app.tag || ''}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** -------------------- Favorites Visuals (APPROVED) -------------------- */
function FavoritesVisual() {
  const { selection } = useAppState()

  const selectionCount =
    (selection as any)?.count ??
    (selection as any)?.size ??
    (Array.isArray((selection as any)?.cells) ? (selection as any).cells.length : 0)

  const [query, setQuery] = useState('')

  // Local visual-only favorites list
  const defaultFavs: AppKey[] = ['outlook', 'chrome', 'vscode', 'notepad', 'github']
  const [favorites, setFavorites] = useState<AppKey[]>(defaultFavs)
  const [isEditing, setIsEditing] = useState(false)

  const filteredFavs = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return favorites
    return favorites.filter((id) => APP_NAMES[id]?.toLowerCase().includes(q))
  }, [favorites, query])

  return (
    <div className="pb-2">
      {/* Search */}
      <div className="mb-3">
        <input
          type="text"
          placeholder="Search applications …"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-lg border border-[rgb(var(--id-border))] bg-white px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      {/* Selection row (compact buttons) */}
      <div className="mb-2 grid grid-cols-[1fr_auto] items-center gap-3">
        <div className="min-w-0 truncate text-[11px] text-[rgb(var(--id-text-muted))]">
          Selection:&nbsp;{selectionCount > 0 ? <strong>{selectionCount}</strong> : 'none'}
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <MiniBtn label="Assign to Selection" primary disabled onClick={() => {}} />
          <MiniBtn label="Unassign Selection" disabled onClick={() => {}} />
        </div>
      </div>

      <div className="mb-1.5 text-[11px] text-[rgb(var(--id-text-muted))]">
        Select cells and Pick an app to enable Assign
      </div>

      {/* Favorites header + actions */}
      <div className="mt-6 mb-6 flex items-center justify-between">
        <div className="text-[13px] text-gray-500">Favorites</div>
        <div className="flex items-center gap-2">
          <GhostBtn label="Edit" onClick={() => setIsEditing((v) => !v)} />
          <GhostBtn label="+ Add Favorite" onClick={() => { /* open picker (visual) */ }} />
        </div>
      </div>

      {/* Favorites list */}
      <div className="space-y-3">
        {filteredFavs.map((id) => (
          <FavoriteCard
            key={id}
            name={APP_NAMES[id] || id}
            isEditing={isEditing}
            onRemove={() => setFavorites((arr) => arr.filter((x) => x !== id))}
          />
        ))}
      </div>

      {/* Add Custom at bottom */}
      <button
        className="mt-3 w-full rounded-xl border border-[rgb(var(--id-border))] bg-white px-3 py-3 text-center text-[13px] font-medium text-blue-600 shadow-sm hover:bg-blue-50"
        onClick={() => { /* open custom builder (visual) */ }}
      >
        + Add Custom App/URL
      </button>
    </div>
  )
}

function FavoriteCard({
  name,
  isEditing,
  onRemove,
}: {
  name: string
  isEditing: boolean
  onRemove: () => void
}) {
  return (
    <div className="w-full rounded-xl border border-[rgb(var(--id-border))] bg-white px-3 py-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Filled star */}
          <svg width="18" height="18" viewBox="0 0 24 24" className="text-yellow-400">
            <path fill="currentColor" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
          </svg>
          {/* App logo */}
          <AppLogo name={name} />
          <div className="text-[14px] text-gray-900 font-medium">{name}</div>
        </div>

        {/* Trash (only in Edit mode) */}
        {isEditing ? (
          <button
            className="rounded-md border border-[rgb(var(--id-border))] bg-white px-2 py-2 hover:bg-red-50"
            onClick={onRemove}
            aria-label={`Remove ${name} from favorites`}
            title="Remove"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" className="text-red-500">
              <path fill="currentColor" d="M9 3h6l1 1h4v2H4V4h4l1-1zm2 7h2v8h-2v-8zM7 10h2v8H7v-8zm8 0h2v8h-2v-8z"/>
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** Simple SVG-ish logos (approximate, no external assets) */
function AppLogo({ name }: { name: string }) {
  const n = name.toLowerCase()
  const box = 'inline-flex items-center justify-center w-7 h-7 rounded-md border border-[rgb(var(--id-border))] bg-white'
  if (n.includes('chrome')) {
    return (
      <div className={box} title="Chrome">
        <div className="relative w-5 h-5">
          <span className="absolute inset-0 rounded-full bg-red-500" />
          <span className="absolute inset-0" style={{ clipPath: 'polygon(50% 50%, 100% 0, 100% 100%)', background: '#f4b400' }} />
          <span className="absolute inset-0" style={{ clipPath: 'polygon(0 100%, 0 0, 50% 50%)', background: '#0f9d58' }} />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-blue-500 border border-white" />
        </div>
      </div>
    )
  }
  if (n.includes('outlook')) {
    return (
      <div className={box} title="Outlook">
        <div className="w-5 h-5 rounded-sm bg-blue-600 relative">
          <div className="absolute left-1.5 top-1 w-2.5 h-3 bg-white text-blue-600 text-[10px] font-bold flex items-center justify-center">O</div>
        </div>
      </div>
    )
  }
  if (n.includes('vs code')) {
    return (
      <div className={box} title="VS Code">
        <div className="w-5 h-5 rounded-sm bg-sky-600 relative">
          <svg viewBox="0 0 24 24" className="absolute inset-0 m-auto w-4 h-4 text-white">
            <path fill="currentColor" d="M20 4v16l-7-3-7 3V7l7-3 7 3z"/>
          </svg>
        </div>
      </div>
    )
  }
  if (n.includes('notepad')) {
    return (
      <div className={box} title="Notepad">
        <div className="w-5 h-5 rounded-sm bg-white border border-gray-300 relative">
          <div className="absolute left-1 right-1 top-1 h-0.5 bg-blue-500" />
          <div className="absolute left-1 right-1 top-2 h-0.5 bg-gray-300" />
          <div className="absolute left-1 right-1 top-3 h-0.5 bg-gray-300" />
        </div>
      </div>
    )
  }
  if (n.includes('github')) {
    return (
      <div className={box} title="GitHub">
        <div className="w-5 h-5 rounded-full bg-black text-white text-[9px] font-bold flex items-center justify-center">GH</div>
      </div>
    )
  }
  return (
    <div className={box} title={name}>
      <div className="w-5 h-5 rounded-sm bg-gray-100 text-[10px] text-gray-500 flex items-center justify-center">
        {name.slice(0,2).toUpperCase()}
      </div>
    </div>
  )
}

/** Reusable compact buttons */
function MiniBtn({ label, primary, disabled, onClick }: { label: string; primary?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      disabled={!!disabled}
      onClick={onClick}
      className={[
        'inline-flex min-w-0 items-center justify-center rounded-md border shadow-sm text-[11px] !h-7 !px-2 !w-auto whitespace-nowrap',
        disabled
          ? 'border-[rgb(var(--id-border))] bg-gray-100 text-gray-400 cursor-not-allowed'
          : primary
            ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
      ].join(' ')}
      style={{ height: 28, padding: '0 8px', width: 'auto' }}
    >
      {label}
    </button>
  )
}
/** Ghost button (header actions) */
function GhostBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md border border-[rgb(var(--id-border))] bg-white px-3 py-1.5 text-[11px] text-blue-600 shadow-sm hover:bg-blue-50"
    >
      {label}
    </button>
  )
}

/** -------------------- URLs builder (visual only) -------------------- */
function UrlsBuilderVisual() {
  const [browser, setBrowser] = useState('Chrome')
  const [tabs, setTabs] = useState(
    Array.from({ length: 2 }, () => ({ title: '', urls: ['', '', ''] }))
  )

  return (
    <div className="pb-6">
      <h3 className="mb-2 text-sm font-medium text-gray-900">URL Builder</h3>

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
              readOnly
            />
            <div className="space-y-2">
              {t.urls.map((_, i) => (
                <input
                  key={i}
                  type="text"
                  placeholder="https://example.com"
                  className="w-full rounded-md border border-[rgb(var(--id-border))] bg-gray-50 px-2 py-1 text-xs"
                  readOnly
                />
              ))}
            </div>
          </div>
          <div className="mt-2 flex justify-end">
            <button className="rounded-lg border border-[rgb(var(--id-border))] bg-white px-3 py-1.5 text-xs shadow-sm hover:bg-gray-50">
              + Add URL
            </button>
          </div>
        </div>
      ))}

      <button
        className="mb-4 rounded-lg border border-[rgb(var(--id-border))] bg-white px-3 py-1.5 text-xs shadow-sm hover:bg-gray-50"
        onClick={() => setTabs([...tabs, { title: '', urls: ['', '', ''] }])}
      >
        + Add Tab
      </button>

      <hr className="my-3 border-[rgb(var(--id-border))]" />

      {/* Footer (disabled; visuals only) */}
      <div className="mt-2 flex items-center gap-2 pb-4">
        <button className="rounded-md border border-[rgb(var(--id-border))] bg-gray-100 px-3 py-1.5 text-xs text-gray-400" disabled>
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
