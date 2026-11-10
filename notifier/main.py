"""SentinelaCPD - Notification Service (Telegram).

Consulta o MySQL a cada POLL_S segundos e avisa por Telegram:
  - incidente ABERTO (queda de energia)
  - incidente FECHADO (com a duração)
  - temperatura acima do limite (e quando normaliza)
  - dispositivo sem enviar dados (e quando volta)

Sem TELEGRAM_TOKEN/TELEGRAM_CHAT_ID o serviço roda em "modo teste": só escreve
as mensagens no log, sem enviar nada.
"""
import json
import os
import time
import urllib.error
import urllib.request

import mysql.connector

TOKEN = os.getenv("TELEGRAM_TOKEN", "").strip()
CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "").strip()
TEMP_LIMITE = float(os.getenv("TEMP_LIMITE", "35"))
HISTERESE = 1.0                                   # °C abaixo do limite para considerar normalizado
OFFLINE_S = int(os.getenv("OFFLINE_S", "60"))     # sem dados por mais que isso = offline
POLL_S = int(os.getenv("POLL_S", "5"))

DB = dict(
    host=os.getenv("DB_HOST", "localhost"),
    database=os.getenv("DB_NAME", "iot_db"),
    user=os.getenv("DB_USER", "sentinela"),
    password=os.getenv("DB_PASSWORD", ""),
)


# ----------------------------------------------------------------- mensagens
def fmt_duracao(s):
    if s is None:
        return "?"
    s = int(s)
    h, resto = divmod(s, 3600)
    m, seg = divmod(resto, 60)
    if h:
        return f"{h} h {m} min {seg} s"
    if m:
        return f"{m} min {seg} s"
    return f"{seg} s"


def fmt_hora(dt):
    return dt.strftime("%d/%m %H:%M:%S") if dt else "?"


def nome(d):
    return d.get("nome") or d.get("dispositivo_id") or d.get("id")


def msg_incidente_aberto(inc):
    return (
        "🔴 ALERTA SENTINELACPD\n"
        f"Interrupção da alimentação principal detectada.\n"
        f"Dispositivo: {nome(inc)}\n"
        f"Início: {fmt_hora(inc['inicio'])}\n"
        "O dispositivo pode estar operando por bateria."
    )


def msg_incidente_fechado(inc):
    return (
        "🟢 SENTINELACPD: energia restabelecida\n"
        f"Dispositivo: {nome(inc)}\n"
        f"Início: {fmt_hora(inc['inicio'])}\n"
        f"Fim: {fmt_hora(inc['fim'])}\n"
        f"Duração da interrupção: {fmt_duracao(inc['duracao_s'])}"
    )


# ------------------------------------------------- regras por dispositivo
class Estado:
    """Memória do serviço (o que já foi avisado), para não repetir alertas."""

    def __init__(self):
        self.temp_alta = set()
        self.offline = set()
        self.visto_online = set()   # só avisa "offline" de quem já foi visto online


def avaliar_dispositivos(rows, est, limite=TEMP_LIMITE, offline_s=OFFLINE_S):
    """Recebe as linhas de status dos dispositivos e devolve as mensagens a enviar."""
    msgs = []
    for d in rows:
        did = d["id"]
        seg = d.get("segundos_sem_contato")
        temp = d.get("temperatura")
        online = seg is not None and seg <= offline_s

        # --- offline / de volta
        if online:
            est.visto_online.add(did)
            if did in est.offline:
                est.offline.discard(did)
                msgs.append(f"🟢 SENTINELACPD: {nome(d)} voltou a enviar dados.")
        elif did in est.visto_online and did not in est.offline:
            est.offline.add(did)
            msgs.append(
                f"⚠️ SENTINELACPD: {nome(d)} parou de enviar dados "
                f"(último contato: {fmt_hora(d.get('ultimo_contato'))})."
            )

        # --- temperatura (só avalia com leitura recente)
        if online and temp is not None:
            if temp > limite and did not in est.temp_alta:
                est.temp_alta.add(did)
                msgs.append(
                    f"🌡️ ALERTA SENTINELACPD: temperatura alta em {nome(d)}\n"
                    f"Agora: {temp:.1f} °C (limite: {limite:.0f} °C)"
                )
            elif temp <= limite - HISTERESE and did in est.temp_alta:
                est.temp_alta.discard(did)
                msgs.append(
                    f"✅ SENTINELACPD: temperatura de {nome(d)} normalizou ({temp:.1f} °C)."
                )
    return msgs


# ------------------------------------------------------------------ Telegram
def telegram(metodo, payload=None):
    """Chama a API do Telegram. Devolve o JSON ou None em caso de erro (sem vazar o token)."""
    url = f"https://api.telegram.org/bot{TOKEN}/{metodo}"
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        print(f"[telegram] erro HTTP {e.code} em {metodo}")
    except Exception as e:
        print(f"[telegram] falha em {metodo}: {type(e).__name__}")
    return None


def enviar(texto):
    """Envia (ou, em modo teste, só registra). True = entregue/registrado."""
    if not (TOKEN and CHAT_ID):
        print("[modo teste] " + texto.replace("\n", " | "))
        return True
    r = telegram("sendMessage", {"chat_id": CHAT_ID, "text": texto})
    ok = bool(r and r.get("ok"))
    print(f"[telegram] {'enviado' if ok else 'FALHOU'}: {texto.splitlines()[0]}")
    return ok


def listar_chats():
    """Ajuda a achar o TELEGRAM_CHAT_ID: mostra quem já falou com o bot."""
    r = telegram("getUpdates")
    chats = {}
    for u in (r or {}).get("result", []):
        c = (u.get("message") or {}).get("chat")
        if c:
            chats[c["id"]] = c.get("first_name") or c.get("title") or c.get("username") or "?"
    if chats:
        print("[telegram] Chats que já falaram com o bot (copie o id para TELEGRAM_CHAT_ID no .env):")
        for cid, n in chats.items():
            print(f"[telegram]   id={cid}  nome={n}")
    else:
        print("[telegram] Nenhum chat encontrado: abra o bot no Telegram, envie /start e reinicie o notifier.")


# ------------------------------------------------------------------- banco
_conn = None


def conn():
    global _conn
    if _conn is None or not _conn.is_connected():
        _conn = mysql.connector.connect(**DB, autocommit=True)
    else:
        _conn.ping(reconnect=True, attempts=3, delay=1)
    return _conn


def q(sql, params=()):
    cur = conn().cursor(dictionary=True)
    cur.execute(sql, params)
    rows = cur.fetchall()
    cur.close()
    return rows


def run(sql, params=()):
    cur = conn().cursor()
    cur.execute(sql, params)
    cur.close()


def preparar_banco():
    run(
        """CREATE TABLE IF NOT EXISTS notificacoes (
             id BIGINT AUTO_INCREMENT PRIMARY KEY,
             tipo VARCHAR(30) NOT NULL,
             referencia_id BIGINT NOT NULL,
             enviado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
             UNIQUE KEY uq_notif (tipo, referencia_id))"""
    )
    # Primeira execução: o histórico existente não gera avisos antigos.
    if not q("SELECT 1 FROM notificacoes WHERE tipo='BASELINE'"):
        run("INSERT IGNORE INTO notificacoes (tipo, referencia_id) SELECT 'ABERTO', id FROM incidentes")
        run("INSERT IGNORE INTO notificacoes (tipo, referencia_id) "
            "SELECT 'FECHADO', id FROM incidentes WHERE status='FECHADO'")
        run("INSERT IGNORE INTO notificacoes (tipo, referencia_id) VALUES ('BASELINE', 0)")
        print("[notifier] histórico existente marcado como já notificado")


def marcar(tipo, ref):
    run("INSERT IGNORE INTO notificacoes (tipo, referencia_id) VALUES (%s,%s)", (tipo, ref))


SQL_INC = (
    "SELECT i.id, i.dispositivo_id, i.status, i.inicio, i.fim, i.duracao_s, d.nome "
    "FROM incidentes i JOIN dispositivos d ON d.id = i.dispositivo_id "
)


def ciclo(est):
    # incidentes abertos ainda não avisados
    for inc in q(SQL_INC + "WHERE NOT EXISTS (SELECT 1 FROM notificacoes n "
                           "WHERE n.tipo='ABERTO' AND n.referencia_id=i.id) ORDER BY i.id"):
        if enviar(msg_incidente_aberto(inc)):
            marcar("ABERTO", inc["id"])
    # incidentes fechados ainda não avisados
    for inc in q(SQL_INC + "WHERE i.status='FECHADO' AND NOT EXISTS (SELECT 1 FROM notificacoes n "
                           "WHERE n.tipo='FECHADO' AND n.referencia_id=i.id) ORDER BY i.id"):
        if enviar(msg_incidente_fechado(inc)):
            marcar("FECHADO", inc["id"])
    # temperatura e disponibilidade
    rows = q(
        """SELECT d.id, d.nome, d.ultimo_contato,
                  TIMESTAMPDIFF(SECOND, d.ultimo_contato, NOW()) AS segundos_sem_contato,
                  l.temperatura
             FROM dispositivos d
             LEFT JOIN leituras l
               ON l.id = (SELECT MAX(id) FROM leituras WHERE dispositivo_id = d.id)"""
    )
    for m in avaliar_dispositivos(rows, est):
        enviar(m)


def main():
    while True:
        try:
            conn()
            break
        except Exception as e:
            print(f"[db] aguardando MySQL: {e}")
            time.sleep(3)
    preparar_banco()

    if TOKEN and not CHAT_ID:
        listar_chats()
        print("[notifier] TELEGRAM_CHAT_ID vazio: rodando em modo teste (nada é enviado).")
    elif not TOKEN:
        print("[notifier] TELEGRAM_TOKEN vazio: rodando em modo teste (nada é enviado).")
    enviar("✅ SentinelaCPD: serviço de alertas ativo.")

    est = Estado()
    while True:
        try:
            ciclo(est)
        except Exception as e:
            print(f"[erro] {type(e).__name__}: {e}")
        time.sleep(POLL_S)


if __name__ == "__main__":
    main()
