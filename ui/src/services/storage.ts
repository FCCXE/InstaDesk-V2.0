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

export function safeGet<T = Json>(key: string, fallback: T): T {
  try {
    if (hasLocalStorage()) {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } else {
      const raw = mem.get(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    }
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
