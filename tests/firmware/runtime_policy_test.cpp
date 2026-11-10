#include "../../firmware/RuntimePolicy.h"
#include <cassert>
#include <cmath>
#include <iostream>
#include <string>
using namespace sentinela;
int main() {
  assert(validCredentials("CPD", "abcdefgh"));
  assert(validCredentials(" rede com espacos ", " senha com espacos "));
  assert(!validCredentials("", "abcdefgh"));
  assert(!validCredentials("CPD", "curta"));
  assert(!validCredentials(std::string(33,'x').c_str(), "abcdefgh"));
  assert(!validCredentials("CPD", std::string(64,'x').c_str()));
  assert(!validCredentials("CPD\n", "abcdefgh"));
  Credentials creds;
  assert(!creds.valid());
  strcpy(creds.ssid, "CPD"); strcpy(creds.password, "abcdefgh");
  assert(creds.valid());
  memset(creds.ssid,'x',sizeof(creds.ssid));
  assert(!creds.valid()); // blob sem terminador não deve ler além do limite
  // millis volta a zero a cada ~49 dias: timers devem continuar funcionando.
  assert(elapsed(20, UINT32_MAX - 20, 40));
  assert(!elapsed(20, UINT32_MAX - 20, 42));
  Retry retry;
  assert(retry.ready(0));
  retry.failed(UINT32_MAX - 1000);
  assert(!retry.ready(1998));
  assert(retry.ready(1999));
  for (int i=0;i<20;++i) retry.failed(100);
  assert(retry.wait == 60000 && retry.next == 60000);
  retry.reset(); assert(retry.ready(0));
  Rms noSamples; assert(std::isnan(noSamples.amperes(1)));
  Rms dc; for(int i=0;i<1000;++i) dc.add(1680);
  assert(dc.amperes(1) == 0);
  Rms noise; for(int i=0;i<1000;++i) noise.add(1680 + (i%2 ? 10:-10));
  assert(noise.amperes(1) == 0);
  Rms sine, shifted;
  for(int i=0;i<10000;++i) {
    int ac = std::lround(100 * std::sin(2 * 3.141592653589793 * i / 100));
    sine.add(1680+ac); shifted.add(2500+ac);
  }
  assert(std::abs(sine.amperes(1)-100/std::sqrt(2)) < 0.2);
  assert(std::abs(sine.amperes(1)-shifted.amperes(1)) < 0.001);
  assert(std::abs(sine.amperes(0.00055f)-0.03889f) < 0.0002);
  std::cout << "PASS: credenciais, blob, timers com overflow, backoff e RMS com offset/ruido/senoide\n";
}
