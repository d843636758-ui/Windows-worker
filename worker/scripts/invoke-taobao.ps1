param(
  [Parameter(Mandatory = $true)] [string]$Executable,
  [Parameter(Mandatory = $true)] [string]$RequestPath,
  [Parameter(Mandatory = $true)] [string]$OutputPath
)

$ErrorActionPreference = "Stop"
& $Executable --request $RequestPath -o $OutputPath
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
