// C:\FcXe Studios\Instadesk\instadesk-tauri\ui\src\services\HiddenAppsService.ts
//
// Persistent set of catalog seed app ids that the user has hidden from the
// App History list. Catalog seeds (Outlook, Chrome, VS Code, Notepad, etc.)
// are hardcoded in appsCatalog.ts so they can't be deleted — but the user
// can opt to hide ones they never use, and restore them later.
//
// Custom apps, URL Groups, and Favorites have their own services and are
// truly deletable. This module exists only to manage the catalog-seed
// visibility filter.

import { safeGet, safeSet } from "./storage";

const KEY = "insta.hidden-catalog-ids.v1";

/** Read the set of hidden catalog ids from localStorage. Always returns a
 *  fresh Set, so the caller can mutate without affecting other readers. */
export function listHiddenIds(): Set<string> {
  const arr = safeGet<string[]>(KEY, []);
  return new Set(arr ?? []);
}

/** Persist the set. Caller passes a Set; we serialize as a sorted array
 *  for stable storage representation. */
function saveSet(set: Set<string>): void {
  safeSet(KEY, [...set].sort());
}

/** Hide one catalog id. No-op if already hidden. */
export function hideId(id: string): void {
  if (!id) return;
  const set = listHiddenIds();
  set.add(id);
  saveSet(set);
}

/** Restore one previously-hidden catalog id. No-op if not hidden. */
export function showId(id: string): void {
  if (!id) return;
  const set = listHiddenIds();
  if (set.delete(id)) saveSet(set);
}

/** Restore all hidden ids. */
export function showAll(): void {
  saveSet(new Set());
}

/** Convenience check used by the App History filter. */
export function isHidden(id: string): boolean {
  return listHiddenIds().has(id);
}
