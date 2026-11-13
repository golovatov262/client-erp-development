$ErrorActionPreference='Stop'
. "$PSScriptRoot/../public/nbki-agent/NbkiAgent.ps1" -LibraryOnly
$raw=[Text.Encoding]::UTF8.GetBytes('<Document>test</Document>')
$archive=Make-Zip @{'ticket.xml'=$raw; 'ticket.xml.sig'=[byte[]](1,2,3)}
if($archive[0] -ne 0x50 -or $archive[1] -ne 0x4b){throw 'Invalid ZIP'}
function Verify-Signature($content,$signature,$expected,$detached) {
    if((Hash $content) -ne (Hash $raw) -or -not $detached -or $expected -ne 'expected'){throw 'Unexpected signature input'}
}
Verify-Receipt $archive 'expected'
$bad=Make-Zip @{'../ticket.xml'=$raw; '../ticket.xml.sig'=[byte[]](1,2,3)}
$blocked=$false
try {Verify-Receipt $bad 'expected'} catch {$blocked=$true}
if(-not $blocked){throw 'Path traversal not blocked'}

$name='QY01GG000001_20261113_120000.zip.p7m'
$content=Upload-Content ([byte[]](1,2,3)) $name
try {
    if($content.Headers.ContentType.MediaType -ne 'multipart/form-data'){throw 'Wrong content type'}
    $body=$content.ReadAsStringAsync().GetAwaiter().GetResult()
    if($body -notmatch 'name="?file"?' -or $body -notmatch [regex]::Escape($name) -or $body -notmatch 'name="?pathnm"?' -or $body -notmatch 'uploadGUTDF'){throw 'Wrong multipart fields'}
} finally {$content.Dispose()}
Assert-UploadSuccess ([Text.Encoding]::UTF8.GetBytes("Success`r`nThe following files were successfully uploaded :`r`n$name`r`n")) $name
foreach($text in @('The parameter pathnm is not specified.', 'Success', "Success`nThe following files were successfully uploaded :`nOTHER.zip.p7m", "Error: Success`nThe following files were successfully uploaded :`n$name")) {
    $blocked=$false
    try{Assert-UploadSuccess ([Text.Encoding]::UTF8.GetBytes($text)) $name}catch{$blocked=$true}
    if(-not $blocked){throw 'HTTP 200 error or wrong filename accepted'}
}
$blocked=$false
try{Assert-TimestampCertificate ([byte[]](1,2,3))}catch{$blocked=$true}
if(-not $blocked){throw 'Invalid timestamp accepted'}
Write-Host 'PASS: ZIP32, receipt structure, traversal prevention, multipart fields, HTTP 200 errors and filename matching. Live GOST crypto/TLS requires Windows.'

# Exercise the same CLR reflection bridge on managed doubles on Linux; real COM
# activation and GOST operations still require the user's Windows installation.
Add-Type -TypeDefinition @'
public sealed class NbkiBridgeFixture {
    public string Content { get; set; }
    public object Certificate { get; set; }
    public int Count { get { return 2; } }
    public string this[int index] { get { return "item" + index; } }
    public string Combine(string text, int profile, bool detached) { return text + profile + detached; }
    public void Fail() { throw new System.InvalidOperationException("fixture failure"); }
}
'@
$fixture=New-Object NbkiBridgeFixture
$bridge=New-Object Nbki.ComDispatch($fixture)
$bridge.Set('Content','xml')
if($bridge.Get('Content') -ne 'xml' -or $bridge.Get('Count') -ne 2){throw 'Bridge property access failed'}
if($bridge.Get('Item',@(1)) -ne 'item1'){throw 'Indexed COM property arguments lost'}
if($bridge.Call('Combine',@('profile',5,$true)) -ne 'profile5True'){throw 'Bridge method argument types lost'}
$bridge.Set('Certificate',$bridge)
if(-not [object]::ReferenceEquals($fixture.Certificate,$fixture)){throw 'Wrapped COM argument not unwrapped'}
$blocked=$false
try{$bridge.Call('Fail',@())}catch{$blocked=$_.Exception.Message -match 'fixture failure'}
if(-not $blocked){throw 'Bridge suppressed original error'}
Write-Host 'PASS: managed invocation bridge get/set/indexed property/method/object arguments/error propagation.'
