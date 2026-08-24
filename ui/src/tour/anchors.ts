// Walkthrough anchor registry — typed access to anchors.json.
//
// The DATA lives in anchors.json so that the runtime (this module) and the
// build-time gate (scripts/check-tour-anchors.mjs) read the same file, with
// neither of them hand-parsing TypeScript.
//
// The gate enforces both directions on every build:
//   1. every registered anchor exists in the component the registry names;
//   2. every data-tour attribute in src/ is registered.
// One direction alone lets the two drift apart silently.
import registry from './anchors.json'

export type MainTab = 'Apps' | 'Layouts' | 'Settings' | 'Help'
export type AppsSubTab = 'URLs' | 'Apps' | 'Favorites'

/**
 * Where an anchor can be reached. This is the field that makes a null lookup
 * DIAGNOSABLE rather than ambiguous.
 *
 * querySelector returning null means one of two opposite things:
 *   - the owning pane is not open  -> navigate there, then re-measure
 *   - the anchor no longer exists  -> a defect; fail loudly, never narrate
 *
 * Without this declaration the engine cannot tell them apart, takes the
 * reassuring reading, and confidently explains an empty rectangle (F-4).
 */
export type ReachableWhen =
  | { kind: 'always' }
  | { kind: 'tab'; tab: MainTab }
  | { kind: 'tab+sub'; tab: 'Apps'; sub: AppsSubTab }

export type AnchorSpec = {
  /** The data-tour value. Unique across the whole app. */
  id: string
  /** Repo-relative path of the component that owns it, from ui/. */
  component: string
  /** What it points at, in plain words — for whoever authors the step. */
  describes: string
  /** The UI state in which it is expected to be in the DOM. */
  reachableWhen: ReachableWhen
}

export const TOUR_ANCHORS: readonly AnchorSpec[] = (registry.anchors ?? []) as AnchorSpec[]

/** Look up an anchor's declaration. undefined means it is not registered at
 *  all — itself the signal that a step names a bogus anchor. */
export function anchorSpec(id: string): AnchorSpec | undefined {
  return TOUR_ANCHORS.find((a) => a.id === id)
}

/** The CSS selector for an anchor id. One place, so the attribute name can
 *  never drift between the engine and the gate. */
export function anchorSelector(id: string): string {
  return `[data-tour="${id}"]`
}
