param([string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")))
$ErrorActionPreference = "Stop"
Set-Location $ProjectRoot
Stop-ScheduledTask -TaskName "AI Browser Worker" -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq "node.exe" -and $_.CommandLine -match "worker[\\/]+dist[\\/]+index\.js"
} | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}
$git = Get-Command git -ErrorAction SilentlyContinue
if ($git -and (Test-Path (Join-Path $ProjectRoot ".git"))) {
  git pull --ff-only origin main
} else {
  $temporary = Join-Path $env:TEMP ("windows-worker-update-" + [guid]::NewGuid().ToString("N"))
  $archive = Join-Path $temporary "main.zip"
  New-Item -ItemType Directory -Force -Path $temporary | Out-Null
  try {
    Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/d843636758-ui/Windows-worker/archive/refs/heads/main.zip" -OutFile $archive
    Expand-Archive -Path $archive -DestinationPath $temporary -Force
    $source = Join-Path $temporary "Windows-worker-main"
    if (!(Test-Path (Join-Path $source "package.json"))) { throw "Downloaded Windows-worker archive is invalid." }
    Copy-Item -Path (Join-Path $source "*") -Destination $ProjectRoot -Recurse -Force
  } finally {
    Remove-Item -Path $temporary -Recurse -Force -ErrorAction SilentlyContinue
  }
}
npm install
npm run build
Start-ScheduledTask -TaskName "AI Browser Worker"
Write-Host "Windows worker updated and restarted with Taobao Native tools."
