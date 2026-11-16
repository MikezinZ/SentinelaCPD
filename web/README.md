# SentinelaCPD

Dashboard web de telemetria e gestão de alertas do CPD. Implementado em React, Vite, TypeScript, Tailwind CSS, Lucide, Radix UI e Recharts.

## Executar localmente

Com Node.js 22 ou superior, execute:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Abra o endereço informado pelo Vite. Na tela de login, selecione Administrador, Operador ou Visualizador no Modo Demonstração. Também é possível entrar com admin@sentinelacpd.demo, operator@sentinelacpd.demo ou viewer@sentinelacpd.demo e a senha fictícia `Sentinela123`.

```sh
npm test
npm run build
npm run preview
```

## Testar os fluxos

- **CPD operacional:** confira os quatro racks, a busca, a tabela e o detalhe. No histórico, selecione 24 h para testar a paginação e observar a faixa mín.–máx. e as lacunas.
- **Temperatura crítica:** abra a Central de alertas como Operador ou Administrador e reconheça o alerta com uma nota. O alerta muda para Reconhecido e continua aberto.
- **Telemetria antiga:** veja o aviso e compare o horário original da amostra. Em **Falha no DHT22**, a corrente permanece disponível.
- **Dispositivo sem leitura:** confira o estado Sem leitura e os valores indisponíveis.
- **Falha de rede:** veja HTTP 503 e o aviso de dados armazenados quando já houver uma resposta carregada.
- **Conflito de versão:** como Administrador, entre em um rack e selecione Configurar limites. Ative o cenário, salve, recarregue os limites e tente novamente.
- **Cenários extras:** sem dispositivos, histórico vazio e sessão expirada.

## API real

Com o Cloud rodando (`docker compose up -d` na raiz do repositório), crie `.env.local` com `VITE_USE_MOCKS=false`. Em `npm run dev`, o caminho padrão `/api/v2` é repassado pelo proxy do Vite para `VITE_PROXY_TARGET` (padrão `http://localhost:8000`). Para um build publicado em outro endereço, use `VITE_API_BASE=https://SEU_HOST/api/v2` e informe a origem do site em `CORS_ORIGINS` no `.env` do Cloud. Os logins são os usuários cadastrados na API (veja a seção Cloud do README principal). Para implantação estática, configure fallback de rotas para `index.html`.

O frontend aceita o refresh token em memória quando retornado em JSON. Para restaurar a sessão após recarregar a página, o backend web precisa disponibilizar refresh rotativo em cookie HttpOnly com os atributos adequados, pois a aplicação não grava tokens em armazenamento persistente. O cliente envia credenciais e usa Bearer para o access token. A política de CORS, cookies, CSRF, autenticação e RBAC da API real precisa ser aplicada no servidor. A API e o ESP32 não foram disponibilizados para homologação.

O exemplo anexado não fixa a estrutura JSON de cada ponto de histórico. O cliente assume `{ timestamp, temperature, humidity, current }`, com `{ min, max, avg, count }` ou `null` em cada métrica. Se o OpenAPI final usar outros nomes, ajuste a adaptação em `src/services/api.ts` e os contratos. O gráfico raw assume cadência de 5 s para detectar lacunas entre pontos, que deve ser alinhada à cadência do firmware.

## Estrutura

- `src/components` — elementos compartilhados de interface, estados e formatação.
- `src/features` — dispositivos, histórico, alertas e limites.
- `src/services` — API, timeout, refresh, cancelamento e polling.
- `src/mocks` — transporte simulado, dados, permissões, auditoria e cenários.
- `src/contracts` — tipos, regras de apresentação e validação.
- `tests` — regressões de telemetria, RBAC, versionamento, paginação e sessão.

O site publicado usa exclusivamente dados fictícios. Reconhecimentos e ajustes no mock duram enquanto a página permanece aberta.

## Energia e API v2

Device inclui power_state (mains, battery ou unknown) e battery_pct (número ou null). Bateria indisponível permanece sem percentual. A demonstração Queda de energia (em bateria) apresenta POWER_LOSS/LAST_GASP, alerta power_loss crítico, battery_low de aviso e incidentes aberto e encerrado.

GET /devices/{id}/incidents retorna items e next_cursor. Cada incidente contém id, type (power_loss), status (open/closed), started_at, ended_at (ou null) e duration_s (ou null). O detalhe percorre os cursores e mostra início, fim e duração. O backend abre power_loss a partir do evento explícito do dispositivo. Corrente zero isolada não confirma queda.

O prazo de telemetria usa stale_after_seconds do servidor, com padrão de 15 segundos quando ausente. Limites são regras de alerta no servidor, sem envio ao ESP32 nesta versão.

Configure VITE_API_BASE=http://192.168.0.10:8000/api/v2 no .env.local.

Use o IP do computador que executa a API, acessível na mesma rede do celular. O servidor deve escutar na interface de rede e permitir a origem web por CORS. Uma página HTTPS precisa de API HTTPS ou proxy na mesma origem.

Mocks só são ativados explicitamente por VITE_USE_MOCKS=true. Para API real, use false ou remova a variável e reinicie/recompile a aplicação. No celular, localhost aponta para o próprio celular.
