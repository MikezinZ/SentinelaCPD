#include "../../firmware/RuntimePolicy.h"
#include <cassert>
#include <cstdint>
#include <iostream>
using namespace sentinela;
int main() {
  // toque curto
  {
    ConfigButton button;
    assert(button.update(false, 0u) == false);
    assert(button.update(false, 50u) == false);
    assert(button.update(true, 100u) == false);
    assert(button.update(true, 150u) == false);
    assert(button.update(false, 1000u) == false);
    assert(button.update(false, 1050u) == false);
  }
  // acionamento unico e novo acionamento apos soltar
  {
    ConfigButton button;
    assert(button.update(false, 0u) == false);
    assert(button.update(false, 50u) == false);
    assert(button.update(true, 100u) == false);
    assert(button.update(true, 149u) == false);
    assert(button.update(true, 150u) == false);
    assert(button.update(true, 5149u) == false);
    assert(button.update(true, 5150u) == true);
    assert(button.update(true, 20000u) == false);
    assert(button.update(false, 20010u) == false);
    assert(button.update(false, 20060u) == false);
    assert(button.update(true, 20100u) == false);
    assert(button.update(true, 20150u) == false);
    assert(button.update(true, 25149u) == false);
    assert(button.update(true, 25150u) == true);
  }
  // botao mantido desde o boot exige soltar
  {
    ConfigButton button;
    assert(button.update(true, 0u) == false);
    assert(button.update(true, 50u) == false);
    assert(button.update(true, 10000u) == false);
    assert(button.update(false, 10010u) == false);
    assert(button.update(false, 10060u) == false);
    assert(button.update(true, 10070u) == false);
    assert(button.update(true, 10120u) == false);
    assert(button.update(true, 15119u) == false);
    assert(button.update(true, 15120u) == true);
  }
  // repique nao dispara
  {
    ConfigButton button;
    assert(button.update(false, 0u) == false);
    assert(button.update(false, 50u) == false);
    assert(button.update(true, 100u) == false);
    assert(button.update(false, 120u) == false);
    assert(button.update(true, 140u) == false);
    assert(button.update(false, 160u) == false);
    assert(button.update(false, 200u) == false);
    assert(button.update(false, 250u) == false);
    assert(button.update(false, 10000u) == false);
  }
  // repique na soltura nao rearma
  {
    ConfigButton button;
    assert(button.update(false, 0u) == false);
    assert(button.update(false, 50u) == false);
    assert(button.update(true, 100u) == false);
    assert(button.update(true, 150u) == false);
    assert(button.update(true, 5150u) == true);
    assert(button.update(false, 5200u) == false);
    assert(button.update(true, 5220u) == false);
    assert(button.update(true, 5270u) == false);
    assert(button.update(true, 20000u) == false);
    assert(button.update(false, 20010u) == false);
    assert(button.update(false, 20060u) == false);
    assert(button.update(true, 20100u) == false);
    assert(button.update(true, 20150u) == false);
    assert(button.update(true, 25150u) == true);
  }
  // overflow do millis durante pressao
  {
    ConfigButton button;
    assert(button.update(false, 4294967000u) == false);
    assert(button.update(false, 4294967050u) == false);
    assert(button.update(true, 4294967100u) == false);
    assert(button.update(true, 4294967150u) == false);
    assert(button.update(true, 4853u) == false);
    assert(button.update(true, 4854u) == true);
    assert(button.update(true, 10000u) == false);
  }
  // Rede antiga conectada não fecha portal manual; sucesso novo fecha em 15 s.
  assert(portalShouldClose(14999u, 0u, false, true, 0u) == false);
  assert(portalShouldClose(15000u, 0u, false, true, 0u) == true);
  assert(portalShouldClose(60000u, 0u, true, false, 0u) == false);
  assert(portalShouldClose(60000u, 0u, true, true, 0u) == false);
  assert(portalShouldClose(599999u, 0u, true, false, 0u) == false);
  assert(portalShouldClose(600000u, 0u, true, false, 0u) == true);
  assert(portalShouldClose(600000u, 0u, false, false, 0u) == true);
  assert(portalShouldClose(74999u, 0u, false, true, 60000u) == false);
  assert(portalShouldClose(75000u, 0u, false, true, 60000u) == true);
  assert(portalShouldClose(599899u, 4294967195u, true, false, 0u) == true);
  assert(portalShouldClose(14899u, 4294967195u, false, true, 4294967195u) == true);
  std::cout << "PASS: botao, repique, boot, overflow e prazos do portal manual/automatico\n";
}
