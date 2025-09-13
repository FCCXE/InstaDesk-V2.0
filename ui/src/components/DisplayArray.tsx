import React from 'react'
import { useAppState } from '../state/AppState'

/**
 * DisplayArray
 * - Compact, Windows-like display arrangement
 * - Fits inside a card without altering surrounding layout
 * - Width 100%, fixed compact height via viewBox scaling
 */
export default function DisplayArray() {
  const { monitors, currentMonitorId, setCurrentMonitor } = useAppState()

  // SVG viewBox space (normalized to match SAMPLE_MONITORS coords)
  const VBW = 1000
  const VBH = 360

  return (
    <div className="mt-3 rounded-xl border border-[rgb(var(--id-border))] bg-white p-3 shadow-sm">
      <div className="mb-2 text-[12px] font-semibold text-gray-700">Display Array</div>
      <div className="w-full">
        <svg
          viewBox={`0 0 ${VBW} ${VBH}`}
          className="h-[140px] w-full"
          role="img"
          aria-label="Display arrangement"
        >
          <rect x="0" y="0" width={VBW} height={VBH} fill="rgb(246,247,249)" />
          {monitors.map((m, idx) => {
            const isCurrent = m.id === currentMonitorId
            const isActive = m.active
            const fill = isCurrent ? '#0A84FF' : '#DDE1E6'
            const stroke = '#4A4A4A'
            const textFill = isCurrent ? '#FFFFFF' : '#333333'
            const number = labelFromName(m.name, idx)

            return (
              <g key={m.id}>
                <rect
                  x={m.x}
                  y={m.y}
                  width={m.w}
                  height={m.h}
                  rx={10}
                  ry={10}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={2.5}
                  opacity={isActive ? 1 : 0.5}
                />
                <text
                  x={m.x + m.w / 2}
                  y={m.y + m.h / 2 + 4}
                  textAnchor="middle"
                  fontSize={Math.min(m.w, m.h) * 0.5}
                  fill={textFill}
                  style={{ fontWeight: 500 }}
                >
                  {number}
                </text>
                <rect
                  x={m.x}
                  y={m.y}
                  width={m.w}
                  height={m.h}
                  rx={10}
                  ry={10}
                  fill="transparent"
                  onClick={() => setCurrentMonitor(m.id)}
                  className="cursor-pointer"
                />
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

function labelFromName(name: string, fallbackIdx: number) {
  // If the name ends with a number, use it; else fallback to index+1
  const match = name.match(/(\d+)\s*$/)
  return match ? match[1] : String(fallbackIdx + 1)
}
