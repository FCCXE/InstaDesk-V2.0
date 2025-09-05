# --------------------------------------------
# InstaDesk (Tauri) - Commit & Push
# Scope: ONLY the instadesk-tauri repo
# --------------------------------------------
param (
    [string]$Message = "chore: update"
)

# Ensure we operate within the repo root
$repoRoot = "C:\FcXe Studios\Instadesk\instadesk-tauri"
Set-Location $repoRoot

Write-Host "📂 Repo:" (Get-Location)

# Safety: show current top-level (must be instadesk-tauri)
$top = git rev-parse --show-toplevel 2>$null
if (-not $top -or $top -ne $repoRoot) {
    Write-Error "This script must run inside the instadesk-tauri Git repo. Found: $top"
    exit 1
}

git status
git add .
git commit -m "$Message"
git push origin main

Write-Host "✅ Commit + Push complete."
