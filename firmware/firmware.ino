#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <esp_system.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/queue.h>
#include "RuntimePolicy.h"
#include "config.h"
#include "PowerMonitor.h"
#include "SecureOta.h"

#ifndef CONFIG_AP_PASSWORD
#error "Atualize config.h pelo config.example.h: configure CONFIG_AP_PASSWORD."
#endif

// Impedir confirmação automática pelo Arduino antes do teste local.
extern "C" bool verifyRollbackLater() { return true; }

using namespace sentinela;
constexpr int DHT_PIN = 27;
constexpr int CURRENT_PIN = 34;
DHT dht(DHT_PIN, DHT22);
#if MQTT_TLS_ENABLED
WiFiClientSecure transport;
#else
WiFiClient transport;
#endif
PubSubClient mqtt(transport);
WebServer server(80);
Preferences preferences;
Credentials saved, candidate;
Retry mqttRetry;
QueueHandle_t latestQueue = nullptr;
struct Sample {
  float batteryVolts;
  int externalPower;
  uint32_t seq, at;
  float temperature, humidity, current;
};
bool storageReady = false, hasSaved = false;
bool portalActive = false, portalTried = false, portalAllowed = false;
bool candidatePending = false, candidateStarted = false;
bool connectionSeen = false, closeScheduled = false;
uint32_t portalAt = 0, candidateAt = 0, wifiAttemptAt = 0;
uint32_t offlineAt = 0, closeAt = 0, publishedSeq = 0;
char deviceId[24], apName[32], csrf[33];
String notice = "Informe o nome exato da rede Wi-Fi e a senha.";

// Coleta em tarefa própria: timeouts de HTTP/MQTT não interrompem a aquisição.
// A fila de tamanho 1 contém SOMENTE a última amostra, não é histórico offline.
void sampleTask(void*) {
  PowerMonitor power;power.begin();
  esp_task_wdt_add(nullptr);
  dht.begin();
  pinMode(CURRENT_PIN, INPUT);
  analogReadResolution(12);
  TickType_t wake = xTaskGetTickCount();
  uint32_t seq = 0;
  vTaskDelayUntil(&wake, pdMS_TO_TICKS(SAMPLE_MS));
  for (;;) {
    esp_task_wdt_reset();
    power.sample();
    Sample sample{};
    sample.batteryVolts=power.volts;sample.externalPower=power.filter.state;
    sample.seq = ++seq;
    sample.temperature = dht.readTemperature();
    sample.humidity = dht.readHumidity();
    Rms rms;
    const uint32_t start = millis();
    while (!elapsed(millis(), start, 200)) {
      rms.add(analogRead(CURRENT_PIN));
      delayMicroseconds(200);
      if ((rms.count & 63) == 0) taskYIELD();
    }
    sample.current = rms.amperes(FATOR_CALIBRACAO_CORRENTE);
    sample.at = millis();
    xQueueOverwrite(latestQueue, &sample);
    Serial.printf("[SENSOR] seq=%lu T=%.1f H=%.1f I=%.2f\n",
      (unsigned long)sample.seq, sample.temperature, sample.humidity, sample.current);
    vTaskDelayUntil(&wake, pdMS_TO_TICKS(SAMPLE_MS));
  }
}

bool apRequest() {
  // WebServer escuta todas as interfaces; recusar acesso pela rede do CPD.
  if (!portalActive || server.client().localIP() != WiFi.softAPIP()) {
    server.send(403, "text/plain", "Acesse pela rede temporaria do dispositivo.");
    return false;
  }
  server.sendHeader("Cache-Control", "no-store");
  server.sendHeader("X-Content-Type-Options", "nosniff");
  server.sendHeader("X-Frame-Options", "DENY");
  return true;
}

String jsonNumber(float n) {
  return isfinite(n) ? String(n, 2) : String("null");
}

void handleStatus() {
  if (!apRequest()) return;
  Sample sample{};
  bool available = latestQueue && xQueuePeek(latestQueue, &sample, 0) == pdTRUE;
  String json = "{\"device_id\":\"" + String(deviceId) + "\",\"message\":\"" + notice;
  json += "\",\"wifi\":" + String(WiFi.status() == WL_CONNECTED ? "true" : "false");
  json += ",\"mqtt\":" + String(mqtt.connected() ? "true" : "false");
  json += ",\"seq\":" + String(available ? sample.seq : 0);
  json += ",\"temperature\":" + jsonNumber(available ? sample.temperature : NAN);
  json += ",\"humidity\":" + jsonNumber(available ? sample.humidity : NAN);
  json += ",\"current\":" + jsonNumber(available ? sample.current : NAN);
  json += ",\"age_ms\":" + (available ? String(uint32_t(millis() - sample.at)) : String("null"));
  json += ",\"firmware\":\"" + String(FIRMWARE_VERSION) + "\"";
  json += ",\"battery_volts\":" + jsonNumber(available ? sample.batteryVolts : NAN);
  json += ",\"external_power\":" + String(!available || sample.externalPower<0 ? "null" : sample.externalPower ? "true" : "false");
  json += "}";
  server.send(200, "application/json", json);
}

void handleHome() {
  if (!apRequest()) return;
  String html = R"HTML(<!doctype html><html lang="pt-BR"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>SentinelaCPD</title>
<style>body{font:16px system-ui;background:#101827;color:#eef4ff;max-width:520px;margin:30px auto;padding:20px}input,button{box-sizing:border-box;width:100%;padding:14px;margin:8px 0 18px;border-radius:8px;border:1px solid #72839e}button{background:#8de1d4;color:#10212d;font-weight:700}pre{white-space:pre-wrap}small{color:#bfd0e7}</style>
<h1>SentinelaCPD</h1><p>Configuração da rede Wi-Fi</p>
<p>Use uma rede 2,4 GHz com senha pessoal. Digite o nome exatamente como aparece no roteador.</p>
<form method="post" action="/configure"><label>Nome da rede (SSID)<input name="ssid" maxlength="32" required autocomplete="off"></label>
<label>Senha da rede<input name="password" type="password" minlength="8" maxlength="63" required autocomplete="new-password"></label>
<input type="hidden" name="token" value=")HTML";
  html += csrf;
  html += R"HTML("><button>Testar e salvar Wi-Fi</button></form>
<p id="message">Carregando estado...</p><pre id="sensors"></pre>
<small>A senha só é salva após obter IP. Isso não comprova acesso à internet ou ao broker.
O portal fecha após sucesso ou ao completar 10 minutos. Não é necessário manter o celular conectado.</small>
<script>async function refresh(){try{const s=await(await fetch('/status',{cache:'no-store'})).json();document.getElementById('message').textContent=s.message;document.getElementById('sensors').textContent=s.device_id+'\nWi-Fi: '+s.wifi+' | MQTT: '+s.mqtt+'\nAmostra: '+s.seq+' | Idade: '+s.age_ms+' ms\nTemperatura: '+s.temperature+' °C\nUmidade: '+s.humidity+' %\nCorrente: '+s.current+' A\nBateria: '+s.battery_volts+' V | Fonte externa: '+s.external_power;}catch(e){document.getElementById('message').textContent='Portal indisponível. Se houve sucesso, o dispositivo encerrou a configuração.';}}refresh();setInterval(refresh,2000);</script></html>)HTML";
  server.send(200, "text/html; charset=utf-8", html);
}

void handleConfigure() {
  if (!apRequest()) return;
  if (server.arg("token") != csrf) {
    server.send(403, "text/plain", "Sessao invalida. Reabra a pagina."); return;
  }
  if (candidatePending || closeScheduled) {
    server.send(409, "text/plain", "Aguarde o teste atual. Volte para a pagina inicial."); return;
  }
  const String ssid = server.arg("ssid"), password = server.arg("password");
  // Rejeitar NUL embutido e conferir bytes, além de limites HTML por caracteres.
  if (ssid.length() != strlen(ssid.c_str()) || password.length() != strlen(password.c_str()) ||
      !validCredentials(ssid.c_str(), password.c_str())) {
    server.send(400, "text/plain", "SSID: 1..32 bytes; senha: 8..63 bytes. Rede pessoal com senha obrigatoria."); return;
  }
  if (!storageReady) {
    server.send(503, "text/plain", "Falha no armazenamento. Confira o diagnostico serial."); return;
  }
  candidate = Credentials{};
  ssid.toCharArray(candidate.ssid, sizeof(candidate.ssid));
  password.toCharArray(candidate.password, sizeof(candidate.password));
  candidatePending = true;
  candidateStarted = false; // conectar depois de enviar a resposta HTTP
  notice = "Testando rede. Aguarde ate 20 segundos; a rede anterior permanece salva.";
  server.sendHeader("Location", "/");
  server.send(303, "text/plain", "Testando");
}

void startPortal() {
  portalTried = true;
  if (!portalAllowed) return;
  WiFi.mode(WIFI_AP_STA);
  const IPAddress ip(192, 168, 4, 1);
  if (!WiFi.softAPConfig(ip, ip, IPAddress(255,255,255,0)) ||
      !WiFi.softAP(apName, CONFIG_AP_PASSWORD, 1, false, 1)) {
    Serial.println("[PORTAL] Falha ao iniciar.");
    WiFi.softAPdisconnect(true);
    WiFi.mode(WIFI_STA);
    return;
  }
  snprintf(csrf, sizeof(csrf), "%08lx%08lx%08lx%08lx",
    (unsigned long)esp_random(), (unsigned long)esp_random(),
    (unsigned long)esp_random(), (unsigned long)esp_random());
  portalActive = true;
  closeScheduled = false;
  portalAt = millis();
  server.begin();
  Serial.printf("[PORTAL] Rede %s | http://192.168.4.1 | janela de 10 min\n", apName);
}

void stopPortal() {
  server.stop();
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  portalActive = false;
  closeScheduled = false;
  Serial.println("[PORTAL] Encerrado. Coleta continua.");
}

void beginSavedWifi() {
  if (hasSaved) {
    WiFi.begin(saved.ssid, saved.password);
    wifiAttemptAt = millis();
  }
}

void cancelCandidate() {
  candidatePending = false;
  candidateStarted = false;
  candidate = Credentials{};
  WiFi.disconnect(false, false);
  beginSavedWifi();
}

void serviceWifi() {
  uint32_t now = millis();
  if (candidatePending && !candidateStarted) {
    transport.stop();
    WiFi.disconnect(false, false);
    WiFi.begin(candidate.ssid, candidate.password);
    candidateAt = millis();
    candidateStarted = true;
  }
  now = millis();
  if (candidatePending && candidateStarted) {
    if (WiFi.status() == WL_CONNECTED && WiFi.SSID() == candidate.ssid) {
      // Um único blob NVS evita misturar SSID novo com senha antiga após reinício.
      if (preferences.putBytes("network", &candidate, sizeof(candidate)) == sizeof(candidate)) {
        saved = candidate;
        hasSaved = true;
        candidate = Credentials{};
        candidatePending = candidateStarted = false;
        notice = "Wi-Fi conectado e salvo. Portal fecha em 15 segundos. MQTT e internet sao testes separados.";
        closeScheduled = true;
        closeAt = millis();
      } else {
        notice = "Falha ao salvar. Restaurando a configuracao anterior.";
        cancelCandidate();
      }
    } else if (elapsed(now, candidateAt, WIFI_ATTEMPT_MS)) {
      notice = "Nao foi possivel obter IP. Confira nome, senha e sinal. A rede anterior foi preservada.";
      cancelCandidate();
    }
  }
  now = millis();
  const bool connected = WiFi.status() == WL_CONNECTED;
  if (connected && !candidatePending) {
    if (!connectionSeen) {
      Serial.print("[Wi-Fi] IP: "); Serial.println(WiFi.localIP());
      mqttRetry.reset();
    }
    connectionSeen = true;
    offlineAt = now;
    if (!portalActive) portalTried = false;
    if (portalActive && !closeScheduled) {
      notice = "Rede salva reconectada. Portal fecha em 15 segundos.";
      closeScheduled = true; closeAt = now;
    }
  } else if (!connected) {
    if (connectionSeen) {
      connectionSeen = false;
      offlineAt = now;
      transport.stop();
      Serial.println("[Wi-Fi] Desconectado; sensores continuam.");
    }
    if (!candidatePending && hasSaved && elapsed(now, wifiAttemptAt, WIFI_RETRY_MS)) {
      WiFi.disconnect(false, false);
      beginSavedWifi();
    }
    if (!candidatePending && !portalActive && !portalTried &&
        (!hasSaved || elapsed(now, offlineAt, RECOVERY_MS))) startPortal();
  }
  if (portalActive && (elapsed(now, portalAt, PORTAL_MS) ||
      (closeScheduled && elapsed(now, closeAt, PORTAL_SUCCESS_MS)))) {
    if (candidatePending) cancelCandidate();
    stopPortal();
  }
}

void serviceMqtt() {
#if MQTT_TLS_ENABLED
  if(strlen(MQTT_CA_PEM)<50 || !strlen(MQTT_USER) || !strlen(MQTT_PASS) || time(nullptr)<=1767225600)return;
#endif
  // Durante o portal, priorizar a configuração; coleta continua na outra tarefa.
  if (portalActive || candidatePending || WiFi.status() != WL_CONNECTED || !strlen(MQTT_BROKER)) return;
  if (!mqtt.connected()) {
    if (!mqttRetry.ready(millis())) return;
    const bool ok = strlen(MQTT_USER) ? mqtt.connect(deviceId, MQTT_USER, MQTT_PASS) : mqtt.connect(deviceId);
    if (!ok) {
      mqttRetry.failed(millis());
      Serial.printf("[MQTT] Falha %d; nova tentativa em %lu ms.\n", mqtt.state(), (unsigned long)mqttRetry.wait);
      return;
    }
    mqttRetry.reset();
    Serial.printf("[MQTT] Conectado: %s\n", deviceId);
  }
  mqtt.loop();
  Sample sample{};
  if (!latestQueue || xQueuePeek(latestQueue, &sample, 0) != pdTRUE ||
      sample.seq == publishedSeq || elapsed(millis(), sample.at, SAMPLE_MS * 2)) return;
  // Preservar contrato N1: não enviar null para SQL legado. Falha DHT não para a coleta de corrente.
  if (!isfinite(sample.temperature) || !isfinite(sample.humidity) || !isfinite(sample.current)) {
    publishedSeq = sample.seq;
    Serial.println("[MQTT] Amostra invalida; envio legado omitido."); return;
  }
  char payload[160];
  const int count = snprintf(payload, sizeof(payload),
    "{\"temperatura\": %.1f, \"umidade\": %.1f, \"corrente\": %.2f}",
    sample.temperature, sample.humidity, sample.current);
  if (count > 0 && size_t(count) < sizeof(payload)) {
    publishedSeq = sample.seq; // QoS 0; sem ACK de banco ou replay nesta etapa
    if (!mqtt.publish(MQTT_TOPIC, payload, false)) {
      Serial.println("[MQTT] Publicacao falhou; sem historico offline nesta etapa.");
      transport.stop();
      mqttRetry.failed(millis());
    }
  }
}

void setup() {
  Serial.begin(115200); // não aguardar monitor serial
  const uint64_t mac = ESP.getEfuseMac();
  snprintf(deviceId, sizeof(deviceId), "ESP32_CPD_%04X%08X",
    unsigned((mac >> 32) & 0xffff), unsigned(mac & 0xffffffff));
  snprintf(apName, sizeof(apName), "SentinelaCPD-%04X%08X",
    unsigned((mac >> 32) & 0xffff), unsigned(mac & 0xffffffff));
  Serial.printf("\n[BOOT] firmware etapa1 | ID %s\n", deviceId);
  secureOta::begin();
  latestQueue = xQueueCreate(1, sizeof(Sample));
  if (!latestQueue || xTaskCreatePinnedToCore(sampleTask, "sensors", 4096, nullptr, 1, nullptr, 1) != pdPASS) {
    Serial.println("[ERRO] Coleta nao iniciou. Reiniciar e verificar memoria.");
    if (latestQueue) { vQueueDelete(latestQueue); latestQueue = nullptr; }
  }
  storageReady = preferences.begin("sentinela-wifi", false);
  if (storageReady && preferences.getBytesLength("network") == sizeof(saved)) {
    hasSaved = preferences.getBytes("network", &saved, sizeof(saved)) == sizeof(saved) && saved.valid();
  }
  if (!hasSaved) saved = Credentials{};
  if (!storageReady) Serial.println("[NVS] Falha; configuracao indisponivel.");
  const size_t passLength = strlen(CONFIG_AP_PASSWORD);
  portalAllowed = passLength >= 12 && passLength <= 63 && strcmp(CONFIG_AP_PASSWORD, "TROQUE_ESTA_SENHA") != 0;
  for (size_t i = 0; i < passLength; ++i)
    if ((unsigned char)CONFIG_AP_PASSWORD[i] < 32 || (unsigned char)CONFIG_AP_PASSWORD[i] > 126) portalAllowed = false;
  if (!portalAllowed) Serial.println("[PORTAL] Configure senha propria de 12..63 caracteres em config.h.");
  WiFi.persistent(false); // credenciais novas só são gravadas por Preferences após sucesso
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(false); // tentativas explícitas; sem disputa com o teste de novas credenciais
  // Interromper possível conexão automática do driver com credenciais legadas.
  WiFi.disconnect(false, false);
  server.on("/", HTTP_GET, handleHome);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/configure", HTTP_POST, handleConfigure);
  server.onNotFound([](){ if (apRequest()) server.send(404, "text/plain", "Pagina inexistente."); });
#if MQTT_TLS_ENABLED
  transport.setCACert(MQTT_CA_PEM);
  transport.setHandshakeTimeout(15);
  configTime(0,0,"pool.ntp.org","time.google.com");
#endif
  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  mqtt.setSocketTimeout(3);
  mqtt.setKeepAlive(20);
  transport.setTimeout(2000);
  offlineAt = millis();
  if (hasSaved) beginSavedWifi(); else startPortal();
}

void loop() {
  serviceWifi();
  if (portalActive) server.handleClient();
  Sample healthSample{};
  const bool haveSample=latestQueue && xQueuePeek(latestQueue,&healthSample,0)==pdTRUE;
  secureOta::observe(haveSample?healthSample.seq:0,haveSample?uint32_t(millis()-healthSample.at):UINT32_MAX,
    storageReady,haveSample?healthSample.externalPower:-1,portalActive);
  serviceMqtt();
  delay(5); // ceder CPU, sem esperar por conexão
}

