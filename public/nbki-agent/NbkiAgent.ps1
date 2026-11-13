# Windows PowerShell 5.1; CryptoPro CSP and CAdES COM must be installed.
param([string]$ConfigPath = "$env:LOCALAPPDATA\CRM-NBKI\config.json", [switch]$Once, [switch]$LibraryOnly)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
function Api($body) {
    $body.entity = 'nbki_agent'
    Invoke-RestMethod -Uri $crm -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Depth 15 -Compress))) -TimeoutSec 120 -MaximumRedirection 0
}
function Hash([byte[]]$bytes) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }
}
function Find-Cert($thumb) {
    $store = New-Object -ComObject CAdESCOM.Store
    $store.Open(2, 'My', 0)
    $found = $store.Certificates.Find(0, $thumb)
    if ($found.Count -ne 1) { throw "Certificate not found: $thumb" }
    $cert = $found.Item(1)
    if (-not $cert.HasPrivateKey()) { throw 'Private key unavailable in this Windows account' }
    if (-not $cert.IsValid().Result) { throw 'Certificate chain or validity check failed' }
    return $cert
}
function Import-Cert($base64) {
    $cert = New-Object -ComObject CAdESCOM.Certificate
    $cert.Import($base64)
    if (-not $cert.IsValid().Result) { throw 'NBKI certificate chain or validity check failed' }
    return $cert
}
function Cms-Sign([byte[]]$raw, $certificate, [string]$tsp) {
    if (-not $tsp) { throw 'Configure accredited CA timestamp service first' }
    $signer = New-Object -ComObject CAdESCOM.CPSigner
    $signer.Certificate = $certificate; $signer.CheckCertificate = $true; $signer.Options = 2
    $signer.TSAAddress = $tsp
    $data = New-Object -ComObject CAdESCOM.CadesSignedData
    $data.ContentEncoding = 1; $data.Content = [Convert]::ToBase64String($raw)
    $signed = $data.SignCades($signer, 5, $true)
    Verify-Signature $raw $signed $certificate.Thumbprint $true 5
    Assert-TimestampCertificate ([Convert]::FromBase64String($signed))
    return ,([Convert]::FromBase64String($signed))
}
function Verify-Signature([byte[]]$raw, [string]$signature, [string]$expected, [bool]$detached, [int]$profile=1) {
    $data = New-Object -ComObject CAdESCOM.CadesSignedData
    $data.ContentEncoding = 1
    if ($detached) { $data.Content = [Convert]::ToBase64String($raw) }
    $data.VerifyCades($signature, $profile, $detached)
    if ($data.Signers.Count -ne 1 -or $data.Signers.Item(1).Certificate.Thumbprint -ne $expected) { throw 'Unexpected signature certificate' }
    if (-not $data.Signers.Item(1).Certificate.IsValid().Result) { throw 'Signing certificate is not valid' }
    if (-not $detached -and (Hash ([Convert]::FromBase64String($data.Content))) -ne (Hash $raw)) { throw 'Signed content differs from XML' }
}
function Assert-TimestampCertificate([byte[]]$signature) {
    # Decode only here; CAdES COM above verifies the GOST signature and timestamp.
    Add-Type -AssemblyName System.Security
    $cms = New-Object Security.Cryptography.Pkcs.SignedCms
    $cms.Decode($signature)
    if ($cms.SignerInfos.Count -ne 1) { throw 'Expected one signer' }
    $timestamps = @($cms.SignerInfos[0].UnsignedAttributes | Where-Object { $_.Oid.Value -eq '1.2.840.113549.1.9.16.2.14' })
    if ($timestamps.Count -ne 1 -or $timestamps[0].Values.Count -ne 1) { throw 'Missing signature timestamp' }
    $stamp = New-Object Security.Cryptography.Pkcs.SignedCms
    $stamp.Decode($timestamps[0].Values[0].RawData)
    if ($stamp.SignerInfos.Count -ne 1 -or -not $stamp.SignerInfos[0].Certificate) { throw 'Timestamp must include TSA certificate' }
}
function Make-Zip($entries) {
    $stream = New-Object IO.MemoryStream
    $zip = New-Object IO.Compression.ZipArchive($stream, [IO.Compression.ZipArchiveMode]::Create, $true)
    try {
        foreach ($name in $entries.Keys) {
            $entry = $zip.CreateEntry($name, [IO.Compression.CompressionLevel]::Optimal)
            $output = $entry.Open()
            try { $bytes = $entries[$name]; $output.Write($bytes,0,$bytes.Length) } finally { $output.Dispose() }
        }
    } finally { $zip.Dispose() }
    try { return ,$stream.ToArray() } finally { $stream.Dispose() }
}
function Encrypt-Zip([byte[]]$raw, $recipient) {
    $envelope = New-Object -ComObject CAdESCOM.CPEnvelopedData
    $envelope.ContentEncoding = 1; $envelope.Content = [Convert]::ToBase64String($raw)
    $envelope.Algorithm.Name = 25 # GOST 28147-89, NBKI instruction figure 10
    $envelope.Recipients.Add($recipient)
    return ,([Convert]::FromBase64String($envelope.Encrypt(0)))
}
function Decrypt-Zip([byte[]]$raw) {
    $envelope = New-Object -ComObject CAdESCOM.CPEnvelopedData
    $envelope.ContentEncoding = 1
    $envelope.Decrypt([Convert]::ToBase64String($raw))
    return ,([Convert]::FromBase64String($envelope.Content))
}
function Nbki-Request($method, [Uri]$uri, [byte[]]$payload, $config, [string]$fileName) {
    if ($uri.Scheme -ne 'https' -or $uri.Host -ne 'icrs.nbki.ru' -or $uri.Port -ne 443 -or $uri.UserInfo -or $uri.Query -or $uri.Fragment) { throw 'Invalid NBKI HTTPS URL' }
    $handler = New-Object Net.Http.HttpClientHandler
    $handler.AllowAutoRedirect = $false
    $thumb = $config.tls_thumbprint
    if (-not $thumb) { $thumb = $config.signer_thumbprint }
    $tls = Get-Item -LiteralPath "Cert:\CurrentUser\My\$thumb"
    $handler.ClientCertificates.Add($tls) | Out-Null
    $client = New-Object Net.Http.HttpClient($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(120); $client.MaxResponseContentBufferSize = 30MB
    $request = New-Object Net.Http.HttpRequestMessage((New-Object Net.Http.HttpMethod($method)), $uri)
    try {
        if ($method -eq 'POST') { $request.Content = Upload-Content $payload $fileName }
        $response = $client.SendAsync($request).GetAwaiter().GetResult()
        try {
            if ($method -eq 'GET' -and [int]$response.StatusCode -eq 404) { return $null }
            if (-not $response.IsSuccessStatusCode) { throw "NBKI HTTP $([int]$response.StatusCode)" }
            return ,$response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
        } finally { $response.Dispose() }
    } finally { $request.Dispose(); $client.Dispose(); $handler.Dispose() }
}
function Upload-Content([byte[]]$payload, [string]$fileName) {
    if ($fileName -notmatch '^[A-Za-z0-9_]+\.zip\.(p7m|enc)$') { throw 'Invalid protected filename' }
    $multipart = New-Object Net.Http.MultipartFormDataContent
    $file = New-Object Net.Http.ByteArrayContent(,$payload)
    $file.Headers.ContentType = New-Object Net.Http.Headers.MediaTypeHeaderValue('application/octet-stream')
    $multipart.Add($file, 'file', $fileName)
    $multipart.Add((New-Object Net.Http.StringContent('uploadGUTDF')), 'pathnm')
    return ,$multipart
}
function Assert-UploadSuccess([byte[]]$response, [string]$fileName) {
    $text = [Text.Encoding]::UTF8.GetString($response).Trim()
    $pattern = '\ASuccess\s+The following files were successfully uploaded\s*:\s*' + [regex]::Escape($fileName) + '\s*\z'
    if ($text -cnotmatch $pattern) { throw 'NBKI did not confirm upload of this filename. Check delivery before retrying.' }
}
function Receive-Task($task, $config) {
    # Cache downloaded bytes using current-user DPAPI before processing. Retry CRM
    # acknowledgement from cache, never download the same receipt after success.
    $path = Join-Path $cacheDirectory ("receipt-{0}-{1}.txt" -f $task.id,$task.stage)
    if (-not (Test-Path -LiteralPath $path)) {
        foreach ($candidate in $task.urls) {
            $incoming = Nbki-Request 'GET' ([Uri]$candidate.url) $null $config
            if ($null -eq $incoming) { continue }
            $record = @{incoming=[Convert]::ToBase64String($incoming); encrypted=[bool]$candidate.encrypted}
            $protected = ConvertFrom-SecureString (ConvertTo-SecureString ($record | ConvertTo-Json -Compress) -AsPlainText -Force)
            $temporary = $path + '.tmp'
            [IO.File]::WriteAllText($temporary,$protected)
            Move-Item -LiteralPath $temporary -Destination $path -Force
            break
        }
    }
    if (-not (Test-Path -LiteralPath $path)) { return }
    $secure = ConvertTo-SecureString ([IO.File]::ReadAllText($path))
    $record = (New-Object Net.NetworkCredential('', $secure)).Password | ConvertFrom-Json
    $incoming = [Convert]::FromBase64String($record.incoming)
    $archive = if ($record.encrypted) { Decrypt-Zip $incoming } else { $incoming }
    Verify-Receipt $archive $config.receipt_signer.thumbprint
    Api @{action='receipt'; content_base64=[Convert]::ToBase64String($archive); encrypted_base64=[Convert]::ToBase64String($incoming); evidence=@{
        signature_verified=$true; signer_thumbprint=$config.receipt_signer.thumbprint; archive_sha256=(Hash $archive)}} | Out-Null
    # Keep cache until package processing is finished; it also handles lost CRM responses.
}
function Verify-Receipt([byte[]]$archive, $expected) {
    if ($archive.Length -gt 2MB) { throw 'Receipt archive too large' }
    $stream = New-Object IO.MemoryStream(,$archive)
    $zip = New-Object IO.Compression.ZipArchive($stream,[IO.Compression.ZipArchiveMode]::Read)
    try {
        if ($zip.Entries.Count -ne 2) { throw 'Receipt requires XML and detached signature' }
        $entries = @{}
        foreach ($entry in $zip.Entries) {
            if ($entry.FullName -match '[/\\]' -or $entry.Length -gt 2MB -or $entries.ContainsKey($entry.FullName)) { throw 'Invalid receipt archive entry' }
            $inputStream = $entry.Open(); $output = New-Object IO.MemoryStream
            try { $inputStream.CopyTo($output); $entries[$entry.FullName] = $output.ToArray() } finally { $inputStream.Dispose(); $output.Dispose() }
        }
        $names = @($entries.Keys | Where-Object { $_.EndsWith('.xml') })
        if ($names.Count -ne 1 -or -not $entries.ContainsKey($names[0]+'.sig')) { throw 'Missing receipt signature' }
        Verify-Signature $entries[$names[0]] ([Convert]::ToBase64String($entries[$names[0]+'.sig'])) $expected $true
    } finally { $zip.Dispose(); $stream.Dispose() }
}
if ($LibraryOnly) { return }
$cfg = Get-Content -Raw -LiteralPath $ConfigPath | ConvertFrom-Json
$secret = ConvertTo-SecureString $cfg.protectedToken
$token = (New-Object System.Net.NetworkCredential('', $secret)).Password
$crm = [Uri]$cfg.crmUrl
if ($crm.Scheme -ne 'https') { throw 'CRM requires HTTPS' }
$headers = @{ 'X-Nbki-Agent-Key' = $token }
$mutex = New-Object Threading.Mutex($false, 'Local\CRM-NBKI-Agent')
if (-not $mutex.WaitOne(0)) { throw 'Another NBKI agent is already running in this session' }
$cacheDirectory = Join-Path (Split-Path -Parent $ConfigPath) 'receipts'
New-Item -ItemType Directory -Path $cacheDirectory -Force | Out-Null
try {
 do {
    $diagnostic = @{version='2.0'; computer=$env:COMPUTERNAME; account=$env:USERNAME}
    $job = $null
    try {
        $store = New-Object -ComObject CAdESCOM.Store; $store.Open(2,'My',0)
        $certs = @()
        for ($i=1; $i -le $store.Certificates.Count; $i++) {
            $cert=$store.Certificates.Item($i)
            if ($cert.HasPrivateKey() -and $cert.ValidToDate -gt (Get-Date)) {
                $certs += @{thumbprint=$cert.Thumbprint; subject=$cert.SubjectName; valid_until=[string]$cert.ValidToDate}
            }
        }
        $diagnostic.certificates = $certs; $store.Close()
        $poll = Api @{action='poll'; diagnostic=$diagnostic}; $job=$poll.job
        if ($job) {
            $cert = Find-Cert $job.config.signer_thumbprint
            $recipient = Import-Cert $job.config.recipient.der_base64
            if ($recipient.Thumbprint -ne $job.config.recipient.thumbprint) { throw 'Recipient certificate mismatch' }
            if (-not $job.encrypted_base64) {
                $raw = [Convert]::FromBase64String($job.xml_base64)
                if ((Hash $raw) -ne $job.sha256) { throw 'XML checksum mismatch' }
                if ($job.config.protocol_version -ne 2 -or $job.config.signature_profile -ne 'CAdES-T') { throw 'Unsupported package profile' }
                $signature = Cms-Sign $raw $cert $job.config.tsp_url
                $entries = @{}; $entries[$job.file_name+'.sig'] = $signature
                $entries[$job.file_name] = $raw
                if ($job.config.mchd_base64) { $entries['mchd.zip'] = [Convert]::FromBase64String($job.config.mchd_base64) }
                $archive = Make-Zip $entries
                $encrypted = Encrypt-Zip $archive $recipient
                $prepared = Api @{action='prepared'; id=$job.id; lease=$job.lease; content_base64=[Convert]::ToBase64String($encrypted); evidence=@{
                    signature_verified=$true; signature_profile='CAdES-T'; timestamp_certificate_included=$true; signer_thumbprint=$cert.Thumbprint; recipient_thumbprint=$recipient.Thumbprint; xml_sha256=(Hash $raw); archive_sha256=(Hash $archive)}}
                $job.encrypted_name = $prepared.file_name
            } else { $encrypted = [Convert]::FromBase64String($job.encrypted_base64) }
            if ($job.config.transport -eq 'nbki_https') {
                Api @{action='sending'; id=$job.id; lease=$job.lease} | Out-Null
                $response = Nbki-Request 'POST' ([Uri]$job.config.upload_url) $encrypted $job.config $job.encrypted_name
                Assert-UploadSuccess $response $job.encrypted_name
                Api @{action='sent'; id=$job.id; lease=$job.lease; response_base64=[Convert]::ToBase64String($response)} | Out-Null
            }
        }
        $job = $null
        if ($poll.config.auto_receive -and $poll.config.transport -eq 'nbki_https') {
            if (-not $poll.config.receipt_signer) { throw 'Configure NBKI receipt signing certificate first' }
            foreach ($packageId in $poll.receipt_package_ids) {
                try {
                    $claim = Api @{action='receipt_poll'; id=$packageId}
                    if ($claim.task) { Receive-Task $claim.task $poll.config }
                } catch { $diagnostic.receipt_error = $_.Exception.Message }
            }
        }
    } catch {
        $diagnostic.error = $_.Exception.Message
        if ($job) { try { Api @{action='failed'; id=$job.id; lease=$job.lease; error=$_.Exception.Message} | Out-Null } catch {} }
        Write-Warning $diagnostic.error
    }
    # Heartbeat must not claim another job; report errors on the next poll.
    try { Api @{action='heartbeat'; diagnostic=$diagnostic} | Out-Null } catch {}
    if (-not $Once) { Start-Sleep -Seconds 60 }
 } while (-not $Once)
} finally { $mutex.ReleaseMutex(); $mutex.Dispose() }
