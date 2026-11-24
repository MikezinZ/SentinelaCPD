"""SentinelaCPD - API v2 (contrato do app mobile e do dashboard web).

Rotas em /api/v2. Autenticação por token Bearer (JWT de 15 min) com refresh
rotativo guardado no banco. Perfis: viewer (só leitura), operator (reconhece
alertas) e admin (também altera limites).

Erros seguem o envelope esperado pelos clientes:
  {"error": {"message": "...", "fields": {...}}, "request_id": "..."}
"""
import base64
import hashlib
import hmac
import math
import os
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
import mysql.connector.pooling
from fastapi import APIRouter, Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.responses import JSONResponse, Response

from schema import LIMITES_PADRAO, migrar

ACCESS_TTL_S = 900                       # 15 min
REFRESH_TTL_S = 7 * 24 * 3600            # 7 dias
STALE_AFTER_S = int(os.getenv("STALE_AFTER_S", "15"))   # firmware envia a cada 5 s
PAGE = 50
HIST_PAGE = 500
BUCKETS = {"raw": (0, 3600), "1m": (60, 86400), "15m": (900, 7 * 86400)}  # passo e janela máxima (s)
METRICAS = {"temperature": "temperatura", "humidity": "umidade", "current": "corrente"}

_secret = os.getenv("JWT_SECRET", "")
if not _secret:
    _secret = secrets.token_urlsafe(48)
    print("[api] JWT_SECRET vazio: usando chave temporária (sessões caem ao reiniciar a API).")
JWT_SECRET = _secret


class ApiErro(Exception):
    def __init__(self, status: int, message: str, fields: Optional[dict] = None):
        self.status, self.message, self.fields = status, message, fields


def resposta_erro(status, message, fields=None):
    corpo = {"error": {"message": message}, "request_id": uuid.uuid4().hex}
    if fields:
        corpo["error"]["fields"] = fields
    return JSONResponse(corpo, status_code=status)


# ----------------------------------------------------------------- banco
_pool = None


def pool():
    global _pool
    if _pool is None:
        _pool = mysql.connector.pooling.MySQLConnectionPool(
            pool_name="sentinela_v2",
            pool_size=8,
            host=os.getenv("DB_HOST", "localhost"),
            database=os.getenv("DB_NAME", "iot_db"),
            user=os.getenv("DB_USER", "sentinela"),
            password=os.getenv("DB_PASSWORD", ""),
            time_zone="+00:00",          # todas as datas da v2 em UTC
            autocommit=True,
        )
    return _pool


def sql(consulta, params=(), um=False):
    conn = pool().get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(consulta, params)
        linhas = cur.fetchall() if cur.with_rows else []
        cur.close()
        return (linhas[0] if linhas else None) if um else linhas
    finally:
        conn.close()


def executar(consulta, params=()):
    conn = pool().get_connection()
    try:
        cur = conn.cursor()
        cur.execute(consulta, params)
        n, ultimo = cur.rowcount, cur.lastrowid
        cur.close()
        return n, ultimo
    finally:
        conn.close()


def iso(dt):
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def agora():
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ----------------------------------------------------------------- senhas e usuários
def hash_senha(senha: str) -> str:
    sal = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", senha.encode(), sal, 200_000)
    return "pbkdf2_sha256$200000$" + base64.b64encode(sal).decode() + "$" + base64.b64encode(dk).decode()


def confere_senha(senha: str, armazenado: str) -> bool:
    try:
        _, it, sal, dk = armazenado.split("$")
        calc = hashlib.pbkdf2_hmac("sha256", senha.encode(), base64.b64decode(sal), int(it))
        return hmac.compare_digest(calc, base64.b64decode(dk))
    except Exception:
        return False


def criar_usuario(email, nome, papel, senha):
    if papel not in ("viewer", "operator", "admin"):
        raise ValueError("papel inválido")
    if len(senha) < 8:
        raise ValueError("a senha precisa de pelo menos 8 caracteres")
    executar(
        "INSERT INTO usuarios (email, nome, papel, senha_hash) VALUES (%s,%s,%s,%s) "
        "ON DUPLICATE KEY UPDATE nome=VALUES(nome), papel=VALUES(papel), senha_hash=VALUES(senha_hash), ativo=1",
        (email.strip().lower(), nome, papel, hash_senha(senha)),
    )


def preparar_banco():
    """Migração + usuários iniciais. Repete até o MySQL responder."""
    while True:
        try:
            conn = pool().get_connection()
            try:
                migrar(conn)
            finally:
                conn.close()
            break
        except Exception as e:
            print(f"[api] aguardando MySQL para migrar: {e}")
            time.sleep(3)
    if os.getenv("DEMO_USERS", "false").lower() == "true":
        for papel, nome in (("admin", "Admin CPD"), ("operator", "Operador CPD"), ("viewer", "Visitante CPD")):
            if not sql("SELECT id FROM usuarios WHERE email=%s", (f"{papel}@sentinelacpd.demo",), um=True):
                criar_usuario(f"{papel}@sentinelacpd.demo", nome, papel, "Sentinela123")
        print("[api] DEMO_USERS=true: contas de demonstração disponíveis (senha Sentinela123).")
    email, senha = os.getenv("ADMIN_EMAIL", "").strip(), os.getenv("ADMIN_PASSWORD", "")
    if email and senha and not sql("SELECT id FROM usuarios WHERE email=%s", (email.lower(),), um=True):
        criar_usuario(email, os.getenv("ADMIN_NAME", "Administrador"), "admin", senha)
        print(f"[api] administrador inicial criado: {email}")


# ----------------------------------------------------------------- sessão
def usuario_json(u):
    return {"id": str(u["id"]), "name": u["nome"], "role": u["papel"]}


def nova_sessao(u):
    agora_s = int(time.time())
    access = jwt.encode(
        {"sub": str(u["id"]), "role": u["papel"], "name": u["nome"], "iat": agora_s,
         "exp": agora_s + ACCESS_TTL_S, "typ": "access"},
        JWT_SECRET, algorithm="HS256",
    )
    refresh = secrets.token_urlsafe(48)
    executar(
        "INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES (%s,%s,%s)",
        (hashlib.sha256(refresh.encode()).hexdigest(), u["id"], agora() + timedelta(seconds=REFRESH_TTL_S)),
    )
    return {"access_token": access, "refresh_token": refresh, "expires_in": ACCESS_TTL_S, "user": usuario_json(u)}


# HTTPBearer também cria o botão "Authorize" no Swagger (/docs).
bearer = HTTPBearer(auto_error=False, description="Cole o access_token devolvido por POST /api/v2/auth/login")


def usuario_atual(cred: Optional[HTTPAuthorizationCredentials] = Depends(bearer)):
    if not cred or cred.scheme.lower() != "bearer":
        raise ApiErro(401, "Sessão expirada.")
    try:
        dados = jwt.decode(cred.credentials.strip(), JWT_SECRET, algorithms=["HS256"])
        if dados.get("typ") != "access":
            raise ValueError
    except Exception:
        raise ApiErro(401, "Sessão expirada.")
    u = sql("SELECT id, nome, papel FROM usuarios WHERE id=%s AND ativo=1", (int(dados["sub"]),), um=True)
    if not u:
        raise ApiErro(401, "Sessão expirada.")
    return u


async def ler_corpo(request: Request) -> dict:
    """Corpo JSON como dicionário; corpo vazio vira {} e JSON inválido vira 400."""
    bruto = await request.body()
    if not bruto:
        return {}
    try:
        import json
        dados = json.loads(bruto)
    except Exception:
        raise ApiErro(400, "JSON inválido.")
    return dados if isinstance(dados, dict) else {}


# ----------------------------------------------------------------- paginação
def cursor_para_offset(cursor: Optional[str]) -> int:
    if not cursor:
        return 0
    try:
        texto = base64.b64decode(cursor.encode(), validate=True).decode()
        if not texto.startswith("page:"):
            raise ValueError
        offset = int(texto[5:])
        if offset < 0:
            raise ValueError
        return offset
    except Exception:
        raise ApiErro(400, "Cursor inválido.")


def proximo_cursor(offset, tamanho, total_lido):
    return base64.b64encode(f"page:{offset + tamanho}".encode()).decode() if total_lido > tamanho else None


# ----------------------------------------------------------------- dispositivos
SQL_DISPOSITIVOS = """
SELECT d.id, d.nome, d.local, d.ativo, d.firmware, d.energia, d.ultimo_contato,
       l.temperatura, l.umidade, l.corrente, l.bateria, l.data_hora AS leitura_em,
       (SELECT COUNT(*) FROM alertas a WHERE a.dispositivo_id = d.id AND a.resolvido_em IS NULL) AS alertas_ativos
  FROM dispositivos d
  LEFT JOIN leituras l ON l.id = (SELECT MAX(id) FROM leituras WHERE dispositivo_id = d.id)
"""


def dispositivo_json(r, servidor):
    latest = None
    if r["leitura_em"] is not None:
        valores = {"temperature": r["temperatura"], "humidity": r["umidade"], "current": r["corrente"]}
        latest = {
            "sampled_at": None,                      # o firmware não envia horário próprio
            "received_at": iso(r["leitura_em"]),
            "temperature_c": round(r["temperatura"], 2) if r["temperatura"] is not None else None,
            "humidity_pct": round(r["umidade"], 2) if r["umidade"] is not None else None,
            "current_rms_a": round(r["corrente"], 3) if r["corrente"] is not None else None,
            "quality": {k: ("ok" if v is not None else "invalid") for k, v in valores.items()},
        }
    ativo = bool(r["ativo"])
    if not ativo:
        freshness = "inactive"
    elif latest is None:
        freshness = "unknown"
    else:
        freshness = "stale" if (servidor - r["leitura_em"]).total_seconds() > STALE_AFTER_S else "fresh"
    energia = r["energia"] if r["energia"] in ("mains", "battery") else "unknown"
    return {
        "id": r["id"],
        "name": r["nome"] or r["id"],
        "location": r["local"] or "",
        "enabled": ativo,
        "firmware_version": r["firmware"] or "desconhecida",
        "freshness": freshness,
        "stale_after_seconds": STALE_AFTER_S,
        "server_time": iso(servidor),
        "latest": latest,
        "power_state": energia,
        "battery_pct": int(r["bateria"]) if r["bateria"] is not None else None,
        "active_alerts": int(r["alertas_ativos"] or 0),
    }


def buscar_dispositivo(device_id):
    r = sql(SQL_DISPOSITIVOS + " WHERE d.id = %s", (device_id,), um=True)
    if not r:
        raise ApiErro(404, "Dispositivo não encontrado.")
    return r


# ----------------------------------------------------------------- alertas
def alerta_json(a):
    estado = "resolved" if a["resolvido_em"] else "acknowledged" if a["reconhecido_em"] else "active"
    item = {
        "id": str(a["id"]), "device_id": a["dispositivo_id"], "type": a["tipo"], "severity": a["severidade"],
        "state": estado, "opened_at": iso(a["aberto_em"]), "acknowledged_at": iso(a["reconhecido_em"]),
        "acknowledged_by": a["reconhecido_por"], "resolved_at": iso(a["resolvido_em"]),
        "message": a["mensagem"], "rule_version": int(a["versao_regra"]),
    }
    if a["nota"]:
        item["note"] = a["nota"]
    return item


# ----------------------------------------------------------------- limites
CAMPOS_LIMITE = ["temperature_min", "temperature_max", "humidity_min", "humidity_max", "current_max",
                 "temperature_hysteresis", "humidity_hysteresis", "current_hysteresis"]


def limites_de(device_id):
    r = sql("SELECT * FROM limites WHERE dispositivo_id=%s", (device_id,), um=True)
    base = dict(LIMITES_PADRAO) if not r else {k: r[k] for k in ["versao", "consecutive_samples", *CAMPOS_LIMITE]}
    saida = {"version": int(base["versao"])}
    for k in CAMPOS_LIMITE:
        saida[k] = float(base[k]) if base[k] is not None else None
    saida["consecutive_samples"] = int(base["consecutive_samples"])
    return saida, r is not None


def validar_limites(v):
    """Mesmas regras do validateLimits dos clientes."""
    erros = {}
    for campo in [*CAMPOS_LIMITE]:
        x = v.get(campo)
        if x is not None and (isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x)):
            erros[campo] = "Informe um número válido."
    if erros:
        return erros
    for s in ("temperature", "humidity"):
        mn, mx, h = v.get(f"{s}_min"), v.get(f"{s}_max"), v.get(f"{s}_hysteresis")
        if mn is not None and mx is not None and mn >= mx:
            erros[f"{s}_max"] = "Deve ser maior que o mínimo."
        if h is not None and (h < 0 or (mn is not None and mx is not None and h >= mx - mn)):
            erros[f"{s}_hysteresis"] = "Informe uma histerese não negativa e menor que a faixa."
    for campo in ("humidity_min", "humidity_max"):
        x = v.get(campo)
        if x is not None and (x < 0 or x > 100):
            erros[campo] = "Informe um valor entre 0 e 100."
    if v.get("current_max") is not None and v["current_max"] < 0:
        erros["current_max"] = "Informe um valor não negativo."
    ch = v.get("current_hysteresis")
    if (ch is not None and ch < 0) or (v.get("current_max") is not None and ch is None):
        erros["current_hysteresis"] = "Informe uma histerese de corrente não negativa."
    cs = v.get("consecutive_samples")
    if isinstance(cs, bool) or not isinstance(cs, int) or cs < 1:
        erros["consecutive_samples"] = "Informe um inteiro positivo."
    return erros


# ----------------------------------------------------------------- rotas
router = APIRouter(prefix="/api/v2", tags=["v2"])


def corpo(exemplo: dict) -> dict:
    """Mostra a caixa de corpo JSON no Swagger (/docs) para rotas que leem o corpo manualmente."""
    return {"requestBody": {"required": True, "content": {"application/json": {
        "schema": {"type": "object"}, "example": exemplo}}}}


@router.post("/auth/login", openapi_extra=corpo({"email": "admin@sentinelacpd.demo", "password": "Sentinela123"}))
async def login(request: Request):
    dados = await ler_corpo(request)
    email = str(dados.get("email") or "").strip().lower()
    senha = str(dados.get("password") or "")
    u = sql("SELECT id, nome, papel, senha_hash FROM usuarios WHERE email=%s AND ativo=1", (email,), um=True)
    if not u or not confere_senha(senha, u["senha_hash"]):
        raise ApiErro(401, "E-mail ou senha inválidos.")
    executar("DELETE FROM sessoes WHERE expira_em < NOW()")
    return nova_sessao(u)


@router.post("/auth/refresh", openapi_extra=corpo({"refresh_token": "cole_o_refresh_token"}))
async def refresh(request: Request):
    dados = await ler_corpo(request)
    token = str(dados.get("refresh_token") or "")
    h = hashlib.sha256(token.encode()).hexdigest()
    s = sql("SELECT usuario_id, expira_em FROM sessoes WHERE token_hash=%s", (h,), um=True)
    executar("DELETE FROM sessoes WHERE token_hash=%s", (h,))          # rotação: o token antigo morre
    if not s or s["expira_em"] <= agora():
        raise ApiErro(401, "Sessão expirada.")
    u = sql("SELECT id, nome, papel FROM usuarios WHERE id=%s AND ativo=1", (s["usuario_id"],), um=True)
    if not u:
        raise ApiErro(401, "Sessão expirada.")
    return nova_sessao(u)


@router.post("/auth/logout", status_code=204, openapi_extra=corpo({"refresh_token": "cole_o_refresh_token"}))
async def logout(request: Request):
    dados = await ler_corpo(request)
    token = str(dados.get("refresh_token") or "")
    if token:
        executar("DELETE FROM sessoes WHERE token_hash=%s", (hashlib.sha256(token.encode()).hexdigest(),))
    return Response(status_code=204)


@router.get("/me")
def me(u=Depends(usuario_atual)):
    return usuario_json(u)


@router.get("/devices")
def devices(cursor: Optional[str] = None, u=Depends(usuario_atual)):
    offset = cursor_para_offset(cursor)
    servidor = agora()
    linhas = sql(SQL_DISPOSITIVOS + " ORDER BY d.id LIMIT %s OFFSET %s", (PAGE + 1, offset))
    return {
        "items": [dispositivo_json(r, servidor) for r in linhas[:PAGE]],
        "next_cursor": proximo_cursor(offset, PAGE, len(linhas)),
        "server_time": iso(servidor),
    }


@router.get("/devices/{device_id}")
def device(device_id: str, u=Depends(usuario_atual)):
    return dispositivo_json(buscar_dispositivo(device_id), agora())


def ler_data(texto):
    try:
        dt = datetime.fromisoformat(str(texto).replace("Z", "+00:00"))
    except Exception:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


@router.get("/devices/{device_id}/readings")
def readings(device_id: str, request: Request, u=Depends(usuario_atual)):
    q = request.query_params
    buscar_dispositivo(device_id)
    inicio, fim, bucket = ler_data(q.get("from")), ler_data(q.get("to")), q.get("bucket")
    if bucket not in BUCKETS or not inicio or not fim or inicio >= fim \
            or (fim - inicio).total_seconds() > BUCKETS[bucket][1]:
        raise ApiErro(400, "Período inválido.")
    offset = cursor_para_offset(q.get("cursor"))
    passo = BUCKETS[bucket][0]
    if bucket == "raw":
        linhas = sql(
            "SELECT data_hora AS t, temperatura AS temperature_avg, umidade AS humidity_avg, corrente AS current_avg "
            "FROM leituras WHERE dispositivo_id=%s AND data_hora >= %s AND data_hora < %s "
            "ORDER BY data_hora, id LIMIT %s OFFSET %s",
            (device_id, inicio, fim, HIST_PAGE + 1, offset),
        )
    else:
        colunas = ", ".join(
            f"MIN({c}) AS {m}_min, MAX({c}) AS {m}_max, AVG({c}) AS {m}_avg, COUNT({c}) AS {m}_count"
            for m, c in METRICAS.items()
        )
        linhas = sql(
            f"SELECT FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(data_hora) / {passo}) * {passo}) AS t, {colunas} "
            "FROM leituras WHERE dispositivo_id=%s AND data_hora >= %s AND data_hora < %s "
            "GROUP BY t ORDER BY t LIMIT %s OFFSET %s",
            (device_id, inicio, fim, HIST_PAGE + 1, offset),
        )
    pontos = []
    for r in linhas[:HIST_PAGE]:
        ponto = {"timestamp": iso(r["t"])}
        for m in METRICAS:
            if bucket == "raw":
                v = r[f"{m}_avg"]
                ponto[m] = None if v is None else {"min": v, "max": v, "avg": v, "count": 1}
            else:
                n = int(r[f"{m}_count"] or 0)
                ponto[m] = None if n == 0 else {
                    "min": float(r[f"{m}_min"]), "max": float(r[f"{m}_max"]),
                    "avg": round(float(r[f"{m}_avg"]), 3), "count": n,
                }
        pontos.append(ponto)
    return {"points": pontos, "next_cursor": proximo_cursor(offset, HIST_PAGE, len(linhas))}


@router.get("/devices/{device_id}/incidents")
def incidents(device_id: str, cursor: Optional[str] = None, u=Depends(usuario_atual)):
    buscar_dispositivo(device_id)
    offset = cursor_para_offset(cursor)
    linhas = sql(
        "SELECT id, status, inicio, fim, duracao_s FROM incidentes WHERE dispositivo_id=%s "
        "ORDER BY inicio DESC, id DESC LIMIT %s OFFSET %s",
        (device_id, PAGE + 1, offset),
    )
    itens = [{
        "id": str(r["id"]), "type": "power_loss", "status": "open" if r["status"] == "ABERTO" else "closed",
        "started_at": iso(r["inicio"]), "ended_at": iso(r["fim"]),
        "duration_s": int(r["duracao_s"]) if r["duracao_s"] is not None else None,
    } for r in linhas[:PAGE]]
    return {"items": itens, "next_cursor": proximo_cursor(offset, PAGE, len(linhas))}


@router.get("/alerts")
def alerts(state: Optional[str] = None, device_id: Optional[str] = None, cursor: Optional[str] = None,
           u=Depends(usuario_atual)):
    cond, params = [], []
    if state == "active":
        cond.append("resolvido_em IS NULL AND reconhecido_em IS NULL")
    elif state == "acknowledged":
        cond.append("resolvido_em IS NULL AND reconhecido_em IS NOT NULL")
    elif state == "resolved":
        cond.append("resolvido_em IS NOT NULL")
    elif state not in (None, ""):
        raise ApiErro(400, "Estado de alerta inválido.")
    if device_id:
        cond.append("dispositivo_id=%s")
        params.append(device_id)
    offset = cursor_para_offset(cursor)
    where = ("WHERE " + " AND ".join(cond)) if cond else ""
    linhas = sql(f"SELECT * FROM alertas {where} ORDER BY aberto_em DESC, id DESC LIMIT %s OFFSET %s",
                 (*params, PAGE + 1, offset))
    return {"items": [alerta_json(a) for a in linhas[:PAGE]], "next_cursor": proximo_cursor(offset, PAGE, len(linhas))}


@router.post("/alerts/{alert_id}/ack", openapi_extra=corpo({"note": "Verificado no local."}))
async def acknowledge(alert_id: str, request: Request, u=Depends(usuario_atual)):
    if u["papel"] == "viewer":
        raise ApiErro(403, "Perfil sem permissão para reconhecer alertas.")
    if not alert_id.isdigit():
        raise ApiErro(404, "Alerta não encontrado.")
    a = sql("SELECT * FROM alertas WHERE id=%s", (int(alert_id),), um=True)
    if not a:
        raise ApiErro(404, "Alerta não encontrado.")
    if a["reconhecido_em"]:
        return alerta_json(a)
    if a["resolvido_em"]:
        raise ApiErro(409, "O alerta já foi resolvido.")
    dados = await ler_corpo(request)
    nota = dados.get("note")
    if nota is not None and not isinstance(nota, str):
        raise ApiErro(422, "Nota inválida.", {"note": "Informe um texto."})
    if nota and len(nota) > 500:
        raise ApiErro(422, "A nota pode ter até 500 caracteres.", {"note": "Até 500 caracteres."})
    executar(
        "UPDATE alertas SET reconhecido_em=NOW(), reconhecido_por=%s, nota=%s "
        "WHERE id=%s AND reconhecido_em IS NULL",
        (u["nome"], (nota or None), a["id"]),
    )
    return alerta_json(sql("SELECT * FROM alertas WHERE id=%s", (a["id"],), um=True))


def exigir_admin(u):
    if u["papel"] != "admin":
        raise ApiErro(403, "Apenas administradores podem acessar os limites.")


@router.get("/devices/{device_id}/limits")
def get_limits(device_id: str, u=Depends(usuario_atual)):
    buscar_dispositivo(device_id)
    exigir_admin(u)
    return limites_de(device_id)[0]


@router.put("/devices/{device_id}/limits", openapi_extra=corpo({
    "version": 1, "temperature_min": 18, "temperature_max": 27, "humidity_min": 40, "humidity_max": 60,
    "current_max": None, "temperature_hysteresis": 1, "humidity_hysteresis": 3, "current_hysteresis": None,
    "consecutive_samples": 3}))
async def put_limits(device_id: str, request: Request, u=Depends(usuario_atual)):
    buscar_dispositivo(device_id)
    exigir_admin(u)
    dados = await ler_corpo(request)
    atual, existe = limites_de(device_id)
    if dados.get("version") != atual["version"]:
        raise ApiErro(409, "Os limites foram alterados por outra sessão.")
    erros = validar_limites(dados)
    if erros:
        raise ApiErro(422, "Revise os campos.", erros)
    nova = atual["version"] + 1
    valores = [dados.get(k) for k in CAMPOS_LIMITE]
    if existe:
        n, _ = executar(
            "UPDATE limites SET " + ", ".join(f"{k}=%s" for k in CAMPOS_LIMITE) +
            ", consecutive_samples=%s, versao=%s, atualizado_por=%s WHERE dispositivo_id=%s AND versao=%s",
            (*valores, dados["consecutive_samples"], nova, u["nome"], device_id, atual["version"]),
        )
        if n == 0:   # outra sessão salvou entre a leitura e a gravação
            raise ApiErro(409, "Os limites foram alterados por outra sessão.")
    else:
        try:
            executar(
                "INSERT INTO limites (dispositivo_id, " + ", ".join(CAMPOS_LIMITE) +
                ", consecutive_samples, versao, atualizado_por) VALUES (" + ", ".join(["%s"] * (len(CAMPOS_LIMITE) + 4)) + ")",
                (device_id, *valores, dados["consecutive_samples"], nova, u["nome"]),
            )
        except mysql.connector.IntegrityError:
            raise ApiErro(409, "Os limites foram alterados por outra sessão.")
    return limites_de(device_id)[0]
