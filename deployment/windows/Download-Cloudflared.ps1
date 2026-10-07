[CmdletBinding()]
param([string]$Destination)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
# Resolve after parameter binding; some hosts do not populate PSScriptRoot in defaults.
$deploymentScriptPath = $MyInvocation.MyCommand.Path
if ([string]::IsNullOrEmpty($deploymentScriptPath)) {
    throw 'Run this saved script with powershell -File; its script path is unavailable.'
}
$deploymentScriptDirectory = Split-Path -Parent $deploymentScriptPath
if ([string]::IsNullOrEmpty($Destination)) {
    $Destination = Join-Path $deploymentScriptDirectory 'cloudflared.exe'
}
$version = '2026.10.0'
$expectedHash = '86aee4017b26625cee8484c113558f48effa4cd47f7aa05fcf425604e5d2b23c'
$url = "https://github.com/cloudflare/cloudflared/releases/download/$version/cloudflared-windows-amd64.exe"
$target = [IO.Path]::GetFullPath($Destination)
$parent = Split-Path -Parent $target
New-Item -ItemType Directory -Force -Path $parent | Out-Null

if (Test-Path -LiteralPath $target) {
    $actualHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHash) {
        throw 'Existing cloudflared differs from the pinned release. Choose a new Destination; do not overwrite another installation.'
    }
} else {
    $download = $target + '.download'
    Invoke-WebRequest -Uri $url -OutFile $download -UseBasicParsing
    $actualHash = (Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHash) { throw 'Official cloudflared download SHA256 mismatch.' }
    Move-Item -LiteralPath $download -Destination $target
}
& $target --version
if ($LASTEXITCODE -ne 0) { throw 'cloudflared version check failed.' }
