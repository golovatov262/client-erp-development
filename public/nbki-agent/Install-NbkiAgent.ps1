param([Parameter(Mandatory=$true)][string]$CrmUrl)
$ErrorActionPreference='Stop'
$uri=[Uri]$CrmUrl
if ($uri.Scheme -ne 'https') { throw 'Use the HTTPS CRM API address' }
$directory=Join-Path $env:LOCALAPPDATA 'CRM-NBKI'
New-Item -ItemType Directory -Force -Path $directory | Out-Null
$token=Read-Host 'Paste the one-time agent token from CRM' -AsSecureString
@{crmUrl=$CrmUrl; protectedToken=($token | ConvertFrom-SecureString)} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $directory 'config.json') -Encoding UTF8
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'NbkiAgent.ps1') -Destination $directory -Force
$script=Join-Path $directory 'NbkiAgent.ps1'
# No execution-policy or system security changes. The task runs as the current
# interactive user because their registry contains the private-key container.
$action=New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument "-NoProfile -File `"$script`""
$trigger=New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
$principal=New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'CRM NBKI Exchange' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName 'CRM NBKI Exchange'
Write-Host 'Agent installed for the current Windows account. See status and certificates in CRM.'
