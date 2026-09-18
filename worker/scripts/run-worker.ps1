param([Parameter(Mandatory=$true)][string]$ProjectRoot)
$ErrorActionPreference = "Stop"
Set-Location $ProjectRoot
$logDir = Join-Path $env:LOCALAPPDATA "AI-Browser-Worker\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# Scheduled tasks can inherit a reduced environment. Resolve the official
# Taobao CLI before Node starts and pass the verified absolute path directly.
$taobaoCandidates = @()
$installRecord = Join-Path $env:APPDATA "taobao\install-location.txt"
if (Test-Path $installRecord) {
  $taobaoRoot = (Get-Content $installRecord -Raw).Trim().Trim('"')
  if ($taobaoRoot) {
    $taobaoCandidates += Join-Path $taobaoRoot "bin\taobao-native.cmd"
    $taobaoCandidates += Join-Path $taobaoRoot "resources\app\bin\taobao-native.cmd"
  }
}
$taobaoCandidates += Join-Path $env:LOCALAPPDATA "Programs\taobao\bin\taobao-native.cmd"
$taobaoExecutable = $taobaoCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($taobaoExecutable) {
  $env:TAOBAO_NATIVE_PATH = $taobaoExecutable
}

$stamp = Get-Date -Format "yyyy-MM-dd"
& node --env-file=.env worker/dist/index.js *>> (Join-Path $logDir "worker-$stamp.log")
