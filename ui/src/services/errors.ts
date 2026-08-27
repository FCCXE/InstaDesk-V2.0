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

import i18n from '../i18n'

/**
 * A coded error from the Rust side, carried inside Tauri's `Err(String)` as JSON.
 * `message` is the English fallback, so an unknown or newly-added code is still
 * READABLE rather than showing a bare identifier — never worse than before.
 */
type CodedError = { code?: unknown; message?: unknown; args?: unknown }

/**
 * Translate a coded backend error, or return null if this is not one.
 *
 * Rust cannot see the locale files, so it emits a stable CODE and the words are
 * chosen here. Matching on the English prose instead would break silently the
 * first time somebody reworded a sentence — the same read-time-fix trap that left
 * `CaptureLayoutModal` as the only file in the app handling string rejections.
 */
function translateCoded(raw: string): string | null {
  if (!raw.startsWith('{')) return null
  let parsed: CodedError
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed?.code !== 'string') return null

  const fallback = typeof parsed.message === 'string' && parsed.message.length > 0
    ? parsed.message
    : 'Unknown error'
  const args = (parsed.args && typeof parsed.args === 'object') ? parsed.args as Record<string, unknown> : {}
  const key = `backendErrors.${parsed.code}`
  // defaultValue keeps the English sentence when a code has no string yet. The
  // prebuild gate makes that state unreachable in a shipped build, but a fallback
  // that shows a bare code would be worse than the defect this replaced.
  const translated = i18n.t(key, { ...args, defaultValue: fallback })
  return typeof translated === 'string' && translated.length > 0 ? translated : fallback
}

/** Coerce anything a rejected promise can carry into a readable `Error`. */
export function toError(e: unknown): Error {
  if (e instanceof Error) return e

  // The Tauri case, and the reason this file exists.
  if (typeof e === 'string') {
    return new Error(translateCoded(e) ?? (e || 'Unknown error'))
  }

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
