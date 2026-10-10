---
titulo: Plano mestre do MVP (ordem final, dependências entre etapas e o que é executável sem terceiros)
data: 2026-10-05
autor: orquestrador
status: plano para revisão; consolida os planos das Etapas 3 a 8, da etapa transversal "UI própria" e a Etapa 9 (fechamento)
tasks: T49 a T180 (Etapa 9: T175 a T180 detalhadas aqui)
planos:
  - docs/planos/2026-10-05-etapa-3-cartoes-faturas-parcelas.md       (T49–T72)
  - docs/planos/2026-10-05-etapa-4-dividas-pessoas-recorrencias.md   (T73–T90)
  - docs/planos/2026-10-05-etapa-5-metas-resumo-projecoes.md         (T91–T105)
  - docs/planos/2026-10-05-etapa-6-vault-notas.md                    (T106–T120)
  - docs/planos/2026-10-05-etapa-7-importacao-notificacoes.md        (T121–T138)
  - docs/planos/2026-10-05-etapa-8-ia.md                             (T139–T152)
  - docs/planos/2026-10-05-etapa-ui-propria.md                       (T153–T174)
  - Etapa 9 (fechamento): seção 6 deste documento                    (T175–T180)
anteriores:
  - docs/planos/2026-10-03-etapa-1-dominio-arquitetura.md  (T1–T20, concluída)
  - docs/planos/2026-10-04-etapa-2-contas-movimentacoes.md (T21–T48; E2E T44 em andamento por outro agente)
---

# Plano mestre do MVP

## 1. Objetivo

Dar a ordem final de construção do MVP completo do moneylog (PR 02), as dependências entre as etapas, o que cada agente pode fazer **em paralelo**, o que é **executável sem nenhum serviço externo** e o que fica **preparado atrás de uma abstração, documentado e não executado** por depender de terceiros (AWS, chave de IA real, push nativo no iPhone).

## 2. Quadro das etapas

Cobertura dos itens do MVP (PR 02): 1–8 Etapas 1 e 2 (concluídas); 9–11 Etapa 3; 12–13 Etapa 4; 14, 19, 20 Etapa 5; 21 Etapa 6; 16–17 Etapa 7; 18 Etapa 8; 15 (PWA) evolui em todas e fecha na Etapa 9. A etapa transversal "UI própria" não é item do PR 02: nasce do pedido do usuário de **nenhum controle nativo**.

| Etapa  | Conteúdo                                                                                   | Plano          | Tasks                                   | Nº      | Backend   | Frontend  | Tester/Revisor                          |
| ------ | ------------------------------------------------------------------------------------------ | -------------- | --------------------------------------- | ------- | --------- | --------- | --------------------------------------- |
| 1 e 2  | Domínio, contas, categorias, movimentações, dashboard v1                                   | planos 1 e 2   | T1–T48                                  | 48      | concluído | concluído | T44 (E2E) em andamento por outro agente |
| **UI** | Componentes próprios, guarda de controles nativos, revisão de UX, teclado                  | UI própria     | T153–T174                               | 22      | —         | 18        | 4                                       |
| **3**  | Cartões, faturas, parcelas, recorrência no cartão                                          | Etapa 3        | T49–T72                                 | 24      | 12        | 10        | 2                                       |
| **4**  | Pessoas, dívidas, divisão de despesa, recorrências                                         | Etapa 4        | T73–T90                                 | 18      | 9         | 7         | 2                                       |
| **5**  | Metas (reserva lógica), resumo mensal, projeções, exportação                               | Etapa 5        | T91–T105                                | 15      | 7         | 6         | 2                                       |
| **6**  | Vault de notas Markdown                                                                    | Etapa 6        | T106–T120                               | 15      | 7         | 6         | 2                                       |
| **7**  | Importação CSV/OFX e notificações                                                          | Etapa 7        | T121–T138                               | 18      | 10        | 6         | 2                                       |
| **8**  | IA atrás do `AIService` (funciona sem chave)                                               | Etapa 8        | T139–T152 (T141 em duas: T141a e T141b) | 15      | 10        | 3         | 2                                       |
| **9**  | Fechamento: imagem Docker, backup, PWA/offline, segurança, regressão, deploy **preparado** | este documento | T175–T180                               | 6       | 3         | 1         | 2                                       |
|        | **Total das etapas novas**                                                                 |                | **T49–T180**                            | **133** | **58**    | **57**    | **18**                                  |

(T153 e T172 são `dev-frontend`; a coluna `Tester/Revisor` conta também o revisor de T171 e T178. A Etapa 8 tem 14 números de task e 15 tasks porque T141 se divide em T141a e T141b.)

## 3. Dependências entre etapas

### 3.1 Matriz (linha depende de coluna; B = backend, F = frontend)

|          | E2 (concluída)         | UI                                                           | E3                                     | E4                                                             | E5                                                       | E6   | E7                             | E8              |
| -------- | ---------------------- | ------------------------------------------------------------ | -------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------- | ---- | ------------------------------ | --------------- |
| **UI**   | T44                    |                                                              | —                                      | —                                                              | —                                                        | —    | —                              | —               |
| **E3 B** | T44 (só T49/T50 antes) | —                                                            |                                        |                                                                |                                                          |      |                                |                 |
| **E3 F** | T44                    | **G-UI-E3** (T155, T156, T158, T159, T160, T163, T164, T166) | T49 (contrato)                         |                                                                |                                                          |      |                                |                 |
| **E4 B** | T44                    | —                                                            | T52 (mapper), T53 (handlers), T59, T60 |                                                                |                                                          |      |                                |                 |
| **E4 F** | T44                    | T156–T160, T163–T166                                         | T63 (`transactions`)                   | T73 (contrato)                                                 |                                                          |      |                                |                 |
| **E5 B** | T44                    | —                                                            | T59 (T94, T95)                         | T81 (T95, T96); T92 e T93 **não** dependem                     |                                                          |      |                                |                 |
| **E5 F** | T44                    | T156, T157, T159–T164, T166                                  |                                        |                                                                | T91 (contrato)                                           |      |                                |                 |
| **E6 B** | T44                    | —                                                            | T52 (alvos CARD/INVOICE)               | T74, T75 (PERSON/DEBT; `core.debt` não depende de recorrência) | T93 (GOAL); T107/T108 **não** dependem                   |      |                                |                 |
| **E6 F** | T44                    | T158, T164–T167                                              | telas (T118)                           | telas                                                          | telas                                                    | T106 |                                |                 |
| **E7 B** | T44                    | —                                                            | T53 (T126), T59 (T128)                 | T76 (T126), T81 (T128)                                         | T93, T94 (T128, T129); T122–T125 e T127 **não** dependem |      |                                |                 |
| **E7 F** | T44                    | T156, T157, T160, T163–T167                                  |                                        |                                                                |                                                          |      | T121 (contrato)                |                 |
| **E8 B** | T44                    | —                                                            |                                        | T79                                                            | T95, T96 (T144, T146, T147); T139, T140 **não** dependem |      | T124, T125 (T145), T129 (T147) |                 |
| **E8 F** | T44                    | T157–T159, T164, T166                                        |                                        |                                                                | telas (T151)                                             |      | telas (T151)                   | T139 (contrato) |
| **E9**   | tudo                   | T174                                                         | T72                                    | T90                                                            | T105                                                     | T120 | T138                           | T152            |

### 3.2 O que isso permite

- A **UI própria** é frontend puro e **não bloqueia** o backend da Etapa 3 (nem vice-versa): corre em paralelo.
- O **frontend da Etapa 3** espera só o **gate G-UI-E3** (8 componentes), não a etapa inteira.
- Há **tasks de backend de etapas posteriores sem dependência financeira** que podem antecipar o caminho crítico (§4.2): parsers e lote de importação (T122–T125), central de notificações (T127), domínio e persistência das notas (T106–T108, T111), domínio de metas (T92), porta e configuração da IA (T139–T140).
- As Etapas 4, 5, 6 e 7 só **leem** as calculadoras do `core.finance`; as únicas que **estendem** o razão são T78 (divisão de despesa) e T94 (`reserved`).

## 4. Ordem final de execução

### 4.1 Faixas (tracks)

| Faixa    | Agente                        | Tasks                                                                             | Observação                                            |
| -------- | ----------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **UI-F** | dev-frontend, tester, revisor | T153 → T154 → T155 → (T156…T167) → T168 → T169 → T170 → T171 → T172 → T173 → T174 | começa logo depois de T44; prioridade alta            |
| **E3-B** | dev-backend                   | T49 ∥ T50 → T51 → T52 → T53 → (T54 ∥ T56 ∥ T60) → T55 → (T57 ∥ T59) → T58 → T61   | em paralelo com UI-F                                  |
| **E3-F** | dev-frontend                  | T62 → T63 → T64 → (T65 ∥ T69) → (T66 ∥ T67 ∥ T71) → (T68 ∥ T70) → T72             | começa quando G-UI-E3 fecha                           |
| **E4-B** | dev-backend                   | T73 → T74 → T75 → (T76 ∥ T77) → T78; T79 → T80 → T81; T82                         | T75/T76/T79 esperam T52/T53/T60                       |
| **E4-F** | dev-frontend                  | T83 → T84 → T85 → T86; T87 → T88 → T89; T90                                       | depois de E3-F tocar `transactions` (T63)             |
| **E5-B** | dev-backend                   | T91 ∥ T92 → T93 → T94; T95 ∥ T96 ∥ T97; T98                                       | T92/T93 cedo; T95/T96 após E4-B (T81)                 |
| **E5-F** | dev-frontend                  | T99 → (T100 → T101) ∥ T102 ∥ T103 ∥ T104; T105                                    |                                                       |
| **E6-B** | dev-backend                   | T106 → T107 → T108 → (T109 → T110 → T112) ∥ T111; T113                            | T106–T108 e T111 cedo; T109 espera alvos              |
| **E6-F** | dev-frontend                  | T114 → T115 → T116 → T117 → T118; T119; T120                                      | T118 espera as telas das Etapas 3 a 5                 |
| **E7-B** | dev-backend                   | T121 → (T122 ∥ T123 ∥ T127) → T124 → T125 → T126; T128 → T129; T130; T131         | T122–T125 e T127 cedo; T126/T128/T129 esperam E3 a E5 |
| **E7-F** | dev-frontend                  | T132 → T133 → T134; T135 → T136; T137; T138                                       |                                                       |
| **E8-B** | dev-backend                   | T139 → T140 → T141a → (T141b ∥ T142) → T143; T144; T145 ∥ T146 ∥ T147; T148       | por último; T139/T140 cedo                            |
| **E8-F** | dev-frontend                  | T149 → T150 → T151; T152                                                          |                                                       |
| **FECH** | todos                         | T175 ∥ T176 ∥ T177 → T178 → (correções) → T179; T180                              | só depois de tudo                                     |

### 4.2 Marcos (gates) e o que cada um libera

Em vez de ondas rígidas, o orquestrador despacha pelo **grafo de dependências** de cada plano (§6 de cada um). Cada marco só vale com as tasks **mescladas e revisadas** (CLAUDE.md: revisão de código antes da task seguinte que depende dela). Recomendação de largura: até **2 dev-backend** e **2 dev-frontend** ao mesmo tempo, tester e revisor sob demanda.

| Marco                | Quando                       | Libera (backend)                                                                                                                                                                                                       | Libera (frontend)                                                                                                                                                                                         | tester / revisor                               |
| -------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **M0**               | T44 concluído (outro agente) | T49 ∥ T50 (documentos); T73 (contrato E4) logo em seguida                                                                                                                                                              | T153 → T154 → T155                                                                                                                                                                                        | revisor: planos das Etapas 3 e UI              |
| **M1**               | T49 + T50                    | T51 → T52                                                                                                                                                                                                              | —                                                                                                                                                                                                         | —                                              |
| **M2**               | T52                          | T53; T74 → T75; **qualquer hora depois de seus pré-requisitos, para ocupar vagas:** T91/T92/T93 (metas), T106/T107/T108/T111 (vault), T121–T125 e T127 (importação e central de notificações), T139/T140 (porta de IA) | **G-UI-E3** (T155, T156, T158, T159, T160, T163, T164, T166) é atingido por componentes em paralelo (T156 ∥ T157 ∥ T158 ∥ T159 ∥ T163 ∥ T167, depois T160 ∥ T166, depois T161 ∥ T164, depois T162 ∥ T165) | —                                              |
| **M3**               | T53                          | T54 ∥ T56 ∥ T60; T76 (depois de T75)                                                                                                                                                                                   | **G-UI-E3 fechado**: T62 → T63 → T64 … (Etapa 3 front)                                                                                                                                                    | —                                              |
| **M4**               | T60 + T73                    | T79 → T80                                                                                                                                                                                                              | T65 ∥ T69 → T66 ∥ T67 ∥ T71                                                                                                                                                                               | —                                              |
| **M5**               | T55 + T56                    | T57 ∥ T59 → T58; T77 → T78 (revisão de domínio obrigatória)                                                                                                                                                            | T68 ∥ T70; T168 → T169 (UI)                                                                                                                                                                               | **T61** (E3-B) ao fim de T58                   |
| **M6**               | T59 + T81                    | T94 ∥ T95 ∥ T96 ∥ T97 (E5); T109 → T110 → T112 (E6); T126, T128 → T129 → T130 (E7)                                                                                                                                     | **T72** (E3 E2E) → E4-F: T83 → T84 ∥ T87 → T85 ∥ T88 → T86 ∥ T89                                                                                                                                          | **T82** (E4-B), T170 → T171 → T172 (UI)        |
| **M7**               | T95 + T96                    | T98; T144 (insights); T145 ∥ T146 ∥ T147 (E8, depois de T141b/T143)                                                                                                                                                    | E5-F: T99 → T100 ∥ T102 ∥ T103 ∥ T104 → T101; E6-F: T114 → T115 → T116 → T117 → T118, T119                                                                                                                | **T90** (E4 E2E), **T98**, T173 → T174 (UI)    |
| **M8**               | E7-B (T126, T128–T130)       | T131 (tester), T113 (tester E6)                                                                                                                                                                                        | E7-F: T132 → T133 → T134, T135 → T136, T137                                                                                                                                                               | **T105**, **T120**, **T131**                   |
| **M9**               | E8-B (T145–T147)             | T148 (tester)                                                                                                                                                                                                          | E8-F: T149 → T150 → T151                                                                                                                                                                                  | **T138** (E7 E2E), **T148**                    |
| **M10**              | tudo anterior                | —                                                                                                                                                                                                                      | —                                                                                                                                                                                                         | **T152** (E8 E2E)                              |
| **M11 (fechamento)** | T152                         | T175 ∥ T176 ∥ T180                                                                                                                                                                                                     | T177                                                                                                                                                                                                      | T178 (revisor) → correções (T178b…) → **T179** |

Observações:

- **Contratos** (T49, T73, T91, T106, T121, T139) editam o mesmo `contracts/openapi.yaml`: são **só adições**, sempre com rebase, e cada um é escrito **uma etapa à frente** do backend que vai implementá-lo (para o contrato não apodrecer antes do código). Excepcionalmente T73 e T91 podem adiantar para destravar o frontend.
- **Pacotes (revisão 2026-10-05):** `ArchitectureTest` barra ciclos entre features do `core`. Casos de uso que tocam mais de uma feature (cartão×movimentação, dívida×razão, recorrência×movimentação, importação×movimentação) moram em `core/finance/app/<feature>/usecase`; só as portas ficam em `core/<feature>/app/gateways`. Vale para as Etapas 3, 4 e 7 (os planos já foram ajustados).
- Migrações por prefixo de etapa: `V3.*` (E3), `V4.*` (E4), `V5.*` (E5), `V6.*` (E6), `V7.*` (E7), `V8.*` (E8). Como as etapas se sobrepõem, **o Flyway local precisa de `out-of-order` em dev** (ou recriar o banco de dev ao puxar); antes do primeiro deploy as migrações continuam editáveis; depois dele, só novas.
- O **tester de cada etapa** (T61, T82, T98, T113, T131, T148) roda antes do E2E dela (T72, T90, T105, T120, T138, T152); bugs de integridade financeira **bloqueiam** o E2E e o frontend da etapa seguinte.
- Tasks de **preenchimento** (M2) só se encaixam se não conflitarem em arquivos com o que está em andamento (cada plano lista os conflitos em §6.3); na dúvida, fila.

### 4.3 Caminho crítico

`T44 → T49/T50 → T51 → T52 → T53 → T54 → T55 → T57 → T58 → T61` (E3-B) → `T75 → T76 → T78 → T81` (E4-B) → `T95/T96` (E5-B) → `T126/T128/T129` (E7-B) → `T145–T147 → T148` (E8-B) → `T152` → `T178 → T179`.
No frontend: `T153 → T154 → T155 → T156/T160/T164 → (G-UI-E3) → T62 … T72 → T83 … T90 → … → T151 → T152`.
O caminho crítico **do backend** é mais curto que o do frontend em quase todas as etapas; o gargalo é a fila de telas, por isso a UI própria é feita **primeiro** (o frontend não refaz tela depois) e os componentes são paralelizáveis (onda 3 e 4).

## 5. O que é executável sem serviços externos × o que fica preparado

### 5.1 Executável e testável localmente (nenhuma conta, chave ou domínio de terceiros)

| Item                                                                                                                                                                                                   | Como é provado                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Etapas 3 a 7 completas (cartões, dívidas, recorrências, metas, resumo, projeções, exportação, vault, importação CSV/OFX, central de notificações, lembretes, mensagem diária estática, job de geração) | Postgres descartável (Testcontainers/Docker local), backend real, front real, Playwright |
| UI própria, guarda de controles nativos, acessibilidade por teclado, WebKit (iPhone emulado)                                                                                                           | Playwright (Chromium e WebKit), axe, UI Kit                                              |
| Camada de IA inteira **sem chave**: `AIService`, privacidade, aprovação, aterramento, custo, registro, insights determinísticos, categorização por histórico                                           | `AI_PROVIDER=none` e `fake`; servidor HTTP falso local para o adaptador real             |
| Exportação CSV, backup JSON, exportar/importar zip do vault                                                                                                                                            | testes de integração e E2E                                                               |
| Imagem Docker e `docker compose` de produção local, backup/restauração do banco, PWA/offline, Lighthouse local, revisão de segurança (dependências, segredos)                                          | Docker local, Lighthouse CLI, `gitleaks`, `npm audit`, OWASP dependency-check            |
| Arquivos de CI/IaC (workflows, Terraform)                                                                                                                                                              | `actionlint`, `terraform fmt/validate` locais (sem aplicar)                              |

### 5.2 Preparado atrás de abstração, documentado e **não executado**

| Item                                                              | Abstração / o que fica pronto                                                                                                                                                                                                     | O que **não** é feito                                                      | Roteiro para o usuário                                                                                 |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Deploy na AWS** (CloudFront, S3, EC2, RDS, SSM)                 | ADR-005, Terraform e workflows **validados e não aplicados**, imagem Docker, `BackupStorage` com adaptador S3 testado contra fake, variáveis por ambiente                                                                         | criar recurso, aplicar Terraform, executar workflow de deploy, abrir conta | runbook `docs/operacao/deploy-aws.md` (T180)                                                           |
| **Chave de IA real**                                              | `AIService`, `LlmClient` (adaptador do provedor inicial), `FakeLlmClient`, servidor HTTP falso, orçamento, privacidade                                                                                                            | nenhuma chamada a provedor real                                            | `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL` no `.env`; roteiro de validação com chave (T148, T152)         |
| **Push nativo no iPhone/Android**                                 | `PushSender` (`NoopPushSender` padrão, `WebPushSender` VAPID testado com servidor falso), assinaturas, service worker (`push`, `notificationclick`), detecção de capacidade na UI, **central dentro do app como canal garantido** | enviar push real a um aparelho                                             | domínio HTTPS, chaves VAPID, PWA instalada (iOS 16.4+), ligar `moneylog.push.enabled`; roteiro em T137 |
| Atalhos do iOS/Android e `share_target`                           | manifest e deep links validados por teste                                                                                                                                                                                         | validar em aparelho                                                        | roteiro em T137                                                                                        |
| Extratos reais dos bancos                                         | amostras sintéticas e parsers tolerantes                                                                                                                                                                                          | aceitar formatos que o usuário não enviou                                  | enviar extratos anonimizados                                                                           |
| iPhone real e VoiceOver                                           | WebKit emulado, snapshot ARIA, axe                                                                                                                                                                                                | validação em aparelho/leitor real                                          | roteiros de T173 e T174                                                                                |
| E-mail/SMS, Open Finance, XLSX/PDF, Dream Board, score financeiro | fora do MVP (PR 02)                                                                                                                                                                                                               | —                                                                          | —                                                                                                      |

## 6. Etapa 9 — fechamento do MVP (preparado e não executado onde depende de terceiros)

Roda depois das Etapas 3 a 8 e da UI própria. Os itens que a definição de pronto do PR 02 pede e que nenhuma etapa cobre ficam aqui. Migrações: nenhuma obrigatória.

### T175 · dev-backend · Imagem Docker e perfil `prod`

**Objetivo:** empacotar o backend para produção e rodar localmente com `docker compose`.

**Arquivos/camadas:** `backend/Dockerfile` (multi-stage, `eclipse-temurin:21-jre-alpine`, usuário não-root, `-XX:MaxRAMPercentage=75`), `docker-compose.prod.yml` (backend + Postgres local), `application-prod.yaml`, logs estruturados (JSON) sem segredo, `actuator/health` só `liveness/readiness`, `README`.

**Critérios de aceite**

1. **Dado** `docker build`, **então** a imagem sobe com o perfil `prod`, roda como usuário não-root e responde `GET /actuator/health` `UP`; `docker compose -f docker-compose.prod.yml up` sobe backend + Postgres e a suíte de fumaça (login, criar conta, criar movimentação) passa.
2. **Dado** o perfil `prod`, **então** **não** sobe sem `JWT_SECRET` (≥ 32 bytes), `MONEYLOG_OWNER_*` e `DB_*`; swagger/`v3/api-docs` desligados (`404`), cookie de refresh `Secure`, `fake` de IA recusado, `push` só com chaves.
3. **Dado** `_FILE` para segredos (Docker secrets), **então** lê do arquivo e nunca imprime o valor.
4. **Dado** os logs, **então** nenhuma varredura encontra segredos, tokens ou `Authorization` (teste com sentinelas).
5. **Dado** o tamanho da imagem e o tempo de partida, **então** ficam registrados (meta: partida < 30 s).

**Depende de:** Etapas 3 a 8 (código estável); pode começar antes com o que existe e fechar no fim.

### T176 · dev-backend · Backup e restauração do banco (`BackupStorage`)

**Objetivo:** rotina de backup do Postgres com abstração de armazenamento e **prova de restauração**.

**Arquivos/camadas:** `scripts/backup.sh` e `scripts/restore.sh` (`pg_dump`/`pg_restore`), porta `BackupStorage` (`LocalDirBackupStorage` padrão; `S3BackupStorage` testado contra um S3 falso local), job opcional, teste de restauração em Testcontainers, `docs/operacao/backup.md`.

**Critérios de aceite**

1. **Dado** uma base com dados das Etapas 2 a 7, **quando** faço backup e **restauro numa base vazia**, **então** os saldos de todas as contas, o razão (soma zero), as faturas, as dívidas, as metas e as notas são **idênticos** (comparação por consultas).
2. **Dado** `S3BackupStorage` contra o S3 falso, **então** grava, lista, baixa e remove com prefixo por data; **sem credenciais** reais em nenhum teste; configuração só por variável de ambiente.
3. **Dado** retenção (7 diárias), **então** apaga só os backups antigos do prefixo do app.
4. **Dado** backup cifrado opcional (`BACKUP_ENCRYPTION_KEY`), **então** o arquivo não é legível sem a chave e a restauração com a chave certa funciona; chave errada falha sem corromper.
5. **Dado** o runbook, **então** descreve o RPO/RTO esperados e como restaurar passo a passo.

**Depende de:** Etapas 3 a 8.

### T177 · dev-frontend · PWA: offline, instalação, atualização e orçamento

**Objetivo:** fechar o item 15 do MVP (PWA) com qualidade verificável localmente.

**Arquivos/camadas:** `ngsw-config.json`, `src/app/common` (banner de offline, aviso de atualização, convite de instalação próprio, sem `beforeinstallprompt` cru), manifest, ícones/splash, `docs`.

**Critérios de aceite**

1. **Dado** offline, **então** o shell abre e cada tela mostra o último dado carregado **com marca de "desatualizado"** e "tentar de novo"; **nunca** apresenta dado financeiro em cache como atual (resposta `GET` com política de rede primeiro e carimbo); escritas offline **não** são enfileiradas no MVP (aviso claro).
2. **Dado** nova versão, **então** aviso próprio ("Nova versão disponível. Atualizar") e atualização sem perder formulário preenchido (confirmação).
3. **Dado** instalação, **então** convite próprio (Android/desktop) e instrução curta para iOS ("Adicionar à Tela de Início"); modo standalone, ícone, splash e `theme-color` corretos (já cobertos por `check-styles`).
4. **Dado** Lighthouse local (build de produção + `mock`), **então** PWA instalável, acessibilidade ≥ 95, desempenho ≥ 90 em perfil móvel; orçamento de bundle registrado e respeitado.
5. **Dado** logout, **então** o cache de dados financeiros é limpo (nenhum dado do usuário sobra no dispositivo).
6. **Dado** E2E `prod`, **então** a suíte de PWA passa em Chromium e WebKit.

**Depende de:** Etapas 3 a 8 e UI própria (T174).

### T178 · revisor · Revisão de segurança e privacidade (código, dependências e segredos)

**Objetivo:** parecer com severidade sobre o MVP inteiro, e abertura das tasks de correção.

**Arquivos/camadas:** `docs/revisoes/AAAA-MM-DD-revisao-seguranca-mvp.md`; correções entram como tasks de `dev-backend`/`dev-frontend` (sufixo `b`: T178b…).

**Critérios de aceite**

1. **Dado** o checklist (OWASP ASVS nível 1 adaptado a usuário único), **então** cobre: autenticação/refresh (ADR-003), CSRF por `Origin`, rate limit, isolamento por `userId` em **todas** as tabelas novas, validação de entrada (importação, vault, zip), injeção (SQL/CSV/fórmula/XSS/Markdown), XXE, upload, cabeçalhos (CSP, HSTS, `X-Content-Type-Options`, `frame-ancestors`), CORS, segredos, logs, backup e IA (privacidade, chave, prompt injection).
2. **Dado** `npm audit`, OWASP dependency-check (Maven) e `gitleaks` locais, **então** não há vulnerabilidade alta/crítica sem justificativa, nem segredo no repositório.
3. **Dado** cada achado, **então** tem severidade, onde, como reproduzir e sugestão; **críticos e altos** viram tasks obrigatórias antes de T179.
4. **Dado** o parecer, **então** termina com a lista do que não foi avaliado (infraestrutura AWS real, provedor de IA real, push real).

**Depende de:** T175, T176, T177 e Etapas 3 a 8.

### T179 · tester · Regressão completa, definição de pronto do PR 02 e volume

**Objetivo:** prova final do MVP contra o PR 02 e o PR 01.

**Arquivos/camadas:** `frontend/e2e/integration/mvp-acceptance.e2e.ts`, `backend/src/test/java/.../qa/MvpAcceptanceIT.java`, `docs/qa/AAAA-MM-DD-qa-mvp-final.md`.

**Critérios de aceite**

1. **Dado** os 21 itens do MVP e os 8 itens da definição de pronto (§36: mobile e desktop; vazio/loading/erro/validação; sem duplicar nem dupla contagem; sem IA; sem expor chave; feedback visual; consistência dashboard × transações; testes das regras críticas), **então** uma **matriz item × critério** é preenchida com a evidência (teste ou captura) de cada célula.
2. **Dado** os casos do PR 01 (os 9 da tabela), **então** cada um é reproduzido ponta a ponta com a UI e confere caixa, consumo, patrimônio e compromisso.
3. **Dado** o cenário do dono ("um mês de vida financeira": salário, contas, Pix, cartão parcelado, fatura paga, dívida, recorrências, meta, importação de extrato, nota vinculada, resumo, projeção, exportação, backup e restauração), **então** executa de ponta a ponta sem inconsistência entre telas.
4. **Dado** volume (10.000 movimentações, 24 meses, 5 cartões, 2.000 notas), **então** lista, dashboard, resumo e projeção respondem dentro do orçamento (p95 registrado e aceito; sem N+1) e o carregamento único (S-79) não estoura a memória do `t3.micro`/`t4g.micro` (medido com `-Xmx` da imagem).
5. **Dado** a revisão de UX da UI própria, **então** os achados médios/baixos pendentes (T172 CA2) são reavaliados com as telas das Etapas 3 a 8, em 375 px/WebKit e teclado.
6. **Dado** `AI_PROVIDER=none` **e** `fake`, **então** a matriz do item 1 passa nos dois modos.
7. **Dado** o relatório, **então** declara a lista final de **pendências do usuário** (§7) e libera o MVP para a revisão dele.

**Depende de:** T178 (e suas correções), T175–T177 e todas as etapas.

### T180 · dev-backend · Deploy na AWS **preparado e documentado** (não executado)

**Objetivo:** deixar tudo pronto para o usuário subir na AWS sem que nada seja criado agora.

**Arquivos/camadas:** `docs/adrs/ADR-005-topologia-aws-e-banco.md`, `infra/terraform/` (módulos: S3+CloudFront com OAC, EC2 com role/SSM, RDS ou Postgres no EC2, Security Groups restritos ao CloudFront, AWS Budgets), `.github/workflows/{ci.yml, deploy.yml}` (CI roda; `deploy.yml` é `workflow_dispatch` com aprovação manual e OIDC), `docs/operacao/deploy-aws.md`, inventário de variáveis (`.env.example` ↔ SSM).

**Critérios de aceite**

1. **Dado** o Terraform, **então** `terraform fmt -check` e `terraform validate` passam **localmente sem credenciais** e **nenhum** `apply` é executado; o plano de custo estimado (free tier vs. créditos, IPv4 público, RDS) está na ADR com os alertas de orçamento (o risco de custo do D2 §6).
2. **Dado** os workflows, **então** `actionlint` passa; o job de CI roda build/testes/`gitleaks`; o de deploy **não** dispara sozinho e exige aprovação; não há segredo no arquivo.
3. **Dado** a ADR-005, **então** decide RDS × Postgres no EC2 (com recomendação e alternativa), domínio único com CloudFront (sem CORS), cookie `SameSite=Strict`, `trusted-proxies` do rate limit (BUG-QA da Etapa 2), SSH desabilitado (SSM Session Manager).
4. **Dado** o runbook, **então** lista, em ordem, o que o usuário faz (conta AWS, domínio, certificado, parâmetros SSM, primeiro deploy, restauração de teste do backup, rollback) e cada comando que **ele** executa; marca explicitamente "não executado nesta etapa".
5. **Dado** `docs/operacao`, **então** o checklist de go-live inclui: trocar `JWT_SECRET`, definir senha do dono, validar HTTPS, ligar orçamento, testar backup/restore, validar PWA no iPhone, (opcional) ligar IA e push.

**Depende de:** T175, T176.

### 6.1 Dependências e ondas da Etapa 9

T175 ∥ T176 ∥ T177 ∥ T180 (documentos/arquivos, sem execução) → T178 (revisão) → correções (T178b…) → T179 (regressão final).

## 7. O que depende do usuário (consolidado)

1. **Validar as suposições** de maior impacto (§8) antes ou durante a execução; cada plano as lista com as tasks afetadas. Enquanto não responder, vale a opção conservadora registrada.
2. **Chave de IA** e escolha do provedor (Etapa 8); orçamento mensal de tokens.
3. **AWS:** conta, domínio, decisão RDS × Postgres no EC2, orçamento; executar o runbook (T180).
4. **Push nativo no iPhone/Android:** HTTPS real, chaves VAPID, PWA instalada, ligar a flag (T137).
5. **Extratos reais** (CSV/OFX anonimizados) para fortalecer os parsers (T131).
6. **Aparelhos reais:** validar em iPhone (Safari e PWA) e com VoiceOver (T173, T174, T179); atalhos do iOS/Android (T137).
7. **Decisões de produto abertas:** imagem nas metas (hoje fora, S-149); XLSX/PDF na importação (fora); Dream Board e score (pós-MVP); paleta de comandos e busca global (fora do MVP, viabilizadas por `Dialog`/`Combobox`); nome do usuário na mensagem diária (`displayName`).

## 8. Suposições novas de maior impacto (resumo)

Numeração: backend S-119 em diante; frontend FE-S-112 em diante. O texto completo e as tasks afetadas estão em cada plano.

| #             | Etapa | Suposição                                                                                                                                                                               | Se mudar                                                   |
| ------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| FE-S-112      | UI    | "Nenhum controle nativo" = proibir `select`, `details`, `type=date/month/checkbox/...`, `title`, `alert/confirm/prompt`, `<form>` sem `novalidate`; só texto, `textarea`, `button`, `a` | muda a lista do script e do teste de runtime (T154)        |
| FE-S-113      | UI    | Sobreposição própria, sem `@angular/cdk`                                                                                                                                                | só T155 muda                                               |
| FE-S-119      | UI    | Única exceção: `<input type=file>` escondido dentro do `FilePicker`                                                                                                                     | sem exceção, importação e vault não têm seletor de arquivo |
| S-121, S-122  | 3     | Compra no cartão só edita descrição/categoria/observação; estorno só enquanto nenhuma parcela está em fatura fechada (senão cancelar parcelas + reembolso)                              | T57                                                        |
| S-119         | 3     | Faturas persistidas com id determinístico e linha preguiçosa                                                                                                                            | ADR-006 (T50, T52, T58)                                    |
| S-124, S-136  | 3     | Prévias de compra e de pagamento vêm do backend; o front não calcula                                                                                                                    | T53, T55, T67, T68                                         |
| S-137         | 4     | Divisão de despesa e dívida de consumo (S-40) entram na Etapa 4                                                                                                                         | T78                                                        |
| S-139         | 4     | Recorrência editável só nos dados do modelo para ocorrências futuras                                                                                                                    | T79                                                        |
| S-147, S-148  | 5     | Meta é reserva lógica sem posting; reserva acima do saldo é aceita e sinalizada                                                                                                         | T92–T94                                                    |
| S-152         | 5     | Projeção determinística por compromissos; tendência opcional e desligada                                                                                                                | T96                                                        |
| S-157         | 6     | Vault no Postgres, com exportar/importar zip (não há "pasta local" em PWA)                                                                                                              | T106, T112                                                 |
| S-167, S-168  | 7     | Importação só cria `EXPENSE`/`INCOME`; transferência exige decisão; pagamento de fatura no extrato do cartão é rejeitado por padrão                                                     | T125, T126                                                 |
| S-173 a S-175 | 7     | Push preparado e desligado; central dentro do app é o canal garantido; geração idempotente e limite de 5 por dia                                                                        | T127–T130                                                  |
| S-181 a S-184 | 8     | IA só com prévia aprovada, dados redigidos e minimizados, registro de cada análise, números aterrados                                                                                   | T141a, T141b, T144                                         |
| S-185         | 8     | Provedor inicial `anthropic`; `none` padrão                                                                                                                                             | T143                                                       |

## 9. Riscos transversais

| Risco                                                                                                                                                  | Impacto                    | Mitigação                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- | ---------------------------------------------------------------------------------------------------- |
| Sobreposição de etapas editando os mesmos arquivos (`contracts/openapi.yaml`, `FinancialRecordsGatewayImpl`, `TransactionInput`, `i18n`, `tokens.css`) | conflitos de merge         | só adições; rebase; ordem de merge fixada nos planos; contratos uma etapa à frente                   |
| Escopo grande (133 tasks)                                                                                                                              | cronograma                 | paralelismo por faixas (§4), gates mínimos (G-UI-E3), tarefas cedo sem dependência financeira (§3.2) |
| Dupla contagem entre fontes (parcela × fatura × recorrência × dívida × importação)                                                                     | número errado no dashboard | matrizes de não dupla contagem (T59, T81, T126, T131), propriedade por etapa, regressão final (T179) |
| UI própria atrasar o frontend                                                                                                                          | telas paradas              | backend corre em paralelo; gate mínimo; componentes em paralelo                                      |
| Dependência de terceiros bloquear o aceite                                                                                                             | MVP "incompleto"           | tudo atrás de abstração e testado com fakes; pendências listadas (§7)                                |
| Suposições erradas                                                                                                                                     | retrabalho                 | opções conservadoras, cenários em factories, migrações editáveis até o primeiro deploy               |
| Migrações em paralelo (Flyway fora de ordem)                                                                                                           | banco de dev quebrado      | prefixo por etapa e `out-of-order` em dev (§4.2)                                                     |
| Segredos/IA/privacidade                                                                                                                                | exposição de dados         | T141b, T148, T178                                                                                    |

## 10. Fluxo de trabalho por etapa (CLAUDE.md)

1. `orquestrador`: o plano da etapa (já escritos) → 2. `revisor` revisa **o plano** (🔴 volta ao orquestrador) → 3. `dev-backend`/`dev-frontend`, uma task por vez, independentes em paralelo (a **sessão principal** despacha: subagente não dispara subagente) → 4. `revisor` revisa o **código** da task (🔴/🟠 voltam ao dev) → 5. `tester` valida a task/etapa (bug volta ao dev) → 6. a sessão principal resume ao usuário; **commit só quando o usuário pedir** (Conventional Commits, sem linha de atribuição de IA, regra do `CLAUDE.md`).
   Ao despachar, passar sempre: caminho do plano, número da task e o que já foi feito.

---

## Registro de execução: T177 (parcial) e contrato 2.10.0 (2026-10-07)

- **Concluído:** orçamento do bundle inicial. De 532,25 kB para **498,53 kB** (limite de aviso 500 kB, erro 1 MB), sem aviso no `ng build`.
- **Como:** providers de infra usados por uma única área saíram de `app.config.ts` para `src/app/lazy-providers.ts`, ligados em `providers` da rota lazy de cada feature (import, planning, settings, home, goals, notes, vault, debts, people, quick-add). Ficaram globais os do shell ou de várias áreas (auth, accounts, cards, categories, transactions, notifications, ai, reports, search).
- **Regra nova:** `lazy-providers.ts` entra na exceção S-31 do `.dependency-cruiser.cjs`. Facade nova que use uma porta movida fora das rotas listadas precisa da rota adicionada a `lazy-providers.ts`.
- **Contrato 2.10.0:** `applyFailureOf` lê `problem.position` e `problem.cause` (`cause` desconhecida vira `OTHER`, `position` ausente vira `null`); o regex sobre `detail` ficou só como fallback.
- **Pendente em T177:** banner de offline com marca de desatualizado (CA1), aviso de nova versão (CA2), convite de instalação e instrução iOS (CA3), Lighthouse local (CA4), limpeza do cache no logout (CA5) e suíte E2E de PWA (CA6) não foram feitos nesta rodada.

## Registro de execução: T177 (conclusão do PWA, 2026-10-07)

- **Feito:** `PwaService` (`common/services`) e `app-pwa-notices` no shell: banner de offline (honesto: o que já carregou segue na tela, pode estar desatualizado, salvar exige estar online; nada é enfileirado), aviso de nova versão com "Atualizar" atrás de confirmação (recarrega; o que não foi salvo se perde) e convite de instalação (Android/desktop via `beforeinstallprompt`; iOS Safari com a instrução de "Adicionar à Tela de Início"), dispensável com memória em `localStorage` protegida por try/catch. i18n pt/en/es em `pwa.*`.
- **Logout:** `clearPrivateCachesHook` apaga do Cache Storage tudo que não é `ngsw:` nem `moneylog-prefs`. Hoje o `ngsw-config` não cacheia a API, então é rede de segurança. Logout forçado por 401 não passa pelos hooks.
- **Desvio do CA1:** não há cache de respostas `GET` no service worker (nem marca de "desatualizado" por tela); o dado antigo é só o que já está em memória na tela. Cache de leitura com carimbo exigiria `dataGroups` e decisão de produto.
- **Bundle inicial:** conferido no `ng build` (ver saída); sem aviso acima de 500 kB.
- **Ainda pendente:** Lighthouse local (CA4) e suíte E2E de PWA (CA6), por pedido de modo rápido.

## Registro de execução: Etapa 9, T175, T176 e T180 (2026-10-07)
- **T175:** `backend/Dockerfile` (multi-stage, `eclipse-temurin:21-jre-alpine`, uid 10001, `MaxRAMPercentage=75`, `postgresql17-client`), `application-prod.yaml` (logs ECS/JSON, swagger/api-docs off, probes, segredos por `configtree` em `SECRETS_DIR`), `docker-compose.prod.yml` sem segredos. Provado: `docker build` OK; compose sobe backend + Postgres; `/actuator/health` UP, `/v3/api-docs` e swagger 404, cookie `Secure`, `id` = 10001; login, criar conta e criar despesa (saldo 974,50) OK; sentinelas de senha/JWT/token não aparecem nos logs. Imagem 429 MB; partida 5,3 a 6,3 s (meta < 30 s).
- **T176:** porta `BackupStorage` (`core.backup.app`), `LocalDirBackupStorage`, `S3BackupStorage` (SigV4 em JDK puro, sem SDK; testado contra S3 falso, sem credencial real), credenciais por ambiente ou IMDSv2, cifra AES-256-GCM, retenção de 7 dias só no prefixo, `PgDumpCommand`, job desligado por padrão, `scripts/backup.sh` e `restore.sh` (shellcheck limpo), `docs/operacao/backup.md`. `BackupRestoreIT` restaura numa base vazia e compara saldos, razão (soma 0) e hash de todas as tabelas. Job rodou de verdade na imagem (pg_dump + cifra, `read_only`).
- **T180:** ADR-005 (proposta), `infra/terraform/` (`fmt -check` e `validate` OK via `hashicorp/terraform:1.9` em Docker; nunca `plan`/`apply`), `.github/workflows/ci.yml` e `deploy.yml` (`actionlint` limpo; deploy manual com Environment aprovado e OIDC), `docs/operacao/deploy-aws.md` com o checklist de go-live (TOTP/2FA, HTTPS, `unaccent` com papel dono, log de query string, `trusted-proxies`, VAPID, IA).
- **Desvios:** Terraform em arquivos de um módulo raiz (não submódulos); RDS provisionado, Postgres na EC2 fica como alternativa na ADR; teste de varredura de logs foi manual (sentinelas), sem teste automatizado; restore de dump cifrado fora do app não tem CLI.
- **Não executado:** `terraform plan/apply`, `deploy.yml`, S3/IMDS/CloudFront reais, restauração em RDS.

## Registro de execução: guia de deploy barato na AWS (2026-10-10)
- **Feito:** `docs/operacao/deploy-gratis-aws.md` (tabela grátis x crédito x cobra, custo e meses de crédito por arquitetura A/B/C/D, deploy de front e back, checklist de segurança, zerar/restaurar/levar dados locais, fontes a conferir). Recomendação: A (S3 + CloudFront + 1 EC2 com compose, sem RDS), ~US$ 12 a 14/mês, ~7 a 8 meses com US$ 100.
- **Terraform (aditivo):** `database_mode = "ec2"|"rds"` (padrão `ec2`), `instance_type` com detecção de ARM, domínio/ACM opcionais (URL `*.cloudfront.net`), EIP, volume EBS de dados + DLM, grupo de logs, política de cabeçalhos própria (HSTS e CSP opcional), Budgets por uso bruto. `user_data` gera compose e `deploy.sh` com health check e rollback automático. `fmt -check` e `validate` OK via Docker; templates renderizados e checados nos dois modos; nada de `plan`/`apply`.
- **Scripts:** `deploy-frontend.sh` (`--dry-run`, `--print-csp`), `deploy-backend.sh` (`--dry-run`, `--rollback`, `--print-trusted-proxies`), `reset-database.sh` (confirmação digitando o ambiente, dump de segurança, só na instância). `shellcheck` limpo. Sem `aws` CLI local: sync/SSM/ECR/CloudFront não exercitados.
- **Desvios:** SPA por CloudFront Function e não por `custom_error_response` (esta valeria também para `/v1/*`); `user_data` ficou no Terraform (sem `scripts/user-data.sh` duplicado); `deploy.yml` não foi alterado (x86 e desenho com RDS).
- **Pendente:** TOTP/2FA (bloqueio de go-live), HTTPS na origem CloudFront -> EC2 (exige domínio próprio e proxy), CLI para abrir backup cifrado, CSP validada em navegador, preços conferidos no console.

