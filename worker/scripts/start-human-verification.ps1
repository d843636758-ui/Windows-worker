param([string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")))
$ErrorActionPreference = "Stop"
Stop-ScheduledTask -TaskName "AI Browser Worker" -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3
$profile = Join-Path $env:LOCALAPPDATA "AI-Browser-Worker\edge-profile"
$envFile = Join-Path $ProjectRoot ".env"
if (Test-Path $envFile) {
  $line = Get-Content $envFile | Where-Object { $_ -match '^EDGE_PROFILE_DIR=' } | Select-Object -First 1
  if ($line) { $profile = ($line -replace '^EDGE_PROFILE_DIR=','') -replace '^%LOCALAPPDATA%', $env:LOCALAPPDATA }
}
$edge = (Get-Command msedge.exe -ErrorAction SilentlyContinue).Source
if (-not $edge) { $edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe" }
Start-Process $edge -ArgumentList @("--user-data-dir=$profile","https://www.taobao.com")
Write-Host "Manual verification mode opened. Finish the verification yourself, then close this dedicated Edge window and run resume-after-verification.ps1."
