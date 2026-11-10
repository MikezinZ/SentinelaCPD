"""SentinelaCPD - Telemetry Ingestion Service.

Assina o broker MQTT, valida as mensagens e grava no MySQL.

Tópicos:
  sentinela/<id>/telemetria   {"temperatura": 27.8, "umidade": 45.4, "corrente": 0.8, "bateria": 87}
  sentinela/<id>/evento       {"evento": "POWER_LOSS" | "LAST_GASP" | "POWER_RESTORED", ...}
  esp32/telemetria            (legado da N1, sem id: usa DEVICE_PADRAO)
"""
import json
import os
import time

import mysql.connector
import paho.mqtt.client as mqtt

MQTT_HOST = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
DEVICE_PADRAO = os.getenv("DEVICE_PADRAO", "ESP32_CPD_01")

DB = dict(
    host=os.getenv("DB_HOST", "localhost"),
    database=os.getenv("DB_NAME", "iot_db"),
    user=os.getenv("DB_USER", "sentinela"),
    password=os.getenv("DB_PASSWORD", ""),
)

EVENTOS_VALIDOS = {"POWER_LOSS", "LAST_GASP", "POWER_RESTORED"}
_conn = None


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
    cur.execute("INSERT IGNORE INTO dispositivos (id) VALUES (%s)", (disp,))


def tratar_telemetria(disp, d):
    temp = num(d, "temperatura", -40, 125)
    umid = num(d, "umidade", 0, 100)
    corr = num(d, "corrente", 0, 1000)
    bat = num(d, "bateria", 0, 100)
    if temp is None and umid is None and corr is None:
        print(f"[telemetria] descartada (sem valores válidos): {d}")
        return
    cur = conn().cursor()
    garantir_dispositivo(cur, disp)
    cur.execute(
        "INSERT INTO leituras (dispositivo_id, temperatura, umidade, corrente, bateria) "
        "VALUES (%s,%s,%s,%s,%s)",
        (disp, temp, umid, corr, bat),
    )
    cur.execute("UPDATE dispositivos SET ultimo_contato = NOW() WHERE id = %s", (disp,))
    cur.close()
    print(f"[telemetria] {disp} T={temp} U={umid} I={corr} B={bat}")


def tratar_evento(disp, d):
    tipo = d.get("evento")
    if tipo not in EVENTOS_VALIDOS:
        print(f"[evento] tipo inválido: {d}")
        return
    cur = conn().cursor()
    garantir_dispositivo(cur, disp)
    cur.execute(
        "INSERT INTO eventos (dispositivo_id, tipo, payload) VALUES (%s,%s,%s)",
        (disp, tipo, json.dumps(d)),
    )
    if tipo in ("POWER_LOSS", "LAST_GASP"):
        cur.execute("UPDATE dispositivos SET estado='ON_BATTERY' WHERE id=%s", (disp,))
        cur.execute(
            "SELECT id FROM incidentes WHERE dispositivo_id=%s AND status='ABERTO' LIMIT 1",
            (disp,),
        )
        if cur.fetchone() is None:
            cur.execute("INSERT INTO incidentes (dispositivo_id) VALUES (%s)", (disp,))
            print(f"[incidente] ABERTO para {disp}")
    elif tipo == "POWER_RESTORED":
        cur.execute("UPDATE dispositivos SET estado='NORMAL' WHERE id=%s", (disp,))
        cur.execute(
            "UPDATE incidentes SET status='FECHADO', fim=NOW(), "
            "duracao_s=TIMESTAMPDIFF(SECOND, inicio, NOW()) "
            "WHERE dispositivo_id=%s AND status='ABERTO'",
            (disp,),
        )
        print(f"[incidente] FECHADO para {disp}")
    cur.close()
    print(f"[evento] {disp} {tipo}")


def on_connect(client, userdata, flags, reason_code, properties):
    print(f"[mqtt] conectado ({reason_code})")
    client.subscribe([("sentinela/+/telemetria", 0), ("sentinela/+/evento", 1), ("esp32/telemetria", 0)])


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
    except Exception as e:  # uma mensagem ruim não pode derrubar o serviço
        print(f"[erro] {msg.topic}: {e}")


def main():
    # espera o MySQL aceitar conexões
    while True:
        try:
            conn()
            break
        except Exception as e:
            print(f"[db] aguardando MySQL: {e}")
            time.sleep(3)

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="sentinela-ingestor")
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
