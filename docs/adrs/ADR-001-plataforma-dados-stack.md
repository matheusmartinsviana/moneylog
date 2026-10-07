---
tags: [moneylog, adr, arquitetura]
status: aceito
data: 2026-10-03
---

# ADR-001: plataforma, dados e stack

↩ [[00 - moneylog (Índice)]] · [[PR 03 - Conflitos com o Design]]

## Contexto

Os requisitos de produto ([[PR 00 - Requisitos de Produto]]) pedem uma PWA mobile-first, com chave de IA só no backend. O brief de design ([[DS 00 - Direção de Design]]) sugere desktop-first, macOS-native e local-first, com o nome "Monelog".

## Decisão

| Tema       | Decisão                                                                                                                                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nome       | **moneylog**                                                                                                                                                                                                                                        |
| Plataforma | **PWA mobile-first**, instalável. A estética do brief (macOS calmo + lógica de planilha) é o visual da PWA. No desktop, layout de 3 colunas (sidebar, tabela, inspector). No mobile, navegação inferior (Início · Movimentações · + · Metas · Mais) |
| Dados      | **Backend próprio + PostgreSQL**, fonte única da verdade. "Local-first" do brief vira **cache offline do PWA** (service worker) + backup/export                                                                                                     |
| Backend    | **Java 17+ / Spring Boot**, Clean Architecture ([[BE 00 - Backend (Índice)]]), Flyway, Testcontainers                                                                                                                                               |
| Frontend   | **Angular** (standalone, signals, OnPush) + `@angular/pwa` ([[FE 00 - Frontend (Índice)]])                                                                                                                                                          |
| IA         | `AIService` abstrato no backend. `AI_PROVIDER`, `AI_API_KEY` e `AI_MODEL` vêm do `.env`. A tela de settings só mostra status e configuração, sem receber a chave pelo navegador                                                                     |
| Usuário    | Uso pessoal: um usuário, mas com autenticação real. As entidades têm `userId` desde o início, para não fechar a porta                                                                                                                               |

## Consequências

- Celular e desktop sincronizados naturalmente pelo backend.
- As regras de integridade financeira ([[PR 01 - Domínio e Integridade Financeira]]) moram no `core` do backend. O front **não recalcula** saldo nem compromissos: ele exibe o que a API calcula, e assim dashboard e transações nunca divergem.
- Offline: leitura via cache. Registro offline (fila no `/quick-add`) fica como evolução.
- Hospedagem e banco gerenciado ainda precisam ser escolhidos (custo × privacidade).

## Atualização (2026-10-03)

- **Vault de notas Markdown entra no MVP.** Notas financeiras em Markdown com backlinks e vínculo com transações, metas, pessoas e resumos mensais. Como os dados ficam no backend, o vault é armazenado no Postgres, com exportação/importação de uma pasta Markdown compatível com Obsidian.
- **Hospedagem: AWS, mirando o free tier.** Arquitetura enxuta: uma instância EC2 pequena (ou Lightsail) com Docker Compose, RDS PostgreSQL free tier (ou Postgres no próprio host), front estático em S3 + CloudFront, segredos no SSM Parameter Store. EKS está fora, porque custa caro. Revisar os limites do free tier da conta antes do deploy.
