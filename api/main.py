"""SentinelaCPD - API REST (consumida pelo app Mobile e pelo dashboard).

Documentação interativa: http://<host>:8000/docs
Se API_KEY estiver definida, todas as rotas /api exigem o cabeçalho X-API-Key.
"""
import os
from datetime import datetime
from typing import Optional

import mysql.connector.pooling
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

API_KEY = os.getenv("API_KEY", "")
ONLINE_TIMEOUT_S = int(os.getenv("ONLINE_TIMEOUT_S", "30"))   # sem contato além disso = OFFLINE
TEMP_LIMITE = float(os.getenv("TEMP_LIMITE", "35"))            # °C; acima disso = alerta de temperatura

_pool = None


def pool():
    global _pool
    if _pool is None:
        _pool = mysql.connector.pooling.MySQLConnectionPool(
            pool_name="sentinela",
            pool_size=5,
            host=os.getenv("DB_HOST", "localhost"),
            database=os.getenv("DB_NAME", "iot_db"),
            user=os.getenv("DB_USER", "sentinela"),
            password=os.getenv("DB_PASSWORD", ""),
        )
    return _pool


def query(sql, params=()):
    """Executa um SELECT e devolve lista de dicionários."""
    conn = pool().get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(sql, params)
        rows = cur.fetchall()
        cur.close()
        return rows
    finally:
        conn.close()


def verificar_chave(x_api_key: Optional[str] = Header(default=None)):
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Chave de API inválida ou ausente")


app = FastAPI(title="SentinelaCPD API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])


@app.get("/health")
def health():
    """Sem autenticação: usado para checar se a API e o banco estão no ar."""
    query("SELECT 1")
    return {"status": "ok"}


@app.get("/api/dispositivos", dependencies=[Depends(verificar_chave)])
def dispositivos():
    return query(
        "SELECT id, nome, local, estado, criado_em, ultimo_contato FROM dispositivos ORDER BY id"
    )


@app.get("/api/status-cpd", dependencies=[Depends(verificar_chave)])
def status_cpd():
    """Resumo para a tela inicial do app: último valor de cada dispositivo e situação geral."""
    rows = query(
        """
        SELECT d.id, d.nome, d.local, d.estado, d.ultimo_contato,
               TIMESTAMPDIFF(SECOND, d.ultimo_contato, NOW()) AS segundos_sem_contato,
               l.temperatura, l.umidade, l.corrente, l.bateria,
               l.data_hora AS leitura_em,
               (SELECT COUNT(*) FROM incidentes i
                 WHERE i.dispositivo_id = d.id AND i.status = 'ABERTO') AS incidentes_abertos
          FROM dispositivos d
          LEFT JOIN leituras l
            ON l.id = (SELECT MAX(id) FROM leituras WHERE dispositivo_id = d.id)
         ORDER BY d.id
        """
    )
    devs = []
    for r in rows:
        seg = r.pop("segundos_sem_contato")
        r["online"] = seg is not None and seg <= ONLINE_TIMEOUT_S
        r["alerta_temperatura"] = r["temperatura"] is not None and r["temperatura"] > TEMP_LIMITE
        devs.append(r)

    if not devs:
        geral = "SEM_DADOS"
    elif any(d["incidentes_abertos"] or d["estado"] == "ON_BATTERY" for d in devs):
        geral = "EM_INCIDENTE"
    elif any(d["alerta_temperatura"] for d in devs):
        geral = "ALERTA_TEMPERATURA"
    elif not any(d["online"] for d in devs):
        geral = "OFFLINE"
    else:
        geral = "NORMAL"
    return {"status_geral": geral, "limite_temperatura": TEMP_LIMITE, "dispositivos": devs}


@app.get("/api/telemetria", dependencies=[Depends(verificar_chave)])
def telemetria(
    dispositivo: Optional[str] = None,
    de: Optional[datetime] = Query(None, description="início (ex.: 2026-11-10T16:00:00)"),
    ate: Optional[datetime] = Query(None, description="fim"),
    limite: int = Query(100, ge=1, le=1000),
):
    cond, params = [], []
    if dispositivo:
        cond.append("dispositivo_id = %s")
        params.append(dispositivo)
    if de:
        cond.append("data_hora >= %s")
        params.append(de)
    if ate:
        cond.append("data_hora <= %s")
        params.append(ate)
    where = ("WHERE " + " AND ".join(cond)) if cond else ""
    params.append(limite)
    return query(
        "SELECT id, dispositivo_id, temperatura, umidade, corrente, bateria, data_hora "
        f"FROM leituras {where} ORDER BY id DESC LIMIT %s",
        tuple(params),
    )


@app.get("/api/incidentes", dependencies=[Depends(verificar_chave)])
def incidentes(
    dispositivo: Optional[str] = None,
    status: Optional[str] = Query(None, pattern="^(ABERTO|FECHADO)$"),
    limite: int = Query(50, ge=1, le=500),
):
    cond, params = [], []
    if dispositivo:
        cond.append("dispositivo_id = %s")
        params.append(dispositivo)
    if status:
        cond.append("status = %s")
        params.append(status)
    where = ("WHERE " + " AND ".join(cond)) if cond else ""
    params.append(limite)
    return query(
        "SELECT id, dispositivo_id, tipo, status, inicio, fim, duracao_s "
        f"FROM incidentes {where} ORDER BY id DESC LIMIT %s",
        tuple(params),
    )


@app.get("/api/incidentes/{incidente_id}", dependencies=[Depends(verificar_chave)])
def incidente(incidente_id: int):
    rows = query(
        "SELECT id, dispositivo_id, tipo, status, inicio, fim, duracao_s FROM incidentes WHERE id = %s",
        (incidente_id,),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Incidente não encontrado")
    inc = rows[0]
    # eventos ocorridos durante o incidente (e 1 min antes, para pegar o Last-Gasp)
    inc["eventos"] = query(
        "SELECT id, tipo, payload, data_hora FROM eventos "
        "WHERE dispositivo_id = %s AND data_hora >= %s - INTERVAL 1 MINUTE "
        "AND data_hora <= COALESCE(%s, NOW()) ORDER BY id",
        (inc["dispositivo_id"], inc["inicio"], inc["fim"]),
    )
    return inc
