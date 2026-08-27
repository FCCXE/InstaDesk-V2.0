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
