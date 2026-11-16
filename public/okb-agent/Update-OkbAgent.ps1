# Run from the extracted 1.1 package. Existing DPAPI credentials and receipts stay.
$ErrorActionPreference='Stop'
$directory=Join-Path $env:LOCALAPPDATA 'CRM-OKB'
if (-not (Test-Path -LiteralPath (Join-Path $directory 'config.json'))) {throw 'Existing OKB installation not found; use Install-OkbAgent.ps1'}
. (Join-Path $PSScriptRoot 'OkbTransport.ps1')
Get-OkbTunnelExecutable|Out-Null
$task=Get-ScheduledTask -TaskName 'CRM OKB Exchange' -ErrorAction Stop
Stop-ScheduledTask -InputObject $task
$deadline=[DateTime]::UtcNow.AddSeconds(15)
while ((Get-ScheduledTask -TaskName 'CRM OKB Exchange').State -eq 'Running') {
    if ([DateTime]::UtcNow -gt $deadline) {throw 'Old OKB task is still running; files not replaced'}
    Start-Sleep -Milliseconds 200
}
$backup=Join-Path $directory ('backup-'+[DateTime]::UtcNow.ToString('yyyyMMddHHmmss'))
New-Item -ItemType Directory -Path $backup|Out-Null
foreach($name in @('OkbAgent.ps1','CryptoSupport.ps1','OkbTransport.ps1','transport')) {
    $target=Join-Path $directory $name
    if (Test-Path -LiteralPath $target) {Copy-Item -LiteralPath $target -Destination $backup -Recurse}
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $directory -Recurse -Force
}
Write-Host 'Updated to OKB 1.1. Settings and receipts preserved. Background task remains stopped.'
Write-Host 'Run OkbAgent.ps1 -CheckConnection before starting the background task.'
