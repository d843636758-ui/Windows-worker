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

# Discover the real launcher while this interactive updater has the complete
# user environment. Taobao releases do not all use the same subdirectory.
$taobaoRoots = @()
foreach ($base in @($env:APPDATA, $env:LOCALAPPDATA)) {
  if (!$base) { continue }
  $record = Join-Path $base "taobao\install-location.txt"
  if (Test-Path -LiteralPath $record) {
    $root = (Get-Content -LiteralPath $record -Raw).Trim().Trim('"')
    if ($root) { $taobaoRoots += $root }
  }
}
if ($env:LOCALAPPDATA) {
  $taobaoRoots += Join-Path $env:LOCALAPPDATA "Programs\taobao"
  $taobaoRoots += Join-Path $env:LOCALAPPDATA "taobao"
}
if ($env:APPDATA) {
  $taobaoRoots += Join-Path $env:APPDATA "taobao"
}
$taobaoRoots = @($taobaoRoots | Select-Object -Unique)

$taobaoFiles = foreach ($root in $taobaoRoots) {
  if (!(Test-Path -LiteralPath $root -PathType Container)) { continue }
  Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^taobao-native(\.(cmd|bat|exe))?$' }
}
$taobaoExecutable = $taobaoFiles |
  Sort-Object @{ Expression = {
    switch -Regex ($_.Extension) {
      '^\.cmd$' { 0; break }
      '^\.exe$' { 1; break }
      '^\.bat$' { 2; break }
      default { 3 }
    }
  }}, FullName |
  Select-Object -First 1

if (!$taobaoExecutable) {
  throw "Taobao Native CLI was not found under: $($taobaoRoots -join '; ')"
}
$taobaoExecutable = $taobaoExecutable.FullName
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
