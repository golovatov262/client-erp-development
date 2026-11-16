# Private, short-lived loopback bridge to CryptoPro TLS. No system service,
# certificate installation, policy changes, or unverified TLS fallback.
function Get-OkbTunnelExecutable {
    $exe=Join-Path $PSScriptRoot 'transport/stunnel-msspi.exe'
    if (-not [Environment]::Is64BitOperatingSystem) {throw 'OKB transport requires 64-bit Windows'}
    if (-not (Test-Path -LiteralPath $exe)) {throw 'Download and extract the complete OKB 1.1 component'}
    if ((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash -ne 'f8a6aa5a2fab7670096021dd7b00b068f825fa251c52fab2b3c2828a56e6515a') {throw 'OKB TLS executable hash mismatch'}
    return $exe
}
function New-OkbTunnelConfig([int]$port,[string]$thumb) {
    if ($port -lt 1024 -or $port -gt 65535 -or $thumb -notmatch '^[a-fA-F0-9]{40}$') {throw 'Invalid TLS bridge parameters'}
    return (@('foreground = yes','debug = 4','output = tls.log','[crm-okb]','client = yes','msspi = yes','silent = yes',
        ('accept = 127.0.0.1:'+$port),'connect = cfb.bki-okb.com:443',
        'sni = cfb.bki-okb.com','checkHost = cfb.bki-okb.com','verifyChain = yes',
        ('cert = '+$thumb),'TIMEOUTconnect = 15','TIMEOUTbusy = 120','TIMEOUTidle = 120','TIMEOUTclose = 0') -join "`r`n")
}
function Stop-OkbTunnel($tunnel) {
    if ($null -ne $tunnel -and $null -ne $tunnel.Process) {
        try {if (-not $tunnel.Process.HasExited) {$tunnel.Process.Kill();$tunnel.Process.WaitForExit()}}
        finally {$tunnel.Process.Dispose()}
    }
}
function Start-OkbTunnel([string]$directory,[string]$thumb) {
    $exe=Get-OkbTunnelExecutable
    $listener=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,0)
    $listener.Start()
    try {$port=$listener.LocalEndpoint.Port} finally {$listener.Stop()}
    $file=Join-Path $directory 'tls.conf'
    [IO.File]::WriteAllText($file,(New-OkbTunnelConfig $port $thumb),[Text.Encoding]::ASCII)
    $start=New-Object Diagnostics.ProcessStartInfo
    $start.FileName=$exe;$start.Arguments='-quiet "'+$file+'"'
    $start.UseShellExecute=$false;$start.CreateNoWindow=$true
    $start.WorkingDirectory=$directory
    $process=[Diagnostics.Process]::Start($start)
    $tunnel=@{Process=$process;Port=$port}
    try {
        $deadline=[DateTime]::UtcNow.AddSeconds(15)
        do {
            if ($process.HasExited) {throw 'CryptoPro TLS bridge exited before listening'}
            # Detect a port collision before forwarding any credentials.
            $owners=@(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
            if ($owners.Count -gt 0) {
                if ($owners.Count -ne 1 -or $owners[0].OwningProcess -ne $process.Id) {throw 'TLS bridge port ownership mismatch'}
                return $tunnel
            }
            Start-Sleep -Milliseconds 100
        } while ([DateTime]::UtcNow -lt $deadline)
        throw 'CryptoPro TLS bridge startup timed out'
    } catch {Stop-OkbTunnel $tunnel;throw}
}
