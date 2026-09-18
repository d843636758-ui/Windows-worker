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

# Resolve Taobao while this interactive updater has the user's complete
# environment, then persist the verified absolute command for the hidden task.
$taobaoCandidates = @()
foreach ($base in @($env:APPDATA, $env:LOCALAPPDATA)) {
  if (!$base) { continue }
  $record = Join-Path $base "taobao\install-location.txt"
  if (Test-Path -LiteralPath $record) {
    $root = (Get-Content -LiteralPath $record -Raw).Trim().Trim('"')
    if ($root) {
      $taobaoCandidates += Join-Path $root "bin\taobao-native.cmd"
      $taobaoCandidates += Join-Path $root "resources\app\bin\taobao-native.cmd"
      $taobaoCandidates += Join-Path $root "resources\bin\taobao-native.cmd"
    }
  }
}
if ($env:LOCALAPPDATA) {
  $taobaoCandidates += Join-Path $env:LOCALAPPDATA "Programs\taobao\bin\taobao-native.cmd"
}
$taobaoExecutable = $taobaoCandidates |
  Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
  Select-Object -First 1
if (!$taobaoExecutable) {
  throw "Taobao Native CLI was not found while updating. Checked: $($taobaoCandidates -join '; ')"
}
$taobaoExecutable = (Resolve-Path -LiteralPath $taobaoExecutable).Path
$envFile = Join-Path $ProjectRoot ".env"
$envLines = if (Test-Path -LiteralPath $envFile) {
  @(Get-Content -LiteralPath $envFile | Where-Object { $_ -notmatch '^TAOBAO_NATIVE_PATH=' })
} else {
  @()
}
$envLines += 'TAOBAO_NATIVE_PATH="' + $taobaoExecutable + '"'
[System.IO.File]::WriteAllLines($envFile, $envLines, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Verified Taobao Native CLI: $taobaoExecutable"

npm install
npm run build
Start-ScheduledTask -TaskName "AI Browser Worker"
Write-Host "Windows worker updated and restarted with Taobao Native tools."
