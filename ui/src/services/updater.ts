// Auto-updater seam. Wraps the Tauri updater + process plugins so the UI can
// check for / install signed updates. Desktop-only — the web preview no-ops.
//
// Flow: checkForUpdate() asks the configured endpoint (GitHub Releases
// latest.json) whether a newer, correctly-signed version exists; installUpdate()
// downloads + applies it and relaunches the app. Signature verification against
// the bundled public key is done by the plugin — an unsigned/tampered update is
// rejected automatically.
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { inTauri } from './api'
import { IS_SANDBOX } from './version'

export type { Update }

/** Returns an Update handle if a newer signed version is available, else null.
 *  Throws on network/endpoint errors (caller surfaces them). No-op in web. */
export async function checkForUpdate(): Promise<Update | null> {
  if (!inTauri()) return null
  // Sandbox builds are an isolated test channel — they never auto-update (their
  // identity differs from stable, and the build ships no updater artifacts).
  if (IS_SANDBOX) return null
  return await check()
}

/** Download + install the given update, then relaunch into the new version. */
export async function installUpdate(update: Update): Promise<void> {
  await update.downloadAndInstall()
  await relaunch()
}
