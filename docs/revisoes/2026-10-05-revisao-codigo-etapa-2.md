---
data: 2026-10-05
autor: revisor
alvo: código da Etapa 2 (T21 a T48), backend e frontend, working tree sem commits
referências: docs/planos/2026-10-04-etapa-2-contas-movimentacoes.md (S-56 a S-112), docs/revisoes/2026-10-04-revisao-plano-etapa-2.md, docs/revisoes/2026-10-04-revisao-codigo-etapa-1.md, docs/arquitetura/{dominio-financeiro,arquitetura}.md (D1/D2), ADR-001 a ADR-004, contracts/openapi.yaml, vault (BE 03/04/05/06/09, FE 01/02/05/06, PR 01)
fora do escopo desta revisão: os testes novos em backend/src/test/java/com/moneylog/qa (tester, em andamento) e src/util/api + dashboard do front (dev, em andamento). Os relatórios do Maven em backend/target foram lidos só como evidência.
---

# Revisão de código: Etapa 2 (auth, contas, categorias, movimentações, dashboard)

## 1. Resumo

**Não encontrei 🔴 nem 🟠.** Nenhum achado quebra produção hoje, expõe dado de outro usuário ou gera dupla contagem pelos caminhos que o plano cobre. O que sobrou são lacunas de robustez e de concorrência que convém fechar antes da Etapa 3, que reaproveita o mesmo núcleo.

**Backend.**

- _Auth (ADR-003):_ implementada como a ADR descreve. O refresh rotativo, a detecção de reuso com janela de 30 s, o commit da revogação mesmo com a resposta 401 (`TransactionalProxies.requiredCommittingOn`), o `Origin` em `refresh`/`logout`, o rate limit por IP com resolução segura de `X-Forwarded-For`, o hash fictício de mesmo custo no login e as guardas de partida (`JWT_SECRET`, hash BCrypt, cookie `Secure`) estão corretos e testados.
- _Integridade:_ edição e estorno passam por `TransactionEditing` e `TransactionVoiding`, `Transaction.voidTransaction` é package-private (M1 da Etapa 1 resolvido), o invariante do reembolso (S-81, S-89) está no domínio, a idempotência grava a chave na mesma transação com hash do comando canônico, e lista, `entries`, dashboard e saldo das contas saem do mesmo `FinancialRecords` e das mesmas calculadoras (S-79). Os ITs comparam valores literais (`22410.00`, `50.00`, `600.00`), não só "A = B".
- _Contrato:_ todo IT valida requisição e resposta contra `contracts/openapi.yaml`, e `ContractCoverageIT` confere os dois lados.
- _Fragilidades:_ as regras do reembolso são checadas por "ler e depois gravar" sem serializar (corrida entre duas requisições), o estorno em conta não falha fechado quando o contexto vem incompleto, o seed de categorias só roda na criação do dono, faltam índices em `ledger_postings` e `transactions` para as consultas que a Etapa 2 introduziu, e há entradas que ainda viram `500` (NUL em texto, datas extremas, `page` enorme), já reproduzidas pelo tester.

**Frontend.** As camadas estão respeitadas (`depcruise`: nenhuma violação em 262 módulos). O token fica só em memória, o interceptor repete a requisição uma vez e com um refresh compartilhado, o `returnUrl` é validado, nenhum valor de dinheiro é somado, convertido para `number` ou arredondado, os estados `loading`/`empty`/`error`/`ready` existem em todas as telas e as 3 línguas têm as mesmas chaves (testado). Os achados são de acabamento (🟡/🟢).

**Etapa 1.** C1, A1, A2, A3 e M1 a M6 foram de fato implementados (seção 3).

**Não executei** as suítes (o tester está escrevendo testes e há Docker/Testcontainers em uso). Dos relatórios em `backend/target`: 520 testes, 2 falhas, ambas nos ITs novos de QA (`SecurityMatrixQaIT`, `RobustnessQaIT`) e ambas descrevendo defeitos reais do código (achados B6 e B7).

## 2. Itens conformes

### Backend

- **Auth (ADR-003).**
  - JWT HS256 de 15 min validado pelo Resource Server (`SecurityConfig.java:83-90`), segredo ≥ 32 bytes sem imprimir o valor (`JwtSecret.java`), claim `sub` = `userId` lida por `CurrentUserArgumentResolver`.
  - Refresh opaco de 256 bits, só o SHA-256 no banco (`token_hash CHAR(64)`), `family_id`, `replaced_by`/`replaced_at`, FK composta do sucessor (`V2.01`).
  - A linha é travada com `FOR UPDATE` (`RefreshTokenRepositoryJpa.java:17-19`): duas requisições com o mesmo cookie se serializam e as duas recebem `200`.
  - Dentro de 30 s do rotacionamento: novo par na mesma família. Fora da janela: revoga a família e responde `401 REFRESH_INVALID` **com commit** (`AuthConfig.java:63-66`). Revogado por logout ou reuso: recusado sem tolerância.
  - Cookie `ml_refresh; HttpOnly; Secure; SameSite=Strict; Path=/v1/auth` (`RefreshCookies.java:29`); `CookieSecurityGuard` impede `secure=false` fora do perfil `dev` com origens locais.
  - `Origin` ausente ou fora da lista → `403 ORIGIN_NOT_ALLOWED`, sem rotacionar nem revogar (`OriginCheck.java`, `AuthController.java:76,88`).
  - Rate limit de 5 falhas por IP em 15 min, `429` com `Retry-After`; `X-Forwarded-For` só vale vindo de proxy confiável, lido da direita para a esquerda, sem resolver nome (`ClientIpResolver.java`).
  - Login com e-mail desconhecido compara com um hash fictício do **mesmo custo** do hash do dono (`BcryptPasswordVerifier.java:17-23`). Resposta idêntica.
  - Hash só no ambiente, aceito com aspas simples ou por arquivo; mensagem de erro nunca imprime o hash (`OwnerPasswordHash.java`).
  - O dono é a única linha de `users` e o e-mail é atualizado mantendo o `id` (`EnsureOwnerUseCaseImpl.java`).
  - Logs mascaram o e-mail (`OwnerBootstrap.java:45-51`). `.env` está no `.gitignore` e o `.env.example` não tem valor real.
- **Isolamento.** Todo gateway filtra por `userId` (`findByIdAndUserId`, `findByUserId`, consultas JPQL com `p.userId = :userId`). Referência de outro usuário (`accountId`, `categoryId`, `refundOfTransactionId`) vira `*_NOT_FOUND`. Existem FKs compostas `(id, user_id)` em todas as tabelas de negócio (`V2.00`) e nas novas (`V2.01`, `V2.04`).
- **Erros.** `GlobalExceptionHandler` devolve `ProblemDetail` com `code` e `traceId`, mapeia pela classe base (404/422/409), a invariante interna (`DomainException` direto) e o inesperado viram `500 INTERNAL_ERROR` sem mensagem interna, o `traceId` nunca vem do cliente (`TraceIdFilter.java:27`).
- **Edição e estorno.**
  - `UpdateTransactionUseCaseImpl` valida regra antes de gravar e grava na ordem linha (checagem de versão e lock) → revisão do estado anterior → postings antigos inativos (`EDIT`) → postings novos.
  - `TransactionRevisionGatewayImpl` converte `DuplicateKeyException` em 409.
  - `TransactionEntity.apply` sempre avança `updatedAt`, então o `@Version` incrementa mesmo numa edição idêntica e a numeração das revisões não colide.
  - O estorno recusa conta arquivada (S-73) e despesa com reembolso ativo (S-89).
  - `TransactionFlags` calcula `editable`, `voidable` e `voidBlockedBy` com a mesma regra.
- **Idempotência.** O `INSERT ... ON CONFLICT DO UPDATE ... WHERE <vencida>` serializa duas reivindicações no índice único (`IdempotencyGatewayImpl.java:26-35`). A chave sai no rollback, então erro não é memorizado. O hash é do comando canônico com os campos em ordem fixa, tamanho prefixado e `amount` com 2 casas (`CanonicalCommandHash.java`). Mesma chave com corpo diferente → `409 IDEMPOTENCY_KEY_REUSED`.
- **Caminho único (S-79).** `FinancialRecordsGatewayImpl.load` alimenta saldo das contas, lista, `entries`, dashboard e `upcoming`. `CashFlowReport.between` (com predicado) e `forAccount` fazem `totals.cashFlow` e `month.cashFlow`. O saldo inicial vem da linha de `accounts`, e **não** dos postings `ACCOUNT_OPENING` (que são uma cópia gravada e nenhuma leitura de produção usa), então não há dupla contagem. `totals.count` tem a definição única de S-80.
- **Migrações V2.00 a V2.04.** Constraints nomeadas, FKs compostas, índice parcial de nome de categoria ativa (`lower(name) WHERE NOT archived`), `idempotency_keys` única por `(user_id, scope, key)`, `transaction_revisions` única por `(transaction_id, revision)`. Só trocam constraints, sem apagar tabela ou linha.
- **Arquitetura.** `ArchitectureTest` verifica core sem framework, sem `double`/`float`, sem ciclos entre features, `*UseCaseImpl` só em `core.*.app`, entidade só em `infra.*.persistence`. Fronteira transacional em `infra/config` (BE 09), nenhuma chamada a relógio ou UUID aleatório no `core` (grep limpo). Gateways e mappers ficam em `infra/*/gateways`.
- **Testes.** Valores literais nas asserções, ITs com Testcontainers, matriz de segurança, conformidade de contrato nos dois sentidos, cenários do PR 01, concorrência de refresh e de idempotência. Não encontrei asserção tautológica.

### Frontend

- **Token só em memória.** Campo privado de `SessionFacade`, nenhum `localStorage`/`sessionStorage`/cookie escrito pelo JS (grep limpo; o único storage é idioma, tema e última conta, via `safe-storage`).
- **Interceptors.** Anexam `Bearer` só a `/v1/` da mesma origem e nunca a `/v1/auth/*`. O 401 faz **um** refresh compartilhado (`share()`), reaproveita o token se outra requisição já renovou, repete **uma** vez (`RETRIED_AFTER_REFRESH`) e só `refresh_invalid` limpa a sessão e vai para `/login`. Rede e 5xx não derrubam a sessão (S-93). A ordem `[unauthorized, auth]` faz a repetição levar o token novo.
- **`returnUrl`** passa por `safeReturnUrl` (rejeita `//`, `\`, esquema e caracteres de controle).
- **Dinheiro.** `Money` é `{ amount: string }` do começo ao fim. `formatMoney` e `parseAmountInput` só manipulam string e `Intl` (`Number()` só em datas e `Retry-After`). Totais, `impact`, flags e saldos vêm da API. A paginação de contas (`loadAll`) só concatena listas.
- **Estados e i18n.** Todas as páginas têm `loading`/`empty`/`error`/`ready`; `exhaustMap` nos envios; `switchMap` nos filtros; busca com `debounceTime`. `translations.spec` garante as mesmas chaves em pt/en/es, textos não vazios e sentence case; nenhum texto fixo em template (grep limpo).
- **Camadas.** `lint:deps` sem violação; HTTP só em `modules/*/infra`; `app.config.ts` é o único ponto que liga porta e implementação.
- **Mock só por configuração de build.** `ng build` usa a API real; o mock entra por `fileReplacements` em `mock` e `production-mock`.

## 3. Correções da Etapa 1 pedidas na revisão anterior: situação

| Item                                                       | Situação           | Evidência                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C1** mudança de dia perdia parcelas                      | ✅ Implementado    | `InvoiceChain` recusa item ou pagamento fora do calendário (`InvoiceChain.java:45-46,170-175`). Realocação como função pura em `BillingChange` (`reallocateInstallments`, `reallocateDated`, `keepPayment`) e orquestração em `CardBillingChanges.changeBillingDays`, que valida a cadeia antes e depois. Testes: `MudancaDeDiaQaTest`, `CardBillingChangesTest`. |
| **A1** reembolso ignorava parcelas canceladas              | ✅                 | `Transaction.chargedAmount()` e `validateRefundOrigin` usam o cobrado (`AccountTransactions.java:213-217`). Teste `ReembolsoComParcelasCanceladasTest`.                                                                                                                                                                                                           |
| **A2** alocação sem status da fatura                       | ✅                 | Não existe mais `byCalendar`: `CardTransactions.purchase` só aceita `InvoiceChain` e usa `forInstallments`; recorrência no cartão usa `realizeOnCard` (S-50).                                                                                                                                                                                                     |
| **A3** cadeia de outro cartão e data de fechamento inexata | ✅                 | `InvoiceChain` tem `cardId` e `ensureFor`; `requireChain` é chamado nas fábricas; `ensurePayable`/`ensureCanReceiveItem` exigem fechamento exato (`InvoiceClosingDateNotFoundException`).                                                                                                                                                                         |
| **M1** guarda de estorno aberta                            | ✅                 | `Transaction.voidTransaction` é package-private; `TransactionVoiding.voidTransaction` escolhe a guarda pelo tipo, valida a dívida **antes** de mudar a movimentação (`prepareVoid`/`applyVoid`). Ressalva em B3.                                                                                                                                                  |
| **M2** CHECK `due > closing` × clamp                       | ✅                 | S-77 no D1 (§2.5.1 regra 3) e `VencimentoDepoisDoFechamentoTest`.                                                                                                                                                                                                                                                                                                 |
| **M3** chave derivada da duplicata forçada                 | ✅                 | `original_dedup_key` em `V1.06`, `ExistingEntry`/`DuplicateClassifier` comparam as duas chaves; S-75 no D1.                                                                                                                                                                                                                                                       |
| **M4** `credit_card_billing_rules`                         | ✅                 | `closing_day`/`due_day` removidos de `credit_cards`; FK composta `(card_id, user_id)` (`V1.03`).                                                                                                                                                                                                                                                                  |
| **M5** reidratação                                         | ✅                 | `Transaction.restore`, `Debt.restore`, `RecurringTransaction.restore` com `*StateInconsistentException` (S-94); usada em `TransactionRepositoryMapper.toDomain`.                                                                                                                                                                                                  |
| **M6** S-49 a S-55                                         | ✅                 | Registradas no D1 §8 (linhas 417-423) com dono e tasks.                                                                                                                                                                                                                                                                                                           |
| 🟢 da Etapa 1                                              | ✅ em grande parte | descrição de dívida com limite (`Debt.DESCRIPTION_MAX_LENGTH`); arquivar com saldo em todas as datas (`Account.ensureArchivable`, S-92).                                                                                                                                                                                                                          |

## 4. Achados: backend

Nenhum 🔴 ou 🟠.

### 🟡 B1 · Regras do reembolso são "ler e depois gravar", sem serializar

- **Onde:** `AccountTransactionFactory.java:86-97` (`refundOrigin`: lê a original e `sumActiveRefundsOf` sem trava), `UpdateTransactionUseCaseImpl.java:72`, `VoidTransactionUseCaseImpl.java:59`.
- **Problema:** o teto do reembolso (S-9, S-81), o bloqueio do estorno da despesa com reembolso ativo (S-89) e a trava de categoria dependem de uma soma lida antes da gravação, em `READ COMMITTED`. Duas requisições concorrentes passam pelas duas checagens.
  - Dois reembolsos de 60 sobre uma despesa de 100: soma 120.
  - Estornar a despesa enquanto um reembolso é criado: reembolso ativo apontando para original estornada.
  - Editar o valor ou a categoria da despesa durante a criação de um reembolso.
- **Impacto:** consumo negativo na categoria (PR 01 caso 9). A janela é estreita (um usuário, duas abas ou aparelhos), mas é a regra mais cara da etapa, e a correção é barata.
- **Correção sugerida:** travar a linha da despesa original (`SELECT ... FOR UPDATE`, via `@Lock(PESSIMISTIC_WRITE)` no repositório) em `refundOrigin`, na edição e no estorno da despesa, antes de somar. Adicionar um IT concorrente (dois reembolsos em paralelo → um dá `422 REFUND_EXCEEDS_ORIGINAL`).

### 🟡 B2 · O seed de categorias só roda na criação do dono

- **Onde:** `OwnerBootstrap.java:34-38`, `CategorySeedListener.java:18-21`.
- **Problema:** `OwnerCreated` só é publicado quando a linha é inserida. Se o seed falhar (banco indisponível, erro de rede) o `ApplicationRunner` derruba o boot; na reinicialização o dono já existe, `created = false` e o seed **nunca mais roda**: o usuário fica sem categorias e sem forma de corrigir pelo app (as categorias de sistema não são criáveis pela API).
- **Impacto:** primeira execução quebrada de forma silenciosa depois do primeiro erro.
- **Correção sugerida:** chamar o `SeedSystemCategoriesUseCase` (já idempotente por `system_key`, S-59) em todo boot, não só na criação. Teste: criar o dono, apagar as categorias, reiniciar o contexto e esperar as 16.

### 🟡 B3 · Estorno em conta não falha fechado quando o contexto vem incompleto

- **Onde:** `TransactionVoiding.java:46-49`, `VoidContext.java:30-41`, `TransactionVoidPolicy.java:45-60`.
- **Problema:** no ramo "em conta", `context.accounts()` vazio e `activeRefunds == null` são tratados como "nenhuma conta arquivada" e "nenhum reembolso". Quem montar o `VoidContext.of(...)` sem `withAccounts`/`withActiveRefunds` (um futuro caso de uso, a Etapa 3 ou 4) estorna uma movimentação em conta arquivada ou uma despesa com reembolso ativo, sem erro. É o contrário do que o `VoidContextMissingException` faz para cartão e dívida.
- **Correção sugerida:** exigir as duas informações no ramo de conta (`VoidContextMissingException` se `accounts` não cobrir `accountId`/`counterpartAccountId`, e `activeRefunds` obrigatório para `EXPENSE`), ou construir o contexto de conta por uma fábrica que as receba como parâmetros. Teste: `voidTransaction` sem as contas → exceção.

### 🟡 B4 · Entradas ainda viram `500` (reproduzidas pelo tester)

- **Onde:**
  - texto com caractere NUL (`\u0000`) em `name`, `institution`, `description`, `notes`, `reason`: `TransactionHeader.optionalText` (`TransactionHeader.java:41-50`) e `Account`/`Category.requireName` só conferem tamanho; o Postgres recusa `0x00` e o erro vira `500 INTERNAL_ERROR`;
  - datas fora de qualquer faixa razoável (`0000-01-01`, `+999999999-12-31`) em `POST`/`PUT /v1/transactions` e na data de abertura da conta: passam por `@NotNull LocalDate`, o domínio aceita, e o `ck_ledger_postings_competence`/o driver falham;
  - `page=2147483647` em `GET /v1/transactions`: `TransactionGatewayImpl.java:91` faz `setFirstResult((int) page.offset())` e o `long` estoura o `int`. `PageQueryResolver.java:32` aceita até `Integer.MAX_VALUE`.
- **Impacto:** nenhum vaza dado (o `500` não traz mensagem), mas é erro de entrada respondido como falha do servidor, e o front mostra "algo deu errado" em vez de apontar o campo.
- **Correção sugerida:** rejeitar caracteres de controle (exceto quebra de linha em `notes`) na validação de texto (`400`/`422` com o campo); definir uma janela de datas no domínio (ex.: 2000-01-01 a 2100-12-31) com um `code` próprio; limitar `page` (ex.: máximo que mantém `offset ≤ Integer.MAX_VALUE`) e usar `Math.toIntExact` no `setFirstResult`.

### 🟡 B5 · Faltam índices para as consultas novas

- **Onde:** `V1.08` (índices em `ledger_postings`, linhas 43-45), `V1.06` (`transactions`), `LedgerPostingRepositoryJpa.java:24-36`, `TransactionRepositoryJpa.java:18-22`.
- **Problema:** `findByTransactions(userId, ids)`, chamada em todo `GET`/`PUT`/`void` e em toda página da lista, filtra por `transaction_id`, e nenhum índice cobre essa coluna (o `ix_ledger_postings_source` é `(source_type, source_id)`, sem `user_id` e sem uso aqui). `sumActiveRefundsCents` filtra `refund_of_id` e também não tem índice. Além disso `findAllOfTransactions` traz **todo** o histórico (ativos e inativos, inclusive as revisões de edição) em cada chamada do dashboard, da lista e da lista de contas.
- **Impacto:** varredura sequencial; custo cresce com o histórico. Hoje é imperceptível, em alguns anos de uso passa a pesar.
- **Correção sugerida:** `CREATE INDEX ... ON ledger_postings (user_id, transaction_id)` e `ON transactions (user_id, refund_of_id) WHERE refund_of_id IS NOT NULL` numa `V2.05`; registrar em D2 a decisão de carregar tudo (S-79) com um limite de revisão (ex.: medir com 100 mil lançamentos) e o plano de otimização.

### 🟡 B6 · Token sem `exp` é aceito

- **Onde:** `SecurityConfig.java:83-90`.
- **Problema:** o decoder só valida timestamps (`JwtTimestampValidator`), que passa quando `exp` não existe. O servidor sempre emite `exp`, então só um token assinado por quem tem o segredo explora isso, mas é uma defesa em profundidade que custa uma linha (já reproduzido como BUG-QA-03).
- **Correção sugerida:** acrescentar um `JwtClaimValidator` exigindo `exp`, `sub` e `iat` (e, se quiser, `iss`). O token de usuário que não existe no banco (BUG-QA-04) deve responder `401`, não `500` de FK: o `CurrentUserArgumentResolver` ou um filtro pode checar a existência do dono.

### 🟡 B7 · A sessão não tem validade absoluta e o refresh não é limpo

- **Onde:** `SessionOpener.java:31` (cada rotação ganha `now + 30 dias`), `refresh_tokens` (`V2.01`) sem rotina de limpeza.
- **Problema:** a janela é deslizante: uma família rotacionada a cada ≤ 30 dias vive para sempre, e um refresh roubado e rotacionado em silêncio (dentro da janela de 30 s, ou antes do dono voltar) também. As linhas expiradas e revogadas não são apagadas.
- **Correção sugerida:** guardar o início da família e recusar quando passar de um teto absoluto (ex.: 90 dias); um job simples apaga famílias expiradas há mais de N dias. Registrar na ADR-003, que hoje só cita a limpeza do rate limit.

### 🟡 B8 · Lista: página e totais vêm de duas leituras em `READ COMMITTED`

- **Onde:** `ListTransactionsUseCaseImpl.java:41-53` (carrega `FinancialRecords` e depois consulta a página); `application.yaml:11` (`TRANSACTION_READ_COMMITTED`); `TransactionConfig.java:101-107` (`readOnly`).
- **Problema:** se uma movimentação é gravada entre as duas leituras, `items` e `totals` descrevem estados diferentes (o rodapé não bate com as linhas).
- **Correção sugerida:** abrir os casos de uso de leitura que fazem mais de uma consulta (`ListTransactions`, `ListEntries`, `ListAccounts`) com `REPEATABLE_READ`/snapshot (`TransactionalProxies.readOnly` com isolamento). Sem custo para um usuário.

### 🟡 B9 · Editar uma movimentação com categoria arquivada falha mesmo sem mexer na categoria

- **Onde:** `AccountTransactions.java:46,61,154` (`requireCategory`), `AccountTransactionFactory.java:82-84`; regra S-70.
- **Problema:** a edição reconstrói a movimentação pelas mesmas fábricas da criação, que recusam categoria arquivada. Depois de arquivar "Impostos", não dá para corrigir a descrição, a nota ou o valor de nenhuma despesa antiga dessa categoria (`422 CATEGORY_ARCHIVED`), embora S-70 diga que as movimentações antigas continuam apontando para ela. O contornos é trocar de categoria.
- **Correção sugerida:** na edição, só exigir categoria ativa quando `categoryId` mudou (a regra "arquivada não recebe movimentação **nova**"). Decisão de Produto se preferir manter a recusa; nesse caso documentar no contrato e traduzir a mensagem para a tela de edição.

### 🟡 B10 · Contrato e comportamento divergem na busca `q`

- **Onde:** `contracts/openapi.yaml:478` ("sem diferenciar maiúsculas e acentos"); `TransactionFilter.java:50-56` e `TransactionGatewayImpl.java:131-134` só aplicam `toLowerCase`/`lower()`.
- **Problema:** buscar "cafe" não acha "Café". A busca em SQL e a em memória concordam entre si (por isso os totais batem), mas nenhuma normaliza acento, e o contrato promete isso.
- **Correção sugerida:** ou implementar nas duas pontas (extensão `unaccent` e `Normalizer` no domínio, mantendo a igualdade página × totais), ou corrigir o contrato e S-71 ("sem diferenciar maiúsculas; acentos contam").

### 🟡 B11 · O rate limit depende de configuração de deploy que não é verificada

- **Onde:** `application.yaml:64` (`trusted-proxies` vazio por padrão), `LoginRateLimiter.java:20` (mapa em memória sem teto de tamanho).
- **Problema:** atrás do CloudFront, com a lista vazia, todos os clientes aparecem com o IP do proxy: qualquer pessoa que erre 5 logins bloqueia o dono por 15 min (e o limite deixa de ser por cliente). A ADR registra, mas nada impede subir assim em produção.
- **Correção sugerida:** no perfil de produção, falhar a partida ou registrar um `WARN` alto se `trusted-proxies` estiver vazio; podar as chaves expiradas do mapa. Pendência do deploy (ADR-005).

### 🟢 Baixos

- `AccountViews.java:27` e `ListAccountsUseCaseImpl.java`: `records.ledger()` e `records.entries()` são reconstruídos **por conta** da página (até 50). Calcular o `Ledger` uma vez por requisição.
- Dashboard e `upcoming` aceitam `asOf`/`from`/`to` extremos sem limite (o tester cobre; mesmo tratamento de B4).
- `CookieSecurityGuard`/`OriginCheck` não validam o esquema das origens (`http://` em produção). Basta exigir `https` fora do perfil `dev`.
- `ADR-003 §7` cita `server.forward-headers-strategy=NATIVE`, mas o código resolve o IP manualmente e a propriedade não está no `application.yaml`. Ajustar a ADR ou a configuração.
- `categories.system` e `system_key` podem divergir no banco (`system_key NOT NULL` deveria implicar `system = TRUE`); um `CHECK` resolve.
- `TransactionVoidPolicy.java:28-32`: o Javadoc "Policy padrão dos tipos que só envolvem contas" ficou acima da constante `ACCOUNT_ARCHIVED`; mover.
- `LoginRequest.password` aceita até 200 caracteres e o BCrypt só lê 72 bytes: confirmar que `BCryptPasswordEncoder.matches` do Spring Security desta versão não lança exceção (o que viraria `500` sem contar no rate limit).
- Reidratação e ledger: os postings `ACCOUNT_OPENING` gravados em `ledger_postings` não são lidos em produção (só em `LedgerPersistenceIT`). Documentar que a fonte de leitura do saldo inicial é `accounts` (ou parar de gravá-los), para ninguém somar as duas.

## 5. Achados: frontend

Nenhum 🔴 ou 🟠.

### 🟡 F1 · O sinal e a cor do valor repetem regra financeira no front

- **Onde:** `app/features/transactions/transaction-flow.ts:13-47` (`flowOf`), usado em `records-table.component.ts:37`, `transaction-list-item.component.ts:92`, `transaction-detail.page.ts:99`.
- **Problema:** o front decide `+`, `−` ou neutro a partir do tipo, da direção e do filtro de conta, reimplementando S-63 (transferência é saída na origem e entrada no destino, aplicação é saída, etc.). Não altera valor, mas é uma segunda cópia da regra que o backend já entrega pronta em `impact.cash`: um ajuste de rendimento em conta de investimento aparece com `+` e o `impact.cash` é zero; uma regra nova no backend (Etapa 3) exige lembrar de mexer aqui.
- **Correção sugerida:** derivar o sinal de `impact.cash` (já é `Money` com sinal; `isNegative(money)` existe) e deixar a transferência neutra sem filtro e com sinal por conta só se o backend passar o efeito por conta. Se for preferível manter a heurística, cobrir o mapa com um teste de contrato contra o `impact` de cada tipo.

### 🟡 F2 · Faltam traduções para códigos de erro que o backend emite

- **Onde:** `app/common/i18n/translations/{pt,en,es}.ts` (`errors.codes`, linhas ~268-314), `problem-message.ts`.
- **Problema:** o fallback é só por status. Códigos que podem chegar à tela e caem em "algo deu errado" genérico: `TOO_MANY_ATTEMPTS` fora do login, `ORIGIN_NOT_ALLOWED`, `UNAUTHENTICATED`, `INVALID_RANGE`, `ACCOUNT_CURRENCY_NOT_SUPPORTED`, `CURRENCY_MISMATCH`, `*_TOO_LONG` e `*_REQUIRED` do domínio, `TRANSACTION_TEXT_TOO_LONG`, `MALFORMED_JSON`. Para `422` o genérico engana ("algo deu errado, nada foi alterado" para uma recusa de regra).
- **Correção sugerida:** acrescentar os códigos prováveis e, para `422` desconhecido, uma mensagem própria ("não foi possível salvar: verifique os dados") em vez da de indisponibilidade. Um teste que lê a lista de códigos do contrato e exige tradução dos que a tela pode receber.

### 🟢 Baixos

- `util/money-input.ts`: `1.500` em BRL é lido como mil e quinhentos (grupo de milhar) mesmo com a interface em inglês; um usuário que digita `1.500` querendo 1,5 erra por mil. O campo mostra o valor formatado, mas convém um aviso quando o texto tem ponto seguido de exatamente 3 dígitos e a interface não é pt.
- `TransactionFormFacade.submit` gera chave nova a cada envio; se a primeira tentativa tiver sucesso no servidor e a resposta se perder (timeout), editar e reenviar cria outra movimentação. O `retry()` cobre o caso de repetir sem editar; considerar manter a chave enquanto os dados não mudarem.
- Código de mock (`FAKE_SESSION`, ramos `useMocks`) vai para o bundle de produção, desligado por flag. Inofensivo, mas dá para tirá-lo com `fileReplacements` dos providers.
- A lista "vazia" não distingue "sem movimentações" de "nenhum resultado para os filtros"; mostrar "limpar filtros" no segundo caso.
- Single-flight do refresh entre abas (Web Locks) continua opcional (ADR-003 §5); o servidor já tolera a corrida com a janela de 30 s.
- O dashboard e `src/util/api` estão em ajuste pelo dev e ficaram fora desta revisão.

## 6. Riscos

- **Etapa 3 reaproveita o núcleo:** B1 (travas) e B3 (contexto de estorno) precisam estar fechados antes de cartão e fatura, que somam mais caminhos de estorno e reembolso.
- **Desempenho do carregamento único (S-79):** aceitável hoje; B5 e o limite de histórico viram um problema em anos de uso, não em semanas.
- **Operação:** B2 (seed) e B11 (proxy confiável) são falhas de configuração/primeira execução que só aparecem no deploy; precisam de verificação na partida.
- **Sessão:** B7 (validade absoluta) e a revogação de access token por até 15 min (consequência registrada na ADR) são aceitos para usuário único, mas devem entrar na reavaliação pré-deploy (TOTP, ADR-005).

## 7. Pendências por dono

| Dono        | Pendência                                                                                                                                                                                                                                                                         |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend     | B1 a B11 e os 🟢; B1, B2, B3 e B4 antes da Etapa 3; B5 numa `V2.05`                                                                                                                                                                                                               |
| Frontend    | F1 e F2; os 🟢 de acabamento                                                                                                                                                                                                                                                      |
| Produto     | B9 (editar movimentação de categoria arquivada: permitir ou não); B10 (busca com ou sem acento, S-71); teto absoluto da sessão (B7)                                                                                                                                               |
| Arquitetura | Atualizar ADR-003 (B7, `forward-headers-strategy`, validação do esquema das origens) e D2 (limite do carregamento único, índices); ArchUnit: acrescentar regra de que controllers não dependem de `infra.*.persistence`/`gateways` e de que nenhum `core` use `java.time.*.now()` |
| Tester      | Cobrir B1 (reembolsos em paralelo), B2 (reinício sem categorias), B3 (estorno com contexto incompleto) e a janela de datas (B4)                                                                                                                                                   |

## 8. Parecer

### Backend: 🟡 Aprovado com ajustes

A segurança da autenticação, o isolamento por usuário, a integridade do razão e o contrato estão sólidos e provados por testes que comparam valores literais. Não há 🔴 nem 🟠. O aprovado vem com ajustes porque a regra mais valiosa do domínio (o invariante do reembolso) ainda depende de uma leitura sem trava (B1), o estorno em conta não falha fechado (B3), o seed de categorias pode ficar permanentemente incompleto (B2) e há entradas que respondem `500` (B4). Nenhum bloqueia o merge desta etapa; B1 a B4 devem entrar antes da Etapa 3.

### Frontend: 🟡 Aprovado com ajustes

Segurança do token, interceptor, `returnUrl`, camadas, estados de tela e i18n estão corretos, e o front não calcula nenhum valor financeiro. Os ajustes são pontuais: tirar a regra de sinal do front (F1) e completar as traduções dos códigos de erro (F2). Não bloqueiam o merge.
