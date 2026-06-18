# Releasing InstaDesk — Build & Release SOP

The standard operating procedure for cutting an InstaDesk release. Following this
top-to-bottom, anyone (not just the original author) can ship a version and roll
one back. This is **Phase 0** of the FCLX Studios Platform plan; **Phase 1** will
automate steps 4–8 with a CI robot — until then they are run by hand.

InstaDesk ships a **signed auto-updater**. Installed apps poll
`https://github.com/FCCXE/InstaDesk-V2.0/releases/latest/download/latest.json`
and install a newer build **only if its signature matches the public key** baked
into the app (`plugins.updater.pubkey` in `tauri.conf.json`). An unsigned or
tampered build is rejected automatically.

---

## 1. Versioning standard (SemVer)

Versions are `MAJOR.MINOR.PATCH`. While **pre-1.0** (`0.MINOR.PATCH`):
- **PATCH** (`0.1.27 → 0.1.28`) — a bug fix, a docs/manual change, or any user-invisible internal change.
- **MINOR** (`0.1.x → 0.2.0`) — a new user-facing feature or capability.
- **MAJOR** (`0.x → 1.0.0`) — reserved for the first stable/commercial milestone; thereafter, a breaking change.

One version = one `vX.Y.Z` git tag = one GitHub Release = one `CHANGELOG.md` entry. These three must always agree.

## 2. Where the record lives (system of record)

- **`CHANGELOG.md`** (repo root) — the canonical *human-readable* history. Every release has an entry; newest at top under `## [Unreleased]`.
- **`vX.Y.Z` git tags + GitHub Releases** — the canonical *machine* record of what was emitted (immutable; releases carry the installer + signature + `latest.json`).
- **`latest.json` endpoint** — the canonical *"what's live now"* that installed apps read.
- **Version files** — `src-tauri/tauri.conf.json` (`version`, the field the bundler stamps) and `src-tauri/Cargo.toml` (`version`). Keep them equal.

> My (`.claude`) session memory and any local notes are **pointers** to the above, never the source of truth. If memory and this record disagree, the record wins.

## 3. Pre-release checklist

- [ ] All intended changes are committed and pushed to `main`.
- [ ] UI gate passes: `cd ui && npm run build` (= `tsc -b && vite build`) — **not** `tsc --noEmit` (a no-op here).
- [ ] Rust gate passes (if `src-tauri` changed): `cd src-tauri && cargo test --lib && cargo build --lib`.
- [ ] i18n parity + zero duplicate keys (if locales changed).
- [ ] `CHANGELOG.md` `## [Unreleased]` section describes everything in this release.
- [ ] Decide the new version number per §1.

## 4. The release procedure (AUTOMATED — standard since 2026-06-18)

A GitHub Actions robot (`.github/workflows/release.yml`) builds, signs, and publishes
the release. You only prepare the version and push a tag:

1. **Bump the version + roll the changelog** (one command):
   ```bash
   node src-tauri/scripts/bump-version.mjs 0.1.29   # --dry-run to preview first
   ```
   Updates `tauri.conf.json` + `Cargo.toml` and moves `## [Unreleased]` into a dated
   `## [0.1.29]` section in `CHANGELOG.md`. Review the diff.
2. **Commit + push** the bump (`tauri.conf.json`, `Cargo.toml`, `CHANGELOG.md`, and any
   built assets such as bundled manual PDFs) to `main`.
3. **Tag + push the tag** — this triggers the robot:
   ```bash
   git tag v0.1.29 && git push origin v0.1.29
   ```
   The robot checks out the app + agent repos, builds + signs with the key from GitHub
   Secrets, generates `latest.json`, and publishes the GitHub Release (notes from the
   `CHANGELOG.md` section). Watch it under the repo's **Actions** tab.
   - A **clean tag** (`v0.1.29`) → published as **Latest** (reaches all users).
   - A **suffixed tag** (`v0.1.29-rc.1`) → published as a **prerelease** (never "Latest",
     so it can't reach stable auto-update users) — for testing.
4. **Verify** per §5.

> The robot builds the WinAgent from the agent repo's `main` HEAD. *(Recording the exact
> agent commit per release is a future refinement — Platform 3.4 release ledger.)*

### 4b. Manual fallback (if Actions is unavailable)

Run the steps the robot automates, from the inner repo root:
1. `node src-tauri/scripts/bump-version.mjs <X.Y.Z>`
2. Build signed — the signing key must be in the env:
   ```bash
   # PowerShell:  $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content src-tauri\.tauri-keys\updater.key -Raw
   #              $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
   export TAURI_SIGNING_PRIVATE_KEY="$(cat src-tauri/.tauri-keys/updater.key)"
   export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
   npx tauri build --bundles nsis
   ```
   → `src-tauri/target/release/bundle/nsis/InstaDesk_<version>_x64-setup.exe` + `…-setup.exe.sig`.
3. `node src-tauri/scripts/make-latest-json.mjs "What changed"` → writes `latest.json`.
4. Commit + push the bump.
5. `gh release create v<version> --repo FCCXE/InstaDesk-V2.0 --latest <exe> <sig> latest.json` (notes = the CHANGELOG entry).

## 5. Post-release verification

- [ ] Endpoint serves the new version:
  ```bash
  curl -sL "https://github.com/FCCXE/InstaDesk-V2.0/releases/latest/download/latest.json" | grep '"version"'
  ```
- [ ] The release shows all three assets: `gh release view v<version> --json assets --jq '.assets[].name'`.
- [ ] (When feasible) an installed older version offers the update via Settings → Updates.

## 6. Rollback runbook (when a release is bad)

A release can't be un-published safely, but the **updater follows whatever `latest.json` points to**, so you roll forward to a known-good build by changing what "latest" is:

1. **Fastest:** publish a **new** patch version that restores the previous good behavior (e.g. revert the bad commit, bump `0.1.29 → 0.1.30`, ship). The updater offers it because it's newer. *(This is what we did for the 0.1.10 → 0.1.11 regression.)*
2. **Or re-point "latest":** mark the previous good GitHub Release as `--latest` again
   (`gh release edit v<good> --latest`) and/or move the bad release to draft, so the
   `latest/download/latest.json` endpoint serves the good build. Verify with the §5 curl.
3. Always add a `CHANGELOG.md` entry for the rollback/revert so the record stays honest.
4. Keep the `pre-<slug>` rollback tag from before the bad change to restore the source quickly.

## 7. Tag hygiene

- **`vX.Y.Z`** tags = the version record. One per release; never reuse or move (except a deliberate rollback re-point).
- **`pre-<slug>`** tags = disposable local safety markers made before risky edits. They are **not** the record. Prefer keeping them local; prune periodically (e.g. delete `pre-*` older than the last ~10 releases) so they don't bury the version tags. They may be pushed when a rollback point needs sharing, but treat them as scaffolding.

## 8. One-time setup (already done)

- Updater keypair generated: **public** key in `tauri.conf.json`; **private** key at
  `src-tauri/.tauri-keys/updater.key` — **gitignored**.
- ⚠️ **Back up the private key (and its password, currently none) in a password
  manager / secure vault.** It signs every update. If **lost**, you can't ship
  updates (users must reinstall manually). If **leaked**, an attacker could sign
  malicious "updates" — treat it like a code-signing key.

### CI credentials (GitHub Actions secrets, repo `FCCXE/InstaDesk-V2.0`)
The release robot runs in the cloud and needs three repository secrets (set 2026-06-18):
- **`TAURI_SIGNING_PRIVATE_KEY`** — the updater private key (same value as `updater.key`).
- **`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`** — empty (the key has no password).
- **`AGENT_DEPLOY_KEY`** — the **private** half of a read-only SSH **deploy key** registered
  on the agent repo (`FcXe-Studios---InstaDesk`, title `instadesk-ci-agent-read`). It lets CI
  check out that private repo to build the WinAgent. Read-only, single-repo scoped.

To rotate: regenerate the updater key (and re-bake the public key into `tauri.conf.json`),
or `ssh-keygen` a new deploy key → `gh repo deploy-key add` on the agent repo → update the
`AGENT_DEPLOY_KEY` secret. Secrets are never readable back out of GitHub — keep the off-site
backups current.

## 9. Notes

- The **first** published release establishes the baseline; auto-update only triggers when a *newer* version is published than what's installed.
- Keep the GitHub repo's releases public so the `latest.json` endpoint is reachable.
- **Release automation is LIVE** (2026-06-18) — `.github/workflows/release.yml` runs the build/sign/publish from a tag push with the signing key in GitHub Secrets. §4 is the standard; §4b is the manual fallback.
- **Code signing (Azure Trusted Signing)** is separate — it removes the Windows SmartScreen "unknown publisher" warning on the installer itself and is gated on the FCLX UK Ltd entity. The *updater* signature here is independent and already active.
