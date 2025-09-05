# --------------------------------------------
# InstaDesk (Tauri) - Safe rollback one commit
# Creates a revert commit; does NOT rewrite history
# --------------------------------------------
param(
    [string]$Reason = "revert: last commit caused issues"
)

$repoRoot = "C:\FcXe Studios\Instadesk\instadesk-tauri"
Set-Location $repoRoot

$top = git rev-parse --show-toplevel 2>$null
if (-not $top -or $top -ne $repoRoot) {
    Write-Error "This script must run inside the instadesk-tauri Git repo. Found: $top"
    exit 1
}

# Create a revert commit for HEAD (no-edit to use Git message)
git revert --no-edit HEAD
# Optionally append a reason by amending message
git commit --amend -m "$Reason"

git push origin main
Write-Host "↩️  Reverted last commit and pushed."
