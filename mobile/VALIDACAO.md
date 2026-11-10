# Validação da Fase 2 — 10/11/2026

## Resultados executados

| Verificação | Resultado |
|---|---|
| TypeScript `strict` + `noUncheckedIndexedAccess` | Aprovado |
| Testes automatizados | 12 aprovados, 0 falhas |
| Prettier | Todos os arquivos verificados aprovados |
| Compatibilidade Expo SDK 54 | Dependências atualizadas/compatíveis |
| Exportação Hermes Android | Aprovada |
| Exportação Hermes iOS | Aprovada |
| Busca por `any` explícito e comentários TODO | Nenhuma ocorrência no código do app/testes |

## Cobertura dos testes

1. URL base, codificação dos filtros e injeção de chave.
2. Ausência de chave e ID do detalhe somente na rota real.
3. Deadline do cliente, inclusive leitura lenta da chave e transporte que ignora cancelamento. O teste usa timeout reduzido e confirma a constante de produção de 10.000 ms.
4. AbortSignal externo antes e durante a chamada.
5. HTTP 503, falha de rede e JSON inválido.
6. Interceptação de mocks antes de credenciais e rede.
7. Sete cenários e validação de schema/semântica.
8. Serviços de incidentes, detalhe/404, filtros de telemetria, limite, datas e cadastro.
9. Formatação pt-BR, null versus zero, duração de incidente aberto e status inválido.
10. Timer de 5 s, pausa, aborto e retomada imediata no controlador de polling.
11. Descarte de resposta atrasada, flags e desmontagem.
12. Preservação do último sucesso em falha e limpeza de erro no retry.

Os testes de ciclo de vida exercitam o controlador puro utilizado pelo hook. A ligação com AppState foi compilada, mas não executada em ambiente nativo.

## Homologação pendente

Não foram disponibilizados URL/credenciais reais nem OpenAPI compatível com os novos tipos. Não houve chamada a um backend real. Caminhos e três contratos complementares estão explicitados no README.

Não foram executados simuladores/emuladores, APK/IPA, inspeção visual, VoiceOver/TalkBack ou SecureStore em aparelho. A exportação Hermes valida compilação e resolução de módulos; não demonstra funcionamento completo em dispositivo ou prontidão operacional de produção.

## Roteiro manual

- Instalar development build e testar todos os cenários pelo botão DEV.
- Conferir 38,5 °C, banner de dados antigos, valores `--`, lista vazia, retry/Offline e incidente em andamento.
- Alternar ABERTO/FECHADO rapidamente e trocar fonte/cenário durante uma busca; não deve aparecer resposta da seleção anterior.
- Minimizar por 20 s observando o servidor: nenhuma chamada deve ocorrer enquanto o app estiver inativo; ao retornar, a consulta deve ser imediata.
- Testar timeout, rede desligada, 401/403/503 e respostas JSON malformadas em servidor de homologação.
- Salvar/remover chave; fechar/reabrir o app; verificar persistência e precedência sobre a chave de ambiente.
- Confirmar rotas e schemas com OpenAPI; validar que um mock nunca substitui silenciosamente uma falha real.
- Testar fonte ampliada, orientação vertical, telas pequenas, leitor de tela e teclado.
