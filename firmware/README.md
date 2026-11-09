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

## Recuperação e troca de rede sem botão adicional

- Uma queda comum inicia reconexão sem apagar credenciais.
- Após 60 s desconectado, abre UMA janela de portal por interrupção, de até 10 min, protegida pela senha própria da placa.
- Se o roteador voltar e a conexão for restabelecida, o portal fecha após 15 s. O MQTT fica suspenso durante o portal; a coleta não.
- Se o prazo terminar sem configuração, o portal fecha e a reconexão da rede salva continua. Reinicie para abrir uma nova janela se necessário.
- Para trocar uma rede ainda funcional, torne temporariamente a rede anterior indisponível ao dispositivo (na bancada, desligue apenas o hotspot de teste), aguarde a janela e configure a nova. Não derrube a rede compartilhada do CPD para fazer isso. Se não puder isolar o dispositivo da rede anterior, a alternativa desta etapa é manutenção local por USB/abertura da case. Controle autenticado de reconfiguração pelo app é evolução futura.
- Senha de portal esquecida exige manutenção USB para regravar `config.h`; não há senha universal de recuperação.
- Credenciais são salvas como um único registro NVS versionado. Não são criptografadas contra leitura física da flash nesta etapa. As rotas HTTP recusam acesso pela interface da rede do CPD e exigem conexão à rede temporária; o formulário usa token de sessão. Não imprimir senhas ou devolvê-las em páginas.

## Compatibilidade com N1 e aplicativo

Tópico configurável, padrão `esp32/telemetria`; payload preservado:

```json
{"temperatura": 24.3, "umidade": 57.1, "corrente": 0.08}
```

Não há migração de banco ou contrato MQTT v2 neste incremento. `cliente_id` no banco passará a refletir o ID fixo se a regra atual usa o clientid do broker. Verifique autenticação/ACL caso esteja vinculada aos IDs antigos; não abra permissões indiscriminadamente. O histórico com IDs aleatórios não é renomeado.

Se DHT falhar, a coleta e o diagnóstico da corrente continuam, mas a mensagem MQTT completa é omitida para não enviar `null` ao SQL legado. A publicação independente por métrica fica para o contrato v2. Corrente zero não comprova ausência de tensão.

PubSubClient continua publicando QoS 0: sucesso de `publish()` não confirma recebimento pelo broker nem gravação no MySQL. Leituras offline são substituídas pela mais recente; ao reconectar, publica apenas a última amostra recente, sem recuperar as anteriores. A API e as telas do parceiro não são alteradas.

Os métodos de rede são síncronos e podem atrasar o portal/loop de rede; a independência da coleta vem da tarefa separada, não de uma promessa de que todas as bibliotecas são assíncronas. O RMS continua ocupando cerca de 200 ms na tarefa de sensores. O agendamento não é uma garantia de tempo real rígido.

## Teste de aceite na bancada (pendente de execução física)

| Teste | Como conferir | Resultado esperado |
|---|---|---|
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
g++ -std=c++11 -Wall -Wextra -Werror tests/firmware/runtime_policy_test.cpp -o /tmp/sentinela-test
/tmp/sentinela-test
```

Rode a partir da raiz do repositório. O teste não simula rádio, armazenamento NVS, DHCP, HTTP nem sensores físicos. Compilação para ESP32 e teste em bancada são verificações distintas.

### Validação realizada nesta revisão

- Arduino CLI 1.3.1, core ESP32 3.3.12, alvo `esp32:esp32:esp32`, partições padrão e bibliotecas nas versões acima: compilação passou com `--warnings all`.
- Uso informado pelo compilador: 945.508 bytes de aplicação (72% de 1.310.720) e 47.976 bytes de variáveis globais (14%). Isso não mede pico de heap, pilha das tarefas ou autonomia da bateria.
- Testes C++ passaram com AddressSanitizer e UndefinedBehaviorSanitizer; LeakSanitizer desativado por limitação do ambiente de execução. Sintaxe do JavaScript do portal verificada com `node --check`.
- Nenhum teste físico foi executado. Não foi gravado firmware na placa, alterado banco/broker ou implantado serviço na nuvem.

Para reproduzir a compilação com um `config.h` privado preparado:

```sh
arduino-cli compile --fqbn esp32:esp32:esp32 --warnings all firmware
```

## Próximos incrementos

Contrato v2 e qualidade por métrica; TLS e credenciais por dispositivo; fila limitada com deduplicação/ACK após commit; OTA com partições e recuperação; integração definitiva com API/banco. Não instalar hardware adicional para esta etapa.
