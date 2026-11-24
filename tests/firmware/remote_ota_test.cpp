// g++ -std=c++17 -I../../firmware remote_ota_test.cpp -o /tmp/remote_ota && /tmp/remote_ota
#include <cassert>
#include <cstdio>
#include <cstring>
#include "RemoteOtaPolicy.h"
using namespace sentinela;

static const char* SHA = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

int main() {
  char json[512];
  snprintf(json, sizeof json, "{\"job\":7,\"version\":\"0.4.1\",\"sequence\":5,\"target\":\"esp32\",\"size\":1034560,"
    "\"sha256\":\"%s\",\"url\":\"/api/v2/ota/jobs/7/firmware.bin?token=abc\"}", SHA);
  OtaCommand c;
  assert(parseOtaCommand(json, "esp32", 4, 0x1E0000, c) == OTA_ACCEPT);
  assert(c.job == 7 && c.sequence == 5 && c.size == 1034560 && strcmp(c.version, "0.4.1") == 0);
  assert(strcmp(c.url, "/api/v2/ota/jobs/7/firmware.bin?token=abc") == 0);

  assert(parseOtaCommand(json, "esp32s3", 4, 0x1E0000, c) == OTA_WRONG_TARGET);  // outra placa
  assert(parseOtaCommand(json, "esp32", 5, 0x1E0000, c) == OTA_NOT_NEWER);       // mesma versão
  assert(parseOtaCommand(json, "esp32", 9, 0x1E0000, c) == OTA_NOT_NEWER);       // downgrade
  assert(parseOtaCommand(json, "esp32", 4, 1000000, c) == OTA_BAD_SIZE);         // não cabe no slot
  assert(c.job == 7);                                                            // job preservado para o relatório
  assert(parseOtaCommand("{}", "esp32", 4, 0x1E0000, c) == OTA_BAD_JSON);
  assert(parseOtaCommand("lixo", "esp32", 4, 0x1E0000, c) == OTA_BAD_JSON);
  assert(parseOtaCommand("", "esp32", 4, 0x1E0000, c) == OTA_BAD_JSON);

  char bad[512];
  snprintf(bad, sizeof bad, "{\"job\":7,\"version\":\"0.4.1\",\"sequence\":5,\"target\":\"esp32\",\"size\":2000,"
    "\"sha256\":\"XYZ\",\"url\":\"/x\"}");
  assert(parseOtaCommand(bad, "esp32", 4, 0x1E0000, c) == OTA_BAD_HASH);
  snprintf(bad, sizeof bad, "{\"job\":7,\"version\":\"0.4.1\",\"sequence\":5,\"target\":\"esp32\",\"size\":2000,"
    "\"sha256\":\"%s\",\"url\":\"ftp://x\"}", SHA);
  assert(parseOtaCommand(bad, "esp32", 4, 0x1E0000, c) == OTA_BAD_URL);
  snprintf(bad, sizeof bad, "{\"job\":7,\"version\":\"0.4.1\",\"sequence\":5,\"target\":\"esp32\",\"size\":2000,"
    "\"sha256\":\"%s\",\"url\":\"http://10.0.0.2:8000/a.bin\"}", SHA);
  assert(parseOtaCommand(bad, "esp32", 4, 0x1E0000, c) == OTA_ACCEPT);

  char out[256];
  buildOtaStatus(out, sizeof out, 7, "failed", "SHA \"x\"\n", "0.4.0");
  assert(strcmp(out, "{\"job\":7,\"status\":\"failed\",\"detail\":\"SHA 'x''\",\"version\":\"0.4.0\"}") == 0);
  puts("remote_ota_test: ok");
}
