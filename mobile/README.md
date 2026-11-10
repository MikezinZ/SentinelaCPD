# Sentinela CPD — Mobile / Fase 2

Aplicativo Expo SDK 54 para Android e iOS, TypeScript strict, NativeWind v4/Tailwind 3, React Navigation, Lucide e Gifted Charts. Contém o código completo das duas etapas, com a camada simulada da Fase 1 substituída pelo contrato de leitura da Fase 2.

## Instalar e executar

Requisitos: Node.js 20.19+; Android Studio/SDK para Android; macOS/Xcode para iOS.

```bash
npm ci
cp .env.example .env
npm run typecheck
npm test
npm run android
# Em macOS:
npm run ios
```

Após instalar a development build, `npm start` inicia o Metro. Use uma build compatível com Expo SDK 54. O Expo Go instalado no telefone pode usar outro SDK. Não há APK/IPA neste pacote.

## Configuração

| Variável | Padrão sem `.env` | Comportamento |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `http://localhost:8000` | URL base da API |
| `EXPO_PUBLIC_API_KEY` | ausente | Fallback de X-API-Key quando não há chave no SecureStore |
| `EXPO_PUBLIC_USE_MOCKS` | falso | Somente o texto `true` força o Mock Engine |
| `EXPO_PUBLIC_ENABLE_DEV_MENU` | falso | Habilita o menu de cenários em builds de distribuição |
| `EXPO_PUBLIC_STATUS_PATH` | `/status/cpd` | Rota do status |
| `EXPO_PUBLIC_TELEMETRIA_PATH` | `/telemetria` | Rota da telemetria |
| `EXPO_PUBLIC_INCIDENTES_PATH` | `/incidentes` | Lista; detalhe usa `/{id}` |
| `EXPO_PUBLIC_DISPOSITIVOS_PATH` | `/dispositivos` | Cadastro |

O `.env.example` inicia em demonstração deliberadamente. Para API real, defina `EXPO_PUBLIC_USE_MOCKS=false`, configure a URL e desative o modo demonstração em Ajustes. Uma preferência de demonstração salva permanece ativa até ser desativada. O Dev Menu aparece em desenvolvimento, com mocks obrigatórios ou com a flag explícita. Ele fica oculto por padrão em produção real.

`localhost` no telefone é o próprio telefone. No emulador Android, o host costuma ser acessível por `10.0.2.2`; em dispositivo físico utilize um endereço de rede alcançável. Produção deve utilizar HTTPS. O projeto não afrouxa globalmente as políticas nativas contra HTTP sem criptografia; o endereço HTTP padrão é para desenvolvimento.

Variáveis `EXPO_PUBLIC_*` são incorporadas ao bundle e **não são segredos**. Para uma chave sensível, use Ajustes → salvar chave no dispositivo. O SecureStore tem prioridade sobre a chave do ambiente. Remover a chave local volta ao fallback do ambiente, caso exista. Não há logs com chaves ou corpos de erro. Redirecionamentos HTTP são rejeitados para não encaminhar a chave para outro destino.

## Contratos e pontos a homologar com o backend

`StatusGeral`, `DispositivoStatus`, `StatusCpdResponse`, `Incidente` e `TelemetriaQuery` seguem os campos fornecidos. `estado` é string porque seu enum não foi informado. Datas de entrada exigem ISO 8601 com offset ou Z; mocks emitem `-03:00`; a interface apresenta horário de Recife.

**Não foram fornecidos os caminhos reais nem os campos de `TelemetriaPonto`, `DispositivoCadastral` e `IncidenteDetalhe`.** Os formatos abaixo foram adotados explicitamente para entregar uma implementação funcional e tipada. Não são apresentados como contrato oficial confirmado:

| Resposta | Formato adotado |
|---|---|
| `TelemetriaPonto` | `dispositivo_id`, `timestamp`, `temperatura`, `umidade`, `corrente: number \| null`, `bateria: number \| null` |
| `DispositivoCadastral` | `id`, `nome`, `local` |
| `IncidenteDetalhe` | todos os campos de `Incidente` + `telemetria: TelemetriaPonto[]` |

As listas são arrays JSON diretos, sem envelope de paginação. As rotas estão isoladas em `src/services/cpdService.ts` e podem ser configuradas por ambiente. Ajuste os três contratos complementares e seus schemas com o OpenAPI real antes de homologar em produção. Zod valida todos os retornos na fronteira HTTP: incompatibilidade gera erro visível, sem coerção silenciosa ou preenchimento com zeros.

## Serviços

- `getStatusCpd(signal?)`
- `getTelemetria(params, signal?)`: parâmetros codificados; limite inteiro positivo; datas válidas e ordenadas.
- `getIncidentes(status?, signal?)`
- `getIncidenteDetalhe(id, signal?)`: ID inteiro não negativo; 404 tratado.
- `getDispositivos(signal?)`

O cliente Fetch injeta `X-API-Key` quando disponível, impõe deadline de 10 segundos incluindo busca da chave e leitura do JSON, aceita cancelamento externo e diferencia erros HTTP, rede, timeout, configuração e contrato. Mock é interceptado antes de ler credenciais ou tocar a rede. Não há fallback silencioso para dados fictícios quando a API real falha.

## Polling e concorrência

`useCpdStatus` retorna `{data, loading, error, isRefetching, refetch}`. Primeiro carregamento usa `loading`; atualizações com dados anteriores usam `isRefetching`. Falhas preservam o último sucesso da mesma fonte. Um novo fetch cancela o anterior e um contador de geração impede respostas antigas de sobrescreverem as novas, mesmo quando o transporte ignora o aborto.

O intervalo é de 5 segundos. Em `inactive`, `background` ou desmontagem, o intervalo é removido e a requisição é cancelada. Ao voltar para `active`, a busca é imediata e o intervalo é recriado. Telas sem foco também suspendem suas consultas. Alterar fonte/cenário/chave invalida a consulta anterior, sem mostrar dados de mock como se fossem reais. Respostas que demoram mais de 5 segundos podem ser canceladas pelo próximo ciclo de polling, conforme a política solicitada; o cliente isolado mantém deadline máximo de 10 segundos.

## Sete cenários

| Cenário | Resultado |
|---|---|
| `CPD_NORMAL` | Quatro dispositivos com contato há aproximadamente 2 s |
| `ALERTA_TEMPERATURA` | 38,5 °C, flag de alerta e status geral correspondente |
| `STALE_DATA` | Leitura fixa com mais de 60 s; banner “Dados armazenados — conexão indisponível” |
| `SENSOR_CORRENTE_NULL` | Corrente e bateria nulas exibidas como `--`; zero real permanece zero |
| `DISPOSITIVO_SEM_DADOS` | `SEM_DADOS` e lista vazia |
| `ERRO_503_REDE` | HTTP 503 simulado, badge Offline e botão de retry |
| `INCIDENTE_ABERTO` | Queda de energia, incidente aberto, `fim: null` e duração em andamento |

Todos os serviços usam o mesmo cenário. Filtros de telemetria, limite, dispositivo, status e detalhe funcionam no Mock Engine. O início do incidente e a leitura obsoleta ficam estáveis durante o cenário; não reiniciam a cada polling. Trocar o cenário reinicia o relógio da demonstração. Preferências de modo/cenário e chave ficam no SecureStore.

## Telas

- Dashboard: status geral, limiar do backend, dispositivos, média térmica, estado individual, corrente, bateria e freshness.
- Dispositivos: busca por nome/local e detalhe com série de temperatura.
- Incidentes: filtros ABERTO/FECHADO, duração em minutos/segundos e detalhe com leituras associadas. Em abertos, duração usa o início e o relógio atual; em fechados, usa `duracao_s` ou o intervalo início/fim.
- Ajustes: fonte, demonstração e administração da chave local.
- Menu DEV flutuante: sete cenários sem reiniciar o app.

Botões têm altura mínima de 48 dp; cartões clicáveis têm mínimo de 44 dp. Status também aparece em texto. Há labels acessíveis, estados vazios, loading, retry e mensagens de erro.

## Escopo de autenticação e auditoria

O backend informado usa X-API-Key e operações GET. O login fictício de 8 horas e as ações locais de assumir/resolver foram retirados: não representavam autenticação ou gravação reais. Não foi criado endpoint de escrita nem fabricado histórico persistente. A tela de detalhe consulta o registro e as leituras do backend. Autenticação de usuário, renovação de token, trilha de alterações, permissões e gravação de incidentes exigem seus respectivos contratos, caso façam parte de uma próxima etapa.

## Verificação

```bash
npm run typecheck
npm test
npm run format:check
npx expo install --check
npx expo export --platform android --platform ios --output-dir dist
```

Consulte `VALIDACAO.md` para resultados executados e limites. A compilação não substitui homologação da API, testes nativos e inspeção visual em aparelho.

## Referências oficiais

- https://reactnative.dev/docs/appstate
- https://docs.expo.dev/guides/environment-variables/
- https://docs.expo.dev/versions/v54.0.0/sdk/securestore/
- https://www.nativewind.dev/docs/getting-started/installation
