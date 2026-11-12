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
# Mock transport, preserve the real URI filtering and DAV parsing.
function Nbki-Request {
    return ,([Text.Encoding]::UTF8.GetBytes('<d:multistatus xmlns:d="DAV:"><d:response><d:href>/receipts/R_ticket2.zip</d:href></d:response><d:response><d:href>https://evil.org/receipts/R_ticket2.zip</d:href></d:response><d:response><d:href>/receipts/OTHER_ticket2.zip</d:href></d:response></d:multistatus>'))
}
$files=@(Receipt-Files @{receipts_url='https://files.nbki.ru/receipts/'} @('R'))
if($files.Count -ne 1 -or $files[0].Host -ne 'files.nbki.ru'){throw 'Unrelated files or external URLs included'}
Write-Host 'ZIP32 packing, receipt structure, traversal prevention, DAV same-origin and package filtering: OK. CryptoPro COM and live TLS require Windows testing.'
