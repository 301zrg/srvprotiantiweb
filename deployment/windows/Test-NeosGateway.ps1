[CmdletBinding()]
param(
    [ValidateRange(1, 65535)][int]$GatewayPort = 7978,
    [ValidatePattern('^https?://[^\s/]+$')][string]$SiteOrigin = 'http://127.0.0.1:4173'
)
$ErrorActionPreference = 'Stop'

function Get-UpgradeStatus([string]$Origin, [bool]$WithClientIp, [string]$Path = '/neos') {
    $client = New-Object Net.Sockets.TcpClient
    try {
        $client.Connect('127.0.0.1', $GatewayPort)
        $stream = $client.GetStream()
        $stream.ReadTimeout = 5000
        $request = "GET $Path HTTP/1.1`r`nHost: 127.0.0.1`r`nConnection: Upgrade`r`nUpgrade: websocket`r`nSec-WebSocket-Version: 13`r`nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==`r`nOrigin: $Origin`r`n"
        if ($WithClientIp) { $request += "CF-Connecting-IP: 198.51.100.17`r`n" }
        $request += "`r`n"
        $bytes = [Text.Encoding]::ASCII.GetBytes($request)
        $stream.Write($bytes, 0, $bytes.Length)
        $buffer = New-Object byte[] 8192
        $text = ''
        while (-not $text.Contains("`r`n`r`n")) {
            $count = $stream.Read($buffer, 0, $buffer.Length)
            if ($count -eq 0) { throw 'Gateway closed before completing HTTP headers.' }
            $text += [Text.Encoding]::ASCII.GetString($buffer, 0, $count)
            if ($text.Length -gt 16384) { throw 'Unexpected oversized gateway headers.' }
        }
        $status = [regex]::Match($text, '^HTTP/1\.[01] ([0-9]{3})')
        if (-not $status.Success) { throw 'Gateway did not return an HTTP status.' }
        if ($status.Groups[1].Value -eq '101' -and -not $text.Contains('s3pPLMBiTxaQ9kYGzzhZRbK+xOo=')) {
            throw 'Invalid WebSocket accept header.'
        }
        return [int]$status.Groups[1].Value
    } finally { $client.Dispose() }
}

foreach ($test in @(
    @{ Origin=$SiteOrigin; Ip=$true; Path='/neos'; Expected=101; Name='Upgrade to Neos' },
    @{ Origin=$SiteOrigin; Ip=$false; Path='/neos'; Expected=403; Name='Missing trusted client IP' },
    @{ Origin='https://untrusted.example'; Ip=$true; Path='/neos'; Expected=403; Name='Untrusted Origin' },
    @{ Origin=$SiteOrigin; Ip=$true; Path='/admin'; Expected=404; Name='Other routes' }
)) {
    $actual = Get-UpgradeStatus $test.Origin $test.Ip $test.Path
    if ($actual -ne $test.Expected) { throw "$($test.Name): expected $($test.Expected), got $actual" }
    [Console]::WriteLine("PASS $($test.Name): $actual")
}
[Console]::WriteLine('Local gateway checks passed. Public tunnel/browser testing is still required.')
