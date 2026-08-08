$ErrorActionPreference = "Stop"

Write-Host "`nFitMind - reparando a instalacao do conector...`n" -ForegroundColor Cyan

# Fecha processos antigos que podem manter arquivos da instalacao bloqueados.
Get-Process chrome, msedge, node -ErrorAction SilentlyContinue | Stop-Process -Force

$nodeModules = Join-Path $PSScriptRoot "node_modules"
$puppeteerCache = Join-Path $env:USERPROFILE ".cache\puppeteer"

if (Test-Path $nodeModules) {
  Write-Host "Removendo instalacao incompleta..."
  Remove-Item -Recurse -Force $nodeModules
}

if (Test-Path $puppeteerCache) {
  Write-Host "Removendo download incompleto do navegador..."
  Remove-Item -Recurse -Force $puppeteerCache
}

# Garantia adicional para versoes antigas e novas do instalador.
$env:PUPPETEER_SKIP_DOWNLOAD = "true"
$env:PUPPETEER_SKIP_CHROME_DOWNLOAD = "true"

Push-Location $PSScriptRoot
try {
  Write-Host "Instalando dependencias sem baixar outro navegador...`n"
  npm install
  if ($LASTEXITCODE -ne 0) {
    throw "O npm terminou com o codigo $LASTEXITCODE."
  }
} finally {
  Pop-Location
}

Write-Host "`nInstalacao concluida. Agora execute: npm start" -ForegroundColor Green