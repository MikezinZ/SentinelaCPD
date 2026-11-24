"""SentinelaCPD - administração da plataforma (API v2, só perfil admin).

- Usuários: listar, cadastrar, editar perfil/nome, desativar e redefinir senha.
- Dispositivos: vincular (cadastro prévio), renomear, informar local e ativar/desativar.
- Firmware (OTA remota, modalidade A): enviar o .bin, listar versões, iniciar a instalação
  em um dispositivo e acompanhar o resultado.

Fluxo da OTA:
  1. O admin envia o .bin pela dashboard. A API confere o cabeçalho da imagem ESP32 (0xE9),
     lê a etiqueta SENTINELA_FW gravada pelo firmware (versão, sequência e placa) e calcula o SHA-256.
  2. O admin escolhe o dispositivo e clica em instalar. A API cria um job com um token de uso
     único e publica o comando em sentinela/<id>/cmd/ota (MQTT, QoS 1).
  3. O ESP32 valida o comando, baixa o arquivo por HTTP com o token, confere tamanho e SHA-256,
     grava no slot OTA livre e reinicia. O resultado volta em sentinela/<id>/ota e o ingestor
     atualiza o job (downloading -> installed -> success, ou failed/rejected/rolled_back).
"""
import hashlib
import json
import os
import re
import secrets
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse, Response

import v2
from v2 import ApiErro, agora, corpo, executar, iso, ler_corpo, sql, usuario_atual

router = APIRouter(prefix="/api/v2", tags=["administração"])

FIRMWARE_DIR = os.getenv("FIRMWARE_DIR", "/data/firmware")
FIRMWARE_MAX = int(os.getenv("FIRMWARE_MAX_BYTES", str(0x1E0000)))   # tamanho do slot OTA (partitions.csv)
OTA_BASE_URL = os.getenv("OTA_BASE_URL", "").rstrip("/")             # vazio: o ESP32 usa o host do broker
OTA_TOKEN_TTL_S = 15 * 60
ALVO = "esp32"
TAG = b"SENTINELA_FW|"
FINAIS = ("success", "failed", "rejected", "rolled_back", "timeout")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
ID_RE = re.compile(r"^[A-Za-z0-9_\-]{3,50}$")


def exigir_admin(u):
    if u["papel"] != "admin":
        raise ApiErro(403, "Apenas administradores podem executar esta ação.")


# ======================================================================= usuários
def usuario_admin_json(r):
    return {"id": str(r["id"]), "email": r["email"], "name": r["nome"], "role": r["papel"],
            "active": bool(r["ativo"]), "created_at": iso(r["criado_em"])}


def ativos_admin(exceto=None):
    r = sql("SELECT COUNT(*) AS n FROM usuarios WHERE papel='admin' AND ativo=1 AND id<>%s", (exceto or 0,), um=True)
    return int(r["n"])


@router.get("/users")
def listar_usuarios(u=Depends(usuario_atual)):
    exigir_admin(u)
    linhas = sql("SELECT id, email, nome, papel, ativo, criado_em FROM usuarios ORDER BY nome")
    return {"items": [usuario_admin_json(r) for r in linhas]}


def validar_usuario(d, novo):
    erros = {}
    email = str(d.get("email") or "").strip().lower()
    nome = str(d.get("name") or "").strip()
    papel = d.get("role")
    senha = d.get("password")
    if novo or "email" in d:
        if not EMAIL_RE.match(email) or len(email) > 120:
            erros["email"] = "Informe um e-mail válido."
    if novo or "name" in d:
        if not (2 <= len(nome) <= 100):
            erros["name"] = "Informe um nome de 2 a 100 caracteres."
    if novo or "role" in d:
        if papel not in ("viewer", "operator", "admin"):
            erros["role"] = "Perfil inválido."
    if novo or senha not in (None, ""):
        if not isinstance(senha, str) or not (8 <= len(senha) <= 128):
            erros["password"] = "A senha precisa ter de 8 a 128 caracteres."
    if "active" in d and not isinstance(d["active"], bool):
        erros["active"] = "Informe verdadeiro ou falso."
    if erros:
        raise ApiErro(422, "Revise os campos.", erros)
    return email, nome, papel, senha


@router.post("/users", status_code=201, openapi_extra=corpo(
    {"email": "ana@empresa.com", "name": "Ana Souza", "role": "operator", "password": "SenhaForte123"}))
async def criar_usuario(request: Request, u=Depends(usuario_atual)):
    exigir_admin(u)
    email, nome, papel, senha = validar_usuario(await ler_corpo(request), True)
    if sql("SELECT id FROM usuarios WHERE email=%s", (email,), um=True):
        raise ApiErro(409, "Já existe um usuário com este e-mail.", {"email": "E-mail já cadastrado."})
    _, novo_id = executar("INSERT INTO usuarios (email, nome, papel, senha_hash) VALUES (%s,%s,%s,%s)",
                          (email, nome, papel, v2.hash_senha(senha)))
    return usuario_admin_json(sql("SELECT * FROM usuarios WHERE id=%s", (novo_id,), um=True))


@router.put("/users/{user_id}", openapi_extra=corpo(
    {"name": "Ana Souza", "role": "admin", "active": True, "password": "(opcional: nova senha)"}))
async def editar_usuario(user_id: int, request: Request, u=Depends(usuario_atual)):
    exigir_admin(u)
    alvo = sql("SELECT * FROM usuarios WHERE id=%s", (user_id,), um=True)
    if not alvo:
        raise ApiErro(404, "Usuário não encontrado.")
    d = await ler_corpo(request)
    d.pop("email", None)   # e-mail é o login; não muda por aqui
    _, nome, papel, senha = validar_usuario(d, False)
    ativo = d.get("active", bool(alvo["ativo"]))
    papel = papel or alvo["papel"]
    # Nunca deixar a plataforma sem administrador ativo (inclusive o próprio admin se rebaixando).
    if alvo["papel"] == "admin" and (papel != "admin" or not ativo) and ativos_admin(exceto=user_id) == 0:
        raise ApiErro(409, "É preciso manter pelo menos um administrador ativo.")
    executar("UPDATE usuarios SET nome=%s, papel=%s, ativo=%s WHERE id=%s",
             (nome or alvo["nome"], papel, 1 if ativo else 0, user_id))
    if senha:
        executar("UPDATE usuarios SET senha_hash=%s WHERE id=%s", (v2.hash_senha(senha), user_id))
    if senha or not ativo or papel != alvo["papel"]:
        executar("DELETE FROM sessoes WHERE usuario_id=%s", (user_id,))   # derruba sessões antigas
    return usuario_admin_json(sql("SELECT * FROM usuarios WHERE id=%s", (user_id,), um=True))


@router.post("/me/password", status_code=204, openapi_extra=corpo(
    {"current_password": "Sentinela123", "new_password": "NovaSenha456"}))
async def trocar_minha_senha(request: Request, u=Depends(usuario_atual)):
    d = await ler_corpo(request)
    atual = sql("SELECT senha_hash FROM usuarios WHERE id=%s", (u["id"],), um=True)
    if not v2.confere_senha(str(d.get("current_password") or ""), atual["senha_hash"]):
        raise ApiErro(422, "Revise os campos.", {"current_password": "Senha atual incorreta."})
    nova = d.get("new_password")
    if not isinstance(nova, str) or not (8 <= len(nova) <= 128):
        raise ApiErro(422, "Revise os campos.", {"new_password": "A senha precisa ter de 8 a 128 caracteres."})
    executar("UPDATE usuarios SET senha_hash=%s WHERE id=%s", (v2.hash_senha(nova), u["id"]))
    executar("DELETE FROM sessoes WHERE usuario_id=%s", (u["id"],))
    return Response(status_code=204)


# ======================================================================= dispositivos
def validar_dispositivo(d):
    erros = {}
    for campo, limite in (("name", 100), ("location", 100)):
        if campo in d and (not isinstance(d[campo], str) or len(d[campo].strip()) > limite):
            erros[campo] = f"Até {limite} caracteres."
    if "enabled" in d and not isinstance(d["enabled"], bool):
        erros["enabled"] = "Informe verdadeiro ou falso."
    if erros:
        raise ApiErro(422, "Revise os campos.", erros)


@router.post("/devices", status_code=201, openapi_extra=corpo(
    {"id": "ESP32_CPD_7C700ABF1388", "name": "Rack Principal", "location": "Sala CPD - Setor A"}))
async def vincular_dispositivo(request: Request, u=Depends(usuario_atual)):
    exigir_admin(u)
    d = await ler_corpo(request)
    disp = str(d.get("id") or "").strip()
    if not ID_RE.match(disp):
        raise ApiErro(422, "Revise os campos.", {"id": "Use o ID mostrado no monitor serial (ex.: ESP32_CPD_...)."})
    validar_dispositivo(d)
    if sql("SELECT id FROM dispositivos WHERE id=%s", (disp,), um=True):
        raise ApiErro(409, "Dispositivo já vinculado.", {"id": "Já cadastrado."})
    executar("INSERT INTO dispositivos (id, nome, local) VALUES (%s,%s,%s)",
             (disp, (d.get("name") or "").strip() or None, (d.get("location") or "").strip() or None))
    return v2.dispositivo_json(v2.buscar_dispositivo(disp), agora())


@router.put("/devices/{device_id}", openapi_extra=corpo(
    {"name": "Rack Principal", "location": "Sala CPD - Setor A", "enabled": True}))
async def editar_dispositivo(device_id: str, request: Request, u=Depends(usuario_atual)):
    exigir_admin(u)
    atual = v2.buscar_dispositivo(device_id)
    d = await ler_corpo(request)
    validar_dispositivo(d)
    nome = d["name"].strip() if "name" in d else atual["nome"]
    local = d["location"].strip() if "location" in d else atual["local"]
    ativo = d.get("enabled", bool(atual["ativo"]))
    executar("UPDATE dispositivos SET nome=%s, local=%s, ativo=%s WHERE id=%s",
             (nome or None, local or None, 1 if ativo else 0, device_id))
    return v2.dispositivo_json(v2.buscar_dispositivo(device_id), agora())


# ======================================================================= firmware
def ler_etiqueta(dados: bytes):
    """Lê 'SENTINELA_FW|v=0.4.0|seq=4|target=esp32|' gravada no binário pelo firmware."""
    i = dados.find(TAG)
    if i < 0:
        return None
    fim = dados.find(b"\0", i, i + 160)
    texto = dados[i:fim if fim > 0 else i + 160].decode("ascii", "replace")
    campos = dict(p.split("=", 1) for p in texto.split("|")[1:] if "=" in p)
    try:
        return {"version": campos["v"][:32], "sequence": int(campos["seq"]), "target": campos["target"]}
    except (KeyError, ValueError):
        return None


def validar_binario(dados: bytes):
    if len(dados) < 1024:
        raise ApiErro(422, "Arquivo pequeno demais para ser um firmware.")
    if len(dados) > FIRMWARE_MAX:
        raise ApiErro(422, f"O firmware excede o slot OTA ({FIRMWARE_MAX} bytes).")
    if dados[0] != 0xE9:
        raise ApiErro(422, "Arquivo inválido: não é uma imagem de aplicação ESP32 (.bin exportado pela Arduino IDE).")
    etiqueta = ler_etiqueta(dados)
    if not etiqueta:
        raise ApiErro(422, "Firmware sem identificação SentinelaCPD (versão e sequência). Use o firmware do projeto.")
    if etiqueta["target"] != ALVO:
        raise ApiErro(422, f"Firmware para a placa '{etiqueta['target']}', incompatível com {ALVO}.")
    return etiqueta


def firmware_json(r):
    return {"id": str(r["id"]), "version": r["versao"], "sequence": int(r["sequencia"]), "target": r["alvo"],
            "size": int(r["tamanho"]), "sha256": r["sha256"], "notes": r["notas"] or "",
            "uploaded_by": r["enviado_por"], "uploaded_at": iso(r["criado_em"])}


@router.get("/firmware")
def listar_firmware(u=Depends(usuario_atual)):
    linhas = sql("SELECT * FROM firmwares ORDER BY sequencia DESC")
    return {"items": [firmware_json(r) for r in linhas]}


@router.post("/firmware", status_code=201, openapi_extra={"requestBody": {"required": True, "content": {
    "application/octet-stream": {"schema": {"type": "string", "format": "binary"}}}}})
async def enviar_firmware(request: Request, notes: Optional[str] = None, u=Depends(usuario_atual)):
    """Corpo: o arquivo .bin (Sketch > Export Compiled Binary), enviado como application/octet-stream."""
    exigir_admin(u)
    dados = await request.body()
    etiqueta = validar_binario(dados)
    if sql("SELECT id FROM firmwares WHERE sequencia=%s", (etiqueta["sequence"],), um=True):
        raise ApiErro(409, f"A sequência {etiqueta['sequence']} já foi enviada. Aumente FIRMWARE_SEQUENCE.")
    sha = hashlib.sha256(dados).hexdigest()
    os.makedirs(FIRMWARE_DIR, exist_ok=True)
    caminho = os.path.join(FIRMWARE_DIR, sha + ".bin")
    with open(caminho, "wb") as f:
        f.write(dados)
    _, novo = executar(
        "INSERT INTO firmwares (versao, sequencia, alvo, tamanho, sha256, notas, enviado_por) VALUES (%s,%s,%s,%s,%s,%s,%s)",
        (etiqueta["version"], etiqueta["sequence"], etiqueta["target"], len(dados), sha, (notes or "")[:255] or None, u["nome"]),
    )
    return firmware_json(sql("SELECT * FROM firmwares WHERE id=%s", (novo,), um=True))


# ======================================================================= OTA
SQL_JOBS = """
SELECT j.*, f.versao, f.sequencia, f.tamanho, f.sha256
  FROM ota_jobs j JOIN firmwares f ON f.id = j.firmware_id
"""


def job_json(r):
    return {"id": str(r["id"]), "device_id": r["dispositivo_id"], "firmware_id": str(r["firmware_id"]),
            "version": r["versao"], "from_version": r["versao_origem"], "status": r["status"],
            "detail": r["detalhe"] or "", "created_by": r["criado_por"], "created_at": iso(r["criado_em"]),
            "updated_at": iso(r["atualizado_em"]), "finished_at": iso(r["concluido_em"])}


def publicar_comando(device_id, comando):
    import paho.mqtt.publish as publish
    auth = None
    if os.getenv("MQTT_USER"):
        auth = {"username": os.getenv("MQTT_USER"), "password": os.getenv("MQTT_PASS", "")}
    publish.single(f"sentinela/{device_id}/cmd/ota", json.dumps(comando, separators=(",", ":")), qos=1,
                   hostname=os.getenv("MQTT_HOST", "localhost"), port=int(os.getenv("MQTT_PORT", "1883")),
                   auth=auth, client_id=f"sentinela-api-{secrets.token_hex(4)}", keepalive=10)


@router.get("/ota/jobs")
def listar_jobs(device_id: Optional[str] = None, u=Depends(usuario_atual)):
    if device_id:
        linhas = sql(SQL_JOBS + " WHERE j.dispositivo_id=%s ORDER BY j.id DESC LIMIT 50", (device_id,))
    else:
        linhas = sql(SQL_JOBS + " ORDER BY j.id DESC LIMIT 50")
    return {"items": [job_json(r) for r in linhas]}


@router.post("/devices/{device_id}/ota", status_code=201, openapi_extra=corpo({"firmware_id": "1"}))
async def iniciar_ota(device_id: str, request: Request, u=Depends(usuario_atual)):
    exigir_admin(u)
    disp = v2.buscar_dispositivo(device_id)
    if not disp["ativo"]:
        raise ApiErro(409, "Dispositivo desativado.")
    d = await ler_corpo(request)
    try:
        fw_id = int(d.get("firmware_id"))
    except (TypeError, ValueError):
        raise ApiErro(422, "Revise os campos.", {"firmware_id": "Escolha uma versão."})
    fw = sql("SELECT * FROM firmwares WHERE id=%s", (fw_id,), um=True)
    if not fw:
        raise ApiErro(404, "Versão de firmware não encontrada.")
    if disp["firmware"] and disp["firmware"] == fw["versao"]:
        raise ApiErro(409, f"O dispositivo já está na versão {fw['versao']}.")
    em_andamento = sql("SELECT id FROM ota_jobs WHERE dispositivo_id=%s AND status IN ('queued','sent','downloading','installed')",
                       (device_id,), um=True)
    if em_andamento:
        raise ApiErro(409, "Já existe uma atualização em andamento para este dispositivo.")
    token = secrets.token_urlsafe(24)
    _, job = executar(
        "INSERT INTO ota_jobs (dispositivo_id, firmware_id, versao_origem, token_hash, criado_por) VALUES (%s,%s,%s,%s,%s)",
        (device_id, fw_id, disp["firmware"], hashlib.sha256(token.encode()).hexdigest(), u["nome"]),
    )
    caminho = f"/api/v2/ota/jobs/{job}/firmware.bin?token={token}"
    comando = {"job": job, "version": fw["versao"], "sequence": int(fw["sequencia"]), "target": fw["alvo"],
               "size": int(fw["tamanho"]), "sha256": fw["sha256"], "url": (OTA_BASE_URL + caminho) if OTA_BASE_URL else caminho}
    try:
        publicar_comando(device_id, comando)
        executar("UPDATE ota_jobs SET status='sent', detalhe='Comando enviado ao dispositivo.' WHERE id=%s", (job,))
    except Exception as e:
        executar("UPDATE ota_jobs SET status='failed', detalhe=%s, concluido_em=UTC_TIMESTAMP() WHERE id=%s",
                 (f"Broker MQTT indisponível: {e}"[:255], job))
    return job_json(sql(SQL_JOBS + " WHERE j.id=%s", (job,), um=True))


@router.get("/ota/jobs/{job_id}/firmware.bin", include_in_schema=False)
def baixar_firmware(job_id: int, token: str = ""):
    """Download feito pelo ESP32. Sem login: autorizado pelo token de uso único do job."""
    r = sql(SQL_JOBS + " WHERE j.id=%s", (job_id,), um=True)
    valido = r and secrets.compare_digest(r["token_hash"], hashlib.sha256(token.encode()).hexdigest())
    if not valido or r["status"] not in ("sent", "downloading") or agora() - r["criado_em"] > timedelta(seconds=OTA_TOKEN_TTL_S):
        raise ApiErro(403, "Token de download inválido ou expirado.")
    caminho = os.path.join(FIRMWARE_DIR, r["sha256"] + ".bin")
    if not os.path.exists(caminho):
        raise ApiErro(404, "Arquivo de firmware não encontrado no servidor.")
    executar("UPDATE ota_jobs SET status='downloading', detalhe='Download iniciado.' WHERE id=%s AND status='sent'", (job_id,))
    return FileResponse(caminho, media_type="application/octet-stream", filename=f"sentinela-{r['versao']}.bin")
