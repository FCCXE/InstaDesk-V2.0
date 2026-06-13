// Vendor-neutral telemetry seam.
//
// This is the ONLY module that imports the telemetry vendor SDKs (Sentry for
// errors, PostHog for product analytics). Everywhere else in the app calls the
// thin helpers below — captureError() / track() / identifyInstall() — so swapping
// or self-hosting a provider later is a change HERE, not across the codebase
// (the studio's "vendor-neutral emit, never locked in" mandate).
//
// It is INERT by default: nothing is sent unless the keys are present at build
// time via env (VITE_SENTRY_DSN / VITE_POSTHOG_KEY / VITE_POSTHOG_HOST). So dev
// runs and key-less builds emit zero telemetry. The keys are public client keys
// (designed to live in shipped apps); we keep them in a git-ignored .env so they
// stay easy to rotate and so the company can swap them in later with no code change.
//
// Region note: PostHog/Sentry data region is fixed at org-creation; we default the
// PostHog host to EU to match the planned UK-company data residency.
import * as Sentry from '@sentry/react'
import posthog from 'posthog-js'

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined
const POSTHOG_HOST =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://eu.i.posthog.com'
const APP_VERSION = import.meta.env.VITE_APP_VERSION as string | undefined

let sentryOn = false
let posthogOn = false

/** Initialize the configured providers. Safe to call once at startup; a no-op for
 *  any provider whose key is absent. */
export function initTelemetry(): void {
  if (SENTRY_DSN) {
    Sentry.init({
      dsn: SENTRY_DSN,
      release: APP_VERSION,
      // Lean by design: no performance tracing or session replay (cost + privacy).
      tracesSampleRate: 0,
      // Never attach IP / cookies / default PII.
      sendDefaultPii: false,
    })
    sentryOn = true
  }
  if (POSTHOG_KEY) {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      capture_pageview: false, // desktop app, not a website
      autocapture: false, // explicit, named events only — better signal + privacy
      person_profiles: 'identified_only',
    })
    posthogOn = true
  }
}

/** Report an error/exception to the error backend. No-op when telemetry is off. */
export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (sentryOn) {
    Sentry.captureException(err, context ? { extra: context } : undefined)
  }
}

/** Record a named product-usage event. No-op when telemetry is off. */
export function track(event: string, props?: Record<string, unknown>): void {
  if (posthogOn) {
    posthog.capture(event, props)
  }
}

/** Stable, anonymous per-install id (no personal data) so events/errors from the
 *  same machine correlate. No-op when telemetry is off. */
export function identifyInstall(installId: string): void {
  if (posthogOn) {
    posthog.identify(installId)
  }
  if (sentryOn) {
    Sentry.setUser({ id: installId })
  }
}

/** Whether any telemetry provider is actually active (keys present). Lets the UI
 *  hide an opt-out toggle / "send feedback" affordance when nothing is wired. */
export function telemetryActive(): boolean {
  return sentryOn || posthogOn
}

/** Sentry's React error boundary, re-exported through the seam so call sites don't
 *  import the vendor directly. Catches render-time React errors (which plain global
 *  handlers miss) and reports them when telemetry is on; still shows its fallback
 *  UI when off. */
export const ErrorBoundary = Sentry.ErrorBoundary
