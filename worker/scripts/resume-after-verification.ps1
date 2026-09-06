$ErrorActionPreference = "Stop"
Start-ScheduledTask -TaskName "AI Browser Worker"
Write-Host "AI Browser Worker resumed."
