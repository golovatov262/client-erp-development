# Shared, pinned CryptoPro/Schannel primitives from NBKI 2.0.4.
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
