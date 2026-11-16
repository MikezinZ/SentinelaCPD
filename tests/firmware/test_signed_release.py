import pathlib, subprocess, tempfile, unittest
ROOT=pathlib.Path(__file__).resolve().parents[2]
class SignedRelease(unittest.TestCase):
 def test_signing_tamper_and_wrong_key(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=pathlib.Path(tmp)
   def run(*cmd,ok=True):
    r=subprocess.run(cmd,capture_output=True)
    if ok:self.assertEqual(r.returncode,0,r.stderr.decode())
    return r.returncode
   for key in ('release','other'):
    run('openssl','genpkey','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:2048','-out',str(p/(key+'.pem')))
    run('openssl','pkey','-in',str(p/(key+'.pem')),'-pubout','-out',str(p/(key+'-pub.pem')))
   (p/'app.bin').write_bytes(b'\xe9'+bytes(1023))
   run('python',str(ROOT/'tools/sign_release.py'),'--binary',str(p/'app.bin'),'--key',str(p/'release.pem'),'--version','0.4.0','--sequence','4','--url','https://updates.example.org/releases/app.bin','--output',str(p/'manifest'))
   lines=(p/'manifest').read_bytes().splitlines(keepends=True)
   (p/'body').write_bytes(b''.join(lines[:6]));(p/'sig').write_bytes(bytes.fromhex(lines[6].decode().strip()))
   def verify(key):return run('openssl','dgst','-sha256','-verify',str(p/(key+'-pub.pem')),'-signature',str(p/'sig'),str(p/'body'),ok=False)
   self.assertEqual(verify('release'),0)
   self.assertNotEqual(verify('other'),0)
   (p/'body').write_bytes((p/'body').read_bytes().replace(b'0.4.0',b'0.4.1'))
   self.assertNotEqual(verify('release'),0)
if __name__=='__main__':unittest.main()
