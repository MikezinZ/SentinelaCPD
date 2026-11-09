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

Crie `.env.local` com `VITE_USE_MOCKS=false` e `VITE_API_BASE=https://SEU_HOST/api/v2`, então reinicie o Vite ou gere um novo build. Para implantação estática, configure fallback de rotas para `index.html`.

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
