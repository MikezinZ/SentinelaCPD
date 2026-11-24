"""SentinelaCPD - Telemetry Ingestion Service.

Assina o broker MQTT, valida as mensagens, grava no MySQL e alimenta o motor
de alertas da API v2 (alertas.py).

Tópicos:
  sentinela/<id>/telemetria   {"temperatura": 27.8, "umidade": 45.4, "corrente": 0.8, "bateria": 87, "rede": true}
  sentinela/<id>/evento       {"evento": "POWER_LOSS" | "LAST_GASP" | "POWER_RESTORED", ...}
  sentinela/<id>/ota          {"job": 7, "status": "downloading" | "installed" | "success" | "failed" | "rejected" | "rolled_back", "detail": "..."}
  esp32/telemetria            (legado da N1, sem id: usa DEVICE_PADRAO)

Dispositivos desativados pela dashboard (dispositivos.ativo = 0) têm os dados descartados.
"""
import json
import os
import threading
import time

import mysql.connector
import paho.mqtt.client as mqtt

from alertas import MotorAlertas
from schema import migrar

MQTT_HOST = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USER = os.getenv("MQTT_USER", "")       # usuário "plataforma" do EMQX (ver emqx/acl.conf)
MQTT_PASS = os.getenv("MQTT_PASS", "")
DEVICE_PADRAO = os.getenv("DEVICE_PADRAO", "ESP32_CPD_01")
STALE_ALERT_S = int(os.getenv("STALE_ALERT_S", "60"))   # sem dados além disso = alerta telemetry_stale

DB = dict(
    host=os.getenv("DB_HOST", "localhost"),
    database=os.getenv("DB_NAME", "iot_db"),
    user=os.getenv("DB_USER", "sentinela"),
    password=os.getenv("DB_PASSWORD", ""),
)

EVENTOS_VALIDOS = {"POWER_LOSS", "LAST_GASP", "POWER_RESTORED"}
_conn = None
motor = MotorAlertas()


def conn():
    """Conexão MySQL com reconexão automática."""
    global _conn
    if _conn is None or not _conn.is_connected():
        _conn = mysql.connector.connect(**DB, autocommit=True)
    else:
        _conn.ping(reconnect=True, attempts=3, delay=1)
    return _conn


def num(d, chave, minimo, maximo):
    """Lê um número do JSON; devolve None se ausente ou fora da faixa."""
    v = d.get(chave)
    if isinstance(v, (int, float)) and minimo <= v <= maximo:
        return v
    return None


def garantir_dispositivo(cur, disp):
    """Cadastra o dispositivo no primeiro contato. Devolve False se ele foi desativado pelo admin."""
    cur.execute("INSERT IGNORE INTO dispositivos (id) VALUES (%s)", (disp,))
    cur.execute("SELECT ativo FROM dispositivos WHERE id=%s", (disp,))
    linha = cur.fetchone()
    return bool(linha and linha[0])


# ----------------------------------------------------------------- atualização de firmware (OTA)
STATUS_OTA = {"downloading", "installed", "success", "failed", "rejected", "rolled_back"}
OTA_FINAIS = ("success", "failed", "rejected", "rolled_back", "timeout")
OTA_TIMEOUT_S = int(os.getenv("OTA_TIMEOUT_S", "600"))   # sem conclusão nesse prazo = timeout


def tratar_ota(disp, d):
    status, job = d.get("status"), d.get("job")
    if status not in STATUS_OTA or not isinstance(job, int):
        print(f"[ota] mensagem inválida: {d}")
        return
    detalhe = str(d.get("detail") or "")[:255] or None
    cur = conn().cursor()
    final = status in OTA_FINAIS
    # Só atualiza jobs ainda abertos e do próprio dispositivo (o tópico identifica quem enviou).
    cur.execute(
        "UPDATE ota_jobs SET status=%s, detalhe=COALESCE(%s, detalhe), concluido_em=IF(%s, NOW(), NULL) "
        "WHERE id=%s AND dispositivo_id=%s AND status NOT IN ('success','failed','rejected','rolled_back','timeout')",
        (status, detalhe, final, job, disp),
    )
    if cur.rowcount and status == "success" and isinstance(d.get("version"), str):
        cur.execute("UPDATE dispositivos SET firmware=%s WHERE id=%s", (d["version"][:32], disp))
    cur.close()
    print(f"[ota] {disp} job={job} {status} {detalhe or ''}")


def confirmar_ota_por_versao(cur, disp, versao):
    """A telemetria com a nova versão também confirma o job (caso a mensagem 'success' se perca)."""
    cur.execute(
        "UPDATE ota_jobs j JOIN firmwares f ON f.id = j.firmware_id "
        "SET j.status='success', j.detalhe='Nova versão confirmada pela telemetria.', j.concluido_em=NOW() "
        "WHERE j.dispositivo_id=%s AND j.status='installed' AND f.versao=%s",
        (disp, versao),
    )


def expirar_ota(cur):
    cur.execute(
        "UPDATE ota_jobs SET status='timeout', detalhe='Sem resposta do dispositivo no prazo.', concluido_em=NOW() "
        "WHERE status IN ('queued','sent','downloading','installed') AND criado_em < NOW() - INTERVAL %s SECOND",
        (OTA_TIMEOUT_S,),
    )


def tratar_telemetria(disp, d):
    temp = num(d, "temperatura", -40, 125)
    umid = num(d, "umidade", 0, 100)
    corr = num(d, "corrente", 0, 1000)
    bat = num(d, "bateria", 0, 100)
    rede = d.get("rede") if isinstance(d.get("rede"), bool) else None
    fw = d.get("firmware")
    fw = fw.strip()[:32] if isinstance(fw, str) and fw.strip() else None
    if temp is None and umid is None and corr is None:
        print(f"[telemetria] descartada (sem valores válidos): {d}")
        return
    cur = conn().cursor()
    if not garantir_dispositivo(cur, disp):
        cur.close()
        return   # dispositivo desativado na dashboard
    cur.execute(
        "INSERT INTO leituras (dispositivo_id, temperatura, umidade, corrente, bateria) "
        "VALUES (%s,%s,%s,%s,%s)",
        (disp, temp, umid, corr, bat),
    )
    cur.execute("UPDATE dispositivos SET ultimo_contato = NOW() WHERE id = %s", (disp,))
    if rede is not None:   # estado da fonte informado pelo firmware (PC817)
        cur.execute("UPDATE dispositivos SET energia=%s WHERE id=%s", ("mains" if rede else "battery", disp))
    if fw:   # versão do firmware, exibida no app e no web
        cur.execute("UPDATE dispositivos SET firmware=%s WHERE id=%s", (fw, disp))
        confirmar_ota_por_versao(cur, disp, fw)
    try:
        motor.telemetria(cur, disp, temp, umid, corr, bat)
    except Exception as e:  # alerta nunca pode impedir a gravação da leitura
        print(f"[alerta] erro: {e}")
    cur.close()
    print(f"[telemetria] {disp} T={temp} U={umid} I={corr} B={bat} rede={rede}")


def tratar_evento(disp, d):
    tipo = d.get("evento")
    if tipo not in EVENTOS_VALIDOS:
        print(f"[evento] tipo inválido: {d}")
        return
    cur = conn().cursor()
    if not garantir_dispositivo(cur, disp):
        cur.close()
        return
    cur.execute(
        "INSERT INTO eventos (dispositivo_id, tipo, payload) VALUES (%s,%s,%s)",
        (disp, tipo, json.dumps(d)),
    )
    if tipo in ("POWER_LOSS", "LAST_GASP"):
        cur.execute("UPDATE dispositivos SET estado='ON_BATTERY', energia='battery' WHERE id=%s", (disp,))
        cur.execute(
            "SELECT id FROM incidentes WHERE dispositivo_id=%s AND status='ABERTO' LIMIT 1",
            (disp,),
        )
        if cur.fetchone() is None:
            cur.execute("INSERT INTO incidentes (dispositivo_id) VALUES (%s)", (disp,))
            print(f"[incidente] ABERTO para {disp}")
    elif tipo == "POWER_RESTORED":
        cur.execute("UPDATE dispositivos SET estado='NORMAL', energia='mains' WHERE id=%s", (disp,))
        cur.execute(
            "UPDATE incidentes SET status='FECHADO', fim=NOW(), "
            "duracao_s=TIMESTAMPDIFF(SECOND, inicio, NOW()) "
            "WHERE dispositivo_id=%s AND status='ABERTO'",
            (disp,),
        )
        print(f"[incidente] FECHADO para {disp}")
    try:
        motor.evento(cur, disp, tipo)
    except Exception as e:
        print(f"[alerta] erro: {e}")
    cur.close()
    print(f"[evento] {disp} {tipo}")


def on_connect(client, userdata, flags, reason_code, properties):
    print(f"[mqtt] conectado ({reason_code})")
    client.subscribe([("sentinela/+/telemetria", 0), ("sentinela/+/evento", 1), ("sentinela/+/ota", 1),
                      ("esp32/telemetria", 0)])


def on_message(client, userdata, msg):
    try:
        d = json.loads(msg.payload.decode())
        if not isinstance(d, dict):
            raise ValueError("JSON não é objeto")
        partes = msg.topic.split("/")
        if msg.topic == "esp32/telemetria":
            tratar_telemetria(DEVICE_PADRAO, d)
        elif len(partes) == 3 and partes[2] == "telemetria":
            tratar_telemetria(partes[1], d)
        elif len(partes) == 3 and partes[2] == "evento":
            tratar_evento(partes[1], d)
        elif len(partes) == 3 and partes[2] == "ota":
            tratar_ota(partes[1], d)
    except Exception as e:  # uma mensagem ruim não pode derrubar o serviço
        print(f"[erro] {msg.topic}: {e}")


def vigiar_silencio():
    """Thread própria (conexão própria): alerta dispositivos que pararam de enviar."""
    c = None
    while True:
        try:
            if c is None or not c.is_connected():
                c = mysql.connector.connect(**DB, autocommit=True)
            cur = c.cursor()
            motor.verificar_silencio(cur, STALE_ALERT_S)
            expirar_ota(cur)
            cur.close()
        except Exception as e:
            print(f"[alerta] verificação de silêncio falhou: {e}")
            c = None
        time.sleep(10)


def main():
    # espera o MySQL aceitar conexões e garante as tabelas da API v2
    while True:
        try:
            migrar(conn())
            break
        except Exception as e:
            print(f"[db] aguardando MySQL: {e}")
            time.sleep(3)

    threading.Thread(target=vigiar_silencio, daemon=True).start()
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="sentinela-ingestor")
    if MQTT_USER:
        client.username_pw_set(MQTT_USER, MQTT_PASS)
    client.on_connect = on_connect
    client.on_message = on_message
    client.reconnect_delay_set(min_delay=1, max_delay=30)
    while True:
        try:
            client.connect(MQTT_HOST, MQTT_PORT, keepalive=30)
            break
        except Exception as e:
            print(f"[mqtt] aguardando broker: {e}")
            time.sleep(3)
    client.loop_forever()


if __name__ == "__main__":
    main()
