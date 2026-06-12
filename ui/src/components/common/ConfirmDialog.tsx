// Reusable, theme-aware dialogs — the styled replacement for the browser's
// native window.confirm()/prompt()/alert() (which render unstylable OS chrome
// and leak the "localhost:5173 says" web origin).
//
// Promise-based so call sites stay one-liners and the app-wide sweep of native
// dialogs is near-mechanical:
//
//   const confirm = useConfirm()
//   if (await confirm({ title, body, danger: true })) doDestructiveThing()
//
//   const prompt = usePrompt()
//   const value = await prompt({ title, defaultValue }) // string | null (cancel)
//
// Mounted once, high in the tree (main.tsx, inside ThemeProvider so it inherits
// the active theme's tokens).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'

export type ConfirmOptions = {
  /** Bold heading. Already-translated string (callers pass t('…')). */
  title: string
  /** Optional supporting copy. Honors "\n" line breaks (whitespace-pre-line). */
  body?: string
  /** Primary-button label. Defaults to common.ok. */
  confirmLabel?: string
  /** Secondary-button label. Defaults to common.cancel. */
  cancelLabel?: string
  /** Red destructive styling on the primary button. */
  danger?: boolean
}

export type PromptOptions = {
  title: string
  body?: string
  /** Pre-filled input value. */
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>
type PromptFn = (opts: PromptOptions) => Promise<string | null>

const ConfirmContext = createContext<ConfirmFn | null>(null)
const PromptContext = createContext<PromptFn | null>(null)

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within <ConfirmProvider>')
  return ctx
}

export function usePrompt(): PromptFn {
  const ctx = useContext(PromptContext)
  if (!ctx) throw new Error('usePrompt must be used within <ConfirmProvider>')
  return ctx
}

type DialogState =
  | { mode: 'confirm'; opts: ConfirmOptions; resolve: (value: boolean) => void }
  | { mode: 'prompt'; opts: PromptOptions; resolve: (value: string | null) => void }
  | null

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [state, setState] = useState<DialogState>(null)
  const [inputValue, setInputValue] = useState('')
  const okRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const confirm = useCallback<ConfirmFn>(
    (opts) => new Promise<boolean>((resolve) => setState({ mode: 'confirm', opts, resolve })),
    [],
  )

  const prompt = useCallback<PromptFn>(
    (opts) =>
      new Promise<string | null>((resolve) => {
        setInputValue(opts.defaultValue ?? '')
        setState({ mode: 'prompt', opts, resolve })
      }),
    [],
  )

  // Resolve the outstanding promise and dismiss. Updater form keeps us safe
  // against double-close (e.g. Enter + button click racing).
  const cancel = useCallback(() => {
    setState((cur) => {
      if (cur?.mode === 'prompt') cur.resolve(null)
      else cur?.resolve(false)
      return null
    })
  }, [])

  const accept = useCallback((value: string) => {
    setState((cur) => {
      if (cur?.mode === 'prompt') cur.resolve(value)
      else cur?.resolve(true)
      return null
    })
  }, [])

  // While open: focus the input (prompt) or primary button (confirm); Enter
  // accepts, Esc cancels.
  useEffect(() => {
    if (!state) return
    if (state.mode === 'prompt') inputRef.current?.focus()
    else okRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancel()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        accept(inputValue)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, cancel, accept, inputValue])

  const opts = state?.opts
  const danger = state?.mode === 'confirm' && state.opts.danger

  return (
    <ConfirmContext.Provider value={confirm}>
      <PromptContext.Provider value={prompt}>
        {children}
        {state && opts && (
          <div
            className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-3"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) cancel()
            }}
            role="presentation"
          >
            <div
              role={state.mode === 'confirm' ? 'alertdialog' : 'dialog'}
              aria-modal="true"
              aria-labelledby="insta-dialog-title"
              className="w-[460px] max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-surface p-5 shadow-xl"
            >
              <h2 id="insta-dialog-title" className="text-base font-semibold text-fg">{opts.title}</h2>
              {opts.body && (
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">
                  {opts.body}
                </p>
              )}
              {state.mode === 'prompt' && (
                <input
                  ref={inputRef}
                  type="text"
                  aria-label={opts.title}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={state.opts.placeholder}
                  className="mt-3 h-9 w-full rounded-md border border-line bg-raised px-3 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring"
                />
              )}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={cancel}
                  className="rounded-lg border border-line bg-raised px-3 py-1.5 text-sm font-medium text-fg hover:bg-line/60"
                >
                  {opts.cancelLabel ?? t('common.cancel')}
                </button>
                <button
                  ref={okRef}
                  type="button"
                  onClick={() => accept(inputValue)}
                  className={[
                    'rounded-lg border px-3 py-1.5 text-sm font-semibold shadow-sm transition-colors',
                    danger
                      ? 'border-red-600 bg-red-600 text-white hover:bg-red-700 dark:border-red-500/50 dark:hover:bg-red-500'
                      : 'border-violet-600 bg-violet-600 text-white hover:bg-violet-700 dark:border-cyan-400/50 dark:bg-cyan-500 dark:text-slate-900 dark:hover:bg-cyan-400',
                  ].join(' ')}
                >
                  {opts.confirmLabel ?? t('common.ok')}
                </button>
              </div>
            </div>
          </div>
        )}
      </PromptContext.Provider>
    </ConfirmContext.Provider>
  )
}
