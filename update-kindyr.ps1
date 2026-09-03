# Ejecuta pnpm update-kindyr desde cualquier carpeta
# Uso: powershell -ExecutionPolicy Bypass -File C:\KindyrLauncher\update-kindyr.ps1
# O: pnpm --dir C:\KindyrLauncher update-kindyr
# O: node C:\KindyrLauncher\scripts\update-kindyr.js

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot
Write-Host "Ejecutando pnpm update-kindyr desde $ProjectRoot..." -ForegroundColor Cyan
pnpm update-kindyr
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Si viste ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND, ejecuta:" -ForegroundColor Yellow
  Write-Host "  cd C:\KindyrLauncher; pnpm update-kindyr" -ForegroundColor White
  Write-Host "  o" -ForegroundColor Yellow
  Write-Host "  pnpm --dir C:\KindyrLauncher update-kindyr" -ForegroundColor White
  Write-Host "  o" -ForegroundColor Yellow
  Write-Host "  node C:\KindyrLauncher\scripts\update-kindyr.js" -ForegroundColor White
}
