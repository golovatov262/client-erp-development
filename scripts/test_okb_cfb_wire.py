"""Exercise generated curl config and native multipart against a local fixture only."""
import json,os,shutil,subprocess,tempfile,threading,unittest
from pathlib import Path
from http.server import BaseHTTPRequestHandler,HTTPServer
from email.parser import BytesParser
from email.policy import default

class CfbWireTest(unittest.TestCase):
 def test_credentials_and_file_on_wire(self):
  pwsh=shutil.which('pwsh') or '/tmp/nbki-pwsh/pwsh';curl=shutil.which('curl')
  if not Path(pwsh).exists() or not curl:self.skipTest('PowerShell and curl needed')
  got={}
  class Handler(BaseHTTPRequestHandler):
   def do_POST(self):
    got['headers']=dict(self.headers);got['body']=self.rfile.read(int(self.headers['Content-Length']))
    self.send_response(200);self.end_headers();self.wfile.write(b'{"id":42}')
   def log_message(self,*args):pass
  server=HTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
  quote=lambda value:"'"+str(value).replace("'","''")+"'"
  try:
   with tempfile.TemporaryDirectory() as tmp:
    wrapper=Path(tmp)/'curl-fixture'
    wrapper.write_text('#!/usr/bin/python3\nimport sys,subprocess\ns=sys.stdin.buffer.read().decode()\nassert sys.argv[1:]==["-q","--config","-"]\ns="\\n".join(l for l in s.splitlines() if not l.startswith("cert =") and not l.startswith("proto ="))\ns=s.replace("https://cfb.bki-okb.com/cfb","http://127.0.0.1:'+str(server.server_port)+'")\nr=subprocess.run('+repr([curl,'-q','--config','-'])+',input=s.encode());sys.exit(r.returncode)\n');wrapper.chmod(0o700)
    script=Path(tmp)/'test.ps1';script.write_text(f'''
$ErrorActionPreference='Stop'
. {quote(Path(__file__).resolve().parents[1]/'public/okb-agent/OkbAgent.ps1')} -LibraryOnly
function Get-NbkiCurl {{ return {quote(wrapper)} }}
$cfbPassword='test"password\\only'
$config=@{{base_url='https://cfb.bki-okb.com/cfb';sin='00123';group='group';username='user';signer_thumbprint=('A'*40)}}
$r=Cfb-Request 'POST' '/file/inbox/bureaufile' $config ([byte[]](0,255,128,1)) 'CHP_00123_EFK_05-10_20261114120000123.zip.pem.pem'
if ($r.Status -ne 200) {{throw 'Wrong status'}}
''')
    r=subprocess.run([pwsh,'-NoProfile','-File',str(script)],capture_output=True,text=True,timeout=30);self.assertEqual(r.returncode,0,r.stdout+r.stderr)
  finally:server.shutdown();server.server_close();thread.join()
  h={k.lower():v for k,v in got['headers'].items()}
  self.assertEqual(h['x-auth-subscriber'],'00123');self.assertEqual(h['x-auth-password'],'test"password\\only')
  msg=BytesParser(policy=default).parsebytes(('Content-Type: '+h['content-type']+'\r\n\r\n').encode()+got['body'])
  parts=list(msg.iter_parts());self.assertEqual(len(parts),1)
  self.assertEqual(parts[0].get_param('name',header='content-disposition'),'file');self.assertEqual(parts[0].get_payload(decode=True),bytes([0,255,128,1]))
  self.assertEqual(parts[0].get_filename(),'CHP_00123_EFK_05-10_20261114120000123.zip.pem.pem')
