// Reusable, theme-aware confirm/alert dialog — the styled replacement for the
// browser's native window.confirm()/alert() (which render unstylable OS chrome
// and leak the "localhost:5173 says" web origin).
//
// Promise-based so call sites stay one-liners and the app-wide sweep of native
// dialogs is near-mechanical:
//
//   const confirm = useConfirm()
//   if (await confirm({ title, body, danger: true })) doDestructiveThing()
//
// Mounted once, high in the tree (main.tsx, inside ThemeProvider so it inherits
// the active theme's tokens). First consumer: Bottom-bar "Clear All Grids".
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

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within <ConfirmProvider>')
  return ctx
}

type DialogState = (ConfirmOptions & { resolve: (value: boolean) => void }) | null

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [state, setState] = useState<DialogState>(null)
  const okRef = useRef<HTMLButtonElement>(null)

  const confirm = useCallback<ConfirmFn>(
    (opts) => new Promise<boolean>((resolve) => setState({ ...opts, resolve })),
    [],
  )

  // Resolve the outstanding promise and dismiss. Using the updater form keeps
  // us safe against double-close (e.g. Enter + button click racing).
  const close = useCallback((result: boolean) => {
    setState((cur) => {
      cur?.resolve(result)
      return null
    })
  }, [])

  // While open: focus the primary button, Enter confirms, Esc cancels.
  useEffect(() => {
    if (!state) return
    okRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close(false)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        close(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, close])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-3"
          // Backdrop click (outside the card) cancels.
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close(false)
          }}
          role="presentation"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            className="w-[460px] max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-surface p-5 shadow-xl"
          >
            <h2 className="text-base font-semibold text-fg">{state.title}</h2>
            {state.body && (
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">
                {state.body}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => close(false)}
                className="rounded-lg border border-line bg-raised px-3 py-1.5 text-sm font-medium text-fg hover:bg-line/60"
              >
                {state.cancelLabel ?? t('common.cancel')}
              </button>
              <button
                ref={okRef}
                type="button"
                onClick={() => close(true)}
                className={[
                  'rounded-lg border px-3 py-1.5 text-sm font-semibold shadow-sm transition-colors',
                  state.danger
                    ? 'border-red-600 bg-red-600 text-white hover:bg-red-700 dark:border-red-500/50 dark:hover:bg-red-500'
                    : 'border-violet-600 bg-violet-600 text-white hover:bg-violet-700 dark:border-cyan-400/50 dark:bg-cyan-500 dark:text-slate-900 dark:hover:bg-cyan-400',
                ].join(' ')}
              >
                {state.confirmLabel ?? t('common.ok')}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
