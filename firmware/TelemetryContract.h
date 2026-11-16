#pragma once
// Contrato MQTT com o Cloud (ingestor): tópico por dispositivo, bateria e
// eventos de energia. Sem dependências do Arduino para poder ser testado no PC.
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>

namespace sentinela {

// Substitui "{id}" pelo ID do dispositivo. Ex.: "sentinela/{id}/telemetria".
// Tópicos sem "{id}" (ex.: o legado "esp32/telemetria") são copiados como estão.
inline bool expandTopic(const char* tmpl, const char* id, char* out, size_t size) {
  if (!tmpl || !id || !out || size == 0) return false;
  const char* mark = strstr(tmpl, "{id}");
  int written = mark
    ? snprintf(out, size, "%.*s%s%s", int(mark - tmpl), tmpl, id, mark + 4)
    : snprintf(out, size, "%s", tmpl);
  return written > 0 && size_t(written) < size;
}

// Estimativa linear de carga de uma célula Li-ion 18650 (3,30 V = 0 %, 4,20 V = 100 %).
// Retorna -1 quando a tensão não está disponível.
inline int batteryPercent(float volts) {
  if (!std::isfinite(volts)) return -1;
  float pct = (volts - 3.30f) / (4.20f - 3.30f) * 100.0f;
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  return int(pct + 0.5f);
}

enum PowerEvent : uint8_t { POWER_NONE = 0, POWER_LOSS_EVENT = 1, POWER_RESTORED_EVENT = 2 };

inline const char* powerEventName(PowerEvent e) {
  return e == POWER_LOSS_EVENT ? "POWER_LOSS" : e == POWER_RESTORED_EVENT ? "POWER_RESTORED" : "";
}

// Converte o estado filtrado da fonte externa (-1 desconhecido, 0 ausente,
// 1 presente) em eventos. Ligar já sem rede gera POWER_LOSS; voltar gera POWER_RESTORED.
struct PowerEventDetector {
  int last = -1;
  PowerEvent update(int state) {
    if (state == last || state < 0) return POWER_NONE;
    const int previous = last;
    last = state;
    if (state == 0) return POWER_LOSS_EVENT;
    return previous == 0 ? POWER_RESTORED_EVENT : POWER_NONE;
  }
};

// Fila pequena: eventos ocorridos sem conexão são enviados em ordem ao reconectar.
struct PowerEventQueue {
  PowerEvent items[4] = {};
  uint8_t head = 0, count = 0;
  void push(PowerEvent e) {
    if (e == POWER_NONE) return;
    if (count == 4) { head = uint8_t((head + 1) % 4); --count; }  // descarta o mais antigo
    items[(head + count) % 4] = e;
    ++count;
  }
  bool empty() const { return count == 0; }
  PowerEvent front() const { return count ? items[head] : POWER_NONE; }
  void pop() { if (count) { head = uint8_t((head + 1) % 4); --count; } }
};

inline void jsonNumber(char* out, size_t size, float value, int decimals) {
  if (std::isfinite(value)) snprintf(out, size, "%.*f", decimals, double(value));
  else snprintf(out, size, "null");
}

inline const char* jsonPower(int state) { return state < 0 ? "null" : state ? "true" : "false"; }

// {"temperatura":24.3,"umidade":57.1,"corrente":0.08,"bateria":87,"rede":true}
inline int buildTelemetry(char* out, size_t size, float temperature, float humidity,
                          float current, int battery, int externalPower) {
  char t[16], h[16], c[16], b[8];
  jsonNumber(t, sizeof t, temperature, 1);
  jsonNumber(h, sizeof h, humidity, 1);
  jsonNumber(c, sizeof c, current, 2);
  if (battery < 0) snprintf(b, sizeof b, "null"); else snprintf(b, sizeof b, "%d", battery);
  return snprintf(out, size,
    "{\"temperatura\":%s,\"umidade\":%s,\"corrente\":%s,\"bateria\":%s,\"rede\":%s}",
    t, h, c, b, jsonPower(externalPower));
}

// {"evento":"POWER_LOSS","estado":"ON_BATTERY","temperatura":29.4,"umidade":58.2,"bateria":87}
inline int buildPowerEvent(char* out, size_t size, PowerEvent event, float temperature,
                           float humidity, int battery) {
  char t[16], h[16], b[8];
  jsonNumber(t, sizeof t, temperature, 1);
  jsonNumber(h, sizeof h, humidity, 1);
  if (battery < 0) snprintf(b, sizeof b, "null"); else snprintf(b, sizeof b, "%d", battery);
  return snprintf(out, size,
    "{\"evento\":\"%s\",\"estado\":\"%s\",\"temperatura\":%s,\"umidade\":%s,\"bateria\":%s}",
    powerEventName(event), event == POWER_LOSS_EVENT ? "ON_BATTERY" : "NORMAL", t, h, b);
}

}  // namespace sentinela
