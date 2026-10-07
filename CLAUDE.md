# moneylog

## Boas práticas (fonte da verdade)
Vault Obsidian: `/Users/matheusmartinsviana/Documents/Obsidian Vault/moneylog/`
- `00 - moneylog (Índice).md`: princípios gerais
- `produto/PR 00..03`: **requisitos de produto**. `PR 01` (integridade financeira) é a regra mais importante do sistema, e `PR 02` traz o MVP e a definição de pronto
- `design/DS 00..01`: direção de design do **Monelog** (marca, paleta, tipografia, voz, telas). Obrigatório para qualquer UI
- `backend/BE 00..09`: backend · `frontend/FE 00..10`: frontend

## Stack (ADR-001)
PWA mobile-first · backend **Spring Boot (Java 17+)** + **PostgreSQL** + Flyway · frontend **Angular** + `@angular/pwa` · IA via `AIService` no backend (`AI_PROVIDER`/`AI_API_KEY`/`AI_MODEL` no `.env`). Os cálculos financeiros ficam **só no backend**; o front exibe o que a API calcula.

## Ambiente local
- JDK 21: `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` (o `java` padrão do PATH não funciona; o Maven do brew usaria o JDK 26).
- Node 24 / npm 11. Docker Desktop é necessário para Testcontainers e Postgres local.
- Hospedagem alvo: AWS free tier (ADR-001).

## Commits (regra fixa)
- **Nunca** adicionar `Co-Authored-By` nem qualquer linha de atribuição (nem de IA) em commits ou PRs.
- Sempre **Conventional Commits**: `<tipo>(<escopo opcional>): <descrição no imperativo, minúscula>`.
  Tipos: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. Breaking change: `!` ou rodapé `BREAKING CHANGE:`.
- Um commit por mudança lógica. Commit/push só quando o usuário pedir.

## Time de agentes (`.claude/agents/`)
| Agente | Papel | Escreve código? |
|---|---|---|
| `orquestrador` | Quebra a demanda em tasks (Dado/Quando/Então), define contrato, ordem e agente → `docs/planos/` | não |
| `revisor` | Revisa plano e código com severidade e parecer → `docs/revisoes/` | não |
| `dev-backend` | Implementa tasks de backend | sim |
| `dev-frontend` | Implementa tasks de frontend | sim |
| `tester` | Roda e escreve testes, reporta bugs → `docs/qa/` | só testes |

**Subagente não dispara subagente.** Quem orquestra a execução é a **sessão principal**, seguindo o plano:

```
1. orquestrador  → plano em docs/planos/
2. revisor       → revisa o PLANO   (🔴 reprovado → volta ao orquestrador)
3. dev-backend / dev-frontend → uma task por vez; tasks independentes em paralelo
4. revisor       → revisa o CÓDIGO da task (achados 🔴/🟠 → volta ao dev)
5. tester        → valida a task      (bug → volta ao dev)
6. sessão principal → resume para o usuário; commit só se pedido
```

Ao despachar um agente, passe sempre: caminho do plano, número da task e o que já foi feito.
Perguntas em aberto do plano (regras de negócio) vão para o usuário. Nenhum agente decide regra de negócio sozinho.

## Pastas de trabalho
`docs/planos/` · `docs/revisoes/` · `docs/qa/` · `docs/adrs/`
