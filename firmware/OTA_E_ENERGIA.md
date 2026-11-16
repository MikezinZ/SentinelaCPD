# Revisão OTA e energia — preparação para validação

Esta revisão adiciona código de atualização remota e monitoramento opcional de energia. Não comprova segurança elétrica, autonomia ou recuperação física: dependem da identificação da placa, configuração do bootloader, hospedagem HTTPS e ensaios. OTA vem **desabilitado**. Não gravar uma nova tabela de partições em equipamento com dados sem backup e plano de manutenção USB.

## Funcionamento implementado

O equipamento consulta um manifesto HTTPS a cada 15 minutos, após sincronizar o relógio, confirmar saúde local e obter presença estável de alimentação externa. Não aceita URL por MQTT nem disponibiliza upload público. O manifesto informa alvo, versão, sequência crescente, tamanho, SHA-256 e URL do binário. Os seis primeiros campos são assinados com RSA/SHA-256 (PKCS#1 v1.5). A placa conhece somente a chave pública. A privada fica sob responsabilidade de quem autoriza releases, fora do dispositivo e do Git.

São exigidos CA válida, verificação de hostname TLS, HTTPS em ambos os downloads, prefixo de releases fixo com barra final, HTTP 200 e Content-Length exato. Redirecionamentos e transferências chunked são recusados nesta versão. O firmware rejeita downgrade em relação à versão em execução, sequência rejeitada após falha, tamanho incompatível, alvo errado e assinatura inválida. Nunca use `setInsecure()`.

O arquivo é gravado no slot inativo, com verificação do SHA-256 e validação de imagem por `esp_ota_end`. Somente após conclusão a seleção de boot muda. Interrupção durante download/escrita mantém o slot atual selecionado. O slot anterior permanece disponível para recuperação.

Após boot, a confirmação exige 30 segundos de execução, NVS acessível, pelo menos quatro amostras produzidas e amostra recente. A validação é da atividade da coleta, não da exatidão dos sensores. Wi-Fi, internet, DHT válido e presença de energia externa não são condições para confirmar o boot, evitando rollback provocado só por indisponibilidade ambiental. O hook `verifyRollbackLater` adia a confirmação automática do Arduino. Se a saúde não for confirmada em 90 s, é solicitado rollback. Watchdog de 60 s monitora loop, coleta e tarefa OTA; travamento/reboot antes da confirmação deve ser tratado pelo bootloader. As falhas precisam ser ensaiadas no hardware.

Uma tentativa é registrada em NVS antes da troca de slot. Após retorno à imagem anterior, a sequência falha fica bloqueada para evitar ciclo de atualizações. Publique uma nova sequência para corrigir; não reenvie o mesmo release indefinidamente. O bootloader, as partições e a NVS não são atualizados pelo OTA. Migrações de configuração precisam preservar compatibilidade com a versão anterior.

## Bootloader e primeira gravação USB

A IDE Arduino usual utiliza bootloader/SDK pré-compilados. Adicionar `#define CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE` ao sketch não altera esses binários e não habilita recuperação. O código bloqueia OTA quando essa configuração não está habilitada no SDK.

Na distribuição Arduino 3.3.12 inspecionada nesta revisão, o SDK do ESP32 declara `CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE=1`. Por isso a IDE pode ser usada com o bootloader correspondente desse pacote, o hook de confirmação e uma primeira gravação USB completa. A recuperação efetiva ainda deve ser comprovada com esse bootloader exato. Não presumir que uma gravação antiga tem a mesma configuração.

O perfil alternativo em `firmware-idf/` usa Arduino 3.3.12 como componente ESP-IDF 5.5 e permite recompilar o bootloader. Os dois perfis usam dois slots de 1.875 MiB, em flash proposta de 4 MiB. Confirme a capacidade real da placa. A tabela começa em 0x8000, preserva o endereço NVS de 0x9000 e usa otadata em 0xe000. Mudar slots exige a primeira gravação completa por USB; não basta enviar um `.bin` OTA ao firmware antigo.

Pela IDE, use core 3.3.12, mantenha `partitions.csv` junto ao sketch, confirme flash real e grave por USB antes de qualquer OTA. Confira a tabela gerada e o limite de aplicação usado no build. Se a ferramenta continuar mostrando o limite padrão de 1,25 MiB, não concluir que o tamanho dos slots foi alterado só pelo indicador; examine o binário da tabela. O perfil de compilação customizada permite controlar isso diretamente.

Preparação alternativa em terminal com ESP-IDF 5.5 instalado:

```sh
cd firmware-idf
python prepare_components.py
idf.py set-target esp32
idf.py menuconfig
idf.py build
```

Revise no menu: rollback habilitado, autostart Arduino, tick de 1000 Hz, flash real e tabela customizada. Inspecione `sdkconfig` e o bootloader gerado; não aceite configuração ignorada silenciosamente. Não execute erase-flash como rotina. Após backup e conexão USB, grave o conjunto completo do perfil. O build ESP-IDF e o bootloader ainda precisam de validação própria; a compilação pela IDE não substitui esse passo.

O helper obtém PubSubClient v2.8 e DHT 1.4.6. Dependências obtidas pelo Component Manager e hashes devem ser retidos no `dependencies.lock` da release validada. A primeira preparação pode demandar downloads grandes; não exige serviço pago de nuvem.

## Configuração privada

Atualize o seu `config.h` usando o exemplo, preservando as credenciais. `ProductConfig.h` fornece defaults desativados para arquivos privados antigos.

- `OTA_ENABLED`: só habilitar após validar a imagem/bootloader e os testes abaixo.
- `OTA_MANIFEST_URL`: HTTPS do manifesto. Não há servidor de releases implantado por esta revisão.
- `OTA_RELEASE_PREFIX`: por exemplo `https://seu-host/releases/`, barra final obrigatória.
- `OTA_CA_PEM`: CA que valida manifesto e binário, em literal raw C++ PEM.
- `OTA_PUBLIC_KEY_PEM`: chave pública RSA de 2048 a 4096 bits em PEM. Não colocar chave privada.
- Versão e sequência em `ProductConfig.h`: aumentar antes de compilar uma release. O manifesto deve usar a mesma sequência do binário; divergência impede confirmação e causa rollback.

Publicar a aplicação `.bin`, nunca o binário merged, bootloader ou tabela de partições. Exemplo de preparação de chaves, em diretório privado fora do repositório:

```sh
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out release-private.pem
openssl pkey -in release-private.pem -pubout -out release-public.pem
```

Assinar com o script da raiz do projeto:

```sh
python tools/sign_release.py --binary CAMINHO/app.bin --key CAMINHO_PRIVADO/release-private.pem --version 0.4.0 --sequence 4 --url https://seu-host/releases/app-4.bin --output CAMINHO/manifest.txt
```

Publique o binário primeiro e depois o manifesto, atomicamente se o host permitir. Preserve releases e artefatos conhecidos como bons. O manifesto é texto com sete linhas ASCII terminadas por LF. As seis primeiras linhas (incluindo LF final) são assinadas. Hospedagem estática HTTPS com Content-Length atende ao download; validar condições e limites do provedor gratuito escolhido. Não inventar credenciais nem expor o broker TCP atual na internet. O firmware também adiciona transporte MQTT TLS opcional (`MQTT_TLS_ENABLED=1`, `MQTT_CA_PEM`, usuário/senha e porta do listener real). Com TLS selecionado, ele aguarda relógio e CA/credenciais configuradas; não volta para TCP sem criptografia. O backend ainda precisa disponibilizar listener MQTTS, credencial por dispositivo e ACL. O modo TCP padrão continua apenas para bancada.

## Bateria: o que pode e o que depende do circuito

Carregamento e transferência USB/bateria são funções do circuito da placa. Firmware não cria um power-path ausente, não protege a célula de sobretensão/descarga e não garante comutação sem reinício. Confirmar modelo/revisão da placa, proteção da 18650 e quais tensões continuam alimentando sensores quando o USB some. Não presumir que VIN/5 V terá a mesma tensão em bateria.

Até definir ligações, `POWER_PRESENT_PIN=-1` e `BATTERY_ADC_PIN=-1`: energia externa e tensão são desconhecidas; OTA permanece bloqueado. Conectar bateria ao suporte, por si só, não permite ler seu nível no ESP32.

Para presença de fonte, use saída de power-good/sinal condicionado apropriado, independente da alimentação regulada do ESP32. Definir GPIO livre, nível ativo e referência elétrica. GPIO deve receber somente níveis admissíveis pelo ESP32; não ligar USB/5 V diretamente ao pino. Firmware usa entrada sem pull-up presumido e debounce mínimo de 3 s, observado no período de coleta de 5 s. GPIO 27/34, pinos de flash, UART e strapping não são disponibilizados pelo monitor para essa função.

Para tensão da célula, definir divisor resistivo, eventual filtro e GPIO ADC1 livre (32, 33, 35, 36 ou 39; 34 já mede corrente). `BATTERY_DIVIDER_RATIO=(Rsuperior+Rinferior)/Rinferior`, calculado a partir do circuito real. `BATTERY_CALIBRATION` é ajustado comparando com instrumento. Dimensionar para a máxima tensão de carga real, tolerâncias e faixa útil do ADC; não aplicar a célula diretamente ao GPIO. Esta revisão não escolhe resistores ou fiação sem conhecer a placa. Leituras plausíveis são expostas em volts, e valores fora de 2..4,5 V são desconhecidos.

O portal `/status` mostra `battery_volts`, `external_power` e versão. Porcentagem, autonomia e estado de saúde da célula não são estimados. Não usar uma conversão linear de tensão como porcentagem garantida. No momento, estes diagnósticos não são gravados no backend nem disparam eventos `POWER_LOSS`/`LAST_GASP`. Essa emissão requer circuito validado e política de entrega/ACK, especialmente se a rede também perder energia. Corrente zero não prova falta de tensão.

Durante OTA, alimentação externa deve estar confirmada, recente e o portal fechado. Se a presença ficar ausente/desconhecida ou o diagnóstico envelhecer, a transferência é abortada. Isso não substitui BMS/proteção elétrica. Rede/roteador também precisam de energia para telemetria em contingência.

## Testes de aceite obrigatórios

| Ensaio | Aceite |
|---|---|
| Download íntegro, release autorizado | Novo slot inicializa; saúde local confirmada; versão/seq corretas |
| Alterar manifesto, assinatura ou binário | Recusa; não selecionar novo slot |
| CA incorreta, hostname errado, HTTP, redirect | Recusa sem desativar verificação TLS |
| Release antigo, alvo errado ou arquivo grande | Recusa antes de instalar |
| Cortar Wi-Fi ou energia durante download/escrita | Retorno à aplicação selecionada anteriormente, sem corromper NVS |
| Firmware novo reinicia/trava antes de confirmar | Bootloader volta à versão conhecida; sequência falha não entra em ciclo |
| Coleta parada após boot | Watchdog/timeout permite recuperação; confirmar experimentalmente |
| Nova imagem saudável, mas sem internet/DHT | Confirmar apenas saúde local; indisponibilidade externa não causa rollback |
| Fonte USB removida com bateria | Medir tensões dos sensores, reinício ou não, estado e autonomia real |
| Célula descarregando e sinal de fonte ausente | OTA bloqueado; não inventar porcentagem ou evento de falta de rede elétrica |
| Reinício durante atualização de metadados | Não perder a imagem atual, nem repetir release rejeitado indefinidamente |

Não há garantia de zero falhas. As evidências de cada ensaio e os binários/bootloader exatos devem acompanhar a liberação. A confirmação local não prova funcionamento completo do app, broker, calibração ou segurança física. Secure Boot, criptografia da flash/NVS e proteção contra adulteração física não são habilitados nesta revisão; eFuses não são alterados.

## Referências

- https://docs.espressif.com/projects/esp-idf/en/v5.5/esp32/api-reference/system/ota.html
- https://docs.espressif.com/projects/esp-idf/en/v5.5/esp32/api-guides/bootloader.html
- https://docs.espressif.com/projects/arduino-esp32/en/latest/esp-idf_component.html

## Verificações realizadas nesta revisão

- Core Arduino ESP32 3.3.12, PubSubClient 2.8, DHT 1.4.6 e Unified Sensor 1.1.15: compilação para ESP32 Dev Module com `--warnings all` passou. Perfil completo de compilação com OTA/TLS selecionados e strings de teste (não são certificados/chaves utilizáveis): 1.083.388 bytes de aplicação e 49.936 bytes globais. Slot de 1.966.080 bytes; indicador 55%. Heap em execução e pilhas não foram medidos.
- SDK `dio_qspi/include/sdkconfig.h` inspecionado: rollback habilitado; hook de adiamento de confirmação incluído. Não equivale a ensaio do bootloader no dispositivo.
- Teste C++ com UndefinedBehaviorSanitizer passou: limites, origem da URL, alvo, downgrade/replay, release rejeitado, overflow e debounce de energia.
- Teste de assinatura passou: manifesto válido aceito pelo OpenSSL, alteração de conteúdo e uso de outra chave recusados. A biblioteca criptográfica no dispositivo ainda precisa do ensaio integrado.
- Gerador oficial de partições aceitou as duas tabelas e elas foram comparadas byte a byte. JavaScript do portal e scripts Python passaram nas verificações de sintaxe.
- O perfil ESP-IDF alternativo não foi compilado neste ambiente. OTA real, corte de energia, troca de slot, watchdog em falha, retorno à imagem anterior, flash real e comportamento da bateria permanecem pendentes de bancada. Não houve implantação de servidor de releases.
