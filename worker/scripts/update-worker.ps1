param([string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")))
$ErrorActionPreference = "Stop"
Set-Location $ProjectRoot
Stop-ScheduledTask -TaskName "AI Browser Worker" -ErrorAction SilentlyContinue
git pull --ff-only origin main
npm install
npm run build
Start-ScheduledTask -TaskName "AI Browser Worker"
Write-Host "Windows worker updated and restarted with Taobao Native tools."
