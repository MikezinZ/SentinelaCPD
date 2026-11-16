# SentinelaCPD Mobile (iOS & Android)

Aplicativo móvel de campo para monitoramento de telemetria em tempo real (temperatura, umidade relativa e corrente eficaz $I_{\text{RMS}}$) de nós ESP32 em racks de CPD e auditoria rápida de incidentes na ponta.

Construído com **React Native**, **Expo (SDK 54)**, **Expo Router**, **TypeScript**, **NativeWind v4 (Tailwind CSS)**, **Expo SecureStore**, **Lucide React Native** e **React Native SVG / Gifted Charts**.

---

## Como Executar Localmente

No diretório `mobile/`, instale as dependências e inicie o servidor Expo:

```bash
cd mobile
npm install
cp .env.example .env
npx expo start
```

Para executar os testes automatizados de regras de negócio, RBAC, concorrência de limites e ciclo de vida de sessão:

```bash
npm test
```

---

## Credenciais e Modo Demonstração (Mock First)

Por padrão, `EXPO_PUBLIC_USE_MOCKS=true` está habilitado. Na tela de login (`/login`), você pode entrar com 1 toque em qualquer perfil do **Modo Demonstração** ou informar manualmente:

- **Administrador (`admin`):** `admin@sentinelacpd.demo` / `Sentinela123`
- **Operador (`operator`):** `operator@sentinelacpd.demo` / `Sentinela123`
- **Visualizador (`viewer`):** `viewer@sentinelacpd.demo` / `Sentinela123`

Após autenticar, utilize o botão flutuante **Modo Demo** no canto inferior direito para alternar em tempo real entre os **7 cenários obrigatórios**:

1. **CPD Operacional Normal:** Todos os sensores `ok` e pacotes recentes (`fresh` $\le 15\text{ s}$).
2. **Alerta Ativo de Temperatura Crítica:** Temperatura em $30,8\ ^\circ\text{C}$ ($> 27\ ^\circ\text{C}$) com alerta crítico aberto.
3. **Telemetria Antiga (`stale`):** Mais de $15\text{ s}$ sem leitura, exibindo banner fixo *"Dados armazenados — conexão indisponível"* com o timestamp original preservado.
4. **Falha de Sensor (`invalid`):** Sensor DHT22 inválido (`Indisponível`), mantendo a leitura de Corrente RMS (`4,82 A`) íntegra e independente.
5. **Dispositivo Novo sem leitura (`unknown`):** Nó recém-cadastrado com `latest: null` e leituras como `Indisponível`.
6. **Falha de Rede (HTTP 503):** Simula erro de comunicação mantendo dados previamente carregados com aviso de cache.
7. **Conflito de Versão nos Limites (HTTP 409):** Simula concorrência otimista na tela `/devices/:id/limits`, disparando `Alert` nativo e exigindo recarregamento antes de salvar.

---

## Estrutura de Pastas

```text
mobile/
├── app/                  # Rotas Expo Router (/login, /(tabs)/devices, /(tabs)/alerts, /devices/[id]/*)
├── screens/              # Telas modulares (Login, Dispositivos, Detalhes, Histórico, Alertas, Limites)
├── components/           # Componentes visuais, Gráfico Mín/Máx/Média, Modal ACK e Menu Demo
├── services/             # Cliente HTTP tipado (/api/v2) e adaptador Expo SecureStore
├── mocks/                # Servidor mock em memória cobrindo todos os cenários e fixtures
├── types/                # Contratos TypeScript, validações e regras de negócio
├── hooks/                # Hooks de autenticação, polling com pausa em background (AppState) e relógio
└── tests/                # Testes automatizados de regressão
```


## Energia e API v2

Device inclui power_state (mains, battery ou unknown) e battery_pct (número ou null). Bateria indisponível permanece sem percentual. A demonstração Queda de energia (em bateria) apresenta POWER_LOSS/LAST_GASP, alerta power_loss crítico, battery_low de aviso e incidentes aberto e encerrado.

GET /devices/{id}/incidents retorna items e next_cursor. Cada incidente contém id, type (power_loss), status (open/closed), started_at, ended_at (ou null) e duration_s (ou null). O detalhe percorre os cursores e mostra início, fim e duração. O backend abre power_loss a partir do evento explícito do dispositivo. Corrente zero isolada não confirma queda.

O prazo de telemetria usa stale_after_seconds do servidor, com padrão de 15 segundos quando ausente. Limites são regras de alerta no servidor, sem envio ao ESP32 nesta versão.

Configure EXPO_PUBLIC_API_BASE=http://192.168.0.10:8000/api/v2 no .env.local.

Use o IP do computador que executa a API, acessível na mesma rede do celular. O servidor deve escutar na interface de rede e permitir a origem web por CORS. Uma página HTTPS precisa de API HTTPS ou proxy na mesma origem.

Mocks só são ativados explicitamente por EXPO_PUBLIC_USE_MOCKS=true. Para API real, use false ou remova a variável e reinicie/recompile a aplicação. No celular, localhost aponta para o próprio celular.
