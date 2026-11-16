"""Assina metadados de release com chave RSA privada mantida fora do repositório."""
import argparse, hashlib, pathlib, subprocess, tempfile
p=argparse.ArgumentParser();p.add_argument('--binary',required=True);p.add_argument('--key',required=True)
p.add_argument('--version',required=True);p.add_argument('--sequence',type=int,required=True)
p.add_argument('--url',required=True);p.add_argument('--output',required=True);a=p.parse_args()
if not 0<a.sequence<=0xffffffff or not a.url.startswith('https://') or any(c in a.url for c in '\r\n ?#@%\\'):
    p.error('sequência/URL inválida')
if not a.version or len(a.version)>31 or any(c not in '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-_' for c in a.version):p.error('versão inválida')
b=pathlib.Path(a.binary).read_bytes()
if not b or b[0]!=0xe9:p.error('use somente o binário de aplicação ESP32, nunca imagem merged/bootloader')
payload=f'sentinelacpd-esp32-v1\n{a.version}\n{a.sequence}\n{len(b)}\n{hashlib.sha256(b).hexdigest()}\n{a.url}\n'.encode()
with tempfile.TemporaryDirectory() as tmp:
    src=pathlib.Path(tmp)/'payload';sig=pathlib.Path(tmp)/'sig';src.write_bytes(payload)
    subprocess.run(['openssl','dgst','-sha256','-sign',a.key,'-out',str(sig),str(src)],check=True)
    signature=sig.read_bytes()
    if not 256<=len(signature)<=512:p.error('use RSA de 2048 a 4096 bits')
    pathlib.Path(a.output).write_bytes(payload+signature.hex().encode()+b'\n')
print('Manifesto assinado criado. Publicar somente após validar binário, alvo e sequência na bancada.')
