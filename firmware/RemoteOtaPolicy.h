#pragma once
// Validação do comando de atualização remota (OTA pela dashboard). Sem dependência do
// Arduino: compilado e testado também no PC (tests/firmware/remote_ota_test.cpp).
//
// Comando publicado pela plataforma em sentinela/<id>/cmd/ota:
// {"job":7,"version":"0.4.1","sequence":5,"target":"esp32","size":1034560,
//  "sha256":"<64 hex>","url":"/api/v2/ota/jobs/7/firmware.bin?token=..."}
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

namespace sentinela {

struct OtaCommand {
  uint32_t job = 0, sequence = 0, size = 0;
  char version[33] = {}, target[17] = {}, sha256[65] = {}, url[241] = {};
};

enum OtaCheck {
  OTA_ACCEPT = 0, OTA_BAD_JSON, OTA_WRONG_TARGET, OTA_NOT_NEWER, OTA_BAD_SIZE, OTA_BAD_HASH, OTA_BAD_URL,
};

inline const char* otaCheckText(OtaCheck c) {
  switch (c) {
    case OTA_ACCEPT: return "ok";
    case OTA_BAD_JSON: return "comando invalido";
    case OTA_WRONG_TARGET: return "firmware de outra placa";
    case OTA_NOT_NEWER: return "versao igual ou anterior a instalada";
    case OTA_BAD_SIZE: return "tamanho maior que o slot OTA";
    case OTA_BAD_HASH: return "SHA-256 ausente ou invalido";
    case OTA_BAD_URL: return "endereco de download invalido";
  }
  return "erro";
}

// Localiza "chave": no JSON plano enviado pela plataforma. Sem escapes nem objetos aninhados.
inline const char* jsonValue(const char* json, const char* key) {
  char pattern[40];
  const size_t n = strlen(key);
  if (n + 3 >= sizeof(pattern)) return nullptr;
  pattern[0] = '"'; memcpy(pattern + 1, key, n); pattern[n + 1] = '"'; pattern[n + 2] = 0;
  const char* p = strstr(json, pattern);
  if (!p) return nullptr;
  p += n + 2;
  while (*p == ' ') ++p;
  if (*p != ':') return nullptr;
  ++p;
  while (*p == ' ') ++p;
  return p;
}

inline bool jsonString(const char* json, const char* key, char* out, size_t size) {
  const char* p = jsonValue(json, key);
  if (!p || *p != '"') return false;
  ++p;
  size_t i = 0;
  for (; p[i] && p[i] != '"'; ++i) {
    if (p[i] == '\\' || (unsigned char)p[i] < 32 || i + 1 >= size) return false;
    out[i] = p[i];
  }
  if (p[i] != '"') return false;
  out[i] = 0;
  return i > 0;
}

inline bool jsonUint(const char* json, const char* key, uint32_t& out) {
  const char* p = jsonValue(json, key);
  if (!p || *p < '0' || *p > '9') return false;
  char* end = nullptr;
  const unsigned long v = strtoul(p, &end, 10);
  if (end == p || v > 0xFFFFFFFFul) return false;
  out = (uint32_t)v;
  return true;
}

inline bool isSha256Hex(const char* s) {
  if (strlen(s) != 64) return false;
  for (int i = 0; i < 64; ++i) {
    const char c = s[i];
    if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))) return false;
  }
  return true;
}

// Aceita somente comandos completos, para esta placa, com versão mais nova e que cabem no slot.
inline OtaCheck parseOtaCommand(const char* json, const char* target, uint32_t currentSequence,
                                uint32_t slotSize, OtaCommand& c) {
  c = OtaCommand{};
  if (!json || !jsonUint(json, "job", c.job) || !c.job || !jsonUint(json, "sequence", c.sequence) ||
      !jsonUint(json, "size", c.size) || !jsonString(json, "version", c.version, sizeof c.version) ||
      !jsonString(json, "target", c.target, sizeof c.target)) return OTA_BAD_JSON;
  if (strcmp(c.target, target) != 0) return OTA_WRONG_TARGET;
  if (c.sequence <= currentSequence) return OTA_NOT_NEWER;
  if (c.size < 1024 || c.size > slotSize) return OTA_BAD_SIZE;
  if (!jsonString(json, "sha256", c.sha256, sizeof c.sha256) || !isSha256Hex(c.sha256)) return OTA_BAD_HASH;
  if (!jsonString(json, "url", c.url, sizeof c.url)) return OTA_BAD_URL;
  const bool relative = c.url[0] == '/';
  if (!relative && strncmp(c.url, "http://", 7) != 0 && strncmp(c.url, "https://", 8) != 0) return OTA_BAD_URL;
  return OTA_ACCEPT;
}

// Monta {"job":7,"status":"failed","detail":"...","version":"0.4.1"} sem aspas no detalhe.
inline int buildOtaStatus(char* out, size_t size, uint32_t job, const char* status,
                          const char* detail, const char* version) {
  char clean[120] = {};
  size_t j = 0;
  for (size_t i = 0; detail && detail[i] && j + 1 < sizeof clean; ++i)
    clean[j++] = (detail[i] == '"' || detail[i] == '\\' || (unsigned char)detail[i] < 32) ? '\'' : detail[i];
  return snprintf(out, size, "{\"job\":%lu,\"status\":\"%s\",\"detail\":\"%s\",\"version\":\"%s\"}",
                  (unsigned long)job, status, clean, version);
}

}  // namespace sentinela
