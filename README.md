# SentinelaCPD — Cloud (base)

Broker EMQX + MySQL + serviço de ingestão (Python), tudo em Docker.

## Subir

```bash
cp .env.example .env      # edite as senhas
docker compose up -d --build
docker compose logs -f ingestor
```

- MQTT: porta 1883 (ESP32 aponta para o IP do PC/servidor)
- Dashboard EMQX: http://localhost:18083 (usuário `admin`, senha `public` — troque no primeiro acesso)
- MySQL: porta 3306, banco `iot_db` (Workbench)

## Contrato de mensagens

| Tópico | Payload |
| --- | --- |
| `sentinela/<id>/telemetria` | `{"temperatura":27.8,"umidade":45.4,"corrente":0.8,"bateria":87}` (campos opcionais) |
| `sentinela/<id>/evento` | `{"evento":"POWER_LOSS","estado":"ON_BATTERY","temperatura":29.4,"umidade":58.2,"bateria":87}` |
| `esp32/telemetria` | legado da N1, sem id (gravado como `ESP32_CPD_01`) |

Eventos válidos: `POWER_LOSS`, `LAST_GASP`, `POWER_RESTORED`.
`POWER_LOSS`/`LAST_GASP` abrem um incidente; `POWER_RESTORED` fecha e calcula a duração.

## Testar sem o ESP32

```bash
# telemetria (precisa do mosquitto-clients, ou use o MQTTX)
mosquitto_pub -h localhost -t sentinela/ESP32_CPD_01/telemetria -m '{"temperatura":27.8,"umidade":45.4}'
mosquitto_pub -h localhost -t sentinela/ESP32_CPD_01/evento -m '{"evento":"POWER_LOSS"}'
mosquitto_pub -h localhost -t sentinela/ESP32_CPD_01/evento -m '{"evento":"POWER_RESTORED"}'
```

```sql
SELECT * FROM leituras ORDER BY id DESC LIMIT 10;
SELECT * FROM incidentes;
```

## API REST (para o app Mobile)

Sobe junto com o resto. Documentação interativa (dá para testar clicando): http://localhost:8000/docs

| Rota | O que devolve |
| --- | --- |
| `GET /health` | API e banco no ar (sem chave) |
| `GET /api/status-cpd` | situação geral + último valor de cada dispositivo (online, alerta de temperatura, incidentes abertos) |
| `GET /api/telemetria?dispositivo=&de=&ate=&limite=` | histórico, mais recente primeiro (limite máx. 1000) |
| `GET /api/incidentes?dispositivo=&status=ABERTO\|FECHADO&limite=` | lista de incidentes com duração |
| `GET /api/incidentes/{id}` | incidente + eventos ocorridos nele |
| `GET /api/dispositivos` | dispositivos cadastrados |

`status_geral` pode ser: `NORMAL`, `EM_INCIDENTE`, `ALERTA_TEMPERATURA`, `OFFLINE`, `SEM_DADOS`.
Um dispositivo fica `online: false` se passar `ONLINE_TIMEOUT_S` (30 s) sem enviar dados.

Para o celular acessar, use o IP do notebook: `http://<IP-do-notebook>:8000/api/status-cpd`
(celular e notebook na mesma rede; libere a porta 8000 no firewall).
Se definir `API_KEY` no `.env`, envie o cabeçalho `X-API-Key: <valor>` em todas as rotas `/api`.

Ao atualizar de uma versão anterior: `docker compose up -d --build` (os dados do banco são mantidos).

## Alertas por Telegram (serviço `notifier`)

Avisa: incidente aberto, incidente fechado (com duração), temperatura acima de `TEMP_LIMITE`
(e quando normaliza) e dispositivo sem enviar dados por `OFFLINE_S` segundos (e quando volta).

1. Crie o bot com `@BotFather` (`/newbot`), abra o bot e envie `/start`.
2. Coloque o token em `TELEGRAM_TOKEN` no `.env`. O token é uma senha: não publique nem mande em prints.
3. Rode `docker compose up -d --build` e depois `docker compose logs notifier`.
   Ele lista os chats que já falaram com o bot (`id=...`). Copie o seu id para `TELEGRAM_CHAT_ID` no `.env`.
4. Rode `docker compose up -d` de novo. Chega a mensagem "serviço de alertas ativo".

Sem token/chat id o serviço roda em modo teste (só escreve as mensagens no log).
O histórico de incidentes anterior à primeira execução não gera avisos antigos.
Perdeu o token? No `@BotFather`, `/revoke` gera outro e invalida o anterior.

## Pendências conhecidas

- Broker sem autenticação (fase de teste). Próximo passo: usuário/senha no MQTT e depois TLS.
- Se mudar o `init.sql`, recrie o volume: `docker compose down -v` (apaga os dados).
- Próximas etapas: API REST, notificações, Redis, OTA.
