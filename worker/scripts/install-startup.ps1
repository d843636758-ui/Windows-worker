param([string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")))
$ErrorActionPreference = "Stop"
$runner = Join-Path $ProjectRoot "worker\scripts\run-worker.ps1"
if (!(Test-Path (Join-Path $ProjectRoot ".env"))) { throw "Create $ProjectRoot\.env first." }
if (!(Test-Path (Join-Path $ProjectRoot "worker\dist\index.js"))) { throw "Run npm install and npm run build first." }
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runner`" -ProjectRoot `"$ProjectRoot`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName "AI Browser Worker" -Action $action -Trigger $trigger -Settings $settings -Description "Outbound-only Edge automation worker" -Force | Out-Null
Start-ScheduledTask -TaskName "AI Browser Worker"
Write-Host "Installed and started: AI Browser Worker"
