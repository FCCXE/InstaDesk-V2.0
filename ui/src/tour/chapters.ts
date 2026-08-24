// Walkthrough chapter content.
//
// ENGLISH ONLY, deliberately (plan I-10/I-11). The prose lives here as plain
// strings rather than i18n keys until the wording is settled, for one reason:
// the parity gate verifies that a key EXISTS in both locales, not that it has
// been translated. Adding keys now would mean putting English text into es.json
// to keep the gate green — which is precisely the "a Spanish user silently sees
// English" failure the gate exists to prevent, committed on purpose.
//
// I-13 extracts these strings to i18n keys and adds the Spanish in one pass, so
// the gate never sees a fake translation.
//
// Every `anchor` below is verified at BUILD time against anchors.json by
// scripts/check-tour-anchors.mjs. A step naming an anchor nobody registered
// fails the build; the engine's runtime report is the safety net, not the gate.
import type { TourChapter } from './types'

/**
 * The spine — the one sequence that matters.
 *
 * Everything else in InstaDesk is optional; this is the core loop, and nothing
 * else is worth learning until it lands: choose a screen, decide how finely to
 * divide it, pick a region, put an app in it, save that as a Layout, and see
 * what applying it does.
 *
 * The last step cannot be performed — applying a Layout launches programs and
 * rearranges every window on the user's desktop (axis 1, forbidden). It is
 * shown with the schematic instead (REQ-2).
 */
export const SPINE: TourChapter = {
  id: 'spine',
  title: 'First 90 seconds',
  steps: [
    {
      anchor: 'monitor-select',
      title: 'Start by choosing a screen',
      body:
        'InstaDesk arranges one monitor at a time. Pick the screen you want to lay out here — ' +
        'everything below applies to whichever one is selected.',
    },
    {
      anchor: 'grid-size-picker',
      title: 'Decide how finely to divide it',
      body:
        'This splits the chosen screen into a grid. A 2x2 gives you four big regions; a 6x6 lets you ' +
        'place things precisely. You can change it per monitor, at any time.',
    },
    {
      anchor: 'workspace-grid',
      title: 'Pick the region an app should fill',
      body:
        'This is your chosen screen, drawn as that grid. Drag across cells to select a region — ' +
        'one cell for a narrow panel, a block of them for a wide window.',
    },
    {
      anchor: 'assign-buttons',
      title: 'Put an app in the region',
      body:
        'With a region selected, choose an app from the list and press Assign to Selection. ' +
        'That is the whole idea: this app, that space, on this screen.',
    },
    {
      anchor: 'layout-new-button',
      title: 'Save the arrangement as a Layout',
      body:
        'Once the grid holds the apps you want, save it. A Layout remembers every app and the exact ' +
        'region it belongs in, across all your monitors.',
    },
    {
      anchor: 'qp-apply-button',
      title: 'And this is what it buys you',
      body:
        'Press Apply and every app in the Layout opens and lands in its saved region, across every ' +
        'screen, in one click. That is the point of all of the above.',
      schematic: 'apply',
    },
  ],
}

/** Every chapter the app can run. I-11 adds the topic chapters. */
export const CHAPTERS: readonly TourChapter[] = [SPINE]
