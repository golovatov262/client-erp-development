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
Assert-UploadSuccess ([Text.Encoding]::UTF8.GetBytes("Success`r`nThe following files were successfully uploaded :`r`n$name`r`n")) $name
foreach($text in @('The parameter you entered is incorrect.', 'The parameter pathnm is not specified.', 'Success', "Success`nThe following files were successfully uploaded :`nOTHER.zip.p7m", "Error: Success`nThe following files were successfully uploaded :`n$name")) {
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

$script:curlExit=0; $script:curlHttp='200'; $script:curlCalls=0
$script:fakeResponse=[byte[]](0,1,128,255)
function Invoke-NbkiCurl([string[]]$arguments,[byte[]]$payload) {
    $script:curlCalls++
    if($arguments[0] -ne '-q'){throw 'curl user config is not disabled'}
    foreach($unsafe in @('--insecure','-k','--ssl-no-revoke','--location','--retry')) {
        if($arguments -contains $unsafe){throw 'Unsafe curl option'}
    }
    $certIndex=[Array]::IndexOf($arguments,'--cert')
    if($arguments[$certIndex+1] -ne ('CurrentUser\MY\'+('A'*40))){throw 'Wrong TLS certificate selection'}
    $method=$arguments[[Array]::IndexOf($arguments,'--request')+1]
    if($method -eq 'POST') {
        if($arguments -contains '--data-binary' -or $arguments -contains '--header'){throw 'curl multipart overridden'}
        if($arguments -notcontains ('file=@-;filename='+$name+';type=application/octet-stream') -or $arguments -notcontains 'pathnm=uploadGUTDF'){throw 'Wrong upload form'}
        if(($payload -join ',') -notin @('1,2,3','1')){throw 'Encrypted file changed'}
    } elseif($null -ne $payload){throw 'GET sent a request body'}
    $output=$arguments[[Array]::IndexOf($arguments,'--output')+1]
    $script:lastCurlOutput=$output
    [IO.File]::WriteAllBytes($output,$script:fakeResponse)
    return @{ExitCode=$script:curlExit; Output=$script:curlHttp; Error='simulated TLS error'}
}
$config=@{signer_thumbprint=('A'*40)}
$result=Nbki-Request 'POST' ([Uri]'https://icrs.nbki.ru/inout/cgi-bin/uploadvb.cgi') ([byte[]](1,2,3)) $config $name
if((Hash $result) -ne (Hash $script:fakeResponse)){throw 'Binary response changed'}
if(Test-Path -LiteralPath $script:lastCurlOutput){throw 'Temporary response not removed'}
$script:curlHttp='404'
if($null -ne (Nbki-Request 'GET' ([Uri]'https://icrs.nbki.ru/inout/outGUTDF/R_ticket1.zip') $null $config)){throw '404 not handled as pending'}
$script:curlExit=35; $script:curlHttp='000'
$before=$script:curlCalls; $blocked=$false
try{Nbki-Request 'POST' ([Uri]'https://icrs.nbki.ru/inout/cgi-bin/uploadvb.cgi') ([byte[]](1)) $config $name}catch{$blocked=$_.Exception.Message -match 'curl error 35'}
if(-not $blocked -or $script:curlCalls -ne $before+1){throw 'TLS failure not propagated or upload retried'}
if(Test-Path -LiteralPath $script:lastCurlOutput){throw 'Temporary response retained after failure'}
$before=$script:curlCalls; $blocked=$false
try{Nbki-Request 'GET' ([Uri]'https://evil.org/') $null $config}catch{$blocked=$true}
if(-not $blocked -or $script:curlCalls -ne $before){throw 'Foreign URL reached curl'}
if([Environment]::OSVersion.Platform -eq 'Unix') {
    $tmp=Join-Path ([IO.Path]::GetTempPath()) ('nbki runner '+[Guid]::NewGuid().ToString('N')+'.py')
    try {
        [IO.File]::WriteAllText($tmp,"import sys,json; data=sys.stdin.buffer.read(); print(json.dumps([sys.argv[1],list(data)]))")
        $result=[Nbki.CurlClient]::Run('/usr/bin/python3',@($tmp,'test path with spaces'),[byte[]](0,255,128,10))
        $decoded=$result.Output | ConvertFrom-Json
        if($result.ExitCode -ne 0 -or $decoded[0] -ne 'test path with spaces' -or ($decoded[1] -join ',') -ne '0,255,128,10'){throw 'Process runner damaged arguments or binary stdin'}
    } finally {Remove-Item -LiteralPath $tmp -Force}
}
Write-Host 'PASS: curl certificate selection, binary multipart/response, 404, TLS error, no retries, URL restriction, temp cleanup and process runner.'
