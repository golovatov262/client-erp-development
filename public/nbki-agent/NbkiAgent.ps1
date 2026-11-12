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
function Cms-Sign([byte[]]$raw, $certificate, [bool]$detached) {
    $signer = New-Object -ComObject CAdESCOM.CPSigner
    $signer.Certificate = $certificate; $signer.CheckCertificate = $true; $signer.Options = 2
    $data = New-Object -ComObject CAdESCOM.CadesSignedData
    $data.ContentEncoding = 1; $data.Content = [Convert]::ToBase64String($raw)
    $signed = $data.SignCades($signer, 1, $detached)
    Verify-Signature $raw $signed $certificate.Thumbprint $detached
    return ,([Convert]::FromBase64String($signed))
}
function Verify-Signature([byte[]]$raw, [string]$signature, [string]$expected, [bool]$detached) {
    $data = New-Object -ComObject CAdESCOM.CadesSignedData
    $data.ContentEncoding = 1
    if ($detached) { $data.Content = [Convert]::ToBase64String($raw) }
    $data.VerifyCades($signature, 1, $detached)
    if ($data.Signers.Count -ne 1 -or $data.Signers.Item(1).Certificate.Thumbprint -ne $expected) { throw 'Unexpected signature certificate' }
    if (-not $data.Signers.Item(1).Certificate.IsValid().Result) { throw 'Signing certificate is not valid' }
    if (-not $detached -and (Hash ([Convert]::FromBase64String($data.Content))) -ne (Hash $raw)) { throw 'Signed content differs from XML' }
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
    $envelope.Recipients.Add($recipient)
    return ,([Convert]::FromBase64String($envelope.Encrypt(0)))
}
function Decrypt-Zip([byte[]]$raw) {
    $envelope = New-Object -ComObject CAdESCOM.CPEnvelopedData
    $envelope.ContentEncoding = 1
    $envelope.Decrypt([Convert]::ToBase64String($raw))
    return ,([Convert]::FromBase64String($envelope.Content))
}
function Nbki-Request($method, [Uri]$uri, [byte[]]$payload, $config, $extraHeaders=@{}) {
    if ($uri.Scheme -ne 'https' -or ($uri.Host -ne 'nbki.ru' -and -not $uri.Host.EndsWith('.nbki.ru')) -or $uri.Port -ne 443 -or $uri.UserInfo -or $uri.Query -or $uri.Fragment) { throw 'Invalid NBKI HTTPS URL' }
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
        foreach ($key in $extraHeaders.Keys) { $request.Headers.TryAddWithoutValidation($key, [string]$extraHeaders[$key]) | Out-Null }
        if ($null -ne $payload) {
            $request.Content = New-Object Net.Http.ByteArrayContent(,$payload)
            $mime = if ($method -eq 'PROPFIND') { 'application/xml' } else { 'application/octet-stream' }
            $request.Content.Headers.ContentType = New-Object Net.Http.Headers.MediaTypeHeaderValue($mime)
        }
        $response = $client.SendAsync($request).GetAwaiter().GetResult()
        try {
            if (-not $response.IsSuccessStatusCode) { throw "NBKI HTTP $([int]$response.StatusCode)" }
            return ,$response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
        } finally { $response.Dispose() }
    } finally { $request.Dispose(); $client.Dispose(); $handler.Dispose() }
}
function Receipt-Files($config, $registrations) {
    $base = [Uri]$config.receipts_url
    $body = [Text.Encoding]::UTF8.GetBytes('<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getetag/><d:resourcetype/></d:prop></d:propfind>')
    $bytes = Nbki-Request 'PROPFIND' $base $body $config @{Depth='1'}
    $settings = New-Object Xml.XmlReaderSettings; $settings.DtdProcessing = [Xml.DtdProcessing]::Prohibit; $settings.XmlResolver = $null
    $stream = New-Object IO.MemoryStream(,$bytes); $reader = [Xml.XmlReader]::Create($stream,$settings)
    $doc = New-Object Xml.XmlDocument; $doc.XmlResolver = $null
    try { $doc.Load($reader) } finally { $reader.Dispose(); $stream.Dispose() }
    $ns = New-Object Xml.XmlNamespaceManager($doc.NameTable); $ns.AddNamespace('d','DAV:')
    $result = @()
    foreach ($item in $doc.SelectNodes('//d:response',$ns)) {
        $href = $item.SelectSingleNode('d:href',$ns)
        if (-not $href -or $item.SelectSingleNode('.//d:collection',$ns)) { continue }
        $uri = New-Object Uri($base, $href.InnerText)
        if ($uri.Authority -ne $base.Authority -or -not $uri.AbsolutePath.StartsWith($base.AbsolutePath) -or $uri.Query -or $uri.Fragment) { continue }
        if ($uri.AbsolutePath -notmatch '_ticket[12]\.[^/]+$') { continue }
        $filename = [Uri]::UnescapeDataString(($uri.AbsolutePath -split '/')[-1])
        $reg = $filename -replace '_ticket[12]\..*$', ''
        if ($registrations -contains $reg) { $result += $uri }
    }
    return $result
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
$received = @{}
try {
 do {
    $diagnostic = @{version='1.0'; computer=$env:COMPUTERNAME; account=$env:USERNAME}
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
                $detached = $job.config.signature_mode -eq 'detached'
                $signature = Cms-Sign $raw $cert $detached
                $entries = @{}; $entries[$job.file_name+'.sig'] = $signature
                if ($detached) { $entries[$job.file_name] = $raw }
                $archive = Make-Zip $entries
                $encrypted = Encrypt-Zip $archive $recipient
                $prepared = Api @{action='prepared'; id=$job.id; lease=$job.lease; content_base64=[Convert]::ToBase64String($encrypted); evidence=@{
                    signature_verified=$true; signer_thumbprint=$cert.Thumbprint; recipient_thumbprint=$recipient.Thumbprint; xml_sha256=(Hash $raw); archive_sha256=(Hash $archive)}}
                $job.encrypted_name = $prepared.file_name
            } else { $encrypted = [Convert]::FromBase64String($job.encrypted_base64) }
            if ($job.config.transport -eq 'webdav') {
                Api @{action='sending'; id=$job.id; lease=$job.lease} | Out-Null
                $url = New-Object Uri([Uri]$job.config.upload_url, [Uri]::EscapeDataString($job.encrypted_name))
                Nbki-Request 'PUT' $url $encrypted $job.config @{'If-None-Match'='*'} | Out-Null
                Api @{action='sent'; id=$job.id; lease=$job.lease} | Out-Null
            }
        }
        if ($poll.config.auto_receive -and $poll.config.transport -eq 'webdav') {
            if (-not $poll.config.receipt_signer) { throw 'Configure NBKI receipt signing certificate first' }
            foreach ($url in (Receipt-Files $poll.config $poll.receipt_reg_numbers)) {
                try {
                    $incoming = Nbki-Request 'GET' $url $null $poll.config
                    $hash = Hash $incoming
                    if ($received.ContainsKey($hash)) { continue }
                    $archive = Decrypt-Zip $incoming
                    Verify-Receipt $archive $poll.config.receipt_signer.thumbprint
                    Api @{action='receipt'; content_base64=[Convert]::ToBase64String($archive); encrypted_base64=[Convert]::ToBase64String($incoming); evidence=@{
                        signature_verified=$true; signer_thumbprint=$poll.config.receipt_signer.thumbprint; archive_sha256=(Hash $archive)}} | Out-Null
                    $received[$hash]=$true
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
