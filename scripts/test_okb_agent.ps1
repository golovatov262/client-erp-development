$ErrorActionPreference='Stop'
. "$PSScriptRoot/../public/okb-agent/OkbAgent.ps1" -LibraryOnly
$bytes=[Text.Encoding]::UTF8.GetBytes('<NotificationOfReceipt/>')
function Verify-Signature($raw,$signature,$expected,$detached) {if (-not $detached -or (Hash $raw) -ne (Hash $bytes) -or $expected -ne 'expected') {throw 'Wrong detached signature inputs'}}
$zip=Make-Zip @{'receipt.xml'=$bytes;'receipt.xml.sig'=[byte[]](0,255,128)}
if ((Hash (Receipt-Xml $zip 'expected')) -ne (Hash $bytes)) {throw 'Receipt ZIP changed bytes'}
foreach($entries in @(@{'../receipt.xml'=$bytes},@{'receipt.xml'=$bytes;'other.xml'=$bytes})) {
 $blocked=$false;try{Receipt-Xml (Make-Zip $entries)|Out-Null}catch{$blocked=$true};if(-not $blocked){throw 'Unsafe ZIP accepted'}
}
$blocked=$false;try{Curl-Value "secret`nurl=evil"|Out-Null}catch{$blocked=$true};if(-not $blocked){throw 'Curl config injection'}
if ((Curl-Value 'a"b\c') -ne '"a\"b\\c"'){throw 'Curl escaping failed'}
$blocked=$false;try{Cfb-Request GET /file/outbox/list @{base_url='https://evil.invalid'}|Out-Null}catch{$blocked=$true};if(-not $blocked){throw 'Foreign host accepted'}
Write-Host 'PASS: receipt ZIP, traversal, duplicate entries, curl escaping, host restriction. Live GOST/CFB still requires configured Windows.'
