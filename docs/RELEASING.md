# Releasing InstaDesk (signed installer + auto‑update)

InstaDesk ships a **signed auto‑updater**. Installed apps check
`https://github.com/FCCXE/InstaDesk-V2.0/releases/latest/download/latest.json`
and install a newer build **only if its signature matches the public key** baked
into the app (`plugins.updater.pubkey` in `tauri.conf.json`). An unsigned or
tampered build is rejected automatically.

## One‑time setup (already done)
- Updater keypair generated: **public** key in `tauri.conf.json`; **private** key at
  `src-tauri/.tauri-keys/updater.key` — **gitignored**.
- ⚠️ **Back up the private key (and its password, currently none) in a password
  manager / secure vault.** It signs every update. If **lost**, you can't ship
  updates (users must reinstall manually). If **leaked**, an attacker could sign
  malicious "updates" — treat it like a code‑signing key.

## Each release
1. **Bump the version** in `src-tauri/tauri.conf.json` (`"version"`), e.g. `0.1.1`.
2. **Build signed** (from the inner repo root) — the signing key must be in the env:
   ```bash
   # PowerShell:  $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content src-tauri\.tauri-keys\updater.key -Raw
   #              $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
   # bash:
   export TAURI_SIGNING_PRIVATE_KEY="$(cat src-tauri/.tauri-keys/updater.key)"
   export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
   npx tauri build --bundles nsis
   ```
   Produces, in `src-tauri/target/release/bundle/nsis/`:
   `InstaDesk_<version>_x64-setup.exe` **and** `…-setup.exe.sig`.
3. **Generate the manifest:**
   ```bash
   node src-tauri/scripts/make-latest-json.mjs "What changed in this release"
   ```
   Writes `latest.json` next to the installer.
4. **Publish a GitHub release** on `FCCXE/InstaDesk-V2.0`, tag **`v<version>`**
   (must match), and upload **three** assets:
   - `InstaDesk_<version>_x64-setup.exe`
   - `InstaDesk_<version>_x64-setup.exe.sig`
   - `latest.json`
5. Done. Installed apps see it via **Settings → Updates → Check for updates**
   (and can be made to auto‑check on launch later).

## Notes
- The **first** published release establishes the baseline; auto‑update only
  triggers when a *newer* version is published than what's installed.
- Keep the GitHub repo's releases public so the `latest.json` endpoint is reachable.
- A GitHub Action (`tauri-apps/tauri-action`) can later automate steps 2–4.
- **2.6 code signing (Azure)** is separate — it removes SmartScreen warnings on the
  installer itself and is gated on the FcXe UK Ltd entity; the *updater* signature
  here is independent and already active.
