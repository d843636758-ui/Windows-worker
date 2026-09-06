param([string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")))
$ErrorActionPreference = "Continue"
Write-Host "Node:" (node --version)
Write-Host "Edge:" ((Get-Command msedge.exe -ErrorAction SilentlyContinue).Source)
Write-Host "Config:" (Test-Path (Join-Path $ProjectRoot ".env"))
Write-Host "Build:" (Test-Path (Join-Path $ProjectRoot "worker\dist\index.js"))
Write-Host "Alipay bot:" ((Get-Command alipay-bot -ErrorAction SilentlyContinue).Source)
$task = Get-ScheduledTask -TaskName "AI Browser Worker" -ErrorAction SilentlyContinue
if ($task) { Write-Host "Startup task:" $task.State } else { Write-Host "Startup task: not installed" }
if (Test-Path (Join-Path $ProjectRoot ".env")) {
  $relay = (Get-Content (Join-Path $ProjectRoot ".env") | Where-Object { $_ -match '^RELAY_URL=' } | Select-Object -First 1) -replace '^RELAY_URL=',''
  if ($relay) { Write-Host "Relay configured:" $relay }
}
