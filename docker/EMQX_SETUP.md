# Reprodução da integração EMQX → MySQL

Este procedimento usa a edição Enterprise já adotada pelo projeto.
O Compose inicia os serviços; Connector, Rule, Sink e autenticação MQTT
são configurados manualmente. Os nomes dos menus podem variar por versão.
Não há provisionamento automático desses itens.

## 1. Antes de iniciar

Copie `.env.example` para `.env`. Defina suas senhas localmente,
mantenha `MYSQL_DATABASE=iot_db` e use `MYSQL_USER=sentinela_app`.
Este usuário do MySQL é diferente do usuário MQTT do ESP32.

Em terminal na pasta `docker/`:

```bash
docker compose config --quiet
docker compose up -d
docker compose ps
```

Aguarde o MySQL concluir a inicialização. `depends_on` define a ordem de
início, mas não garante que o banco já aceite conexões.

**Bancada já em funcionamento:** não é preciso reiniciar os serviços apenas
para entregar os arquivos. Preserve as credenciais, autenticação e regras
já utilizadas. Não sobrescreva o seu `.env` com o exemplo.

O script `mysql/init.sql` e as variáveis de criação de usuários somente
inicializam um volume novo. Em um banco existente, o usuário
`sentinela_app` NÃO é criado só por adicionar variáveis ao Compose.

Para aplicar somente a tabela em um banco existente, após montar o script:

```bash
docker exec -it mysql_iot mysql -uroot -p iot_db
```

Digite a senha root já usada nesse banco. No prompt MySQL:

```sql
SOURCE /docker-entrypoint-initdb.d/01-init.sql;
SHOW TABLES;
```

`CREATE TABLE IF NOT EXISTS` preserva os registros e não migra a estrutura
de uma tabela que já exista. Confira `SHOW CREATE TABLE leituras_dht22;`
antes de modificar um schema existente.

Se quiser usar o novo usuário em um banco existente, crie-o localmente
pelo MySQL Workbench (Administration → Users and Privileges), com a mesma
senha do seu `.env`, host `%` e privilégios no schema `iot_db`.
Para este Sink, basta o privilégio INSERT na tabela de leituras.
Mantenha o conector atual enquanto esse usuário não estiver validado.

Não use `docker compose down -v`: isso remove o volume do MySQL.
Não adicione volumes vazios ao EMQX em uso sem antes planejar a migração
da configuração. Este Compose mantém o comportamento atual do broker;
suas regras devem ser recriadas por este guia se o container for perdido.

## 2. Versão da imagem

Consulte a instalação já testada:

```bash
docker exec emqx_broker emqx version
docker inspect emqx_broker --format '{{.Config.Image}}'
```

Depois de confirmar a tag disponível correspondente, defina
`EMQX_IMAGE=emqx/emqx-enterprise:VERSAO_CONFIRMADA` no seu `.env`.
Não copie literalmente VERSAO_CONFIRMADA. O padrão `latest` conserva
o Compose anterior, mas ainda não fixa a versão para clones futuros.
Não execute pull/upgrade na bancada perto da entrega.

## 3. Autenticação do dispositivo

**Bancada existente:** mantenha o autenticador e a autorização já
configurados. Se usa MySQL (`mqtt_user` / `mqtt_acl`), essas tabelas,
consultas e configuração devem ser exportadas separadamente, sem senhas
reais. O script deste pacote cria somente a tabela de telemetria.

**Instalação nova, alternativa manual:** em Access Control → Authentication,
crie Password-Based → Built-in Database, com identificação por Username.
Em Users, adicione `esp32_cpd`, defina uma senha local e deixe
Superuser desativado. Use os mesmos valores em `firmware/config.h`
(`MQTT_USER` e `MQTT_PASS`).

Em Access Control → Authorization, configure uma regra que permita ao
usuário `esp32_cpd` publicar em `esp32/telemetria`.
Revise regras permissivas existentes e use Deny para mensagens que não
correspondam às permissões. Essa alternativa usa o banco interno do EMQX,
não tabelas de autenticação MySQL. Não substitua a configuração da bancada
apenas para seguir esta alternativa.

## 4. Connector MySQL

Acesse `http://localhost:18083`. Use o administrador configurado localmente
e altere a senha padrão em uma instalação nova.

Em Integration → Connectors → Create, escolha MySQL:

| Campo | Valor |
| --- | --- |
| Nome | sentinela_mysql |
| Server Host | mysql:3306 |
| Database | iot_db |
| Username | valor de MYSQL_USER no .env |
| Password | valor de MYSQL_PASSWORD no .env |

Teste a conexão antes de salvar. Dentro do container EMQX,
`localhost` aponta para o próprio EMQX; `mysql` é o serviço do banco.
No Workbench executado no computador, o acesso publicado é
`127.0.0.1:3306`.

Se usa um volume existente, confirme que o usuário realmente existe e
tem permissão. Não altere um Connector funcional sem essa verificação.

## 5. Regra de telemetria

Em Integration → Rules → Create, use o identificador `sentinela_telemetria`:

```sql
SELECT
  clientid AS cliente_id,
  topic AS topico,
  payload.temperatura AS temperatura,
  payload.umidade AS umidade,
  payload.corrente AS corrente
FROM
  "esp32/telemetria"
```

Use Enable Test / SQL Test com tópico `esp32/telemetria`, client ID
`ESP32_TESTE` e o payload:

```json
{"temperatura":24.3,"umidade":57.1,"corrente":0.08}
```

Esse teste confere a extração dos campos; não comprova a persistência.

## 6. Ação / Sink MySQL

Na regra, use Add Action → MySQL → Create Action.
Nome: `sentinela_insert`. Connector: `sentinela_mysql`.

Use o SQL Template abaixo, sem aspas nos placeholders e sem ponto e
vírgula no final. Para a primeira reprodução, use Batch Size = 1
(modo sem lote).

```sql
INSERT INTO leituras_dht22
  (cliente_id, topico, temperatura, umidade, corrente)
VALUES
  (${cliente_id}, ${topico}, ${temperatura}, ${umidade}, ${corrente})
```

Salve o Sink e a regra. O timestamp é atribuído pelo MySQL na gravação.

## 7. Teste do pipeline completo

Conecte o ESP32 com as credenciais MQTT configuradas. No firmware,
`MQTT_BROKER` deve ser o IP LAN do computador que executa o Docker,
não `localhost` nem `mysql`. O ESP32 e o broker devem estar acessíveis
pela rede local.

Alternativamente, use MQTTX com um usuário autorizado, publicando
o JSON de teste no tópico `esp32/telemetria`.

No Workbench:

```sql
SELECT id, cliente_id, topico, temperatura, umidade, corrente, data_hora
FROM iot_db.leituras_dht22
ORDER BY id DESC
LIMIT 10;
```

Confirme novos registros, horário e métricas de sucesso da regra/Sink.
Uma simulação no SQL Test não substitui este teste real.

## Referências oficiais

- [EMQX: integração MySQL](https://docs.emqx.com/en/emqx/latest/develop/data-integration/data-bridge-mysql.html)
- [Imagem oficial MySQL: inicialização e variáveis](https://hub.docker.com/_/mysql)
- [EMQX: autenticação em banco interno](https://docs.emqx.com/en/emqx/latest/guides/access-control/authn/mnesia.html)
