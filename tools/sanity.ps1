# tools/sanity.ps1
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path $root

$paths = @(
  (Join-Path $repo "README.md"),
  (Join-Path $repo "ui"),
  (Join-Path $repo "ui\package.json"),
  (Join-Path $repo "ui\src\main.tsx")
)

$missing = @()
foreach ($p in $paths) { if (-not (Test-Path $p)) { $missing += $p } }

if ($missing.Count -gt 0) {
  Write-Host "Sanity check FAILED. Missing:" -ForegroundColor Red
  $missing | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
  exit 1
}

Write-Host "Sanity check OK: repo structure looks good." -ForegroundColor Green
exit 0
