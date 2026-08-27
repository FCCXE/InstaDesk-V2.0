// InstaDesk — error normalisation at the Tauri boundary.
//
// Operator report, 2026-08-27: pressing the hotkey for a Quick Preset that does
// not exist showed a red "error" with NO text. Rust returns a perfectly good
// message — `Err("Quick Preset not found.")` — and it was being thrown away.
//
// The cause: **Tauri's `invoke` rejects with the RAW STRING** the Rust side put in
// `Err(...)`, not with an `Error`. Every catch block in the app reads
// `(e as Error).message`, which on a string is `undefined` — so the message
// vanished and only the red styling survived.
//
// Two things made this invisible for a long time:
//
//   1. The HTTP fallback used in dev (`request()`) throws a real `new Error(...)`,
//      so the same code path WORKS in the browser and fails only in the packaged
//      app. The dev loop could never see it.
//   2. Someone already hit it and fixed it in ONE place —
//      `CaptureLayoutModal.tsx:180` reads `(e as Error)?.message ?? String(e)`.
//      A read-time workaround at a single call site, never swept to the other 26.
//
// That is why the fix belongs at the BOUNDARY, not in the readers: normalise once
// where the two dialects meet, and every existing catch — and every future one —
// is correct without knowing any of this.
import { describe, it, expect } from 'vitest'
import { toError } from './errors'
import i18n from '../i18n'

describe('toError — one dialect at the boundary', () => {
  it('turns a raw string rejection into an Error carrying that text', () => {
    // The operator's exact case.
    const e = toError('Quick Preset not found.')
    expect(e).toBeInstanceOf(Error)
    expect(e.message).toBe('Quick Preset not found.')
  })

  it('passes a real Error through untouched', () => {
    // The HTTP fallback path throws real Errors; normalising must not damage them
    // or re-wrap their message.
    const original = new Error('HTTP 500')
    expect(toError(original)).toBe(original)
  })

  it('never produces an empty message, whatever it is handed', () => {
    // The whole defect was an empty message reaching the user. Silence is the one
    // outcome that must be impossible — an error the user cannot read is the same
    // as no error at all.
    for (const weird of [null, undefined, 0, false, {}, [], Symbol('x')]) {
      const e = toError(weird)
      expect(e).toBeInstanceOf(Error)
      expect(e.message.length).toBeGreaterThan(0)
    }
  })

  it('translates a coded backend error', () => {
    // The operator's case, end to end: Rust emits the code, the UI supplies the
    // words. Asserting it is NOT the raw English fallback proves the translation
    // actually fired rather than the fallback quietly carrying it.
    const raw = JSON.stringify({ code: 'qpNotFound', message: 'Quick Preset not found.', args: {} })
    const msg = toError(raw).message
    expect(msg).toBe('No Quick Preset is saved in that slot.')
    expect(msg).not.toBe('Quick Preset not found.')
  })

  it('interpolates the values Rust supplied', () => {
    const raw = JSON.stringify({ code: 'qpSlotNotFound', message: 'Quick Preset B not found.', args: { slot: 'B' } })
    expect(toError(raw).message).toBe('No Quick Preset is saved in slot B.')
  })

  it('falls back to the English sentence for a code with no string', () => {
    // The prebuild gate makes this unreachable in a shipped build, but a bare
    // identifier on screen would be worse than the defect this replaced.
    const raw = JSON.stringify({ code: 'notATranslatedCode', message: 'Something specific went wrong.', args: {} })
    expect(toError(raw).message).toBe('Something specific went wrong.')
  })

  it('leaves a plain (uncoded) string error alone', () => {
    // 25 map_err pass-throughs carry OS and serde text we do not author.
    expect(toError('The system cannot find the file specified.').message)
      .toBe('The system cannot find the file specified.')
  })

  it('SPANISH: the same code produces the Spanish sentence', async () => {
    // The operator's requirement is that both locales are COMPLETELY deployed.
    // Asserting only the English path would prove translation fires, not that the
    // Spanish half exists — and a missing Spanish string falls back to English
    // silently, which looks identical to success.
    const raw = JSON.stringify({ code: 'qpNotFound', message: 'Quick Preset not found.', args: {} })
    await i18n.changeLanguage('es')
    try {
      expect(toError(raw).message).toBe('No hay ningún Preajuste rápido guardado en esa ranura.')
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('SPANISH: interpolation works in the second locale too', async () => {
    const raw = JSON.stringify({ code: 'qpSlotNotFound', message: 'Quick Preset B not found.', args: { slot: 'B' } })
    await i18n.changeLanguage('es')
    try {
      expect(toError(raw).message).toBe('No hay ningún Preajuste rápido guardado en la ranura B.')
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('keeps a message-bearing object readable', () => {
    expect(toError({ message: 'boom' }).message).toBe('boom')
  })

  it('does not render a plain object as [object Object]', () => {
    // Technically non-empty, and useless to a reader — which is the same failure
    // wearing different clothes.
    const msg = toError({ code: 42, detail: 'bad slot' }).message
    expect(msg).not.toBe('[object Object]')
    expect(msg).toContain('bad slot')
  })
})
