# moneylog

## Boas práticas (fonte da verdade)
Vault Obsidian: `/Users/matheusmartinsviana/Documents/Obsidian Vault/moneylog/`
- `00 - moneylog (Índice).md`: princípios gerais
- `produto/PR 00..03`: **requisitos de produto**. `PR 01` (integridade financeira) é a regra mais importante do sistema, e `PR 02` traz o MVP e a definição de pronto
- `design/DS 00..01`: direção de design do **Monelog** (marca, paleta, tipografia, voz, telas). Obrigatório para qualquer UI
- `backend/BE 00..09`: backend · `frontend/FE 00..10`: frontend

## Stack (ADR-001)
PWA mobile-first · backend **Spring Boot (Java 17+)** + **PostgreSQL** + Flyway · frontend **Angular** + `@angular/pwa` · IA via `AIService` no backend (`AI_PROVIDER`/`AI_API_KEY`/`AI_MODEL` no `.env`). Os cálculos financeiros ficam **só no backend**; o front exibe o que a API calcula.

## Repositórios (três, `backend/` e `frontend/` são submódulos)
- `moneylog` (este): docs, infra (Terraform/Caddy), scripts de deploy, `.claude/`, `docker-compose.prod.yml` e o orquestrador `./moneylog`.
- `backend/` → `moneylog-backend` (privado): Spring Boot, `docker-compose.yml` (Postgres local), `.env.example` e o **contrato** `contracts/openapi.yaml` (fonte da verdade).
- `frontend/` → `moneylog-frontend` (privado): Angular. Mantém uma **cópia** do contrato em `contracts/openapi.yaml`: mudou no backend, rode `./moneylog contract sync`.
- Cada repo tem histórico, CI, hooks e `README` próprios e pode ser clonado e codado sozinho. Clone completo: `git clone --recurse-submodules <url>` e depois `./moneylog setup`.
- **Commit é por repositório.** Mudança que cruza API e tela vira um commit no backend, um no frontend e, depois, um no principal que avança os ponteiros (`git add backend frontend`). Faça push dos submódulos **antes** do principal.
- `./moneylog up|down|status|logs|test|doctor` gerencia banco, backend e frontend sem sair daqui (logs em `.run/`). `./moneylog git <cmd>` roda um comando git nos três.

## Ambiente local
- JDK 21: `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` (o `java` padrão do PATH não funciona; o Maven do brew usaria o JDK 26). O `./moneylog` já usa esse caminho.
- Node 24 / npm 11. Docker Desktop é necessário para Testcontainers e Postgres local.
- Variáveis locais em `backend/.env` (copiado de `backend/.env.example`).
- Hospedagem alvo: AWS free tier (ADR-001). Em produção hoje: `https://moneylog.mviana.tech` (EC2 + Cloudflare); roteiro em `docs/operacao/deploy-gratis-aws.md`.

## Código sem comentários
- Não escreva comentários no código (Java, TypeScript, HTML, CSS, scripts): nomes e testes explicam. Exceção só para algo muito específico que o código não consegue dizer.
- Ficam as diretivas que fazem o código funcionar (`eslint-disable`, `prettier-ignore`, `@ts-expect-error`, `/// <reference>`). Migrações SQL já aplicadas não se editam (o Flyway valida o checksum).

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
