// Walkthrough step + chapter types.
import type { AnchorSpec } from './anchors'
import type { SchematicAction } from './SchematicAction'

/**
 * A step carries NO PROSE. Its words live in the locale files, resolved by
 * convention from the chapter id and the anchor id (I-13):
 *   tour.chapters.<chapterId>.steps.<anchor>.title | .body
 *
 * Keeping the text out of here is what puts it inside the parity gate's reach.
 * While it lived in chapters.ts the gate could not see it, and a Spanish user
 * would have read English chapters surrounded by translated buttons with
 * nothing reporting it.
 */
export type TourStep = {
  /** Anchor id from the registry. Must be registered — the engine treats an
   *  unregistered id as a defect, never as "not here yet". Also the key segment
   *  its text resolves under, so it must be unique within its chapter. */
  anchor: string
  /** Show what a WALLED-OFF action would do, without performing it (REQ-2).
   *  The four actions on axis 1 take effect outside the app window, so a live
   *  tour can only describe them; this draws them instead. */
  schematic?: SchematicAction
}

export type TourGroup = 'essentials' | 'building' | 'daily' | 'trouble'

export type TourChapter = {
  /** Also the i18n key segment: tour.chapters.<id>.title */
  id: string
  /** Heading this chapter sits under in the chooser. A HEADING, not a submenu:
   *  every chapter stays visible and one click away. This app's characteristic
   *  defect is things sitting one layer deeper than people look, and the tour is
   *  the surface meant to cure that — so it must not acquire a layer of its own. */
  group: TourGroup
  steps: readonly TourStep[]
}

/** The one place the key shape is written down, so engine and gate agree. */
export const chapterTitleKey = (chapterId: string) => `tour.chapters.${chapterId}.title`
export const stepTitleKey = (chapterId: string, anchor: string) =>
  `tour.chapters.${chapterId}.steps.${anchor}.title`
export const stepBodyKey = (chapterId: string, anchor: string) =>
  `tour.chapters.${chapterId}.steps.${anchor}.body`

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
  /**
   * Present, but its centre is not currently inside the viewport.
   *
   * TWO CAUSES, and conflating them deadlocks the tour:
   *  - mid-resize, the centre leaves the viewport for a frame or two (measured
   *    in the I-3 spike: 2 of 698 samples). That is self-correcting — retry.
   *  - the anchor is simply SCROLLED OUT OF VIEW. That is NOT self-correcting;
   *    it needs an action. The engine previously only scrolled an anchor into
   *    view once it had already resolved, so an off-screen anchor could never
   *    resolve and the step sat on "Locating…" forever.
   *
   * `el` is carried so the remedy — scrolling it into view — is available.
   */
  | { kind: 'transient'; spec: AnchorSpec; el?: Element }
  /** Registered, reachable in the current state, and still absent after the
   *  grace period. A genuine defect: the anchor was renamed or deleted. */
  | { kind: 'lost'; spec: AnchorSpec }
