---
tipo: revisão de código
etapa: 4 (pessoas, dívidas, divisão de despesa, dívida de consumo, recorrências) - backend, tasks T73 a T81
data: 2026-10-07
revisor: revisor
escopo: backend/src/main (core/debt, core/recurrence, core/transaction/domain Debt*/ExpenseShare/TransactionVoiding, core/finance app+domain, handlers, infra/debt, infra/person, infra/recurrence, infra/dashboard, infra/finance), contracts/openapi.yaml 2.2.0, migrações V4.00 a V4.02
referências: plano da Etapa 4, revisão dos planos 3-9, D1 (§2.6, §2.6.1, §2.7, §2.8, §8.4 S-222 a S-233), D2, PR 01 (casos 6, 7, 8 e tabela), revisões e QAs anteriores
parecer: aprovado com ajustes (nenhum 🔴; 2 🟠 a corrigir antes do merge)
nota: T82 (tester) roda em paralelo; mudanças em backend/src/test/**/qa/* foram ignoradas
---

# Revisão do código do backend da Etapa 4

## 1. Resumo

A integridade financeira está correta e **contada uma vez só** em todos os cenários que o PR 01 exige. O motivo é estrutural e bom: dívida, divisão e consumo de dívida não têm cálculo próprio, tudo vira `ledger_postings` por fábricas de domínio (`DebtTransactions`, `AccountTransactions.expenseWithShares`, `Debt.recognitionEntries`), e todas as lentes (caixa, consumo, patrimônio, compromissos, lista, dashboard) leem o mesmo razão. O status da dívida e a "ocorrência realizada" são **derivados** (quitações ativas e movimentações ativas com `recurrence_id`), nunca gravados: estornar a quitação ou a realização devolve o estado sozinho (S-41, S-49), sem caminho de dessincronização.

Não encontrei 🔴. Há **dois 🟠**, ambos em recorrências (número errado em tela depois de "encerrar"; realizar ocorrência de recorrência desativada), nenhum no razão. Os 🟡 são lacunas de contrato, de constraint e de robustez.

**Como verifiquei.** Reli o código completo de T73 a T81 e refiz por conta, pelos postings das fábricas, os cenários abaixo. Rodei `ArchitectureTest` e `ExpenseWithSharesTest` (verdes). **Não rodei os ITs com Postgres** (o T82 usa o mesmo `target/` em paralelo); a análise de concorrência é por leitura das travas. O repositório não tem commits, então **não consegui fazer diff estrutural do contrato**: a análise das alterações não aditivas é por leitura (item 6).

### Cenários refeitos (caixa / consumo / patrimônio / compromisso)

| Cenário                                                | Postings                                                                                                       | Caixa | Consumo        | Patrimônio             | Compromisso                       | Resultado                                             |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ----- | -------------- | ---------------------- | --------------------------------- | ----------------------------------------------------- |
| Emprestar 300 (caso 6)                                 | `RECEIVABLE +300 / ACCOUNT −300` (`DebtTransactions.withNewDebt`)                                              | −300  | 0              | 0 (recebível compensa) | `DEBT_RECEIVABLE` IN na previsão  | conforme                                              |
| Devolução 300 (caso 7)                                 | `ACCOUNT +300 / RECEIVABLE −300`, sem `INCOME`                                                                 | +300  | 0              | 0                      | some                              | conforme (não é renda)                                |
| Eu devo 200 sem movimentação (caso 8)                  | `PAYABLE −200 / EQUITY +200`                                                                                   | 0     | 0              | −200                   | `DEBT_PAYABLE` OUT (ou `undated`) | conforme                                              |
| Captação 500                                           | `ACCOUNT +500 / PAYABLE −500`                                                                                  | +500  | 0              | 0                      | OUT                               | conforme (não é renda, S-6)                           |
| Pagar dívida 200                                       | `PAYABLE +200 / ACCOUNT −200`                                                                                  | −200  | 0              | 0                      | cai 200                           | conforme (não duplica o consumo de dívida de consumo) |
| Despesa dividida: Pix 200, 100 do João                 | `EXPENSE +100 / RECEIVABLE +100 / ACCOUNT −200` (`sharedExpense`: consumo = `amount − Σ partes`)               | −200  | +100           | −100                   | cobrança IN 100                   | conforme                                              |
| João paga 100                                          | `ACCOUNT +100 / RECEIVABLE −100`                                                                               | +100  | inalterado     | 0                      | some                              | conforme (não é receita)                              |
| Jantar de 80 pago pelo amigo (`PAYABLE` com categoria) | `EXPENSE(cat) +80 / PAYABLE −80` (origem `DEBT_RECOGNITION`)                                                   | 0     | +80            | −80                    | OUT                               | conforme; aparece em `debtItems` e no total           |
| Reembolso de despesa dividida                          | teto = valor − Σ dívidas de origem (`HandlerSupport.refundOrigin:123-127`)                                     |       | nunca negativo |                        |                                   | conforme                                              |
| Estorno da despesa dividida                            | guardas da despesa e de **cada** dívida antes de mudar qualquer coisa (`TransactionVoiding.voidSharedExpense`) |       |                |                        | dívidas `VOIDED`                  | conforme                                              |

## 2. Itens conformes

- **Dupla contagem (PR 01).** Nenhuma movimentação de dívida toca `EXPENSE`/`INCOME`. A despesa dividida é uma só movimentação com origem das dívidas, e o `EXPENSE` posta só a parte do usuário. A dívida de consumo posta consumo uma vez, no reconhecimento; pagar depois move só `PAYABLE`/`ACCOUNT`. `CashFlowReport` filtra `source = TRANSACTION`, então dívida sem movimentação nunca entra no caixa. `ConsumptionReport` e `EntryReport` fecham com `month.consumption` (a linha de dívida de consumo entra em `total`/`byCategory` e vem em `debtItems`).
- **Divisão.** Parte > 0, `Σ partes < valor` (`!total.isLessThan(amount)`), moeda igual, pessoa do usuário e ativa, duas partes à mesma pessoa viram duas dívidas, até 20 partes (`@Size(max = 20)` na entrada). Sem arredondamento no backend: o cliente informa o valor de cada parte em centavos e o consumo é `amount − Σ`, então o centavo que sobra é sempre do usuário e nada é calculado em ponto flutuante. Sem overflow possível: 20 × 13 dígitos cabem em `long`, e `Money.add` usa `addExact`.
- **Estorno (`TransactionVoiding`, caminho único).** Origem com quitação ativa → `DEBT_HAS_SETTLEMENTS`; dívida perdoada → `DEBT_CLOSED` (origem e quitação); `prepareVoid` e `ensureCanVoidTransaction` rodam **antes** de `applyVoid`, então a recusa não deixa estado parcial; quitação estornada só devolve o status (derivado); `TransactionFlags.ofDebt/ofShares` reusam as mesmas regras (`DebtVoidRules`), então `voidable`/`voidBlockedBy` não divergem do `POST /void`. Realização estornada reabre a ocorrência: o índice único é parcial em `status = 'ACTIVE'` e a lista de realizadas lê só ativas.
- **Concorrência.** A ordem estendida (movimentações → recorrência → cartão → dívidas → pessoas → contas por id) é respeitada em todos os caminhos: criação (`AccountTransactionFactory.lockFor`: movimentações, cartão, dívidas ordenadas, pessoas ordenadas, contas ordenadas), estorno (`VoidTransactionUseCaseImpl`: movimentação → dívidas por id → contas por id), realização (recorrência → cartão **ou** conta), perdão, estorno do registro e edição da dívida (só a dívida), criação de dívida e arquivar pessoa (só a pessoa). Procurei inversões (dívida→pessoa, conta→recorrência, conta→dívida) e **não há**: nenhum caminho trava dívida depois de pessoa ou conta, nem recorrência depois de conta. Quitações concorrentes, estorno × quitação e perdão × quitação se serializam na linha da dívida e o saldo é **lido depois da trava** (`lockForUpdate` seguido de `findById`; `findDebtLinks` é projeção, sempre fresca). `lockFailure` mapeia deadlock/trava para `409 CONFLICT` + `Retry-After`; `lockForUpdate` de id inexistente não lança, e a leitura seguinte responde 404 (sem vazar existência).
- **Idempotência.** `CanonicalCommandHash` inclui `shares` (valor, pessoa, previsão, descrição, em ordem) e `newDebt`/`debtId`, e não muda o hash das despesas sem divisão. A realização tem escopo próprio (`POST /v1/recurrences/{id}/occurrences/{date}/realize`, 61 caracteres, cabe em `VARCHAR(100)`), hash com recorrência + data + valor, `claim` e movimentação na mesma transação; o replay devolve o estado atual. `Idempotency-Key` obrigatório (`@RequestHeader`).
- **Isolamento.** Todo gateway novo filtra por `user_id` (`findByIdAndUserId`, `lockByIdAndUserId`, `findByUserIdAndPersonIdIn`, `findIdsByOrigin`, `findDebtLinks`, `findActiveRealized`, `findByUserIdAndRecurrenceIdIn`; a lista de dívidas usa SQL parametrizado com `d.user_id = ?`). Pessoa, dívida, categoria, conta e cartão de outro usuário viram 404 pelo mesmo caminho do inexistente. FKs compostas `(id, user_id)` em `debts.category_id` (V4.01), `recurring_transactions` (categoria, conta, cartão), `recurrence_skips` e `transactions.recurrence_id` (V4.02).
- **Fontes de compromisso.** Fatura entra só por `outstanding` de fatura não paga; dívida só `OPEN`/`PARTIALLY_SETTLED` com `outstanding` (SETTLED/CANCELED/VOIDED fora); recorrência só `PENDING` de recorrência ativa (`occurrences` devolve vazio se `!active`); a realizada sai por existir movimentação ativa e passa a vir da conta ou da fatura (uma vez). Dívida sem `expectedDate` vai a `undated` e fora dos horizontes (S-145). Entradas (cobrança, receita recorrente) não abatem o comprometido (`sum(OUT)`).
- **Migrações.** V4.00 só índices (parciais onde cabe). V4.01: `category_id` com FK composta e `ck_debts_category` coerente com `Debt.validated`. V4.02: os `CHECK`s reproduzem `Schedule`/`validateModel` (`custom`, `period`, `max`, `target`), sem coluna de status e sem tabela de realizadas.
- **Arquitetura.** ArchUnit verde: core sem Spring/JPA/Jackson/infra, sem ponto flutuante, sem ciclos entre features (`transaction → debt`, `recurrence → transaction`, `finance → recurrence/debt/card`), `UseCaseImpl` só em `core.*.app..`, `*Entity` só em `infra.*.persistence`. Realizar/pular ficam em `core.finance.app.recurrences` (recurrence não depende de finance), como o plano pedia. Casos de uso gravadores passam por `TransactionalProxies.required`, leituras por `snapshotReadOnly`.
- **Contrato.** `Debt`, `DebtSummary`, `Person`, `Recurrence`, `OccurrenceView`, `Transaction.debt`/`shares`, `ExpenseShareInput`, `NewDebtInput`, `LoanGivenInput` (`oneOf [newDebt] | [debtId]`), `MoneyReceivedInput` e `DebtPaymentInput` batem com os records de resposta/entrada; códigos de erro (`SHARES_EXCEED_AMOUNT`, `SHARE_PERSON_ARCHIVED`, `DEBT_*`, `PERSON_*`, `RECURRENCE_*`) existem no código. `Idempotency-Key` aparece só onde cria movimentação (criar movimentação, realizar). As alterações não aditivas **não quebram clientes** (item 6).

## 3. Achados

### 🟠 A1. "Custo fixo mensal" e "receita recorrente" continuam somando recorrência **encerrada**

- **Onde:** `core/recurrence/domain/MonthlyEstimate.java:26-29` (só filtra `isActive()` e a direção), `core/recurrence/app/usecase/GetRecurrenceSummaryUseCaseImpl.java:19`, `core/recurrence/app/RecurrenceView.java:36-39` (`monthlyEstimate` por item), `contracts/openapi.yaml:1730` ("Σ das recorrências ativas").
- **Problema:** "encerrar" é o fluxo principal para parar uma recorrência (`POST /end` grava só `endDate`, `active` continua `true`, S-139). Uma recorrência com `endDate` no passado (ou com `maxOccurrences` esgotado) não gera mais ocorrência nem compromisso, mas entra na estimativa mensal para sempre. O comprometido (`CommitmentSchedule`) e a estimativa passam a divergir para a mesma recorrência.
- **Impacto:** o número exibido no cartão "Custo fixo mensal" (T87) fica errado depois da ação mais comum do usuário (cancelar uma assinatura), e cada `Recurrence.monthlyEstimate` também. Não afeta o razão. Nenhum teste cobre (`RecurrencesIT` encerra mas não confere `summary`).
- **Correção sugerida:** `MonthlyEstimate` recebe "hoje" e ignora recorrência sem ocorrência a partir de hoje (`endDate < hoje`, ou `maxOccurrences` já esgotado), e `RecurrenceView.monthlyEstimateOf` usa o mesmo critério (0,00 como na desativada). Teste: encerrar ontem e conferir `summary` e `monthlyEstimate`. Acertar o texto do contrato (linha 1730).

### 🟠 A2. Realizar (e pular) ocorrência de recorrência **desativada** é aceito e grava no razão

- **Onde:** `core/recurrence/domain/RecurringTransaction.java:287-297` (`ensurePending` não olha `active`), `core/finance/app/recurrences/usecase/RealizeOccurrenceUseCaseImpl.java:84-96`, `RealizeCardRecurrenceUseCaseImpl.java:59-74`, `SkipOccurrenceUseCaseImpl.java:19-22`.
- **Problema:** `deactivate` só zera `occurrences(...)`. `realize` valida a data pela agenda (`isOccurrence`) e cria a movimentação mesmo com `active = false`; o mesmo vale para o cartão e para `skip` (que grava em `recurrence_skips`). O contrato diz que a desativada "deixa de gerar ocorrências pendentes", mas a API não recusa o realize.
- **Impacto:** uma aba desatualizada ou um cliente que guardou a lista cria uma despesa de uma recorrência que o usuário desativou. É dinheiro real no razão, e depois **o item some da lista de ocorrências** (que já não o mostra como pendente) enquanto a movimentação existe. Não gera dupla contagem, mas contraria a intenção de "desativar".
- **Correção sugerida:** `ensurePending` (ou `realize`/`realizeOnCard`/`skip`) recusa `!active` com um código novo (`RECURRENCE_INACTIVE`, 422) ou reaproveita `RECURRENCE_NOT_AN_OCCURRENCE`; decisão de Produto se desativada ainda pode ser realizada para quitar atrasadas (se sim, documentar). Cobrir com IT (hoje não há teste de realize em desativada).

### 🟡 B1. V4.01 trocou o índice único de origem por índice comum e o banco deixou de proteger "uma origem, uma dívida" nos empréstimos

- **Onde:** `V4.01__alter_table_debts_category_and_shared_origin.sql:15-16`.
- **Problema:** a justificativa ("uma dívida, uma origem continua garantido pelo domínio") só vale para a coluna (cada dívida tem uma origem), não para o inverso. Hoje **nenhum caminho da aplicação** cria duas dívidas para o mesmo `LOAN_GIVEN`/captação: cada requisição gera um id novo de movimentação, `Debt.withMovement` recebe esse id e o `debtId` de uma dívida existente é sempre recusado (`newOriginRefusal`). Mas o `VoidTransactionUseCaseImpl.lockLinkedDebts` trata o `LOAN_GIVEN` como **uma** dívida (`transaction.debtId()`), então uma segunda dívida com a mesma origem (bug futuro, importação da Etapa 7, SQL manual) não seria encerrada no estorno, e deixaria recebível ativo sem origem.
- **Correção sugerida:** manter a unicidade só onde ela deve valer, por exemplo uma coluna `origin_kind` (`SINGLE`/`SHARE`) e `CREATE UNIQUE INDEX ... ON debts (origin_transaction_id) WHERE origin_kind = 'SINGLE'`; ou um teste de arquitetura/IT que prove que só `EXPENSE` cria mais de uma dívida por origem.

### 🟡 B2. `POST /v1/debts` não tem `Idempotency-Key`; clique duplo ou retry cria duas dívidas e duplica o patrimônio

- **Onde:** `infra/debt/controller/DebtController.java:68-73`, `core/finance/app/debts/usecase/CreateDebtUseCaseImpl.java:39-50`.
- **Problema:** emprestar, receber, pagar, dividir e realizar são idempotentes; "eu devo 200" sem movimentação não é, e cada chamada grava `PAYABLE −X / EQUITY +X` (ou o consumo, com categoria). Um retry do PWA em rede ruim (o motivo de o `Idempotency-Key` existir) dobra o consumo ou o passivo, silenciosamente.
- **Correção sugerida:** o mesmo mecanismo (`IdempotencyGateway`, escopo próprio, hash canônico) ou, no mínimo, registrar a decisão como pendência de Produto e orientar o front (T85 CA6) a bloquear o reenvio. O plano pediu chave só para as movimentações; por isso fica 🟡.

### 🟡 B3. `PUT /v1/recurrences/{id}` apaga o `endDate` quando o campo não vem

- **Onde:** `core/recurrence/app/usecase/UpdateRecurrenceUseCaseImpl.java:58` (`recurrence.changeEnd(c.endDate())`, `null` remove o fim), `contracts/openapi.yaml` `RecurrenceUpdate.endDate` (nullable, sem dizer o que `null` faz).
- **Problema:** é semântica de substituição completa, não dita no contrato. Um cliente que edita só o valor e omite `endDate` **reabre** uma recorrência encerrada: as ocorrências futuras voltam aos compromissos.
- **Correção sugerida:** documentar no contrato ("`endDate` ausente/`null` remove o fim; reenvie o atual para mantê-lo") ou tratar ausente como "não muda" (exige distinguir ausente de `null` no corpo).

### 🟡 B4. Listagem de ocorrências sem limite de janela

- **Onde:** `infra/recurrence/controller/RecurrenceController.java:116-125` (`from`/`to` sem `@DateInWindow` nem tamanho máximo), `core/recurrence/app/usecase/ListOccurrencesUseCaseImpl.java:32-47`, `core/recurrence/domain/Schedule.java:73-88` (`SAFETY_LIMIT = 100_000`).
- **Problema:** `to=9999-12-31` com uma recorrência `DAILY` materializa até 100 mil ocorrências por recorrência, ordena tudo em memória e só então pagina. É autenticado e só dados próprios, mas uma requisição ocupa heap e CPU desproporcionais.
- **Correção sugerida:** `@DateInWindow` em `from`/`to` e teto de janela (por exemplo 24 meses, `422 RECURRENCE_INVALID` ou `400`), ou paginar na origem. O mesmo teto serve para `RecurrenceView.nextOccurrenceOf`.

### 🟡 B5. `debtItems` volta completo em **toda** página de `/v1/entries`

- **Onde:** `core/finance/app/transactions/usecase/ListEntriesUseCaseImpl.java:65-68`.
- **Problema:** o contrato diz "completas (não paginadas)", mas um cliente que concatena as páginas duplica as linhas de dívida de consumo a cada página (o `total` está certo; a lista não).
- **Correção sugerida:** devolver `debtItems` só na página 1 (ou documentar que o cliente deve usar só a primeira resposta). Teste com `page=2`.

### 🟡 B6. Contrato do `PUT` de despesa dividida contradiz o código

- **Onde:** `contracts/openapi.yaml:2732` (`ExpenseUpdate.shares`: "divisão iguais aos da despesa (senão 422)") × `core/finance/app/transactions/handlers/AccountTypeHandlers.java:83-87` (qualquer `shares` não vazio numa despesa já dividida → `422 TRANSACTION_NOT_EDITABLE`).
- **Problema:** quem lê o contrato manda as mesmas partes e recebe 422. O `IT CA7` afirma o comportamento do código, não o do texto.
- **Correção sugerida:** alinhar o texto ("`shares` não se envia no `PUT`") e tirar `shares` de `ExpenseUpdate`, ou aceitar `shares` idêntico às dívidas atuais. Preferir a primeira (mais simples e igual ao mapa resposta → entrada).

### 🟡 B7. Testes: propriedades por construção e lacunas de concorrência

- A "propriedade de 200 cenários" (`ExpenseWithSharesTest:230-264`) gera 1 a 4 partes de uma despesa e confere `ledger.sum = 0`, consumo, caixa e patrimônio. É verdadeira, mas **por construção** (a própria fábrica monta o grupo balanceado) e não mistura quitação, perdão, estorno nem reembolso; `if (sum >= total) continue` pode descartar cenários sem avisar. A combinação real está só no `IT CA6`. Não é tautologia, mas prova menos do que o nome promete.
- Os casos de uso com `InMemory*Gateway` não exercitam trava nem derivação (realizadas/quitações vêm de movimentações), então a prova de S-49, de status derivado e de concorrência é dos ITs. Existe concorrência de **quitação × quitação** e **origem × quitação**; faltam **perdão × quitação**, **estorno da despesa dividida × quitação de uma das partes**, **realizar × estornar a realização** e **realizar × desativar**.
- Não há teste de: realize/skip em recorrência desativada (A2), `summary` com recorrência encerrada (A1), `entries` com `page > 1` e `debtItems` (B5).

### 🟢 C1. Detalhes

- `core/debt/domain/Person.java:99`: nome com mais de 100 caracteres lança `PERSON_NAME_REQUIRED` (mensagem enganosa); a entrada já barra com `@Size`, então só aparece fora da API.
- `Debt`: `expectedDate` anterior a `date` é aceita (nasce atrasada). Pode ser intencional (dívida antiga); registrar.
- `RecurrenceController.occurrences`: `from > to` é tratado no controller (400), mas `ListOccurrencesUseCaseImpl:34` ainda lança `IllegalArgumentException` (500 se chamado por outro caminho).
- `ListEntriesUseCaseImpl`/`GetUpcomingUseCaseImpl`: `IllegalArgumentException` para `from > to`; confirmar que o controller sempre valida antes.
- `RecurrenceRepositoryJpa.findPage` e os filtros `status = ACTIVE` dependem de o enum virar literal para usar o índice parcial; sem medição, só observação.
- Compra no cartão que é realização de recorrência e depois tem a única parcela cancelada (`cancel-installments`) continua "realizada" (a movimentação segue ativa): a ocorrência não reabre. Decisão de Produto.

## 4. Análise por prioridade pedida

1. **Integridade financeira.** Tabela da seção 1. Sem dupla contagem entre despesa, dívida, quitação, recorrência realizada, fatura e `/upcoming`/dashboard: a realizada sai das previsões e vem só da movimentação/fatura; `Σ upcoming OUT` = faturas não pagas + ocorrências pendentes + dívidas `PAYABLE` datadas. Consumo negativo (reembolso de despesa dividida): o teto soma o principal das dívidas de origem, então o reembolso fica limitado à parte do usuário. Arredondamento: não existe no backend (valores explícitos por parte, remanescente é consumo do usuário). `shares` 1 a 20 e `Σ ≥ total` recusados.
2. **Estorno e guardas.** Conforme (itens conformes). Observação de domínio, não é defeito: perdoar uma dívida **mantém** o consumo que ela reconheceu (`PAYABLE` com categoria) e a parte do usuário na despesa dividida, e move só o patrimônio contra `EQUITY` (S-19, sem receita nem despesa). Confirmar com Produto que o jantar perdoado continua custando 80 de consumo (ver pendências).
3. **Concorrência e travas.** Sem inversão de ordem e sem deadlock encontrado; falha de trava vira `409` com `Retry-After`. `CannotAcquireLock`/deadlock residual cai em `GlobalExceptionHandler.isLockFailure`. A V4.01 não abre dupla dívida por nenhum caminho atual (B1 é defesa em profundidade).
4. **Isolamento, FKs compostas, idempotência.** Conforme (itens conformes).
5. **Fontes de compromisso.** Conforme, com A1 (estimativa) e A2 (desativada). Vencidas e não realizadas entram em todos os horizontes (S-20, por desenho). Risco: não há teto de ocorrências vencidas, então uma recorrência diária nunca realizada soma até 365 itens por ano no comprometido (ver riscos).
6. **Contrato.** Respostas e requisições batem com o código. As alterações não aditivas são `UnavailableTransactionInput.type` (de 4 valores para só `INVOICE_PAYMENT`) e o repontamento do `discriminator.mapping` de `LOAN_GIVEN`/`MONEY_RECEIVED`/`DEBT_PAYMENT` para schemas próprios. **Não quebram o cliente atual:** esses tipos respondiam `422 TRANSACTION_TYPE_NOT_AVAILABLE` (nunca funcionaram), `UnavailableTransactionUpdate` mantém os três (o `PUT` segue `422 TRANSACTION_NOT_EDITABLE`), `schema.gen.ts` já foi regenerado e não há uso de `UnavailableTransactionInput` fora do arquivo gerado. Em semver é mudança de comportamento para um cliente que enviasse esses tipos; como 2.2.0 já foi publicada para o front, vale registrar no changelog do contrato. Campos aditivos (`debtItems`, `debtConsumption`, `shares`, `Transaction.debt`) opcionais e documentados (ver B5 e B6).
7. **Arquitetura e testes.** ArchUnit e `ExpenseWithSharesTest` verdes. Ver B7.

## 5. Riscos

- **Fail-closed global (S-94).** Qualquer `DEBT_STATE_INCONSISTENT` ou `RECURRENCE_STATE_INCONSISTENT` (dado corrompido) derruba `FinancialRecords.load` e, com ele, dashboard, lista, entries e `/upcoming` (500). É a escolha certa para integridade; vale um alarme de log e um runbook de correção de dados.
- **Atrasadas sem teto (S-20).** Ocorrências vencidas e não realizadas somam em todos os horizontes e crescem com o tempo; recorrência diária esquecida infla o comprometido e faz `disponível` negativo. Produto pode querer "pular em lote" ou um limite.
- **Cartão não divide.** `shares` só existe em `EXPENSE` em conta; compra no cartão dividida (caso comum) não é suportada. Está dentro do plano, mas o front não deve oferecer.
- **Carga do carregamento único.** `FinancialRecordsGatewayImpl.load` agora lê todas as dívidas, quitações e lançamentos próprios do usuário por requisição de lente; `recurrences.findAll` lê todas as realizadas. Aceitável no MVP; medir quando passar de alguns milhares de movimentações.
- **Pessoa arquivada com dívida aberta.** O arquivamento não bloqueia (certo: quitar e perdoar devem seguir possíveis); a pessoa some da lista `ACTIVE` mas a dívida segue em `/upcoming`. A UI deve mostrar a pessoa arquivada.

## 6. Pendências por dono

- **Backend:** A1, A2, B1 a B6 e os testes de B7; log de alarme para `*_STATE_INCONSISTENT`.
- **Produto:** (1) perdão de dívida de consumo/despesa dividida mantém o consumo? (hoje sim, S-19); (2) recorrência desativada pode ter ocorrência atrasada realizada? (A2); (3) `POST /v1/debts` precisa de idempotência? (B2); (4) política de ocorrências atrasadas sem fim (S-20); (5) ocorrência de cartão cuja parcela foi cancelada reabre?
- **Arquitetura:** registrar a decisão de B1 (unicidade de origem) e a alteração não aditiva do contrato no changelog; atualizar D1 §8.4 com a regra de A2 quando decidida.
- **UX:** `debtItems` na página 1 (B5); não oferecer divisão em compra no cartão; mostrar pessoa arquivada nas dívidas abertas.

## 7. Parecer

🟡 **Aprovado com ajustes.** O razão, as guardas de estorno, a concorrência e o isolamento estão corretos e bem testados; nada impede a integridade financeira nem o merge do que mexe em dinheiro. Corrigir **A1** e **A2** antes do merge (pequenos, localizados, com teste), e tratar B1 a B6 como itens de acompanhamento antes do T90. O T82 pode seguir: as propriedades devem incluir sequências com perdão, estorno, reembolso e realização (B7), e os testes de concorrência listados em B7 ainda não existem.
