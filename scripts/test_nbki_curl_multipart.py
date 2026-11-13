"""Local wire test: execute the worker's request builder against an HTTP fixture."""
import email.policy
from email.parser import BytesParser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import unittest


class MultipartWireTest(unittest.TestCase):
    def test_native_form_preserves_binary_filename_and_destination(self):
        pwsh = shutil.which('pwsh') or '/tmp/nbki-pwsh/pwsh'
        curl = shutil.which('curl')
        if not Path(pwsh).exists() or not curl:
            self.skipTest('PowerShell and curl required')
        captured = {}

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                captured['content_type'] = self.headers['Content-Type']
                captured['body'] = self.rfile.read(int(self.headers['Content-Length']))
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'ok')

            def log_message(self, *args):
                pass

        server = HTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        worker = Path(__file__).resolve().parents[1] / 'public/nbki-agent/NbkiAgent.ps1'
        quote = lambda s: "'" + str(s).replace("'", "''") + "'"
        script = f'''
$ErrorActionPreference='Stop'
. {quote(worker)} -LibraryOnly
function Invoke-NbkiCurl([string[]]$arguments,[byte[]]$payload) {{
    # Only the fixture replaces TLS/host. Production URL validation still runs.
    $localArgs=@()
    for($i=0;$i -lt $arguments.Length-1;$i++) {{
        if($arguments[$i] -in @('--cert','--proto')) {{$i++;continue}}
        $localArgs += $arguments[$i]
    }}
    $localArgs += 'http://127.0.0.1:{server.server_port}/upload'
    return [Nbki.CurlClient]::Run({quote(curl)},$localArgs,$payload)
}}
$config=@{{signer_thumbprint=('A'*40)}}
Nbki-Request 'POST' ([Uri]'https://icrs.nbki.ru/inout/cgi-bin/uploadvb.cgi') ([byte[]](0,255,128,13,10,1)) $config 'QY01GG000001_20261113_120000.zip.p7m' | Out-Null
'''
        try:
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / 'wire.ps1'
                path.write_text(script)
                result = subprocess.run([pwsh, '-NoProfile', '-File', str(path)], capture_output=True, text=True, timeout=30)
                self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()
        message = BytesParser(policy=email.policy.default).parsebytes(
            ('Content-Type: ' + captured['content_type'] + '\r\nMIME-Version: 1.0\r\n\r\n').encode() + captured['body'])
        parts = list(message.iter_parts())
        self.assertEqual(len(parts), 2)
        file, destination = parts
        self.assertEqual(file.get_param('name', header='Content-Disposition'), 'file')
        self.assertEqual(file.get_filename(), 'QY01GG000001_20261113_120000.zip.p7m')
        self.assertEqual(file.get_payload(decode=True), bytes([0, 255, 128, 13, 10, 1]))
        self.assertEqual(destination.get_param('name', header='Content-Disposition'), 'pathnm')
        self.assertEqual(destination.get_payload(decode=True), b'uploadGUTDF')
