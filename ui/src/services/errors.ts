// InstaDesk — one error dialect at the Tauri boundary.
//
// **Tauri's `invoke` rejects with the RAW STRING** the Rust side put in `Err(...)`,
// not with an `Error`. The whole app catches with `(e as Error).message`, which on
// a string is `undefined` — so a perfectly good message like
// `"Quick Preset not found."` reached the user as a red box with no text
// (operator-reported 2026-08-27, pressing the hotkey for a Quick Preset that does
// not exist).
//
// Why it survived so long: the dev HTTP fallback (`request()`) throws a real
// `new Error(...)`, so the identical code path works in the browser and fails only
// in the packaged app. The dev loop could never show it.
//
// And it had already been met once: `CaptureLayoutModal.tsx:180` reads
// `(e as Error)?.message ?? String(e)` — a read-time workaround at one call site
// out of 27, never swept. That is exactly the failure mode this normalisation
// avoids: **fix the dialect at the boundary, not every reader**, because a
// read-time fix has to be remembered by everyone forever, and it never is.
//
// Every catch block in the app therefore keeps working unchanged, and any future
// one is correct without its author knowing any of this.

/** Coerce anything a rejected promise can carry into a readable `Error`. */
export function toError(e: unknown): Error {
  if (e instanceof Error) return e

  // The Tauri case, and the reason this file exists.
  if (typeof e === 'string') return new Error(e || 'Unknown error')

  if (typeof e === 'object' && e !== null) {
    const msg = (e as { message?: unknown }).message
    if (typeof msg === 'string' && msg.length > 0) return new Error(msg)
    // A plain object stringifies to "[object Object]", which is non-empty and
    // useless — the same failure wearing different clothes. Serialise instead so
    // whatever detail it carries is at least readable.
    try {
      const json = JSON.stringify(e)
      if (json && json !== '{}') return new Error(json)
    } catch {
      // circular or otherwise unserialisable — fall through
    }
  }

  // Symbols throw on string concatenation, so String() is used deliberately.
  const text = (() => {
    try { return String(e) } catch { return '' }
  })()
  // Silence is the one outcome that must be impossible: an error the user cannot
  // read is indistinguishable from no error at all.
  return new Error(text && text !== 'undefined' && text !== 'null' ? text : 'Unknown error')
}
