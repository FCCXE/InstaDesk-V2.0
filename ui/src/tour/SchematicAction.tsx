// REQ-2 — the schematic animation for the four WALLED-OFF actions.
//
// D-1 forbids the walkthrough from performing Apply, Snap, Minimize all and
// Close all. All four take effect OUTSIDE the app window, across the user's
// physical monitors — which makes them the product's actual payoff and exactly
// the part a live tour cannot demonstrate. This shows them instead.
//
// D-11 ruled: code-drawn, not video. A recorded clip cannot be diffed, linted
// or type-checked, so it goes stale silently the first time a control is
// restyled; this follows a restyle automatically, weighs kilobytes rather than
// megabytes, and needs no rig to re-record.
//
// The visual vocabulary is deliberately BORROWED from LayoutPreviewOverlay —
// monitor boxes, grid lines from cols/rows, sky-200 tiles with a sky-600 stroke
// — because users already meet that picture via "Show content" on every Layout
// card. Reusing it means the animation explains itself; inventing a second
// diagram of the same thing would not.
//
// No api import, by construction: this file draws, it never acts.
import { useEffect, useState } from 'react'

export type SchematicAction = 'apply' | 'snap' | 'minimize-all' | 'close-all'

/* Two monitors, sized in viewBox units. M1 is the wide primary. */
const VB_W = 1000
const VB_H = 380
const MON = [
  { x: 40, y: 40, w: 560, h: 290, cols: 3, rows: 2, label: 'M1' },
  { x: 640, y: 70, w: 320, h: 230, cols: 2, rows: 2, label: 'M2' },
]

type Tile = { id: string; mon: number; col: number; row: number; span?: number }

/* Where the windows END UP. Deliberately few and large enough to read at the
 * card's real width (~310 px) rather than an idealised full-screen mock. */
const TILES: Tile[] = [
  { id: 'a', mon: 0, col: 0, row: 0, span: 2 },
  { id: 'b', mon: 0, col: 2, row: 0 },
  { id: 'c', mon: 0, col: 0, row: 1 },
  { id: 'd', mon: 1, col: 0, row: 0, span: 2 },
]

function cellRect(t: Tile) {
  const m = MON[t.mon]
  const cw = m.w / m.cols
  const ch = m.h / m.rows
  return {
    x: m.x + t.col * cw + 5,
    y: m.y + t.row * ch + 5,
    w: cw * (t.span ?? 1) - 10,
    h: ch - 10,
  }
}

/** Start-of-animation placement per action. The tour is showing what WOULD
 *  happen, so each action animates from its own "before". */
function startTransform(action: SchematicAction, i: number): string {
  switch (action) {
    case 'apply':
      // Windows scattered before a Layout gathers them.
      return `translate(${[70, -40, 30, -60][i]}, ${[60, 90, -30, 40][i]}) scale(0.82)`
    case 'snap':
      // Only one window moves; the rest are already placed.
      return i === 1 ? 'translate(120, 70) scale(0.8)' : 'translate(0,0) scale(1)'
    case 'minimize-all':
    case 'close-all':
      return 'translate(0,0) scale(1)'
  }
}

function endTransform(action: SchematicAction, i: number): string {
  switch (action) {
    case 'apply':
    case 'snap':
      return 'translate(0,0) scale(1)'
    case 'minimize-all':
      // Collapse toward the foot of the monitor they live on.
      return `translate(0, ${MON[TILES[i].mon].h * 0.42}) scale(1, 0.08)`
    case 'close-all':
      return 'translate(0,0) scale(0.72)'
  }
}

/**
 * Close-all fades its windows to nothing. That reads correctly while the loop is
 * running — they vanish and return — but it is the WRONG still frame: a user
 * with prefers-reduced-motion is shown the settled state deliberately, and a
 * diagram of two empty monitors looks like a picture that failed to load rather
 * than like "the windows were closed". So the static case keeps a ghost.
 */
const endOpacity = (action: SchematicAction, reduced: boolean) =>
  action === 'close-all' ? (reduced ? 0.16 : 0) : 1

/**
 * Which tile is the SUBJECT of the action.
 *
 * Without this, Apply and Snap settle into an identical picture and are
 * distinguishable only while moving — so a glance at a paused moment, or a user
 * with prefers-reduced-motion (who is shown the settled state deliberately),
 * sees one diagram for two different actions. Snap moves ONE window; Apply
 * moves them all. Marking the subject makes that legible without motion.
 */
const subjectOf = (action: SchematicAction): number | null => (action === 'snap' ? 1 : null)

export default function SchematicAction({ action }: { action: SchematicAction }) {
  const [on, setOn] = useState(false)
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (reduced) {
      setOn(true)
      return
    }
    setOn(false)
    // Loop: settle, hold, reset. Long enough to read, short enough not to nag.
    const kick = window.setTimeout(() => setOn(true), 350)
    const loop = window.setInterval(() => setOn((v) => !v), 2400)
    return () => {
      window.clearTimeout(kick)
      window.clearInterval(loop)
    }
  }, [action, reduced])

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      role="img"
      aria-label={`Diagram of what ${action.replace('-', ' ')} would do`}
      style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8, background: 'rgba(148,163,184,0.10)' }}
    >
      {MON.map((m) => (
        <g key={m.label}>
          <rect
            x={m.x} y={m.y} width={m.w} height={m.h} rx={10}
            fill="rgba(148,163,184,0.08)" stroke="#94a3b8" strokeWidth={2}
          />
          {/* Grid lines, same weight and colour as the Layout preview. */}
          {Array.from({ length: m.cols - 1 }, (_, i) => i + 1).map((i) => (
            <line key={`v${i}`} x1={m.x + (m.w * i) / m.cols} y1={m.y}
              x2={m.x + (m.w * i) / m.cols} y2={m.y + m.h} stroke="#e2e8f0" strokeWidth={1.5} strokeOpacity={0.35} />
          ))}
          {Array.from({ length: m.rows - 1 }, (_, i) => i + 1).map((i) => (
            <line key={`h${i}`} x1={m.x} y1={m.y + (m.h * i) / m.rows}
              x2={m.x + m.w} y2={m.y + (m.h * i) / m.rows} stroke="#e2e8f0" strokeWidth={1.5} strokeOpacity={0.35} />
          ))}
          <text x={m.x + 8} y={m.y - 10} fontSize={26} fill="#94a3b8"
            style={{ fontFamily: 'system-ui, sans-serif', fontWeight: 700 }}>{m.label}</text>
        </g>
      ))}

      {TILES.map((t, i) => {
        const r = cellRect(t)
        const cx = r.x + r.w / 2
        const cy = r.y + r.h / 2
        return (
          <g
            key={t.id}
            style={{
              // Transform about the tile's own centre so scaling collapses it in
              // place rather than dragging it toward the SVG origin.
              transformOrigin: `${cx}px ${cy}px`,
              transform: on ? endTransform(action, i) : startTransform(action, i),
              opacity: on ? endOpacity(action, reduced) : 1,
              transition: reduced ? 'none' : 'transform 900ms cubic-bezier(.22,.61,.36,1), opacity 700ms ease',
            }}
          >
            {(() => {
              const subject = subjectOf(action)
              const isSubject = subject === null || subject === i
              return (
                <rect
                  x={r.x} y={r.y} width={r.w} height={r.h} rx={7}
                  fill={isSubject ? '#bae6fd' : '#94a3b8'}
                  fillOpacity={isSubject ? 0.82 : 0.28}
                  stroke={isSubject ? '#0284c7' : '#64748b'}
                  strokeWidth={2}
                  strokeDasharray={isSubject ? undefined : '6 5'}
                />
              )
            })()}
          </g>
        )
      })}
    </svg>
  )
}
