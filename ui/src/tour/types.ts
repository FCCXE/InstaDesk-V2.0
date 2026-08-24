// Walkthrough step + chapter types.
import type { AnchorSpec } from './anchors'

export type TourStep = {
  /** Anchor id from the registry. Must be registered — the engine treats an
   *  unregistered id as a defect, never as "not here yet". */
  anchor: string
  title: string
  body: string
}

export type TourChapter = {
  id: string
  title: string
  steps: readonly TourStep[]
}

export type Rect = { x: number; y: number; w: number; h: number }

/**
 * The result of trying to locate a step's anchor.
 *
 * This union is the whole reason the registry exists. `querySelector` returning
 * null is ambiguous, and a walkthrough that collapses the causes into one
 * "not found" takes the reassuring reading and narrates an empty rectangle
 * while every gate stays green (finding F-4, reproduced live in the I-3 spike).
 *
 * Each case below has a DIFFERENT remedy, so each is represented separately:
 */
export type AnchorResolution =
  /** Found, on screen, measured. */
  | { kind: 'ready'; el: Element; rect: Rect }
  /** The step names an anchor that is not in the registry at all. A DEFECT in
   *  the step, not a timing problem. Never wait on this. */
  | { kind: 'unregistered'; anchor: string }
  /** Registered, absent from the DOM, and its owning pane is not open. The
   *  remedy is to navigate there — supplied by I-7 once tab state is lifted. */
  | { kind: 'needs-navigation'; spec: AnchorSpec }
  /** Present but its centre is momentarily outside the viewport — happens
   *  mid-resize. Measured in the I-3 spike (2 occurrences in 698 samples, both
   *  with centre-y beyond viewport height). Retry; do NOT report it as lost. */
  | { kind: 'transient'; spec: AnchorSpec }
  /** Registered, reachable in the current state, and still absent after the
   *  grace period. A genuine defect: the anchor was renamed or deleted. */
  | { kind: 'lost'; spec: AnchorSpec }
