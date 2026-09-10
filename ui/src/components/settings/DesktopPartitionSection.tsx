import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppState } from "../../state/AppState";
import {
  api,
  type DesktopApplyResponse,
  type DesktopMonitorPlan,
  type DesktopPlanResponse,
} from "../../services/api";
import { toError } from "../../services/errors";

/**
 * Desktop Partition — tidy the desktop into folders / documents / apps.
 *
 * WHAT THIS COMPONENT DELIBERATELY DOES NOT DO: any geometry. Zones, the grid,
 * alphabetical order and every coordinate are computed in the WinAgent (D-4).
 * This screen chooses a monitor, shows what the agent intends, and asks.
 *
 * OFF MEANS OFF (ruling R-4, invariant D-1). While the switch is off this
 * component does not call the agent AT ALL — not even to read. A read-only scan
 * would be harmless, but "off" that still runs things is exactly the kind of
 * almost-off that makes a feature untrustworthy, and the user cannot see the
 * difference between a scan and a move from the outside.
 */
export default function DesktopPartitionSection() {
  const { t } = useTranslation();
  const { monitors, currentMonitorId, desktopPartitionOn, setDesktopPartitionOn } = useAppState();

  const [busy, setBusy] = useState<null | "plan" | "apply" | "undo">(null);
  const [plan, setPlan] = useState<DesktopMonitorPlan | null>(null);
  const [result, setResult] = useState<DesktopApplyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [watching, setWatching] = useState(false);

  // Monitor ids are "m{N}" and the agent takes the 1-based N — the same
  // conversion LayoutsPane uses. The partition follows the selection the rest of
  // the app is already using rather than inventing its own.
  const monitorIdToIndex = (id: string) => {
    const n = parseInt((id || "").replace(/^m/, ""), 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  };
  const monitorId = monitorIdToIndex(currentMonitorId ?? monitors[0]?.id ?? "m1");
  const monitorLabel =
    monitors.find((m) => m.id === (currentMonitorId ?? monitors[0]?.id))?.name ?? `M${monitorId}`;

  // Has the operator ever actually applied a layout on this machine?
  //
  // The watcher exists to KEEP THE ARRANGEMENT THEY CHOSE across screen changes
  // and Explorer restarts. Running it before they have ever pressed Apply would
  // mean a resolution change silently rearranges a desktop they never asked to
  // have rearranged -- switching the feature on would become a destructive act by
  // itself, which is not what "on" should mean.
  const APPLIED_KEY = "instadesk:desktopPartitionApplied";
  const hasApplied = () => {
    try {
      return window.localStorage.getItem(APPLIED_KEY) === "true";
    } catch {
      // Unreadable storage falls to "never applied", which only withholds the
      // watcher. The safe direction for anything that moves the user's icons.
      return false;
    }
  };
  const markApplied = () => {
    try {
      window.localStorage.setItem(APPLIED_KEY, "true");
    } catch {
      /* the watcher simply will not auto-start; nothing breaks */
    }
  };

  // Start the watcher only when BOTH are true: the feature is on, and a layout has
  // been applied at least once. Asking Rust for the live status rather than
  // trusting our own flag -- a stored handle proves one was started, not that it
  // is still alive.
  const syncWatcher = useCallback(async () => {
    try {
      if (desktopPartitionOn && hasApplied()) {
        const r = await api.desktopWatchStart(monitorId);
        setWatching(Boolean(r?.running));
      } else {
        await api.desktopWatchStop();
        setWatching(false);
      }
    } catch {
      setWatching(false);
    }
    // monitorId is intentionally read fresh on each call rather than being a dep:
    // restarting the watcher on every monitor selection change would kill and
    // respawn a process for a click that may not be about the desktop at all.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktopPartitionOn]);

  const refreshUndo = useCallback(async () => {
    if (!desktopPartitionOn) return;
    try {
      const r = await api.desktopUndoAvailable();
      setUndoAvailable(Boolean(r?.available));
    } catch {
      // Not being able to tell whether an undo exists must not break the pane.
      // The button stays hidden, which is the safe direction.
      setUndoAvailable(false);
    }
  }, [desktopPartitionOn]);

  useEffect(() => {
    if (!desktopPartitionOn) {
      // Turning it off drops everything on screen too. Leaving a stale plan
      // visible under an "off" switch would suggest something is still pending.
      setPlan(null);
      setResult(null);
      setError(null);
      setUndoAvailable(false);
      // OFF stops the watcher as well. A feature that is "off" but still has a
      // process rearranging the desktop is not off (D-1).
      void api.desktopWatchStop().catch(() => {});
      setWatching(false);
      return;
    }
    void refreshUndo();
    void syncWatcher();
  }, [desktopPartitionOn, refreshUndo, syncWatcher]);

  async function preview() {
    setBusy("plan");
    setError(null);
    setResult(null);
    try {
      const r: DesktopPlanResponse = await api.desktopPlan(monitorId);
      const mine = r.plans?.find((p) => p.monitor === monitorId) ?? r.plans?.[0] ?? null;
      setPlan(mine);
      if (!mine) setError(t("desktopPartition.noIconsHere"));
    } catch (e) {
      setError(toError(e).message);
    } finally {
      setBusy(null);
    }
  }

  async function apply() {
    setBusy("apply");
    setError(null);
    try {
      const r = await api.desktopApply(monitorId, true);
      setResult(r);
      // Only a real apply arms the watcher.
      if (r?.ok && !r?.refused) { markApplied(); void syncWatcher(); }
      // Whatever happened, the desktop may have changed — re-read rather than
      // assuming the plan on screen still describes it.
      await preview();
      await refreshUndo();
    } catch (e) {
      setError(toError(e).message);
    } finally {
      setBusy(null);
    }
  }

  async function undo() {
    setBusy("undo");
    setError(null);
    try {
      const r = await api.desktopUndo();
      setResult(r);
      await preview();
    } catch (e) {
      setError(toError(e).message);
    } finally {
      setBusy(null);
    }
  }

  const zones = plan?.zoneCounts ?? {};

  return (
    <div className="flex flex-col gap-3">
      {/* ---- the switch, and what OFF means, stated on screen ---- */}
      <label className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <span className="min-w-0">
          <span className="block text-sm text-fg">{t("desktopPartition.enable")}</span>
          <span
            className={`block text-[10px] leading-tight ${
              desktopPartitionOn ? "text-amber-600 dark:text-amber-400" : "text-muted"
            }`}
          >
            {desktopPartitionOn ? t("desktopPartition.onHint") : t("desktopPartition.offHint")}
          </span>
        </span>
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0"
          checked={desktopPartitionOn}
          onChange={(e) => setDesktopPartitionOn(e.target.checked)}
        />
      </label>

      {desktopPartitionOn && (
        <>
          <div className="text-[11px] text-muted">
            {t("desktopPartition.forMonitor", { name: monitorLabel })}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-line px-3 py-1.5 text-sm text-fg disabled:opacity-50"
              disabled={busy !== null}
              onClick={() => void preview()}
            >
              {busy === "plan" ? t("desktopPartition.working") : t("desktopPartition.preview")}
            </button>
            <button
              type="button"
              className="rounded-lg border border-amber-500 px-3 py-1.5 text-sm text-amber-700 disabled:opacity-50 dark:text-amber-400"
              // Apply is offered only once a plan has been seen AND is clean.
              // The agent refuses a plan with problems anyway; the button not
              // being there first means the refusal is not the user's discovery.
              disabled={busy !== null || !plan || !plan.ok || plan.willMove === 0}
              onClick={() => void apply()}
            >
              {busy === "apply" ? t("desktopPartition.working") : t("desktopPartition.apply")}
            </button>
            {undoAvailable && (
              <button
                type="button"
                className="rounded-lg border border-line px-3 py-1.5 text-sm text-fg disabled:opacity-50"
                disabled={busy !== null}
                onClick={() => void undo()}
              >
                {busy === "undo" ? t("desktopPartition.working") : t("desktopPartition.undo")}
              </button>
            )}
          </div>

          {watching && (
            <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
              {t("desktopPartition.watching")}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
          )}

          {plan && (
            <div className="rounded-lg border border-line px-3 py-2 text-xs text-fg">
              <div className="mb-1 font-medium">
                {t("desktopPartition.planFor", { n: plan.monitor, icons: plan.iconsHere })}
              </div>
              <div className="text-muted">
                {t("desktopPartition.zones", {
                  folders: zones.folders ?? 0,
                  documents: zones.documents ?? 0,
                  apps: zones.apps ?? 0,
                  untouched: zones.untouched ?? 0,
                })}
              </div>
              <div className="text-muted">
                {t("desktopPartition.willMove", { n: plan.willMove })}
              </div>
              {/* An assumed grid inset is stated, not hidden behind a clean number. */}
              {!plan.grid.phaseMeasured && (
                <div className="mt-1 text-amber-600 dark:text-amber-400">
                  {t("desktopPartition.gridAssumed")}
                </div>
              )}
              {plan.problems?.length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-red-700 dark:text-red-300">
                  {plan.problems.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {result && (
            <div className="rounded-lg border border-line px-3 py-2 text-xs">
              {result.refused ? (
                <>
                  <div className="font-medium text-red-700 dark:text-red-300">
                    {t("desktopPartition.refused", { stage: result.stage ?? "" })}
                  </div>
                  <ul className="mt-1 list-disc pl-4 text-red-700 dark:text-red-300">
                    {(result.problems ?? [result.error ?? ""]).filter(Boolean).map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <div className="font-medium text-fg">
                    {t("desktopPartition.moved", {
                      moved: result.moved ?? 0,
                      verified: result.verified ?? 0,
                    })}
                  </div>
                  {result.undoVerified && (
                    <div className="text-muted">{t("desktopPartition.undoSaved")}</div>
                  )}
                  {(result.landedWrong?.length ?? 0) > 0 && (
                    <div className="mt-1 text-red-700 dark:text-red-300">
                      {t("desktopPartition.landedWrong", { n: result.landedWrong?.length ?? 0 })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
