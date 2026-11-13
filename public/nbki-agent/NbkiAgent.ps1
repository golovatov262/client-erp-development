# Windows PowerShell 5.1; CryptoPro CSP and CAdES COM must be installed.
param([string]$ConfigPath = "$env:LOCALAPPDATA\CRM-NBKI\config.json", [switch]$Once, [switch]$LibraryOnly, [switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
# Keep raw COM objects inside managed code. Windows PowerShell's dynamic COM
# binder can throw in GetTypeAttrForTypeInfo before the actual COM method runs.
if (-not ('Nbki.ComDispatch' -as [type])) {
Add-Type -TypeDefinition @'
using System;
using System.Reflection;
using System.Runtime.InteropServices;
namespace Nbki {
    public sealed class ComDispatch {
        private readonly object target;
        public ComDispatch(object value) {
            if (value == null) throw new ArgumentNullException("value");
            target = value;
        }
        public static ComDispatch Create(string progId) {
            return new ComDispatch(Activator.CreateInstance(Type.GetTypeFromProgID(progId, true)));
        }
        private static object Unwrap(object value) {
            ComDispatch proxy = value as ComDispatch;
            return proxy == null ? value : proxy.target;
        }
        private object Invoke(string name, BindingFlags flags, object[] values) {
            object[] arguments = new object[values.Length];
            for (int i = 0; i < values.Length; i++) arguments[i] = Unwrap(values[i]);
            try {
                object result = target.GetType().InvokeMember(name,
                    flags | BindingFlags.Public | BindingFlags.Instance | BindingFlags.OptionalParamBinding,
                    null, target, arguments);
                return result != null && Marshal.IsComObject(result) ? new ComDispatch(result) : result;
            } catch (TargetInvocationException ex) {
                throw new InvalidOperationException("CAdESCOM." + name + ": " + ex.InnerException.Message, ex.InnerException);
            }
        }
        public object Call(string name, object[] arguments) { return Invoke(name, BindingFlags.InvokeMethod, arguments); }
        public object Get(string name) { return Invoke(name, BindingFlags.GetProperty, new object[0]); }
        public object Get(string name, object[] arguments) { return Invoke(name, BindingFlags.GetProperty, arguments); }
        public void Set(string name, object value) { Invoke(name, BindingFlags.SetProperty, new object[] {value}); }
    }
}
'@
}
if (-not ('Nbki.CurlClient' -as [type])) {
Add-Type -TypeDefinition @'
using System;
namespace Nbki {
    public sealed class CurlResult {
        public int ExitCode;
        public string Output;
        public string Error;
    }
    public static class CurlClient {
        // ProcessStartInfo.Arguments uses Windows argv quoting, never a shell.
        public static string Quote(string value) {
            var result = new System.Text.StringBuilder("\"");
            int slashes = 0;
            foreach (char ch in value) {
                if (ch == '\\') { slashes++; continue; }
                if (ch == '"') { result.Append('\\', slashes * 2 + 1); result.Append(ch); }
                else { result.Append('\\', slashes); result.Append(ch); }
                slashes = 0;
            }
            result.Append('\\', slashes * 2); result.Append('"');
            return result.ToString();
        }
        public static CurlResult Run(string executable, string[] arguments, byte[] payload) {
            var quoted = new string[arguments.Length];
            for (int i = 0; i < arguments.Length; i++) quoted[i] = Quote(arguments[i]);
            var info = new System.Diagnostics.ProcessStartInfo(executable, string.Join(" ", quoted));
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.RedirectStandardOutput = true;
            info.RedirectStandardError = true;
            info.RedirectStandardInput = payload != null;
            using (var process = new System.Diagnostics.Process()) {
                process.StartInfo = info;
                process.Start();
                var output = process.StandardOutput.ReadToEndAsync();
                var error = process.StandardError.ReadToEndAsync();
                try {
                    if (payload != null) {
                        try { process.StandardInput.BaseStream.Write(payload, 0, payload.Length); }
                        catch (System.IO.IOException) { /* curl may exit early on TLS failure */ }
                        finally { process.StandardInput.Close(); }
                    }
                    if (!process.WaitForExit(150000)) {
                        process.Kill();
                        throw new TimeoutException("NBKI curl timed out; delivery may be uncertain");
                    }
                    return new CurlResult { ExitCode = process.ExitCode,
                        Output = output.GetAwaiter().GetResult(), Error = error.GetAwaiter().GetResult() };
                } finally {
                    if (!process.HasExited) { process.Kill(); process.WaitForExit(); }
                }
            }
        }
    }

}
'@
}
function Api($body) {
    $body.entity = 'nbki_agent'
    Invoke-RestMethod -Uri $crm -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Depth 15 -Compress))) -TimeoutSec 120 -MaximumRedirection 0
}
function Hash([byte[]]$bytes) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }
}
function Find-Cert($thumb) {
    $store = [Nbki.ComDispatch]::Create('CAdESCOM.Store')
    $store.Call('Open', @(2, 'My', 0)) | Out-Null
    try {
        $found = $store.Get('Certificates').Call('Find', @(0, $thumb, $false))
        if ($found.Get('Count') -ne 1) { throw "Certificate not found: $thumb" }
        $cert = $found.Get('Item', @(1))
        if (-not $cert.Call('HasPrivateKey', @())) { throw 'Private key unavailable in this Windows account' }
        if (-not $cert.Call('IsValid', @()).Get('Result')) { throw 'Certificate chain or validity check failed' }
        return $cert
    } finally { $store.Call('Close', @()) | Out-Null }
}
function Import-Cert($base64) {
    $cert = [Nbki.ComDispatch]::Create('CAdESCOM.Certificate')
    $cert.Call('Import', @($base64)) | Out-Null
    if (-not $cert.Call('IsValid', @()).Get('Result')) { throw 'NBKI certificate chain or validity check failed' }
    return $cert
}
function Cms-Sign([byte[]]$raw, $certificate, [string]$tsp) {
    if (-not $tsp) { throw 'Configure accredited CA timestamp service first' }
    $signer = [Nbki.ComDispatch]::Create('CAdESCOM.CPSigner')
    $signer.Set('Certificate', $certificate)
    $signer.Set('CheckCertificate', $true)
    $signer.Set('Options', 2)
    $signer.Set('TSAAddress', $tsp)
    $data = [Nbki.ComDispatch]::Create('CAdESCOM.CadesSignedData')
    $data.Set('ContentEncoding', 1)
    $data.Set('Content', [Convert]::ToBase64String($raw))
    $signed = $data.Call('SignCades', @($signer, 5, $true, 0))
    Verify-Signature $raw $signed ($certificate.Get('Thumbprint')) $true 5
    Assert-TimestampCertificate ([Convert]::FromBase64String($signed))
    return ,([Convert]::FromBase64String($signed))
}
function Verify-Signature([byte[]]$raw, [string]$signature, [string]$expected, [bool]$detached, [int]$profile=1) {
    $data = [Nbki.ComDispatch]::Create('CAdESCOM.CadesSignedData')
    $data.Set('ContentEncoding', 1)
    if ($detached) { $data.Set('Content', [Convert]::ToBase64String($raw)) }
    $data.Call('VerifyCades', @($signature, $profile, $detached)) | Out-Null
    $signers = $data.Get('Signers')
    if ($signers.Get('Count') -ne 1) { throw 'Expected one signature certificate' }
    $cert = $signers.Get('Item', @(1)).Get('Certificate')
    if ($cert.Get('Thumbprint') -ne $expected) { throw 'Unexpected signature certificate' }
    if (-not $cert.Call('IsValid', @()).Get('Result')) { throw 'Signing certificate is not valid' }
    if (-not $detached -and (Hash ([Convert]::FromBase64String($data.Get('Content')))) -ne (Hash $raw)) { throw 'Signed content differs from XML' }
}
function Local-Certificates {
    $store = [Nbki.ComDispatch]::Create('CAdESCOM.Store')
    $store.Call('Open', @(2, 'My', 0)) | Out-Null
    try {
        $certificates = $store.Get('Certificates')
        for ($i=1; $i -le $certificates.Get('Count'); $i++) {
            $cert = $certificates.Get('Item', @($i))
            if ($cert.Call('HasPrivateKey', @()) -and $cert.Get('ValidToDate') -gt (Get-Date)) {
                @{thumbprint=$cert.Get('Thumbprint'); subject=$cert.Get('SubjectName'); valid_until=[string]$cert.Get('ValidToDate')}
            }
        }
    } finally { $store.Call('Close', @()) | Out-Null }
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
    $envelope = [Nbki.ComDispatch]::Create('CAdESCOM.CPEnvelopedData')
    $envelope.Set('ContentEncoding', 1)
    $envelope.Set('Content', [Convert]::ToBase64String($raw))
    $envelope.Get('Algorithm').Set('Name', 25) # GOST 28147-89
    $envelope.Get('Recipients').Call('Add', @($recipient)) | Out-Null
    return ,([Convert]::FromBase64String($envelope.Call('Encrypt', @(0))))
}
function Decrypt-Zip([byte[]]$raw) {
    $envelope = [Nbki.ComDispatch]::Create('CAdESCOM.CPEnvelopedData')
    $envelope.Set('ContentEncoding', 1)
    $envelope.Call('Decrypt', @([Convert]::ToBase64String($raw))) | Out-Null
    return ,([Convert]::FromBase64String($envelope.Get('Content')))
}
function Get-NbkiCurl {
    if ($script:nbkiCurlPath) { return $script:nbkiCurlPath }
    $path = Join-Path ([Environment]::GetFolderPath('System')) 'curl.exe'
    if (-not (Test-Path -LiteralPath $path)) { throw 'Windows system curl.exe not found' }
    $version = [Nbki.CurlClient]::Run($path, @('-q','--version'), $null)
    if ($version.ExitCode -ne 0 -or $version.Output -notmatch '\bSchannel\b') { throw 'NBKI requires Windows curl with Schannel' }
    $script:nbkiCurlPath = $path
    return $path
}
function Invoke-NbkiCurl([string[]]$arguments, [byte[]]$payload) {
    return [Nbki.CurlClient]::Run((Get-NbkiCurl), $arguments, $payload)
}
function Nbki-Request($method, [Uri]$uri, [byte[]]$payload, $config, [string]$fileName) {
    if ($uri.Scheme -ne 'https' -or $uri.Host -ne 'icrs.nbki.ru' -or $uri.Port -ne 443 -or $uri.UserInfo -or $uri.Query -or $uri.Fragment) { throw 'Invalid NBKI HTTPS URL' }
    if ($method -notin @('GET','POST')) { throw 'Invalid NBKI HTTP method' }
    $thumb = $config.tls_thumbprint
    if (-not $thumb) { $thumb = $config.signer_thumbprint }
    if ($thumb -notmatch '^[0-9A-Fa-f]{40}$') { throw 'Invalid TLS certificate thumbprint' }
    $directory = Join-Path ([IO.Path]::GetTempPath()) ('crm-nbki-'+[Guid]::NewGuid().ToString('N'))
    [IO.Directory]::CreateDirectory($directory) | Out-Null
    $output = Join-Path $directory 'response.bin'
    try {
        # -q must be first: ignore .curlrc, including retries, redirects or insecure options.
        # No --insecure, no --ssl-no-revoke, no redirects and no automatic upload retries.
        $arguments = @('-q','--silent','--show-error','--proto','=https','--connect-timeout','15',
            '--max-time','120','--max-filesize','31457280','--output',$output,'--write-out','%{http_code}',
            '--cert',('CurrentUser\MY\'+$thumb),'--request',$method)
        $body = $null
        if ($method -eq 'POST') {
            $content = Upload-Content $payload $fileName
            try {
                $arguments += @('--header',('Content-Type: '+$content.Headers.ContentType.ToString()),'--data-binary','@-')
                $body = $content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
            } finally { $content.Dispose() }
        }
        $arguments += $uri.AbsoluteUri
        $result = Invoke-NbkiCurl $arguments $body
        if ($result.ExitCode -ne 0) { throw "NBKI curl error $($result.ExitCode): $($result.Error.Trim())" }
        $status = $result.Output.Trim()
        if ($status -notmatch '^\d{3}$') { throw 'NBKI curl returned invalid HTTP status' }
        if ($method -eq 'GET' -and $status -eq '404') { return $null }
        if ([int]$status -lt 200 -or [int]$status -ge 300) { throw "NBKI HTTP $status" }
        if ((Get-Item -LiteralPath $output).Length -gt 30MB) { throw 'NBKI response too large' }
        return ,([IO.File]::ReadAllBytes($output))
    } finally { Remove-Item -LiteralPath $directory -Recurse -Force }
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
    if (-not (Test-Path -LiteralPath $path)) { Write-Host "Package $($task.id): ticket$($task.stage) not ready (HTTP 404)."; return }
    $secure = ConvertTo-SecureString ([IO.File]::ReadAllText($path))
    $record = (New-Object Net.NetworkCredential('', $secure)).Password | ConvertFrom-Json
    $incoming = [Convert]::FromBase64String($record.incoming)
    $archive = if ($record.encrypted) { Decrypt-Zip $incoming } else { $incoming }
    Verify-Receipt $archive $config.receipt_signer.thumbprint
    Api @{action='receipt'; content_base64=[Convert]::ToBase64String($archive); encrypted_base64=[Convert]::ToBase64String($incoming); evidence=@{
        signature_verified=$true; signer_thumbprint=$config.receipt_signer.thumbprint; archive_sha256=(Hash $archive)}} | Out-Null
    Write-Host "Package $($task.id): ticket$($task.stage) verified and saved in CRM."
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
    $diagnostic = @{version='2.0'; build='2.0.2'; computer=$env:COMPUTERNAME; account=$env:USERNAME}
    $job = $null
    try {
        $diagnostic.stage = 'Read CurrentUser My certificates'
        $diagnostic.certificates = @(Local-Certificates)
        $diagnostic.stage = 'Check Windows curl transport'
        Get-NbkiCurl | Out-Null
        if ($CheckOnly) {
            Api @{action='heartbeat'; diagnostic=$diagnostic} | Out-Null
            Write-Host "CHECK OK: certificate store and CRM connection. Certificates: $($diagnostic.certificates.Count). No files sent."
            break
        }
        $diagnostic.stage = 'Poll CRM queue'
        $poll = Api @{action='poll'; diagnostic=$diagnostic}; $job=$poll.job
        if ($job) {
            $diagnostic.stage = 'Prepare package'
            $cert = Find-Cert $job.config.signer_thumbprint
            $recipient = Import-Cert $job.config.recipient.der_base64
            if ($recipient.Get('Thumbprint') -ne $job.config.recipient.thumbprint) { throw 'Recipient certificate mismatch' }
            if (-not $job.encrypted_base64) {
                $raw = [Convert]::FromBase64String($job.xml_base64)
                if ((Hash $raw) -ne $job.sha256) { throw 'XML checksum mismatch' }
                if ($job.config.protocol_version -ne 2 -or $job.config.signature_profile -ne 'CAdES-T') { throw 'Unsupported package profile' }
                $diagnostic.stage = 'Sign XML with CAdES-T'
                $signature = Cms-Sign $raw $cert $job.config.tsp_url
                $entries = @{}; $entries[$job.file_name+'.sig'] = $signature
                $entries[$job.file_name] = $raw
                if ($job.config.mchd_base64) { $entries['mchd.zip'] = [Convert]::FromBase64String($job.config.mchd_base64) }
                $archive = Make-Zip $entries
                $diagnostic.stage = 'Encrypt ZIP'
                $encrypted = Encrypt-Zip $archive $recipient
                $prepared = Api @{action='prepared'; id=$job.id; lease=$job.lease; content_base64=[Convert]::ToBase64String($encrypted); evidence=@{
                    signature_verified=$true; signature_profile='CAdES-T'; timestamp_certificate_included=$true; signer_thumbprint=$cert.Get('Thumbprint'); recipient_thumbprint=$recipient.Get('Thumbprint'); xml_sha256=(Hash $raw); archive_sha256=(Hash $archive)}}
                $job.encrypted_name = $prepared.file_name
            } else { $encrypted = [Convert]::FromBase64String($job.encrypted_base64) }
            if ($job.config.transport -eq 'nbki_https') {
                $diagnostic.stage = 'Send to NBKI'
                Api @{action='sending'; id=$job.id; lease=$job.lease} | Out-Null
                $response = Nbki-Request 'POST' ([Uri]$job.config.upload_url) $encrypted $job.config $job.encrypted_name
                Assert-UploadSuccess $response $job.encrypted_name
                Api @{action='sent'; id=$job.id; lease=$job.lease; response_base64=[Convert]::ToBase64String($response)} | Out-Null
                Write-Host "Package $($job.id): upload confirmed by NBKI. Awaiting receipts."
            }
        }
        if (-not $job) { Write-Host 'No packages to send. Uncertain deliveries are not retried automatically.' }
        $job = $null
        if ($poll.config.auto_receive -and $poll.config.transport -eq 'nbki_https') {
            if (-not $poll.config.receipt_signer) { throw 'Configure NBKI receipt signing certificate first' }
            foreach ($packageId in $poll.receipt_package_ids) {
                try {
                    $claim = Api @{action='receipt_poll'; id=$packageId}
                    if ($claim.task) { Receive-Task $claim.task $poll.config }
                } catch { $diagnostic.receipt_error = $_.Exception.Message; Write-Warning $diagnostic.receipt_error }
            }
        }
    } catch {
        $diagnostic.error = $diagnostic.stage + ': ' + $_.Exception.Message
        $diagnostic.error_location = $_.ScriptStackTrace
        if ($job) { try { Api @{action='failed'; id=$job.id; lease=$job.lease; error=$_.Exception.Message} | Out-Null } catch {} }
        Write-Warning $diagnostic.error
    }
    # Heartbeat must not claim another job; report errors on the next poll.
    try { Api @{action='heartbeat'; diagnostic=$diagnostic} | Out-Null } catch {}
    if (-not $Once -and -not $CheckOnly) { Start-Sleep -Seconds 60 }
 } while (-not $Once -and -not $CheckOnly)
} finally { $mutex.ReleaseMutex(); $mutex.Dispose() }
