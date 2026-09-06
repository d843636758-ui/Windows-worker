param([Parameter(Mandatory=$true)][string]$ProjectRoot)
$ErrorActionPreference = "Stop"
Set-Location $ProjectRoot
$logDir = Join-Path $env:LOCALAPPDATA "AI-Browser-Worker\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp = Get-Date -Format "yyyy-MM-dd"
& node --env-file=.env worker/dist/index.js *>> (Join-Path $logDir "worker-$stamp.log")
