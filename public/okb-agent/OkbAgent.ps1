# Windows PowerShell 5.1. Credentials are DPAPI-protected for the current user.
param([string]$ConfigPath="$env:LOCALAPPDATA\CRM-OKB\config.json",[switch]$Once,[switch]$CheckOnly,[switch]$LibraryOnly)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'CryptoSupport.ps1')
function Okb-Api($body) {
    $body.entity='okb_agent'
    Invoke-RestMethod -Uri $crm -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes(($body|ConvertTo-Json -Depth 20 -Compress))) -TimeoutSec 120 -MaximumRedirection 0
}
function Curl-Value([string]$value) {
    if ($value -match '[\x00-\x1f\x7f]') {throw 'Control characters in CFB setting'}
    return '"'+$value.Replace('\','\\').Replace('"','\"')+'"'
}
function Cfb-Request([string]$method,[string]$path,$config,[byte[]]$payload=$null,[string]$fileName='') {
    if ($config.base_url -ne 'https://cfb.bki-okb.com/cfb') {throw 'Unexpected OKB API host'}
    if ($method -notin @('GET','POST') -or $path -notmatch '^/file/(inbox/bureaufile|outbox/(list|by-name/[A-Za-z0-9_.%-]+|mark-downloaded))(\?[^\r\n]*)?$') {throw 'Unexpected CFB request path'}
    $thumb=$config.tls_thumbprint;if (-not $thumb) {$thumb=$config.signer_thumbprint}
    if ($thumb -notmatch '^[A-Fa-f0-9]{40}$') {throw 'Invalid TLS certificate thumbprint'}
    $dir=Join-Path ([IO.Path]::GetTempPath()) ('crm-okb-'+[Guid]::NewGuid().ToString('N'))
    [IO.Directory]::CreateDirectory($dir)|Out-Null
    try {
        $output=Join-Path $dir 'response.bin'
        $lines=@('silent','show-error','proto = "=https"','connect-timeout = 15','max-time = 120','max-filesize = 31457280',
            ('output = '+(Curl-Value $output)),'write-out = "%{http_code}"',('cert = '+(Curl-Value ('CurrentUser\MY\'+$thumb))),
            ('request = '+(Curl-Value $method)),('url = '+(Curl-Value ($config.base_url+$path))))
        $auth=@{'X-Auth-Subscriber'=$config.sin;'X-Auth-Group'=$config.group;'X-Auth-Username'=$config.username;'X-Auth-Password'=$cfbPassword}
        foreach($key in $auth.Keys) {
            if (-not $auth[$key]) {throw ('Missing CFB credential: '+$key)}
            $lines+=('header = '+(Curl-Value ($key+': '+$auth[$key])))
        }
        if ($null -ne $payload) {
            $inputFile=Join-Path $dir 'encrypted.bin';[IO.File]::WriteAllBytes($inputFile,$payload)
            $safePath=$inputFile.Replace('\','/')
            if ($fileName) {
                if ($fileName -notmatch '^CHP_\d{5}_EFK_05-10_\d{17}\.zip\.pem\.pem$') {throw 'Invalid OKB upload filename'}
                $lines+=('form = '+(Curl-Value ('file=@"'+$safePath+'";filename='+$fileName+';type=application/octet-stream')))
            } else {
                $lines+='header = "Content-Type: application/json"'
                $lines+=('data-binary = '+(Curl-Value ('@'+$safePath)))
            }
        }
        # Credentials are passed through stdin, never arguments or a config file.
        $result=[Nbki.CurlClient]::Run((Get-NbkiCurl),@('-q','--config','-'),[Text.Encoding]::UTF8.GetBytes(($lines -join "`n")))
        if ($result.ExitCode -ne 0) {throw ('CFB transport error '+$result.ExitCode+'; check delivery before retrying')}
        if ($result.Output.Trim() -notmatch '^\d{3}$') {throw 'Invalid CFB HTTP response'}
        return @{Status=[int]$result.Output.Trim();Bytes=[IO.File]::ReadAllBytes($output)}
    } finally {Remove-Item -LiteralPath $dir -Recurse -Force}
}
function Cfb-Json($response) {
    if ($response.Status -ne 200) {throw ('CFB HTTP '+$response.Status+'; response saved when uploading')}
    return ([Text.Encoding]::UTF8.GetString($response.Bytes)|ConvertFrom-Json)
}
function Sign-Okb([byte[]]$zip,$certificate,[string]$tsp) {
    if (-not $tsp) {throw 'Missing TSP URL'}
    $signer=[Nbki.ComDispatch]::Create('CAdESCOM.CPSigner');$signer.Set('Certificate',$certificate)
    $signer.Set('CheckCertificate',$true);$signer.Set('Options',1);$signer.Set('TSAAddress',$tsp)
    $data=[Nbki.ComDispatch]::Create('CAdESCOM.CadesSignedData');$data.Set('ContentEncoding',1)
    $data.Set('Content',[Convert]::ToBase64String($zip))
    $signed=$data.Call('SignCades',@($signer,5,$false,0))
    Verify-Signature $zip $signed ($certificate.Get('Thumbprint')) $false 5
    Assert-TimestampCertificate ([Convert]::FromBase64String($signed))
    return ,([Text.Encoding]::ASCII.GetBytes($signed))
}
function Read-OkbReceipt([byte[]]$encrypted,[string]$expected) {
    $envelope=[Text.Encoding]::ASCII.GetString($encrypted).Trim()
    $signedBytes=Decrypt-Zip ([Convert]::FromBase64String($envelope))
    $signed=[Text.Encoding]::ASCII.GetString($signedBytes).Trim()
    $data=[Nbki.ComDispatch]::Create('CAdESCOM.CadesSignedData');$data.Set('ContentEncoding',1)
    $data.Call('VerifyCades',@($signed,1,$false))|Out-Null
    $zip=[Convert]::FromBase64String($data.Get('Content'))
    Verify-Signature $zip $signed $expected $false
    return ,(Receipt-Xml $zip $expected)
}
function Receipt-Xml([byte[]]$zip,[string]$expected) {
    if ($zip.Length -gt 10MB) {throw 'Receipt archive too large'}
    $stream=New-Object IO.MemoryStream(,$zip)
    $archive=New-Object IO.Compression.ZipArchive($stream,[IO.Compression.ZipArchiveMode]::Read)
    try {
        if ($archive.Entries.Count -ne 2) {throw 'Expected receipt XML and detached signature'}
        $entries=@{}
        foreach($entry in $archive.Entries) {
            if ($entry.FullName -match '[/\\]' -or $entry.Length -gt 2MB -or $entries.ContainsKey($entry.FullName)) {throw 'Invalid receipt ZIP entry'}
            $inputStream=$entry.Open();$output=New-Object IO.MemoryStream
            try {$inputStream.CopyTo($output);$entries[$entry.FullName]=$output.ToArray()} finally {$inputStream.Dispose();$output.Dispose()}
        }
        $names=@($entries.Keys|Where-Object {$_ -match '\.xml$'})
        if ($names.Count -ne 1) {throw 'Expected one receipt XML'}
        $xmlName=$names[0];$sigName=@($entries.Keys|Where-Object {$_ -ne $xmlName})[0]
        if ($sigName -notmatch '\.(sig|p7s|pem)$') {throw 'Unrecognized detached signature entry'}
        $signature=$entries[$sigName];$text=[Text.Encoding]::ASCII.GetString($signature).Trim()
        $text=$text -replace '^-----BEGIN (CMS|PKCS7)-----','' -replace '-----END (CMS|PKCS7)-----$',''
        if ($text -match '^[A-Za-z0-9+/=\s]+$') {$base64=$text} else {$base64=[Convert]::ToBase64String($signature)}
        Verify-Signature $entries[$xmlName] $base64 $expected $true
        return ,$entries[$xmlName]
    } finally {$archive.Dispose();$stream.Dispose()}
}
function Protect-Cache([byte[]]$raw,[string]$path) {
    Add-Type -AssemblyName System.Security
    [IO.File]::WriteAllBytes($path,[Security.Cryptography.ProtectedData]::Protect($raw,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))
}
function Ack-Okb($receipt,$config) {
    $json=[Text.Encoding]::UTF8.GetBytes((@{fileName=$receipt.file_name}|ConvertTo-Json -Compress))
    Cfb-Json (Cfb-Request 'POST' '/file/outbox/mark-downloaded' $config $json)|Out-Null
    Okb-Api @{action='ack';id=$receipt.id}|Out-Null
}
function Receive-Okb($task) {
    $config=$task.config;$reg=$task.file_name.Substring(0,$task.file_name.Length-4)
    $page=1;$count=100
    do {
        $listing=Cfb-Json (Cfb-Request 'GET' ('/file/outbox/list?kind=bureaufile&count='+$count+'&page='+$page+'&contextSearch='+[Uri]::EscapeDataString($reg)) $config)
        foreach($file in @($listing.page.files|Sort-Object @{Expression={if($_.name -match '^TECH'){0}else{1}}},name)) {
            if ($file.name -notmatch '^[A-Za-z0-9_.-]+$' -or -not $file.name.Contains($reg)) {continue}
            $cache=Join-Path $cacheDirectory ((Hash ([Text.Encoding]::UTF8.GetBytes($file.name)))+'.bin')
            if (Test-Path -LiteralPath $cache) {
                $encrypted=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($cache),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
            } else {
                $response=Cfb-Request 'GET' ('/file/outbox/by-name/'+[Uri]::EscapeDataString($file.name)) $config
                if ($response.Status -ne 200) {throw ('CFB receipt HTTP '+$response.Status)}
                $encrypted=$response.Bytes;Protect-Cache $encrypted $cache
            }
            $xml=Read-OkbReceipt $encrypted $config.receipt_signer.thumbprint
            $saved=Okb-Api @{action='receipt';id=$task.id;file_name=$file.name;xml_base64=[Convert]::ToBase64String($xml);encrypted_base64=[Convert]::ToBase64String($encrypted);evidence=@{signature_verified=$true;signer_thumbprint=$config.receipt_signer.thumbprint;xml_sha256=(Hash $xml)}}
            # Only acknowledge after durable CRM save. Failed acknowledgements remain in CRM.
            Ack-Okb @{id=$saved.id;file_name=$file.name} $config
            Remove-Item -LiteralPath $cache -Force
            Write-Host ('OKB package '+$task.id+': receipt verified and saved in CRM.')
        }
        $page++
        # Do not mark/download unrelated files. A finite page bound avoids an endless changed listing.
    } while (($page-1)*$count -lt $listing.totalCount -and $page -le 100)
}
if ($LibraryOnly) {return}
Add-Type -AssemblyName System.Security
$cfg=Get-Content -Raw -LiteralPath $ConfigPath|ConvertFrom-Json
$token=(New-Object Net.NetworkCredential('',(ConvertTo-SecureString $cfg.protectedToken))).Password
$cfbPassword=(New-Object Net.NetworkCredential('',(ConvertTo-SecureString $cfg.protectedCfbPassword))).Password
$crm=[Uri]$cfg.crmUrl;if ($crm.Scheme -ne 'https') {throw 'CRM requires HTTPS'}
$headers=@{'X-Okb-Agent-Key'=$token}
$cacheDirectory=Join-Path (Split-Path -Parent $ConfigPath) 'receipts';[IO.Directory]::CreateDirectory($cacheDirectory)|Out-Null
$mutex=New-Object Threading.Mutex($false,'Local\CRM-OKB-Agent')
if (-not $mutex.WaitOne(0)) {throw 'OKB component already running'}
try {
 do {
    $job=$null;$upload=$null;$diagnostic=@{version='1.0';computer=$env:COMPUTERNAME}
    try {
        $diagnostic.certificates=@(Local-Certificates);Get-NbkiCurl|Out-Null
        if ($CheckOnly) {Okb-Api @{action='heartbeat';diagnostic=$diagnostic}|Out-Null;Write-Host 'CHECK OK: certificate store and CRM. No files sent.';break}
        $poll=Okb-Api @{action='poll';diagnostic=$diagnostic};$job=$poll.job
        if ($job) {
            $raw=[Convert]::FromBase64String($job.xml_base64)
            if ((Hash $raw) -ne $job.sha256) {throw 'XML hash mismatch'}
            $cert=Find-Cert $job.config.signer_thumbprint;$recipient=Import-Cert $job.config.recipient.der_base64
            $zip=Make-Zip @{$job.file_name=$raw}
            $signed=Sign-Okb $zip $cert $job.config.tsp_url
            $encrypted=[Text.Encoding]::ASCII.GetBytes([Convert]::ToBase64String((Encrypt-Zip $signed $recipient)))
            $name=$job.file_name.Substring(0,$job.file_name.Length-4)+'.zip.pem.pem'
            Okb-Api @{action='sending';id=$job.id;lease=$job.lease;content_base64=[Convert]::ToBase64String($encrypted);evidence=@{xml_sha256=(Hash $raw);signer_thumbprint=$job.config.signer_thumbprint;recipient_thumbprint=$job.config.recipient.thumbprint;signature_profile='CAdES-T';signature_verified=$true;attached=$true}}|Out-Null
            $upload=Cfb-Request 'POST' '/file/inbox/bureaufile' $job.config $encrypted $name
            Protect-Cache $upload.Bytes (Join-Path $cacheDirectory ('upload-'+$job.id+'.bin'))
            $confirmation=Cfb-Json $upload
            Okb-Api @{action='sent';id=$job.id;lease=$job.lease;response=$confirmation}|Out-Null
            Write-Host ('OKB package '+$job.id+': upload confirmed. Awaiting receipts.')
        }
        foreach($ack in $poll.acks) {try {Ack-Okb $ack $poll.config} catch {Write-Warning ('Receipt acknowledgement: '+$_.Exception.Message)}}
        foreach($pending in $poll.pending) {try {Receive-Okb $pending} catch {$diagnostic.receipt_error=$_.Exception.Message;Write-Warning $diagnostic.receipt_error}}
    } catch {
        $diagnostic.error=$_.Exception.Message
        if ($job) {
            $failure=@{action='failed';id=$job.id;lease=$job.lease;error=$diagnostic.error}
            if ($upload -and $upload.Bytes.Length -le 1MB -and $upload.Bytes.Length -gt 0) {$failure.response_base64=[Convert]::ToBase64String($upload.Bytes)}
            try {Okb-Api $failure|Out-Null} catch {Write-Warning 'Could not save upload result in CRM; do not retry manually'}
        }
        Write-Warning $diagnostic.error
    }
    try {Okb-Api @{action='heartbeat';diagnostic=$diagnostic}|Out-Null} catch {Write-Warning 'CRM heartbeat failed'}
    if (-not $Once) {Start-Sleep -Seconds 30}
 } while (-not $Once)
} finally {$mutex.ReleaseMutex();$mutex.Dispose()}
