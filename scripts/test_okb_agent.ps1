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
$tls=New-OkbTunnelConfig 49152 ('A'*40)
foreach ($required in @('accept = 127.0.0.1:49152','connect = cfb.bki-okb.com:443','verifyChain = yes','checkHost = cfb.bki-okb.com','sni = cfb.bki-okb.com','msspi = yes')) {
 if (-not $tls.Contains($required)) {throw ('Missing transport restriction: '+$required)}
}
foreach ($bad in @("A`nverifyChain = no",'short')) {
 $blocked=$false;try {New-OkbTunnelConfig 49152 $bad|Out-Null} catch {$blocked=$true}
 if (-not $blocked) {throw 'TLS config injection'}
}
$blocked=$false;try {New-OkbTunnelConfig 80 ('A'*40)|Out-Null} catch {$blocked=$true}
if (-not $blocked) {throw 'Invalid port accepted'}
Write-Host 'PASS: TLS bridge verification, fixed destination, loopback binding, config injection.'
$script:actions=@();$script:requests=0
function Okb-Api($body) {
 $script:actions+= $body.action
 if($body.action -ne 'heartbeat') {throw 'Connection check mutated queue'}
 return @{config=@{}}
}
function Cfb-Request($method,$path,$config,$payload,$fileName) {
 $script:requests++
 if($method -ne 'GET' -or $path -ne '/file/outbox/list?kind=bureaufile&count=1&page=1' -or $payload -or $fileName) {throw 'Connection check sent data'}
 return @{Status=200;Bytes=[Text.Encoding]::UTF8.GetBytes('{"totalCount":0,"page":{"files":[]}}')}
}
Test-OkbConnection @{version='1.1'}
if($script:requests -ne 1 -or $script:actions.Count -ne 1) {throw 'Unexpected check requests'}
function Cfb-Request {return @{Status=403;Bytes=[byte[]]@()}}
$blocked=$false;try{Test-OkbConnection @{}|Out-Null}catch{$blocked=$true}
if(-not $blocked){throw 'Unauthorized response reported as success'}
Write-Host 'PASS: connection check does not claim/send/ack; HTTP denial fails.'
