"""Teste de ponta a ponta da plataforma: usuários, dispositivos e OTA remota.

Precisa da API (porta 8000), do ingestor e do broker MQTT rodando, com DEMO_USERS=true.
Um "ESP32 simulado" assina o comando de OTA, baixa o firmware pela URL do comando,
confere o SHA-256 e responde como o firmware real (downloading -> installed -> success).

Uso:
  python tests/plataforma/teste_plataforma.py caminho/do/firmware.bin
Variáveis opcionais: API (http://localhost:8000), MQTT_HOST, MQTT_PORT e, com o broker protegido,
MQTT_DEVICE_USER / MQTT_DEVICE_PASS (usuário "dispositivo" do EMQX).
"""
import hashlib
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request

import paho.mqtt.client as mqtt

API = os.getenv("API", "http://localhost:8000").rstrip("/")
DISP = "ESP32_CPD_TESTE01"
ok = 0


def checar(condicao, texto):
    global ok
    if not condicao:
        raise SystemExit(f"FALHOU: {texto}")
    ok += 1
    print(f"  ok  {texto}")


def req(metodo, caminho, corpo=None, token=None, bruto=None, tipo="application/json"):
    dados = bruto if bruto is not None else (json.dumps(corpo).encode() if corpo is not None else None)
    r = urllib.request.Request(API + caminho, data=dados, method=metodo)
    if dados is not None:
        r.add_header("Content-Type", tipo)
    if token:
        r.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(r, timeout=15) as resp:
            texto = resp.read()
            return resp.status, (json.loads(texto) if texto and resp.headers.get_content_type() == "application/json" else texto)
    except urllib.error.HTTPError as e:
        texto = e.read()
        try:
            return e.code, json.loads(texto)
        except Exception:
            return e.code, texto


def login(email, senha="Sentinela123"):
    s, r = req("POST", "/api/v2/auth/login", {"email": email, "password": senha})
    checar(s == 200, f"login {email}")
    return r["access_token"]


def mqtt_cliente(nome):
    """Cliente com as credenciais de dispositivo: o client id precisa ser o ID da placa (ACL)."""
    c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=nome)
    if os.getenv("MQTT_DEVICE_USER"):
        c.username_pw_set(os.getenv("MQTT_DEVICE_USER"), os.getenv("MQTT_DEVICE_PASS", ""))
    c.connect(os.getenv("MQTT_HOST", "localhost"), int(os.getenv("MQTT_PORT", "1883")), 30)
    return c


def esp32_simulado(versao_atual, recebidos):
    """Responde aos comandos como o firmware (RemoteOta.h)."""
    c = mqtt_cliente(DISP)

    def publicar(job, status, detalhe, versao):
        c.publish(f"sentinela/{DISP}/ota", json.dumps({"job": job, "status": status, "detail": detalhe, "version": versao}), qos=1)

    def mensagem(cli, _u, msg):
        cmd = json.loads(msg.payload)
        recebidos.append(cmd)
        url = cmd["url"] if cmd["url"].startswith("http") else API + cmd["url"]
        publicar(cmd["job"], "downloading", "Baixando firmware.", versao_atual[0])
        try:
            binario = urllib.request.urlopen(url, timeout=15).read()
        except Exception as e:
            publicar(cmd["job"], "failed", f"download: {e}", versao_atual[0])
            return
        if hashlib.sha256(binario).hexdigest() != cmd["sha256"] or len(binario) != cmd["size"] or binario[0] != 0xE9:
            publicar(cmd["job"], "failed", "SHA-256 nao confere", versao_atual[0])
            return
        publicar(cmd["job"], "installed", "SHA-256 conferido; reiniciando.", versao_atual[0])
        time.sleep(1)
        versao_atual[0] = cmd["version"]          # "reiniciou" na nova versão
        c.publish(f"sentinela/{DISP}/telemetria", json.dumps(
            {"temperatura": 24.0, "umidade": 50.0, "corrente": 0.1, "rede": True, "firmware": versao_atual[0]}))
        publicar(cmd["job"], "success", "Nova versao em execucao.", versao_atual[0])

    c.on_message = mensagem
    c.subscribe(f"sentinela/{DISP}/cmd/ota", qos=1)
    c.loop_start()
    c.publish(f"sentinela/{DISP}/telemetria", json.dumps(
        {"temperatura": 24.0, "umidade": 50.0, "corrente": 0.1, "rede": True, "firmware": versao_atual[0]}))
    return c


def esperar_job(token, job_id, finais=("success", "failed", "rejected", "rolled_back", "timeout"), prazo=20):
    fim = time.time() + prazo
    while time.time() < fim:
        _, r = req("GET", f"/api/v2/ota/jobs?device_id={DISP}", token=token)
        job = next(j for j in r["items"] if j["id"] == job_id)
        if job["status"] in finais:
            return job
        time.sleep(0.5)
    return job


def main():
    binario = open(sys.argv[1], "rb").read()
    admin, viewer = login("admin@sentinelacpd.demo"), login("viewer@sentinelacpd.demo")

    print("Usuários")
    email = f"teste{int(time.time())}@empresa.com"
    s, r = req("POST", "/api/v2/users", {"email": email, "name": "Teste", "role": "operator", "password": "curta"}, admin)
    checar(s == 422 and "password" in r["error"]["fields"], "senha curta é recusada (422)")
    s, novo = req("POST", "/api/v2/users", {"email": email, "name": "Teste", "role": "operator", "password": "SenhaTeste123"}, admin)
    checar(s == 201 and novo["role"] == "operator", "admin cadastra usuário")
    s, _ = req("POST", "/api/v2/users", {"email": email, "name": "Outro", "role": "viewer", "password": "SenhaTeste123"}, admin)
    checar(s == 409, "e-mail repetido é recusado (409)")
    s, _ = req("GET", "/api/v2/users", token=viewer)
    checar(s == 403, "viewer não acessa a lista de usuários (403)")
    tok_novo = login(email, "SenhaTeste123")
    s, r = req("PUT", f"/api/v2/users/{novo['id']}", {"role": "viewer"}, admin)
    checar(s == 200 and r["role"] == "viewer", "admin muda o perfil")
    s, _ = req("GET", "/api/v2/me", token=tok_novo)
    checar(s == 200, "token de acesso ainda vale até expirar (JWT de 15 min)")
    s, r = req("PUT", f"/api/v2/users/{novo['id']}", {"active": False}, admin)
    checar(s == 200 and r["active"] is False, "admin desativa o usuário")
    s, _ = req("POST", "/api/v2/auth/login", {"email": email, "password": "SenhaTeste123"})
    checar(s == 401, "usuário desativado não entra (401)")
    _, eu = req("GET", "/api/v2/me", token=admin)
    _, lista = req("GET", "/api/v2/users", token=admin)
    admins = [u for u in lista["items"] if u["role"] == "admin" and u["active"]]
    if len(admins) == 1:
        s, _ = req("PUT", f"/api/v2/users/{eu['id']}", {"role": "viewer"}, admin)
        checar(s == 409, "último admin não pode se rebaixar (409)")
    s, _ = req("POST", "/api/v2/me/password", {"current_password": "errada", "new_password": "NovaSenha123"}, admin)
    checar(s == 422, "troca de senha exige a senha atual")

    print("Dispositivos")
    s, _ = req("POST", "/api/v2/devices", {"id": "id com espaço"}, admin)
    checar(s == 422, "ID inválido é recusado")
    req("POST", "/api/v2/devices", {"id": DISP, "name": "Rack Teste", "location": "Bancada"}, admin)
    s, r = req("PUT", f"/api/v2/devices/{DISP}", {"name": "Rack Teste", "location": "Bancada", "enabled": True}, admin)
    checar(s == 200 and r["name"] == "Rack Teste" and r["enabled"], "admin renomeia e ativa o dispositivo")
    s, _ = req("PUT", f"/api/v2/devices/{DISP}", {"name": "X"}, viewer)
    checar(s == 403, "viewer não edita dispositivo (403)")

    print("Firmware")
    s, r = req("POST", "/api/v2/firmware", bruto=b"isto nao e firmware" * 100, token=admin, tipo="application/octet-stream")
    checar(s == 422, "arquivo que não é imagem ESP32 é recusado (422)")
    sem_tag = bytes([0xE9]) + b"\0" * 4000
    s, r = req("POST", "/api/v2/firmware", bruto=sem_tag, token=admin, tipo="application/octet-stream")
    checar(s == 422 and "identificação" in r["error"]["message"], "imagem sem etiqueta SentinelaCPD é recusada")
    outra = binario.replace(b"target=esp32|", b"target=esp3X|")
    s, r = req("POST", "/api/v2/firmware", bruto=outra, token=admin, tipo="application/octet-stream")
    checar(s == 422 and "incompatível" in r["error"]["message"], "firmware de outra placa é recusado")
    s, _ = req("POST", "/api/v2/firmware", bruto=binario, token=viewer, tipo="application/octet-stream")
    checar(s == 403, "viewer não envia firmware (403)")
    s, fw = req("POST", "/api/v2/firmware?notes=teste", bruto=binario, token=admin, tipo="application/octet-stream")
    if s == 409:   # já enviado numa execução anterior
        _, lista = req("GET", "/api/v2/firmware", token=admin)
        fw = next(f for f in lista["items"] if f["sha256"] == hashlib.sha256(binario).hexdigest())
    else:
        checar(s == 201 and fw["sha256"] == hashlib.sha256(binario).hexdigest(), f"firmware {fw.get('version')} aceito com SHA-256")
        s, _ = req("POST", "/api/v2/firmware", bruto=binario, token=admin, tipo="application/octet-stream")
        checar(s == 409, "mesma sequência não entra duas vezes (409)")

    print("OTA")
    versao = ["0.0.1"]
    recebidos = []
    dispositivo = esp32_simulado(versao, recebidos)
    time.sleep(1.5)
    s, job = req("POST", f"/api/v2/devices/{DISP}/ota", {"firmware_id": fw["id"]}, viewer)
    checar(s == 403, "viewer não inicia atualização (403)")
    s, job = req("POST", f"/api/v2/devices/{DISP}/ota", {"firmware_id": fw["id"]}, admin)
    checar(s == 201 and job["status"] == "sent", "admin inicia a atualização e o comando é enviado")
    s, _ = req("POST", f"/api/v2/devices/{DISP}/ota", {"firmware_id": fw["id"]}, admin)
    checar(s == 409, "segunda atualização simultânea é recusada (409)")
    final = esperar_job(admin, job["id"])
    checar(final["status"] == "success", f"job terminou em success ({final['detail']})")
    checar(recebidos and len(recebidos[0]["sha256"]) == 64, "comando MQTT traz SHA-256, tamanho e versão")
    _, d = req("GET", f"/api/v2/devices/{DISP}", token=admin)
    checar(d["firmware_version"] == fw["version"], f"dashboard mostra a versão nova ({d['firmware_version']})")
    url = recebidos[0]["url"]
    s, _ = req("GET", url[len(API):] if url.startswith("http") else url)
    checar(s == 403, "token de download não serve depois de concluído")
    s, _ = req("GET", f"/api/v2/ota/jobs/{job['id']}/firmware.bin?token=errado")
    checar(s == 403, "download com token errado é recusado")
    s, _ = req("POST", f"/api/v2/devices/{DISP}/ota", {"firmware_id": fw["id"]}, admin)
    checar(s == 409, "reinstalar a mesma versão é recusado (409)")
    dispositivo.loop_stop()
    dispositivo.disconnect()

    print("Dispositivo desativado")
    req("PUT", f"/api/v2/devices/{DISP}", {"enabled": False}, admin)
    c = mqtt_cliente(DISP)
    c.loop_start()
    c.publish(f"sentinela/{DISP}/telemetria", json.dumps({"temperatura": 99.0, "umidade": 50.0, "corrente": 0.1})).wait_for_publish()
    time.sleep(1.5)
    c.loop_stop()
    _, d = req("GET", f"/api/v2/devices/{DISP}", token=admin)
    checar(d["freshness"] == "inactive" and (d["latest"] or {}).get("temperature_c") != 99.0,
           "dados de dispositivo desativado são descartados")
    req("PUT", f"/api/v2/devices/{DISP}", {"enabled": True}, admin)
    print(f"\n{ok} verificações passaram.")


if __name__ == "__main__":
    main()
