# Atualização em preparação: OTA e energia

A revisão OTA está descrita em [OTA_E_ENERGIA.md](OTA_E_ENERGIA.md). Ela adiciona código, perfil de bootloader com rollback e monitoramento opcional da alimentação. OTA vem desabilitado e requer ligação de presença de fonte, HTTPS/chaves, bootloader correspondente e teste físico. A tabela de partições nova exige planejamento da primeira gravação USB. As instruções abaixo registram a etapa anterior de conectividade e seus testes.

# Firmware — etapa 1: operação autônoma e configuração de Wi-Fi

Proposta para teste na placa ESP32-WROOM-32 dual-core. Base: firmware N1 do repositório, blob `11ff8f13e42eefe8d82ea738af5099ec9532ffa9`.

## O que muda

- Sensores em tarefa FreeRTOS própria: a inicialização, o portal e as tentativas de conexão não condicionam a coleta à disponibilidade da rede.
- DHT22 no GPIO 27 e corrente no GPIO 34; aquisição nominal a cada 5 s, RMS em janela de 200 ms e mesmo limiar de ruído de 18 unidades ADC.
- Identificador MQTT fixo `ESP32_CPD_<12 caracteres hexadecimais>`, derivado do eFuse MAC, sem ID aleatório por reconexão. O ID não é segredo nem mecanismo de autenticação.
- Uma rede Wi-Fi pessoal salva via página local. Substitui as duas redes fixas do `config.h` antigo; não há alternância multi-SSID nesta etapa.
- Reconexão Wi-Fi por tentativas e MQTT com espera progressiva de 3 a 60 s, sem laço infinito de espera por conexão.
- Última leitura disponível para diagnóstico no portal e na serial, mesmo offline. NÃO há histórico/fila persistente de medições.

## Antes de gravar

1. Faça uma cópia privada do firmware e `config.h` atuais para poder voltar à N1.
2. Instale o suporte **esp32 by Espressif Systems 3.3.12** e selecione **ESP32 Dev Module** (ESP32 clássico, dual-core). Bibliotecas: **PubSubClient 2.8**, **DHT sensor library 1.4.6**, **Adafruit Unified Sensor 1.1.15**. WiFi, WebServer, Preferences e FreeRTOS vêm com o core.
3. Copie `config.example.h` para `config.h`. É necessário atualizar o arquivo antigo: ele não tem `CONFIG_AP_PASSWORD`. A ausência dessa opção gera erro de compilação explícito.
4. Escolha uma senha exclusiva para o portal, de 12 a 63 caracteres ASCII imprimíveis. O texto `TROQUE_ESTA_SENHA` desativa o portal de propósito. Anote a senha antes de fechar a case; o firmware não a imprime.
5. Preserve `FATOR_CALIBRACAO_CORRENTE` do seu arquivo privado. O valor do exemplo não constitui calibração validada. Reconfira corrente e ruído após mudar core, firmware ou alimentação.
6. Para testar somente sensores e Wi-Fi, mantenha `MQTT_BROKER` vazio. Para a bancada, preencha IP, porta, usuário e senha existentes. Não use `localhost`: ele não é o computador da bancada para o ESP32.
7. Abra `firmware.ino` na pasta `firmware`, com `RuntimePolicy.h` ao lado, e grave. Não há necessidade de manter o monitor serial aberto para funcionar.

Não publique `config.h`, binários com credenciais, ou a senha da etiqueta. Esta versão mantém MQTT/TCP da N1: **uso apenas na rede de bancada, sem TLS e sem implantação pública**.

## Primeiro uso pelo celular

1. Alimente o ESP32. Se não houver configuração salva por esta versão, aparecerá a rede `SentinelaCPD-<ID>`.
2. Conecte com a senha definida em `CONFIG_AP_PASSWORD`. Se o celular avisar que a rede não tem internet, escolha permanecer nela.
3. Abra explicitamente **http://192.168.4.1**. Não há promessa de abertura automática de portal cativo; não é necessário instalar aplicativo.
4. Digite SSID e senha da rede 2,4 GHz. Esta versão usa entrada manual, sem lista/varredura de redes. Nomes ocultos funcionam por entrada manual. Limites são medidos em bytes; caracteres acentuados podem ocupar mais de um byte.
5. Aguarde até 20 s. O firmware só salva a nova configuração após conectar e obter IP. Se falhar, conserva e tenta a configuração anterior.
6. Após sucesso, o portal fecha em 15 s; o celular é desconectado da rede temporária. Só então começa a tentativa MQTT, se um broker estiver configurado.
7. Reinicie: o dispositivo deve reutilizar a rede salva e o mesmo ID MQTT.

Obter IP NÃO comprova acesso à internet, DNS, broker ou banco. O MVP atende Wi-Fi pessoal com senha de 8..63 bytes, não redes abertas, senha hexadecimal de 64 caracteres, WPA-Enterprise/802.1X ou login em portal de convidados. Confirme com o administrador se a rede do CPD aceita o protótipo e permite MQTT.

## Trocar Wi-Fi pelo botão BOOT

1. Instale esta revisão inteira do firmware; preserve seu `config.h` privado. Se adicionou o bloco temporário `resetWifi.remove("network")` em `setup()`, remova-o: ele apagaria a rede em todo reinício.
2. Ligue a placa normalmente e deixe o BOOT solto. Com o firmware executando, segure **somente BOOT por pelo menos 5 segundos** e solte. Não pressione EN nem ligue/reinicie segurando BOOT: no ESP32 clássico, isso pode entrar no modo de gravação.
3. Aparecerá a rede `SentinelaCPD-<ID>`, mesmo se a rede salva estiver funcionando. Conecte com a senha `CONFIG_AP_PASSWORD` e abra **http://192.168.4.1**.
4. Informe o novo SSID/senha de uma rede pessoal de 2,4 GHz. A rede anterior fica salva até a nova conexão obter IP. Em caso de senha incorreta ou timeout de 20 s, a tentativa anterior é restaurada e o portal manual permanece aberto para corrigir os dados.
5. Após conectar e salvar a nova rede, o portal fecha em 15 s. Reinicie para conferir a persistência. Se não enviar configuração válida, o portal fecha ao completar 10 min e conserva a rede salva.

Não é necessário desligar o roteador nem manter um computador conectado. O botão também permite abrir uma janela de diagnóstico na bateria: acompanhe `seq`, idade da amostra e sensores pelo portal. Isso não mede autonomia nem comprova uma troca de alimentação sem reinício.

O portal manual não fecha só porque a rede antiga continua conectada ou voltou após uma tentativa malsucedida. Durante o portal, a coleta continua e o envio MQTT fica suspenso; não há histórico de todas as medições desse período. A janela de 10 min conta desde a abertura, mesmo se um teste de credenciais estiver pendente no fim do prazo.

O botão tem debounce de 50 ms e um acionamento por pressão longa; solte antes de tentar novamente. Um botão mantido desde o início do firmware exige soltura antes de ser reconhecido. Chamadas síncronas de rede podem atrasar o reconhecimento. `CONFIG_BUTTON_PIN` usa GPIO0 por padrão (BOOT ativo em LOW, com pull-up), inclusive para `config.h` antigo sem essa opção; `-1` desativa. Se usar outro botão/GPIO, confirme a ligação e evite os pinos dos sensores e do monitoramento de energia.

O portal e o ciclo OTA têm uma reserva de rede compartilhada: se uma atualização estiver em andamento, a abertura manual é recusada e a serial orienta a soltar e tentar novamente. Enquanto o portal estiver aberto, o OTA não começa. Não há interrupção forçada de uma atualização para trocar a rede.

## Recuperação automática e segurança da configuração

- Uma queda comum inicia reconexão sem apagar credenciais.
- Após 60 s desconectado, abre UMA janela de recuperação por interrupção, de até 10 min, protegida pela senha própria da placa. Se um ciclo OTA ainda estiver encerrando, aguarda a liberação da reserva de rede.
- No portal automático, se o roteador voltar e a conexão for restabelecida, o portal fecha após 15 s. Esse fechamento não ocorre só pela reconexão da rede antiga no portal aberto pelo BOOT.
- Se o prazo terminar sem configuração, o portal fecha e a reconexão da rede salva continua. Use BOOT para abrir outra janela.
- Senha de portal esquecida exige manutenção USB para regravar `config.h`; não há senha universal de recuperação. O BOOT não remove essa senha nem apaga as credenciais.
- Credenciais são salvas como um único registro NVS versionado. Não são criptografadas contra leitura física da flash nesta etapa. As rotas HTTP recusam acesso pela interface da rede do CPD e exigem conexão à rede temporária; o formulário usa token de sessão. Não imprimir senhas ou devolvê-las em páginas.

## Integração com o Cloud (MQTT)

O tópico é montado com o ID fixo da placa. `{id}` em `MQTT_TOPIC` e `MQTT_EVENT_TOPIC` vira `ESP32_CPD_<MAC>`:

| Tópico (padrão) | Quando | Payload |
| --- | --- | --- |
| `sentinela/{id}/telemetria` | a cada amostra (5 s) | `{"temperatura":24.3,"umidade":57.1,"corrente":0.08,"bateria":87,"rede":true}` |
| `sentinela/{id}/evento` | queda e retorno da fonte externa | `{"evento":"POWER_LOSS","estado":"ON_BATTERY","temperatura":29.4,"umidade":58.2,"bateria":87}` e `{"evento":"POWER_RESTORED",...}` |

- `bateria` é a estimativa linear da 18650 (3,30 V = 0 %, 4,20 V = 100 %) e `rede` é o estado filtrado da fonte (PC817). Os dois saem `null` enquanto `BATTERY_ADC_PIN` e `POWER_PRESENT_PIN` estiverem em `-1`.
- Os eventos só existem com `POWER_PRESENT_PIN` configurado. Ligar a placa já sem fonte gera `POWER_LOSS`. Eventos ocorridos sem conexão ficam numa fila de 4 e são enviados em ordem na reconexão, antes da telemetria.
- O ingestor do Cloud usa o ID do tópico para separar os dispositivos, abre o incidente de energia no `POWER_LOSS` e fecha no `POWER_RESTORED`, calculando a duração.
- Um `config.h` antigo com `MQTT_TOPIC "esp32/telemetria"` continua compilando, mas o Cloud grava tudo como `ESP32_CPD_01`. Atualize o `config.h` pelo `config.example.h`.
- A lógica de tópico, bateria, eventos e JSON fica em `TelemetryContract.h`, sem dependência do Arduino, e tem teste próprio.

Se DHT falhar, a coleta e o diagnóstico da corrente continuam, mas a mensagem MQTT completa é omitida para não enviar `null` ao SQL legado. A publicação independente por métrica fica para o contrato v2. Corrente zero não comprova ausência de tensão.

PubSubClient continua publicando QoS 0: sucesso de `publish()` não confirma recebimento pelo broker nem gravação no MySQL. Leituras offline são substituídas pela mais recente; ao reconectar, publica apenas a última amostra recente, sem recuperar as anteriores. A API e as telas do parceiro não são alteradas.

Os métodos de rede são síncronos e podem atrasar o portal/loop de rede; a independência da coleta vem da tarefa separada, não de uma promessa de que todas as bibliotecas são assíncronas. O RMS continua ocupando cerca de 200 ms na tarefa de sensores. O agendamento não é uma garantia de tempo real rígido.

## Teste de aceite na bancada (pendente de execução física)

| Teste | Como conferir | Resultado esperado |
|---|---|---|
| Troca com Wi-Fi funcionando | Com rede antiga conectada, segurar BOOT por 5 s e aguardar mais de 15 s | Portal continua aberto e permite cadastrar outra rede sem desligar o roteador |
| Falha na troca manual | No portal do BOOT, enviar senha errada e aguardar a reconexão antiga | Credenciais antigas preservadas; portal continua aberto para correção |
| Botão e reinício | Toque curto, pressão longa contínua, soltar/repetir e iniciar segurando BOOT | Toque curto ignorado; uma abertura por pressão; usar BOOT somente após iniciar, sem EN |
| OTA em curso | Em bancada com OTA configurado, tentar BOOT durante download/gravação | Abertura recusada; OTA preservado; nova pressão após encerrar abre portal |
| Primeira configuração | Ligar sem credenciais desta versão; acessar pelo celular | Portal protegido, leitura local com `seq` crescente e envio das credenciais |
| Autonomia | Fonte USB, sem PC; configurar e depois reiniciar | Reconexão automática, mesmo ID e novas medições no broker |
| Senha errada | Na janela de recuperação enviar senha incorreta | Timeout de 20 s; configuração anterior preservada, sem reboot |
| Queda Wi-Fi | Desligar somente hotspot de teste por mais de 60 s | Leituras continuam; portal permite ver `seq`; religar recupera conexão |
| Broker fora do ar | Manter Wi-Fi e parar broker por 2 min | Serial registra novas leituras a cada ~5 s; espera MQTT cresce, sem loop preso |
| Retorno broker | Religar broker | Mesmo ID; mensagem no formato N1; não apresentar histórico perdido como recuperado |
| Persistência | Cortar alimentação após mensagem de configuração salva | SSID e senha persistem após reinício |
| DHT indisponível | Com alimentação desligada, desconectar DHT e religar | Diagnóstico inválido para DHT; corrente continua; MQTT legado omitido |
| Portal expira | Não configurar por 10 min | AP encerra; sensores continuam; reinício permite nova janela |
| Isolamento HTTP | Tentar IP da interface STA pelo Wi-Fi do CPD enquanto portal ativo | Resposta 403; não conseguir configurar pela rede do CPD |
| Credenciais/ACL MQTT | Usar permissões normais do equipamento | Novo ID autorizado apenas conforme política do projeto |

Teste de energia/rede não exige alterar nem energizar o circuito de corrente de rede elétrica. Comece com alimentação USB e sensores já montados.

## Testes automatizados

O teste C++ exercita validação de credenciais, registro NVS malformado, overflow de `millis`, backoff e cálculo RMS com offset, ruído e senoide conhecida:

```sh
g++ -std=c++11 -Wall -Wextra -Werror tests/firmware/config_portal_test.cpp -o /tmp/sentinela-portal
/tmp/sentinela-portal
g++ -std=c++11 -Wall -Wextra -Werror tests/firmware/runtime_policy_test.cpp -o /tmp/sentinela-test
/tmp/sentinela-test
g++ -std=c++11 -Wall -Wextra -Werror tests/firmware/telemetry_contract_test.cpp -o /tmp/sentinela-contrato
/tmp/sentinela-contrato
```

Rode a partir da raiz do repositório. O teste não simula rádio, armazenamento NVS, DHCP, HTTP nem sensores físicos. Compilação para ESP32 e teste em bancada são verificações distintas.

### Validação anterior à adição do botão BOOT

- Arduino CLI 1.3.1, core ESP32 3.3.12, alvo `esp32:esp32:esp32`, partições padrão e bibliotecas nas versões acima: compilação passou com `--warnings all`.
- Uso informado pelo compilador: 945.508 bytes de aplicação (72% de 1.310.720) e 47.976 bytes de variáveis globais (14%). Isso não mede pico de heap, pilha das tarefas ou autonomia da bateria.
- Testes C++ passaram com AddressSanitizer e UndefinedBehaviorSanitizer; LeakSanitizer desativado por limitação do ambiente de execução. Sintaxe do JavaScript do portal verificada com `node --check`.
- Nenhum teste físico foi executado. Não foi gravado firmware na placa, alterado banco/broker ou implantado serviço na nuvem.

Para reproduzir a compilação com um `config.h` privado preparado:

```sh
arduino-cli compile --fqbn esp32:esp32:esp32 --warnings all firmware
```

## Validação da troca manual de rede

A lógica de pressão longa, debounce, acionamento único, soltura após boot e overflow dos timers tem casos em `tests/firmware/config_portal_test.cpp`. O mesmo teste cobre os prazos diferentes dos portais manual e automático.

Nesta alteração, foram feitas revisão estática da integração e simulação dos cenários de botão/timers em JavaScript. A simulação não substitui execução C++, compilação para ESP32 ou teste físico. Esses três passos continuam pendentes para esta revisão; as compilações e os testes registrados acima são de versões anteriores.

## Próximos incrementos

Contrato v2 e qualidade por métrica; TLS e credenciais por dispositivo; fila limitada com deduplicação/ACK após commit; OTA com partições e recuperação; integração definitiva com API/banco. Não instalar hardware adicional para esta etapa.

