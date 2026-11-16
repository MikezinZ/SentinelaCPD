#include "../../firmware/TelemetryContract.h"
#include <cassert>
#include <cmath>
#include <cstring>
#include <iostream>
using namespace sentinela;
int main() {
  char topic[64];
  assert(expandTopic("sentinela/{id}/telemetria", "ESP32_CPD_ABCD", topic, sizeof topic));
  assert(strcmp(topic, "sentinela/ESP32_CPD_ABCD/telemetria") == 0);
  assert(expandTopic("esp32/telemetria", "X", topic, sizeof topic));
  assert(strcmp(topic, "esp32/telemetria") == 0);
  char small[8];
  assert(!expandTopic("sentinela/{id}/evento", "ESP32_CPD_ABCD", small, sizeof small));

  assert(batteryPercent(NAN) == -1);
  assert(batteryPercent(4.2f) == 100);
  assert(batteryPercent(4.5f) == 100);
  assert(batteryPercent(3.3f) == 0);
  assert(batteryPercent(3.0f) == 0);
  assert(batteryPercent(3.75f) == 50);

  PowerEventDetector d;
  assert(d.update(-1) == POWER_NONE);
  assert(d.update(1) == POWER_NONE);            // liga com rede: nada a avisar
  assert(d.update(1) == POWER_NONE);
  assert(d.update(0) == POWER_LOSS_EVENT);
  assert(d.update(0) == POWER_NONE);
  assert(d.update(-1) == POWER_NONE);           // leitura desconhecida não muda o estado
  assert(d.update(1) == POWER_RESTORED_EVENT);
  PowerEventDetector boot;
  assert(boot.update(0) == POWER_LOSS_EVENT);   // ligou já em bateria

  PowerEventQueue q;
  assert(q.empty());
  q.push(POWER_LOSS_EVENT); q.push(POWER_RESTORED_EVENT); q.push(POWER_NONE);
  assert(q.count == 2 && q.front() == POWER_LOSS_EVENT);
  q.pop(); assert(q.front() == POWER_RESTORED_EVENT);
  q.pop(); assert(q.empty());
  for (int i = 0; i < 6; ++i) q.push(i % 2 ? POWER_RESTORED_EVENT : POWER_LOSS_EVENT);
  assert(q.count == 4 && q.front() == POWER_LOSS_EVENT);

  char json[200];
  int n = buildTelemetry(json, sizeof json, 24.31f, 57.06f, 0.083f, 87, 1);
  assert(n > 0 && size_t(n) < sizeof json);
  assert(strcmp(json, "{\"temperatura\":24.3,\"umidade\":57.1,\"corrente\":0.08,\"bateria\":87,\"rede\":true}") == 0);
  buildTelemetry(json, sizeof json, 24.3f, 57.1f, 0.08f, -1, -1);
  assert(strstr(json, "\"bateria\":null,\"rede\":null"));
  buildPowerEvent(json, sizeof json, POWER_LOSS_EVENT, 29.4f, NAN, 87);
  assert(strcmp(json, "{\"evento\":\"POWER_LOSS\",\"estado\":\"ON_BATTERY\",\"temperatura\":29.4,\"umidade\":null,\"bateria\":87}") == 0);
  buildPowerEvent(json, sizeof json, POWER_RESTORED_EVENT, NAN, NAN, -1);
  assert(strstr(json, "\"evento\":\"POWER_RESTORED\",\"estado\":\"NORMAL\""));
  std::cout << "telemetry_contract_test: ok\n";
}
