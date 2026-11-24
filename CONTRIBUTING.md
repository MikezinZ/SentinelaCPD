# Como contribuir com o SentinelaCPD

Obrigado pelo interesse! Este é um projeto acadêmico aberto (licença MIT). Sugestões, correções e melhorias são bem-vindas.

## Antes de começar

1. Leia o [README](README.md), principalmente **Como reproduzir o projeto** e **Limitações conhecidas**.
2. Abra uma *issue* descrevendo o problema ou a ideia antes de uma mudança grande.

## Rodando os testes

| Parte | Comando |
| --- | --- |
| Firmware (regras testáveis no PC) | `cd tests/firmware && for f in *.cpp; do g++ -std=c++17 -I../../firmware $f -o /tmp/t && /tmp/t; done` |
| Dashboard web | `cd web && npm ci && npm test && npm run build` |
| App mobile | `cd mobile && npm ci && npm test` |
| Plataforma de ponta a ponta | Com o Docker no ar e `DEMO_USERS=true`: `python tests/plataforma/teste_plataforma.py firmware.ino.bin` |

## Padrões

* **Commits:** [Conventional Commits](https://www.conventionalcommits.org/pt-br/) em português: `feat(api): ...`, `fix(firmware): ...`, `docs: ...`, `test: ...`.
* **Um assunto por commit**, com mensagem que diga *o que* mudou.
* **Nunca** envie `.env`, `firmware/config.h`, tokens ou senhas. Use os arquivos `*.example`.
* Mudou um contrato (tópico MQTT, JSON ou rota da API)? Atualize o README e os testes no mesmo pull request.
* Regras novas do firmware ficam em cabeçalhos testáveis no PC (como `TelemetryContract.h` e `RemoteOtaPolicy.h`), com teste em `tests/firmware/`.

## Segurança

Encontrou uma falha de segurança? Não abra uma issue pública: fale diretamente com a equipe pelo GitHub.
