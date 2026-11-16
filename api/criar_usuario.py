"""Cria ou atualiza um usuário da API v2.

Uso (com o Docker rodando):
  docker compose exec api python criar_usuario.py --email ana@empresa.com --nome "Ana" --papel admin
A senha é pedida no terminal (não fica no histórico).
"""
import argparse
import getpass

import v2

p = argparse.ArgumentParser()
p.add_argument("--email", required=True)
p.add_argument("--nome", required=True)
p.add_argument("--papel", choices=["viewer", "operator", "admin"], default="viewer")
a = p.parse_args()
senha = getpass.getpass("Senha (mínimo 8 caracteres): ")
if senha != getpass.getpass("Repita a senha: "):
    raise SystemExit("As senhas não conferem.")
v2.preparar_banco()
v2.criar_usuario(a.email, a.nome, a.papel, senha)
print(f"Usuário {a.email} ({a.papel}) pronto.")
