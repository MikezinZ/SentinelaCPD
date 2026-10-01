# SentinelaCPD: Telemetria Ambiental e Auditoria de Continuidade Energética em Borda

> **"A estabilidade do CPD não depende da sorte; depende da telemetria contínua na borda."**

> *Uma plataforma aberta de engenharia dedicada a investigar como Sistemas Embarcados, Computação de Borda e Mensageria Assíncrona podem mitigar falhas operacionais, estrangulamento térmico e interrupções energéticas em Centros de Processamento de Dados críticos.*

---

# SentinelaCPD

![SentinelaCPD Banner](images/banner_sentinela.png)

---

## 📌 Status do Projeto — Entrega N1 Homologada

**O SentinelaCPD concluiu sua primeira etapa de validação física e arquitetural (N1)** no âmbito do Projeto Integrador 6 (Engenharia da Computação - 2026.2).

A plataforma validou com sucesso a ingestão em tempo real de grandezas microclimáticas e a extração discreta de corrente alternada eficaz ($I_{\text{RMS}}$) sob cargas ativas em rede de 220V AC, integrando nós embarcados a um broker MQTT industrial conteinerizado e persistência relacional auditável.

---

# Why SentinelaCPD?

Servidores e equipamentos de rede raramente avisam quando vão falhar.

Tradicionalmente, a infraestrutura física de TI opera em silos: o ar-condicionado opera com seu próprio termostato mecânico, os nobreaks (UPS) possuem interfaces proprietárias e os técnicos monitoram telas apenas após a ocorrência de incidentes (*downtime*).

Quando um sistema de climatização falha de madrugada ou uma tomada de distribuição (PDU) sofre sobrecorrente, a inércia térmica de um rack é curta: em poucos minutos ocorre o estrangulamento térmico (*thermal throttling*), degradação prematura de chips de silício ou desligamento abrupto de servidores.

O SentinelaCPD investiga uma abordagem diferente:

> **Como transformar o próprio ambiente do CPD em um sistema sensorial ativo, capaz de auditar continuamente variáveis térmicas e a presença/consumo de energia diretamente na borda?**

Em vez de depender de soluções industriais fechadas de custo proibitivo, o projeto implementa uma arquitetura resiliente, de baixo custo, orientada a eventos e estritamente *local-first*.

---

# Motivação de Engenharia e Contexto

Ambientes de missão crítica exigem conformidade com normas técnicas internacionais, como os padrões da **ASHRAE (American Society of Heating, Refrigerating and Air-Conditioning Engineers)** para CPDs, que estipulam limites rígidos para temperatura de bulbo seco ($18^\circ\text{C}$ a $27^\circ\text{C}$) e umidade relativa não condensável ($40\%$ a $60\%$).

A motivação central deste trabalho divide-se em três pilares:

1. **Prevenção de Hotspots Térmicos:** Mapear a microclimatização próxima aos racks antes que o calor residual atinja níveis destrutivos.
2. **Auditoria de Carga e Continuidade Elétrica:** Detectar instantaneamente a presença ou corte de alimentação em circuitos chave através de sensoriamento indutivo não invasivo.
3. **Soberania e Desacoplamento:** Garantir que o pipeline de telemetria funcione em rede local restrita, imune a quedas de conexão externa com nuvens públicas.

---

# Evolução Arquitetural do Projeto

```text
Monitoramento Analógico Manual
            ↓
Sistemas SCADA Proprietários
            ↓
Internet das Coisas (IoT)
            ↓
Processamento de Sinais na Borda (Edge Computing)
            ↓
Mensageria Orientada a Eventos (MQTT)
            ↓
SentinelaCPD: Telemetria Integrada em Borda
```

---

# Visão do Sistema

O SentinelaCPD não foi concebido como um leitor isolado de sensores. Ele opera como um **pipeline de dados contínuo e determinístico**, projetado para:

* Amostrar periodicamente a temperatura e a umidade do ar ambiente;
* Calcular numericamente o valor eficaz (RMS) da forma de onda de corrente AC;
* Discriminar consumo ativo de ruídos térmicos do conversor analógico-digital;
* Estruturar payloads semânticos leves em JSON;
* Garantir entrega e reconexão autônoma em redes locais protegidas;
* Persistir séries temporais em banco de dados relacional para auditoria.

---

# O Ecossistema em Resumo

```text
                     Ambiente Físico do CPD
                     (Temperatura, Umidade, Carga AC)
                                │
                                ▼
                   Camada de Percepção Física
                   (DHT22 + Toroide ZMCT103C)
                                │
                                ▼
                     Processamento de Borda
                   (ESP32 DevKit v1 - FreeRTOS)
                                │
                                ▼
                   Mensageria MQTT em Rede Local
                     (Tópico: esp32/telemetria)
                                │
                                ▼
                    Motor de Regras do Broker
                       (EMQX 5.x via Docker)
                                │
                                ▼
                      Persistência de Dados
                       (MySQL Server 8.0)
                                │
                                ▼
                    Auditoria e Visualização
                   (MySQL Workbench & GitPage)
```

---

# Arquitetura do Sistema e Camadas

O ecossistema é desacoplado em responsabilidades bem delimitadas:

```text
+-------------------------------------------------------------------+
|                     Camada de Percepção (Sensing)                 |
|      [ Sensor DHT22: Temp/Umidade ]    [ ZMCT103C: Indução AC ]   |
+---------------------------------+---------------------------------+
                                  │
                                  ▼
+-------------------------------------------------------------------+
|                   Camada de Borda (Edge Processing)               |
|                    ESP32 Dual-Core @ 240MHz                       |
|   - Amostragem em 60Hz (200ms)     - Janela Móvel RMS             |
|   - Supressão de Ruído ADC         - Multi-SSID Wi-Fi Manager     |
+---------------------------------+---------------------------------+
                                  │ TCP/IP 1883
                                  ▼
+-------------------------------------------------------------------+
|               Camada de Mensageria e Ingestão (Docker)            |
|                      EMQX Broker Enterprise 5.x                   |
|   - Autenticação de Dispositivo    - Parse JSON via SQL Rule      |
+---------------------------------+---------------------------------+
                                  │ Conector Data Bridge
                                  ▼
+-------------------------------------------------------------------+
|                  Camada de Persistência e Auditoria               |
|                         MySQL Database 8.0                        |
|   - Armazenamento em Série Temporal (leituras_dht22)              |
|   - Consultas de Auditoria e Validação via Workbench              |
+-------------------------------------------------------------------+
```

---

# Fundamentação Matemática: Cálculo Discreto de RMS

O sensor **ZMCT103C** baseia-se em um transformador de corrente micro-toroidal acoplado a um circuito condicionador ativo. Como opera sob corrente alternada senoidal de $60\text{ Hz}$ ($T \approx 16.6\text{ ms}$), o sinal analógico não pode ser interpretado via média aritmética escalar.

O firmware executa um algoritmo discreto de valor eficaz durante uma janela de integração temporal de $200\text{ ms}$ (~12 ciclos senoidais completos):

$$I_{\text{RMS}} = \sqrt{\frac{1}{N} \sum_{i=1}^{N} (x_i - \mu)^2} \cdot K$$

Em que:

* $N$: Total de amostras analógicas discretizadas durante a janela de $200\text{ ms}$ (taxa aproximada de $5\text{ kHz}$);
* $x_i$: Valor instantâneo bruto lido pelo ADC de 12 bits ($0$ a $4095$);
* $\mu$: Nível médio de polarização (*offset* DC centrado em ~1680);
* $K$: Constante de proporcionalidade empírica ajustada ao ganho do amplificador operacional e ao fator de potência da carga.

### Supressão de Piso de Ruído

Para evitar flutuações fantasmas decorrentes do ruído Johnson–Nyquist no silício do conversor analógico-digital com carga em repouso:

$$\text{Se } \sigma_{\text{ADC}} < 18.0 \implies I_{\text{RMS}} = 0.00\text{ A}$$

---

# Especificações de Hardware e Pinagem

| Módulo / Dispositivo | Interface Elétrica | Pino ESP32 | Descrição e Cuidados Técnicos |
| --- | --- | --- | --- |
| **ESP32 DevKit v1** | Borda / MCU | Micro-USB | Alimentação lógica de 5V e processamento dual-core. |
| **DHT22 (AM2302)** | Digital Single-Bus | **GPIO 27** | Resistor pull-up integrado; leitura a cada 5 segundos. |
| **ZMCT103C (AC)** | Analógico com Offset | **GPIO 34 (ADC1)** | Alocado no ADC1 para evitar conflito com o rádio Wi-Fi. |
| **Barramento Lateral** | Distribuição DC | 5V / GND | Trilhas dedicadas da protoboard prevenindo ruído comum. |
| **Circuito AC (220V)** | Acoplamento Magnético | Isolado | Apenas o condutor Fase transpassa o orifício toroidal. |

---

# Resultados Experimentais e Homologação (N1)

A validação em bancada foi conduzida conectando um painel de LED comercial (18W / 220V AC com driver chaveado) através do sensor de corrente. Os registros foram persistidos no MySQL através da regra ativa do EMQX:

```sql
SELECT id, cliente_id, temperatura, umidade, corrente, data_hora
FROM iot_db.leituras_dht22
ORDER BY id DESC LIMIT 5;
```

```text
+-----+----------------+-------------+---------+----------+---------------------+
| id  | cliente_id     | temperatura | umidade | corrente | data_hora           |
+-----+----------------+-------------+---------+----------+---------------------+
| 440 | ESP32_CPD_8544 | 30.9        | 67.6    | 0.00     | 2026-09-27 15:46:37 |
| 441 | ESP32_CPD_8544 | 30.9        | 67.6    | 0.13     | 2026-09-27 15:46:42 |
| 442 | ESP32_CPD_8544 | 31.0        | 67.4    | 0.12     | 2026-09-27 15:46:47 |
| 443 | ESP32_CPD_8544 | 31.0        | 67.0    | 0.13     | 2026-09-27 15:46:52 |
| 448 | ESP32_CPD_8544 | 31.0        | 66.9    | 0.00     | 2026-09-27 15:47:17 |
+-----+----------------+-------------+---------+----------+---------------------+
```

* **Repouso Estável:** Com a carga desconectada, a supressão de ruído manteve o valor cravado em `0.00 A`.
* **Regime Nominal Ativo:** A leitura estabilizou com precisão em `~0.13 A`, condizente com a potência ativa do conjunto e seu fator de potência.
* **Latência de Trânsito:** Latência ponta a ponta (leitura -> Wi-Fi -> EMQX -> MySQL) inferior a $80\text{ ms}$.

---

# Princípios de Engenharia Adotados

* **Separação Rígida de Responsabilidades:** O microcontrolador não executa SQL; o banco não sabe o que é um sensor; o broker faz apenas mensageria e roteamento.
* **Local-First & Resiliência:** Todo o processamento e armazenamento ocorrem no perímetro local do CPD.
* **Proteção de Segredos e Credenciais:** Variáveis de ambiente isoladas em arquivos `.env` e parâmetros locais em `config.h`, excluídos do controle de versão pelo `.gitignore`.
* **Não-Bloqueio de CPU:** Utilização rigorosa de temporizadores por software (`millis()`) para manter a recepção de pacotes de rede sempre ativa.

---

# Organização do Repositório

```text
SentinelaCPD/
│
├── index.html              # Interface estática da GitPage (Apresentação N1)
├── style.css               # Estilos complementares
├── script.js               # Scripts de interface e gráficos
├── README.md               # Documentação técnica de engenharia
├── .gitignore              # Proteção contra tracking de segredos e temporários
│
├── images/                 # Evidências experimentais, diagramas e esquemáticos
│   ├── hero_sentinela.png
│   ├── bancada_teste.jpg
│   └── workbench_log.png
│
├── firmware/               # Código C++ do ESP32
│   ├── firmware.ino        # Lógica principal, amostragem e loop MQTT
│   └── config.example.h    # Modelo parametrizado de configurações e pinagem
│     
│
└── docker/                 # Orquestração do Backend
    ├── docker-compose.yml  # Descritor dos serviços EMQX e MySQL 8.0
    └── .env.example        # Modelo de variáveis de ambiente
```

---

# Como Reproduzir o Projeto

### 1. Infraestrutura Docker

Navegue até o diretório de conteinerização, instancie as variáveis e inicie os serviços:

```bash
cd docker
cp .env.example .env
docker compose up -d
```

* Dashboard Administrativo EMQX: `http://localhost:18083` (Usuário inicial: `admin`)
* Porta do Broker MQTT: `1883`
* Porta do Servidor MySQL: `3306`

### 2. Configuração e Carga do Firmware

1. Acesse o diretório `/firmware`.
2. Duplique o arquivo de exemplo para criar a sua configuração local:

   ```bash
   cp config.example.h config.h
   ```

3. Defina as credenciais da rede Wi-Fi e o endereço IP do host onde o Docker está executando.
4. Abra o `firmware.ino` no Arduino IDE, selecione a placa **ESP32 Dev Module** e realize o upload.

---

# Roteiro de Evolução e Roadmap (Rumo à N2)

### Marco N1 (Concluído)

- [x] Arquitetura de borda operacional com amostragem RMS contínua e DHT22.
- [x] Cluster local Docker com broker EMQX autenticado e persistência MySQL.
- [x] Validação em bancada de carga real e homologação de registros.
- [x] Documentação técnica de reprodutibilidade e GitPage publicada.

### Marco N2 (Em Desenvolvimento)

- [ ] Dashboard Web SPA em tempo real integrado via WebSockets.
- [ ] Módulo analítico de consumo acumulado (quilowatt-hora / kWh) e estimativa de custo.
- [ ] Sistema de alerta reativo via mensageria (Webhook / Telegram) para violação de limites térmicos conforme normas ASHRAE.
- [ ] Implementação de canal criptografado via TLS/MQTTS (porta 8883).

---

# Licença e Agradecimentos

Este projeto é disponibilizado sob a licença **MIT**.

Agradecimentos ao corpo docente do curso de Engenharia da Computação, às comunidades de software aberto do **EMQX**, **Eclipse Paho / PubSubClient** e aos pioneiros da computação ubíqua e distribuída.