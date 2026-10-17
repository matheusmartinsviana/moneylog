# moneylog

[![ci](https://github.com/matheusmartinsviana/moneylog/actions/workflows/ci.yml/badge.svg)](https://github.com/matheusmartinsviana/moneylog/actions/workflows/ci.yml)
[![deploy](https://github.com/matheusmartinsviana/moneylog/actions/workflows/deploy.yml/badge.svg)](https://github.com/matheusmartinsviana/moneylog/actions/workflows/deploy.yml)
![Java 21](https://img.shields.io/badge/Java-21-007396?logo=openjdk&logoColor=white)
![Spring Boot](https://img.shields.io/badge/Spring_Boot-4.1-6DB33F?logo=springboot&logoColor=white)
![Angular](https://img.shields.io/badge/Angular-22-DD0031?logo=angular&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)

Controle financeiro pessoal em PWA mobile-first: razão que sempre fecha em zero, cartões com fatura e parcelas,
dívidas, recebíveis de terceiros, metas, planejamento e importação de extrato.

Este repositório reúne a documentação de arquitetura, a infraestrutura e os scripts de deploy. O código está em dois
repositórios, ligados aqui como submódulos:

| Pasta | Repositório | O que é |
|---|---|---|
| `backend/` | [moneylog-backend](https://github.com/matheusmartinsviana/moneylog-backend) | API em Spring Boot e PostgreSQL |
| `frontend/` | [moneylog-frontend](https://github.com/matheusmartinsviana/moneylog-frontend) | PWA em Angular |

## Começando

Requisitos: JDK 21, Node 24 e Docker.

```bash
git clone --recurse-submodules https://github.com/matheusmartinsviana/moneylog.git
cd moneylog
./moneylog setup   # submódulos, hooks, backend/.env e dependências do front
./moneylog up      # banco, backend (:8080) e frontend (:4200)
```

Outros comandos: `status`, `logs [-f]`, `down`, `restart`, `test [back|front|all]`, `contract [sync|check]`, `doctor`
e `git <cmd>` (roda nos três repositórios).

## Documentação

| Pasta | Conteúdo |
|---|---|
| [`docs/adrs`](docs/adrs) | decisões de arquitetura |
| [`docs/arquitetura`](docs/arquitetura) | arquitetura, modelo de domínio e insights |
| [`docs/operacao`](docs/operacao) | deploy na AWS, backup e OIDC |
| [`infra`](infra) | Terraform e Caddy |
| [`scripts`](scripts) | deploy, backup e restauração |

## Contribuindo

Commits em Conventional Commits, um por repositório: primeiro o backend e o frontend, depois o principal avançando
os ponteiros (`git add backend frontend`). O contrato `backend/contracts/openapi.yaml` é a fonte da verdade e o
frontend mantém uma cópia (`./moneylog contract sync`).

## Produção

`https://moneylog.mviana.tech`. O roteiro de publicação está em
[`docs/operacao/deploy-gratis-aws.md`](docs/operacao/deploy-gratis-aws.md).
