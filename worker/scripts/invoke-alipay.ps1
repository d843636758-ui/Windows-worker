param(
  [string]$Executable = "alipay-bot",
  [Parameter(Mandatory=$true)][ValidateSet("check-wallet","submit-payment","query-payment-status")][string]$Command,
  [Parameter(ValueFromRemainingArguments=$true)][string[]]$Rest
)
$ErrorActionPreference = "Stop"
$candidate = $null
if ([IO.Path]::IsPathRooted($Executable) -and (Test-Path $Executable)) { $candidate = $Executable }
if (-not $candidate) { $candidate = (Get-Command $Executable -ErrorAction SilentlyContinue).Source }
if (-not $candidate) {
  @(
    (Join-Path $env:APPDATA "npm\alipay-bot.cmd"),
    (Join-Path $env:LOCALAPPDATA "npm\alipay-bot.cmd")
  ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1 | ForEach-Object { $candidate = $_ }
}
if (-not $candidate) { throw "alipay-bot was not found. Run: npx.cmd -y @alipay/agent-payment@latest install-cli" }
& $candidate $Command @Rest
exit $LASTEXITCODE
