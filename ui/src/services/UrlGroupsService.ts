// Persistence for "URL groups" — named bundles of (browser + URL list) that
// the user configures via the Apps → URLs builder and then assigns to grid
// cells like a regular app. When applied, each URL group spawns one browser
// window with its URLs loaded as tabs.
import { safeGet, safeSet } from "./storage";

export type UrlGroup = {
  id: string;
  name: string;        // user-chosen label, e.g. "Research"
  browser: string;     // catalog id: "Chrome" | "Edge" | "Firefox" | "Brave"
  urls: string[];      // browser tabs to open in the new window
  createdAt: number;
};

const KEY = "insta.urlgroups.v1";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    // @ts-ignore
    return crypto.randomUUID();
  }
  return "ug_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function load(): UrlGroup[] {
  return safeGet<UrlGroup[]>(KEY, []);
}
function save(list: UrlGroup[]) {
  safeSet(KEY, list);
}

/** Newest-first list. */
export function listUrlGroups(): UrlGroup[] {
  return [...load()].sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Add a URL group. De-dupes by NAME ALONE; updates the URLs *and the browser* if
 * that name already exists.
 *
 * F-1, fixed 2026-08-27. This used to de-dupe on (name, browser) while
 * `findUrlGroupByName` — which resolves a grid assignment when a Layout is
 * applied — matched on name alone. Two keys for one identity, and the
 * consequences were MEASURED, not guessed:
 *
 *   - Saving "Dashboards" on Edge when "Dashboards"/Chrome existed did not
 *     de-dupe, so two records shared one name.
 *   - The lookup then returned the FIRST in insertion order — the record the user
 *     had just replaced. The app launched the browser they thought they had
 *     changed away from ("expected 'Chrome' to be 'Edge'").
 *   - The other record became unreachable: listed in App History, launchable by
 *     nothing.
 *
 * The NAME is made the single key, rather than teaching the lookup about
 * browsers, because a stored assignment carries only the group's name
 * (layoutBuilder.resolveAppTarget is handed an app-name string). The name is
 * therefore already the identity in the saved data; the de-dupe was the half that
 * disagreed. Making the lookup browser-aware would instead require every stored
 * assignment to start carrying a browser — a data migration, for no gain.
 *
 * Consequence worth stating plainly: re-saving a name now REPLACES that group even
 * when the browser differs. That is the point — it turns changing a group's
 * browser into an edit instead of a shadow — but it is destructive, so the caller
 * must tell the user it updated rather than created.
 */
export function addUrlGroup(input: { name: string; browser: string; urls: string[] }): UrlGroup {
  const name = input.name.trim();
  const browser = input.browser.trim();
  const urls = input.urls.map(u => u.trim()).filter(Boolean);
  if (!name || !browser) throw new Error("URL group needs both a name and a browser.");
  if (urls.length === 0) throw new Error("URL group needs at least one URL.");

  const list = load();
  const existing = list.find(g => g.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.urls = urls;
    existing.browser = browser;
    existing.createdAt = Date.now();
    save(list);
    return existing;
  }
  const item: UrlGroup = { id: uuid(), name, browser, urls, createdAt: Date.now() };
  list.push(item);
  save(list);
  return item;
}

/**
 * Edit an existing group, addressed by ID. Returns the updated record, or `null`
 * if no group carries that id.
 *
 * By id and never by name, deliberately. `addUrlGroup` keys on the name, which is
 * right for a SAVE from the builder — but an edit is a different act: it means
 * "change THIS record", not "change whatever currently answers to this name".
 * Routing an edit through the name would silently create a new group the moment
 * the name in the builder drifted, which is F-1 arriving through a second door.
 *
 * `name` is intentionally not updatable. Saved Layouts reference a group by name
 * (F-2), so renaming is a cascade across stored data and is out of scope by
 * invariant U-3 — the caller must keep the name field read-only while editing.
 * `browser` IS updatable: the builder shows a browser picker, so ignoring a change
 * the user can watch themselves make would be a fresh lie, and it is safe now that
 * one name means one group.
 *
 * `createdAt` is preserved, so an edit does not reshuffle App History under the
 * user while they are working in it.
 */
export function updateUrlGroup(
  id: string,
  patch: { urls: string[]; browser?: string },
): UrlGroup | null {
  // Validate before touching storage, and validate the SAME way addUrlGroup does.
  // Two doors into one store must not disagree about what is valid, or the rule
  // one of them enforces is a single edit away from being void.
  const urls = patch.urls.map(u => u.trim()).filter(Boolean);
  if (urls.length === 0) throw new Error("URL group needs at least one URL.");

  const list = load();
  const existing = list.find(g => g.id === id);
  if (!existing) return null;

  existing.urls = urls;
  if (patch.browser !== undefined) {
    const browser = patch.browser.trim();
    if (!browser) throw new Error("URL group needs both a name and a browser.");
    existing.browser = browser;
  }
  save(list);
  return existing;
}

/**
 * One editable row in the URL Builder.
 *
 * Named `UrlGroupDraftRow` rather than the obvious `UrlGroup` on purpose: state/AppState
 * already exports a DIFFERENT type called `UrlGroup` (`{ id, title, urls }`, a builder
 * draft row) alongside this module's `UrlGroup` (`{ id, name, browser, urls, createdAt }`,
 * a saved record). One name, two meanings, resolved only by which file you happen to be
 * importing from — recorded as D-2 in the work plan. Adding a third thing called
 * `UrlGroup` would have made that worse; this name says which side it belongs to.
 */
export type UrlGroupDraftRow = { id: string; title: string; urls: string[] };

/** The URL Builder's editable shape for a single saved group. */
export type UrlGroupDraft = { browser: string; tabGroups: UrlGroupDraftRow[] };

/**
 * Project a saved group into the builder's editable shape, so it can be opened
 * for editing instead of retyped from memory.
 *
 * The mapping is deliberately faithful — no padding with blank rows, no
 * normalising, no reordering. `saved -> draft -> saved` must be the identity on
 * the URL list, because otherwise opening a group and saving it *unchanged* would
 * quietly alter the user's data: a way to lose configuration while appearing to
 * do nothing, which is the very complaint this work answers (invariant U-1).
 *
 * The row carries the saved group's `id`, so the save path knows WHICH record to
 * update and never has to match on the name — the second door onto the
 * shadow-group defect.
 */
export function groupToDraft(g: UrlGroup): UrlGroupDraft {
  return {
    browser: g.browser,
    tabGroups: [{ id: g.id, title: g.name, urls: [...g.urls] }],
  };
}

export function removeUrlGroup(id: string): void {
  save(load().filter(g => g.id !== id));
}

export function clearUrlGroups(): void {
  save([]);
}

/** Look up a URL group by its display name (case-insensitive). Used by
 *  layoutBuilder.resolveAppTarget when an assignment's title matches a URL
 *  group instead of a plain app catalog entry.
 *
 *  Returns the MOST RECENTLY SAVED match, not the first in insertion order.
 *
 *  After the F-1 fix above, `addUrlGroup` can no longer create two groups sharing
 *  a name — but storage written by an earlier build still can, and those records
 *  are the user's, so they are not deleted behind their back (invariant U-1).
 *  Insertion order is not deterministic in any sense a user could predict; "the
 *  one I saved last" is. This makes legacy data resolve the same way every time,
 *  and the way the user would expect. */
export function findUrlGroupByName(name: string): UrlGroup | null {
  const lc = name.toLowerCase();
  const matches = load().filter(g => g.name.toLowerCase() === lc);
  if (matches.length === 0) return null;
  return matches.reduce((newest, g) => (g.createdAt > newest.createdAt ? g : newest));
}
