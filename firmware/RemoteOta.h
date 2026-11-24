#pragma once
// Atualização remota iniciada pela dashboard (modalidade A do requisito RF08).
//
// 1. A plataforma publica o comando em sentinela/<id>/cmd/ota (validado em RemoteOtaPolicy.h).
// 2. O ESP32 baixa o .bin da API com o token do job, confere tamanho, cabeçalho 0xE9 e SHA-256
//    enquanto grava no slot OTA livre. A aplicação atual nunca é apagada.
// 3. Só depois da verificação o boot muda de slot. O job e a sequência ficam na NVS.
// 4. Após reiniciar, a nova versão precisa confirmar saúde (SecureOta.h: 30 s de coleta).
//    Sem confirmação em 90 s, o bootloader volta para a versão anterior (rollback) e o
//    firmware antigo informa "rolled_back". Confirmada, informa "success".
#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <Preferences.h>
#include <esp_ota_ops.h>
#include <esp_task_wdt.h>
#include <mbedtls/sha256.h>
#include <algorithm>
#include "ProductConfig.h"
#include "RemoteOtaPolicy.h"
#include "SecureOta.h"

#ifndef OTA_HTTP_PORT
#define OTA_HTTP_PORT 8000   // porta da API quando o comando traz caminho relativo
#endif

namespace sentinela {
namespace remoteOta {
using Report = void (*)(uint32_t job, const char* status, const char* detail);

static char inbox[512];
static volatile bool hasInbox = false;
static uint32_t bootJob = 0, bootSequence = 0;
static bool reportPending = false;

// Chamado pelo callback MQTT: só copia; a instalação roda no loop principal.
inline void onMessage(const uint8_t* payload, unsigned length) {
  if (length >= sizeof(inbox)) length = 0;   // comando grande demais vira JSON vazio (rejeitado)
  memcpy(inbox, payload, length);
  inbox[length] = 0;
  hasInbox = true;
}

// Antes de secureOta::begin(): lembra qual job motivou o último reinício.
inline void beginBoot() {
  Preferences store;
  if (store.begin("sentinela-rota", true)) {
    bootJob = store.getUInt("job", 0);
    bootSequence = store.getUInt("seq", 0);
    store.end();
  }
  reportPending = bootJob != 0;
  if (reportPending)
    Serial.printf("[OTA] Reinicio apos atualizacao (job %lu, sequencia %lu; em execucao %u).\n",
      (unsigned long)bootJob, (unsigned long)bootSequence, (unsigned)FIRMWARE_SEQUENCE);
}

inline void clearBootJob() {
  Preferences store;
  if (store.begin("sentinela-rota", false)) { store.remove("job"); store.remove("seq"); store.end(); }
  reportPending = false;
}

// Com MQTT conectado: informa o resultado da atualização que causou o reinício.
inline void serviceBootReport(Report report) {
  if (!reportPending) return;
  if (bootSequence == FIRMWARE_SEQUENCE) {
    if (!secureOta::healthy.load()) return;   // aguarda a confirmação de saúde
    report(bootJob, "success", "Nova versao em execucao com saude local confirmada.");
  } else {
    report(bootJob, "rolled_back", "A nova versao nao confirmou saude; voltou para a versao anterior.");
  }
  clearBootJob();
}

inline String downloadUrl(const OtaCommand& c, const char* host) {
  if (c.url[0] != '/') return String(c.url);
  return String("http://") + host + ":" + String(OTA_HTTP_PORT) + c.url;
}

// Baixa, verifica e grava. Devolve true quando o novo slot está selecionado (reiniciar em seguida).
inline bool install(const OtaCommand& c, Report report, const char* host) {
  auto fail = [&](const char* why) { report(c.job, "failed", why); return false; };
  const esp_partition_t* slot = esp_ota_get_next_update_partition(nullptr);
  if (!slot || c.size > slot->size) return fail("Particao OTA indisponivel ou pequena.");
  if (!secureOta::tryLockNetwork()) return fail("Ocupado: portal Wi-Fi aberto ou outra atualizacao.");
  struct Unlock { ~Unlock() { secureOta::unlockNetwork(); } } unlock;

  const String url = downloadUrl(c, host);
  WiFiClient plain;
  WiFiClientSecure tls;
  HTTPClient http;
  http.setConnectTimeout(10000);
  http.setTimeout(10000);
  http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
  bool opened;
  if (url.startsWith("https://")) {
    if (strlen(OTA_CA_PEM) < 50) return fail("HTTPS sem CA configurada (OTA_CA_PEM).");
    tls.setCACert(OTA_CA_PEM);
    tls.setTimeout(10000);
    opened = http.begin(tls, url);
  } else {
    opened = http.begin(plain, url);
  }
  if (!opened) return fail("Endereco de download invalido.");
  report(c.job, "downloading", "Baixando firmware.");
  Serial.printf("[OTA] Job %lu: baixando %s (%lu bytes)\n", (unsigned long)c.job, c.version, (unsigned long)c.size);
  const int code = http.GET();
  if (code != 200) {
    char why[48];
    snprintf(why, sizeof why, "Download recusado (HTTP %d).", code);
    http.end();
    return fail(why);
  }
  if (http.getSize() != int(c.size)) { http.end(); return fail("Tamanho do arquivo diferente do anunciado."); }

  esp_ota_handle_t handle = 0;
  if (esp_ota_begin(slot, c.size, &handle) != ESP_OK) { http.end(); return fail("Nao foi possivel preparar o slot OTA."); }
  mbedtls_sha256_context hash;
  mbedtls_sha256_init(&hash);
  bool ok = mbedtls_sha256_starts(&hash, 0) == 0;
  const char* why = "Falha na gravacao.";
  uint8_t buffer[1024], digest[32] = {};
  uint32_t total = 0, started = millis(), progress = millis();
  WiFiClient* stream = http.getStreamPtr();
  while (ok && total < c.size) {
    esp_task_wdt_reset();
    if (uint32_t(millis() - started) > 180000 || uint32_t(millis() - progress) > 15000) {
      ok = false; why = "Download interrompido (tempo esgotado)."; break;
    }
    const int available = stream->available();
    if (!available) {
      if (!http.connected()) { ok = false; why = "Conexao encerrada durante o download."; break; }
      delay(5);
      continue;
    }
    const size_t want = std::min(size_t(available), std::min(sizeof(buffer), size_t(c.size - total)));
    const int got = stream->read(buffer, want);
    if (got <= 0) { ok = false; why = "Falha de leitura no download."; break; }
    if (total == 0 && buffer[0] != 0xE9) { ok = false; why = "Arquivo nao e uma imagem ESP32."; break; }
    ok = mbedtls_sha256_update(&hash, buffer, got) == 0 && esp_ota_write(handle, buffer, got) == ESP_OK;
    total += got;
    progress = millis();
    delay(1);
  }
  ok = ok && mbedtls_sha256_finish(&hash, digest) == 0;
  mbedtls_sha256_free(&hash);
  http.end();
  char hex[65];
  for (int i = 0; i < 32; ++i) snprintf(hex + 2 * i, 3, "%02x", digest[i]);
  if (ok && (total != c.size || strcmp(hex, c.sha256) != 0)) { ok = false; why = "SHA-256 nao confere: arquivo corrompido ou alterado."; }
  if (!ok) { esp_ota_abort(handle); return fail(why); }
  if (esp_ota_end(handle) != ESP_OK) return fail("Imagem rejeitada pela validacao do ESP-IDF.");

  // Registrar antes de trocar o slot: a nova versão sabe que foi instalada por este job,
  // e SecureOta.h usa "pending" para decidir rollback se a versão não subir saudável.
  Preferences rota, secure;
  const bool stored = rota.begin("sentinela-rota", false) && rota.putUInt("job", c.job) && rota.putUInt("seq", c.sequence) &&
                      secure.begin("sentinela-ota", false) && secure.putUInt("pending", c.sequence);
  rota.end();
  if (!stored) { secure.end(); return fail("Falha ao registrar a atualizacao na NVS."); }
  if (esp_ota_set_boot_partition(slot) != ESP_OK) {
    secure.remove("pending");
    secure.end();
    clearBootJob();
    return fail("Nao foi possivel selecionar o novo slot.");
  }
  secure.end();
  report(c.job, "installed", "SHA-256 conferido e firmware gravado; reiniciando.");
  Serial.printf("[OTA] Job %lu: %s verificado (SHA-256 ok). Reiniciando.\n", (unsigned long)c.job, c.version);
  return true;
}

}  // namespace remoteOta
}  // namespace sentinela
