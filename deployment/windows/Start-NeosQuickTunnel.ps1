[CmdletBinding()]
param(
    [string]$CloudflaredPath,
    [ValidateRange(1, 65535)][int]$GatewayPort = 7978,
    [ValidateSet('http2', 'quic', 'auto')][string]$Protocol = 'auto'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$deploymentScriptPath = $MyInvocation.MyCommand.Path
if ([string]::IsNullOrEmpty($deploymentScriptPath)) {
    throw 'Run this saved script with powershell -File; its script path is unavailable.'
}
$deploymentScriptDirectory = Split-Path -Parent $deploymentScriptPath
if ([string]::IsNullOrEmpty($CloudflaredPath)) {
    $CloudflaredPath = Join-Path $deploymentScriptDirectory 'cloudflared.exe'
}
$binary = [IO.Path]::GetFullPath($CloudflaredPath)
if (-not (Test-Path -LiteralPath $binary -PathType Leaf)) {
    throw 'Run Download-Cloudflared.ps1 first, or pass -CloudflaredPath.'
}
$probe = New-Object Net.Sockets.TcpClient
try { $probe.Connect('127.0.0.1', $GatewayPort) }
finally { $probe.Dispose() }

$runDir = Join-Path $deploymentScriptDirectory ('runtime\quick-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $runDir | Out-Null
$stdout = Join-Path $runDir 'stdout.log'
$stderr = Join-Path $runDir 'stderr.log'
function Read-TunnelLog([string]$LogPath) {
    # Start-Process keeps redirected logs open for writing; permit that writer.
    $logStream = [IO.File]::Open($LogPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    $logReader = $null
    try {
        $logReader = New-Object IO.StreamReader($logStream)
        return $logReader.ReadToEnd()
    } finally {
        if ($logReader) { $logReader.Dispose() }
        else { $logStream.Dispose() }
    }
}
$configPath = Join-Path $runDir 'quick-tunnel.yml'
[IO.File]::WriteAllText($configPath, "protocol: $Protocol" + [Environment]::NewLine)
$arguments = @('tunnel', '--config', ('"' + $configPath + '"'), '--no-autoupdate', '--protocol', $Protocol, '--url', "http://127.0.0.1:$GatewayPort")
$tunnelProcess = $null
try {
    $tunnelProcess = Start-Process -FilePath $binary -ArgumentList $arguments -WorkingDirectory $runDir `
        -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    $deadline = [DateTime]::UtcNow.AddSeconds(90)
    $publicUrl = $null
    while ([DateTime]::UtcNow -lt $deadline) {
        $tunnelProcess.Refresh()
        if ($tunnelProcess.HasExited) { throw "cloudflared exited. See $stderr" }
        $text = ''
        foreach ($log in @($stdout, $stderr)) {
            if (Test-Path -LiteralPath $log) { $text += Read-TunnelLog $log }
        }
        $match = [regex]::Match($text, 'https://[a-z0-9-]+\.trycloudflare\.com')
        if ($match.Success -and $text.Contains('Registered tunnel connection')) {
            $publicUrl = $match.Value
            break
        }
        Start-Sleep -Milliseconds 500
    }
    if (-not $publicUrl) { throw "Tunnel registration timed out. Check outbound TCP 7844 and $stderr" }
    $wssUrl = $publicUrl.Replace('https://', 'wss://') + '/neos'
    [IO.File]::WriteAllText((Join-Path $runDir 'endpoint.txt'), $wssUrl + [Environment]::NewLine)
    [Console]::WriteLine("Neos test endpoint: $wssUrl")
    [Console]::WriteLine("Logs: $runDir")
    [Console]::WriteLine('Keep this terminal open. Ctrl+C stops ONLY this tunnel. Restart creates a new URL.')
    while (-not $tunnelProcess.HasExited) {
        Start-Sleep -Seconds 1
        $tunnelProcess.Refresh()
    }
    throw "Tunnel stopped unexpectedly. See $stderr"
} finally {
    if ($tunnelProcess) {
        $tunnelProcess.Refresh()
        if (-not $tunnelProcess.HasExited) { Stop-Process -Id $tunnelProcess.Id }
    }
}
