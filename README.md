# moneylog

Controle financeiro pessoal (PWA mobile-first). Este é o repositório **principal**: docs, infra, scripts de deploy e o
orquestrador de desenvolvimento. O código vive em dois repositórios independentes, ligados aqui como submódulos.

| Pasta | Repositório | O que é |
|---|---|---|
| `backend/` | `moneylog-backend` | Spring Boot 4 (Java 21) + PostgreSQL + Flyway; contrato OpenAPI; Postgres local |
| `frontend/` | `moneylog-frontend` | Angular + PWA |
| `docs/`, `infra/`, `scripts/` | este | ADRs, planos, roteiros de deploy, Terraform/Caddy, scripts |

## Começando
```bash
git clone --recurse-submodules https://github.com/matheusmartinsviana/moneylog.git
cd moneylog
./moneylog setup      # submódulos, hooks de commit, backend/.env e dependências do front
./moneylog up         # banco + backend (:8080) + frontend (:4200) em segundo plano
./moneylog status
./moneylog logs -f
./moneylog down
```
Comandos: `setup`, `up|down|restart [db|back|front|all]`, `status`, `logs [db|back|front|all] [-f]`, `test [back|front|all] [--full]`,
`contract [sync|check]`, `git <cmd>` (roda nos três repositórios) e `doctor`. Detalhes no cabeçalho de `./moneylog`.

## Trabalhando em cada parte
Cada submódulo é um repositório normal: dá para entrar em `backend/` ou `frontend/` e usar `git`, `./mvnw` e `npm` direto,
ou clonar só um deles. O contrato `contracts/openapi.yaml` é do backend; o frontend mantém uma cópia
(`./moneylog contract sync`).

**Fluxo de commits.** Commit em cada repositório que mudou (Conventional Commits, **sem `Co-Authored-By`**), push dos
submódulos primeiro e, por último, no principal: `git add backend frontend && git commit -m "chore: atualiza submódulos"`.

## Produção
`https://moneylog.mviana.tech` (EC2 + Cloudflare). Roteiro: `docs/operacao/deploy-gratis-aws.md`. Deploy do front:
`scripts/deploy-frontend.sh`; do backend: imagem no ECR e `instance-setup.sh app <TAG>` na instância.
