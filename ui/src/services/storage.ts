// C:\FcXe Studios\Instadesk\instadesk-tauri\ui\src\services\storage.ts
/* Safe JSON storage with in-memory fallback for non-browser contexts. */
type Json = any;

const mem = new Map<string, string>();

function hasLocalStorage(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
}

// Guard against corrupted/hand-edited storage holding a syntactically-valid but
// wrong-SHAPE value (e.g. `{}` under a key whose fallback is `[]`). Without this,
// callers that immediately `.sort()` or `new Set(...)` the result would throw and
// crash the pane. We only validate the coarse shape (array vs object vs
// primitive), which is enough to prevent those failures.
function shapeMatches(parsed: unknown, fallback: unknown): boolean {
  if (Array.isArray(fallback)) return Array.isArray(parsed);
  if (fallback !== null && typeof fallback === "object") {
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
  }
  return typeof parsed === typeof fallback;
}

export function safeGet<T = Json>(key: string, fallback: T): T {
  try {
    const raw = hasLocalStorage() ? window.localStorage.getItem(key) : mem.get(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return shapeMatches(parsed, fallback) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

export function safeSet<T = Json>(key: string, value: T): void {
  const raw = JSON.stringify(value);
  try {
    if (hasLocalStorage()) {
      window.localStorage.setItem(key, raw);
    } else {
      mem.set(key, raw);
    }
  } catch {
    // ignore
  }
}
