// DEV-ONLY mirror of the walkthrough's telemetry.
//
// Telemetry is INERT in development: track() only emits when build-time keys are
// present, and there are none in a dev or Sandbox run. So "the events fire in the
// right order" is unverifiable by observation — it could only be assumed.
//
// This mirrors every emitted event into a small ring buffer that the DEV panel
// renders, so the ordering can actually be SEEN. It is fed from the single emit()
// helper in TourProvider, so the mirror cannot drift from what is really sent.
//
// Compiled out of production: every write is behind import.meta.env.DEV.
export type TourEvent = { at: number; event: string; props: Record<string, unknown> }

const MAX = 12
let log: TourEvent[] = []
const listeners = new Set<() => void>()

export function noteTourEvent(event: string, props: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return
  log = [...log.slice(-(MAX - 1)), { at: Date.now(), event, props }]
  listeners.forEach((f) => f())
}

export function readTourEvents(): readonly TourEvent[] {
  return log
}

export function clearTourEvents(): void {
  log = []
  listeners.forEach((f) => f())
}

export function subscribeTourEvents(f: () => void): () => void {
  listeners.add(f)
  return () => listeners.delete(f)
}
