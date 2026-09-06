$task = Get-ScheduledTask -TaskName "AI Browser Worker" -ErrorAction SilentlyContinue
if ($task) { Unregister-ScheduledTask -TaskName "AI Browser Worker" -Confirm:$false }
Write-Host "Removed scheduled task. Profile and logs were preserved."
