# moneylog

Controle financeiro pessoal, em PWA mobile-first, com razão que sempre fecha em zero, cartões com fatura e parcelas,
dívidas, recebíveis de terceiros, metas, planejamento e importação de extrato.

[![ci](https://github.com/matheusmartinsviana/moneylog/actions/workflows/ci.yml/badge.svg)](https://github.com/matheusmartinsviana/moneylog/actions/workflows/ci.yml)
[![deploy](https://github.com/matheusmartinsviana/moneylog/actions/workflows/deploy.yml/badge.svg)](https://github.com/matheusmartinsviana/moneylog/actions/workflows/deploy.yml)
[![backend ci](https://github.com/matheusmartinsviana/moneylog-backend/actions/workflows/ci.yml/badge.svg)](https://github.com/matheusmartinsviana/moneylog-backend/actions/workflows/ci.yml)
[![frontend ci](https://github.com/matheusmartinsviana/moneylog-frontend/actions/workflows/ci.yml/badge.svg)](https://github.com/matheusmartinsviana/moneylog-frontend/actions/workflows/ci.yml)
[![codeql](https://github.com/matheusmartinsviana/moneylog-frontend/actions/workflows/codeql.yml/badge.svg)](https://github.com/matheusmartinsviana/moneylog-frontend/actions/workflows/codeql.yml)

![Java 21](https://img.shields.io/badge/Java-21-007396?logo=openjdk&logoColor=white)
![Spring Boot](https://img.shields.io/badge/Spring_Boot-4.1-6DB33F?logo=springboot&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)
![Angular](https://img.shields.io/badge/Angular-22-DD0031?logo=angular&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-mobile--first-5A0FC8?logo=pwa&logoColor=white)

Este é o repositório **principal**: documentação, decisões de arquitetura, infraestrutura, scripts de deploy e o
orquestrador de desenvolvimento. O código vive em dois repositórios independentes, ligados aqui como submódulos.

## Visão geral

| Pasta | Repositório | O que é |
|---|---|---|
| `backend/` | [`moneylog-backend`](https://github.com/matheusmartinsviana/moneylog-backend) | Spring Boot 4 (Java 21) + PostgreSQL + Flyway; contrato OpenAPI; Postgres local |
| `frontend/` | [`moneylog-frontend`](https://github.com/matheusmartinsviana/moneylog-frontend) | Angular 22 + PWA |
| `docs/`, `infra/`, `scripts/` | este | ADRs, planos, revisões, roteiros de deploy, Terraform/Caddy, scripts |

**Princípios.** Os cálculos financeiros ficam só no backend; o frontend exibe o que a API calcula. O contrato
`backend/contracts/openapi.yaml` é a fonte da verdade e o frontend mantém uma cópia sincronizada. A integridade do
razão é a regra mais importante do sistema.

## Começando

Requisitos: JDK 21, Node 24 / npm 11 e Docker Desktop (Postgres local e Testcontainers).

```bash
git clone --recurse-submodules https://github.com/matheusmartinsviana/moneylog.git
cd moneylog
./moneylog setup      # submódulos, hooks de commit, backend/.env e dependências do front
./moneylog up         # banco + backend (:8080) + frontend (:4200) em segundo plano
./moneylog status
./moneylog logs -f
./moneylog down
```

Comandos do orquestrador: `setup`, `up|down|restart [db|back|front|all]`, `status`, `logs [db|back|front|all] [-f]`,
`test [back|front|all] [--full]`, `contract [sync|check]`, `git <cmd>` (roda nos três repositórios) e `doctor`.
Detalhes no cabeçalho de `./moneylog`.

## Trabalhando em cada parte

Cada submódulo é um repositório normal, com histórico, CI, hooks e README próprios: dá para entrar em `backend/` ou
`frontend/` e usar `git`, `./mvnw` e `npm` direto, ou clonar só um deles.

**Fluxo de commits.** Commit em cada repositório que mudou, push dos submódulos primeiro e, por último, no
principal, que avança os ponteiros: `git add backend frontend && git commit -m "chore: atualiza submódulos"`.
Mensagens em Conventional Commits e sem linha de co-autor.

## Integração contínua

| Repositório | Workflows |
|---|---|
| principal | `ci` (varredura de segredos com gitleaks e validação do Terraform), `deploy` (manual: front, back ou ambos) |
| `moneylog-backend` | `ci` (`./mvnw verify` com Testcontainers, build da imagem Docker e varredura de segredos) |
| `moneylog-frontend` | `ci` (qualidade, typecheck, testes, build, varredura de segredos), `codeql`, `dependency-review` |

## Documentação

| Pasta | Conteúdo |
|---|---|
| `docs/adrs/` | decisões de arquitetura (plataforma, razão e dinheiro, topologia AWS, segurança, orçamentos, compra agrupada e outras) |
| `docs/planos/` | planos de trabalho com tasks e critérios Dado/Quando/Então |
| `docs/revisoes/` | revisões de plano e de código, com severidade e parecer |
| `docs/qa/` | relatórios de QA |
| `docs/operacao/` | deploy, backup e operação |

## Produção

`https://moneylog.mviana.tech` (EC2 + Cloudflare). Roteiro: `docs/operacao/deploy-gratis-aws.md`. Deploy do front:
`scripts/deploy-frontend.sh`; do backend: imagem no ECR e `instance-setup.sh app <TAG>` na instância.
