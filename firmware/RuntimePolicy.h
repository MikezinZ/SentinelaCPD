#pragma once
#include <stdint.h>
#include <stddef.h>
#include <math.h>
#include <string.h>

namespace sentinela {
constexpr uint32_t SAMPLE_MS = 5000;
constexpr uint32_t WIFI_ATTEMPT_MS = 20000;
constexpr uint32_t WIFI_RETRY_MS = 30000;
constexpr uint32_t RECOVERY_MS = 60000;
constexpr uint32_t PORTAL_MS = 600000;
constexpr uint32_t PORTAL_SUCCESS_MS = 15000;
inline bool elapsed(uint32_t now, uint32_t start, uint32_t interval) {
  return uint32_t(now - start) >= interval;
}
// SSID 1..32 bytes; WPA/WPA2 Personal com senha 8..63 bytes; não trimar espaços.
inline bool validCredentials(const char* ssid, const char* password) {
  const size_t s = strlen(ssid), p = strlen(password);
  if (s == 0 || s > 32 || p < 8 || p > 63) return false;
  for (size_t i = 0; i < s; ++i)
    if ((unsigned char)ssid[i] < 32 || (unsigned char)ssid[i] == 127) return false;
  for (size_t i = 0; i < p; ++i)
    if ((unsigned char)password[i] < 32 || (unsigned char)password[i] == 127) return false;
  return true;
}
struct Credentials {
  uint32_t version = 1;
  char ssid[33] = {};
  char password[64] = {};
  bool valid() const {
    return version == 1 && memchr(ssid, '\0', sizeof(ssid)) &&
      memchr(password, '\0', sizeof(password)) && validCredentials(ssid, password);
  }
};
struct Retry {
  uint32_t at = 0, wait = 0, next = 3000;
  bool ready(uint32_t now) const { return elapsed(now, at, wait); }
  void reset() { wait = 0; next = 3000; }
  void failed(uint32_t now) {
    at = now; wait = next;
    next = next >= 30000 ? 60000 : next * 2;
  }
};
struct Rms {
  double sum = 0, squares = 0;
  uint32_t count = 0;
  void add(int value) { sum += value; squares += double(value) * value; ++count; }
  float amperes(float factor) const {
    if (!count) return NAN;
    const double mean = sum / count;
    const double variance = fmax(0.0, squares / count - mean * mean);
    const double rms = sqrt(variance);
    return rms < 18.0 ? 0.0f : float(rms * factor);
  }
};
}
