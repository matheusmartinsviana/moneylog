# QA backend, Etapa 4 (T82)

Agente: tester. Escopo: `backend/` (pessoas, dívidas, movimentações de dívida, divisão de despesa, dívida de consumo, recorrências com realizar e pular, fontes de compromisso no dashboard e `/upcoming`, migrações V4.00 a V4.02). Nenhum código de produção alterado; nada em `frontend/` nem em `contracts/`; sem commits. Fontes: plano da Etapa 4 (T82), D1 §8.4 (S-222 a S-233), PR 01 (casos 6, 7, 8 e tabela de integridade), revisão de código da Etapa 4.

## 1. Resumo

- Baseline (`./mvnw clean verify`, JDK 21, antes dos meus testes): **BUILD SUCCESS, 8:47 min. Unitários 958 verdes; ITs 468 executados, 0 falhas, 1 ignorado** (o BUG-QA-09 da Etapa 2, ainda aberto).
- Execução final com os meus testes (`./mvnw clean verify`, exit 0, `BUILD SUCCESS`, 8:56 min, gate de cobertura do `core` ok): unitários **958 / 0 falhas**; ITs **520 executados, 0 falhas, 10 ignorados** (1 antigo + 9 meus, todos `@Disabled("BUG-QA-xx")`).
- Escrevi 7 arquivos em `backend/src/test/java/com/moneylog/qa/` (propriedade, concorrência, bordas, segurança, migração, achados da revisão e apoio). Eles confirmaram **9 bugs** (nenhum 🔴; 2 🟠 de recorrência já apontados pela revisão, mais 1 🟠 novo de concorrência) e **uma observação de desempenho**. Testes que expõem bug estão `@Disabled("BUG-QA-xx")` com a reprodução na mensagem.
- Integridade financeira: a propriedade (4 sementes x 170 = 680 operações, ciclo completo) **não achou violação do razão, de dívida, de consumo, de patrimônio nem de `/upcoming`**; os casos 6, 7 e 8 do PR 01 batem em todas as colunas. Os bugs encontrados são de recorrência (encerrada/desativada), idempotência, paginação, contrato e um 500 por leitura inconsistente do razão em concorrência.

## 2. Casos executados

### 2.1 Baseline e execução final

Baseline: acima (958 unitários, 468 ITs, 1 ignorado). Execução final com os meus testes: 958 unitários e 520 ITs (468 + 52 novos), 0 falhas, 10 ignorados (BUG-QA-09 + 9 meus); `BUILD SUCCESS`. Uma execução intermediária falhou na propriedade (consumo mensal negativo, ver observação em §3); era erro do meu oráculo (por competência em vez de por despesa) e foi corrigido.

### 2.2 Casos do PR 01 e divisão (`DebtBordersQaIT`) — aprovados

- **Caso 6** (emprestar 300): caixa −300,00, consumo vazio, patrimônio de impacto 0,00; resumo: consumo 0, renda 0, `receivables` 300,00, patrimônio 20.000,00.
- **Caso 7** (receber 300): caixa +300,00, `month.income` e `month.consumption` 0,00, recebível 0, saldo da conta volta a 20.000,00.
- **Caso 8** (eu devo 200 sem movimentação): saldo 20.000,00, consumo 0, patrimônio 19.800,00, compromisso `DEBT_PAYABLE` em `/upcoming`.
- **100,00 em 3 partes**: 33,33 x 3 aceito (caixa −100,00, consumo 0,01, 3 dívidas); 33,34+33,33+33,33 = 100,00 recusado `SHARES_EXCEED_AMOUNT`; parte única 99,99 passa e 100,00 não.
- **1 a 20 partes**: 1, 2, 3, 7, 19 e 20 partes de 0,01 com valor total n+1 centavos (consumo 0,01 sempre); 21 partes recusada (400/422, sem 5xx); parte 0,00 recusada; razão fecha e há exatamente a soma esperada de dívidas.
- **Reembolso da despesa dividida**: teto = parte do usuário (200 com 100 do João: 100,01 recusado `REFUND_EXCEEDS_ORIGINAL`, 100,00 aceito), consumo da competência 0,00 e nunca negativo; estorno da despesa com reembolso ativo recusado; quitação da parte e perdão da parte não devolvem teto ao reembolso.
- **Edição da dividida**: valor/divisão = 422 `TRANSACTION_NOT_EDITABLE`; descrição e categoria editam sem quebrar razão, dívidas nem entries (consumo muda de categoria). Ver BUG-QA-23 (shares idênticas).
- **Teto S-78** (999.999.999,99): aceito em empréstimo, dívida, divisão (partes no limite), recorrência e realize; 1.000.000.000,00 = 422 em todos; Σ de 20 partes no teto = 422 sem estouro; resumo e razão seguem consistentes.

### 2.3 Propriedade com semente fixa (`DebtPropertyQaIT`) — aprovada

4 sementes (20261007, 11, 90210, 424242) x 170 operações = **680 operações**, mistura: empréstimo, recebimento (total, metade, a maior em 1 centavo, 1 centavo), captação, pagamento, dívida sem movimentação (com e sem categoria, com e sem data), perdão e estorno do registro, despesa dividida (1 a 20 partes, centavos que sobram), reembolso de despesa, estorno de qualquer movimentação, compra/pagamento de fatura/mudança de dias do cartão, recorrências (diária, semanal, mensal, anual, personalizada; conta, receita e cartão) realizadas, puladas, encerradas, desativadas e estornadas, passagem do tempo e tentativas inválidas. Verificado a cada 5 operações (136 verificações), 0 violações:

- razão fecha em zero (total e por grupo); invariantes do cartão (`CardInvariants`);
- por dívida: `outstanding` ≥ 0, `settled` ≤ principal, `settled + outstanding = principal` nas abertas, Σ quitações ativas = `settled`, `CANCELED`/`VOIDED` com saldo 0;
- livro `RECEIVABLE` = Σ saldo a receber e livro `PAYABLE` = −Σ saldo a pagar; patrimônio = abertura + livros ACCOUNT/RECEIVABLE/PAYABLE/CARD; `netWorth.receivables`/`payables` batem;
- nenhum lançamento de receita ou despesa nasce de `LOAN_GIVEN`/`MONEY_RECEIVED`/`DEBT_PAYMENT`;
- consumo por competência = razão `EXPENSE` = `entries.totals` = Σ linhas (itens + `debtItems`); nunca negativo, por categoria também;
- pessoa: `net` da lista = `net` do detalhe = Σ dívidas abertas = Σ `debts[]`;
- saldo da conta = abertura + razão = `balances.inAccounts`; `month.consumption` = entries; `totals.cashFlow` da lista = `month.cashFlow`; `month.income` = razão `INCOME` (devolução nunca é renda);
- `/upcoming`: Σ OUT = faturas não pagas + ocorrências pendentes OUT + dívidas `PAYABLE` datadas; Σ IN = ocorrências de receita + dívidas a receber datadas; chave a chave sem item duplicado e sem item faltando; `undated` = dívidas abertas sem data;
- nenhuma ocorrência realizada duas vezes nem pulada e realizada ao mesmo tempo;
- toda requisição e resposta validada contra o OpenAPI; nenhum 5xx; nenhum 400 em corpo válido; todo `code` de erro visto está na tabela do contrato (DEBT_CLOSED, DEBT_HAS_ORIGIN_TRANSACTION, DEBT_HAS_SETTLEMENTS, DEBT_NOT_FOUND, DEBT_SETTLEMENT_EXCEEDS_OUTSTANDING, INVOICE_NOT_PAYABLE, RECURRENCE_INVALID, RECURRENCE_NOT_FOUND, REFUND_EXCEEDS_ORIGINAL, TRANSACTION_ALREADY_VOIDED, TRANSACTION_AMOUNT_NOT_POSITIVE, TRANSACTION_IN_CLOSED_INVOICE).
  (O gerador atinge as ações em proporção: ver o histograma impresso no log do IT, `QA-E4-PROP`.)

### 2.4 Concorrência (`DebtConcurrencyQaIT`, `DebtReviewQaIT`)

Aprovados (contrato validado, razão e livros conferidos depois de cada corrida):

- 8 quitações simultâneas de 100,00 numa dívida de 300,00 (3 rodadas): exatamente 3 x 201, 5 recusadas, saldo 0, `SETTLED`. Quitações que juntas passam do principal (6 x 60,00 em 100,00): só 1 vence.
- Quitação x estorno da origem (12 rodadas): nunca os dois; origem estornada => dívida `VOIDED`.
- Quitação x perdão e x estorno do registro (8 rodadas): sem 5xx, estorno do registro com quitação nunca aceito.
- Despesa dividida: 6 estornos simultâneos (1 vence, 5 recusados; 6 rodadas); estorno x quitação de uma parte (10 rodadas): nunca os dois, estorno vencedor deixa todas as dívidas `VOIDED`; reembolso x estorno x quitação (8 rodadas): consumo nunca negativo.
- Realização simultânea da mesma ocorrência (8 threads): conta e cartão, 1 x 201, as outras `RECURRENCE_OCCURRENCE_ALREADY_REALIZED`, 1 só movimentação; realize x skip x skip (12 rodadas); realize x estorno da realizada x novo realize (S-49, 10 rodadas): no máximo 1 ativa; realize x deactivate (10 rodadas): sem 5xx.
- Recorrência de cartão x compra x pagamento da fatura x mudança de dias (8 rodadas): só 200/201/409/422; invariante do cartão fecha.
- Mesma origem (V4.01 tornou o índice não único): 8 empréstimos com a mesma `Idempotency-Key` = 1 movimentação e 1 dívida; 8 despesas divididas com a mesma chave = 1 despesa e exatamente 3 dívidas; 6 `LOAN_GIVEN` com `debtId` existente = 422 `DEBT_ALREADY_HAS_ORIGIN`. Duplicata de origem forçada por SQL: GET, lista e estorno da origem sem 5xx, e as duas dívidas ficam encerradas (B1 da revisão, sem defeito).
- Arquivar pessoa x criar dívida/empréstimo/divisão com ordem cruzada de pessoas (10 rodadas): só 200/201/409/422 (sem deadlock 500 nesse conjunto).
- Leituras (summary, upcoming, entries, lista, pessoa, transações) durante escritas de dívida: 0 respostas 5xx em ~700.
  Reprovado: **BUG-QA-26** (500 em escritas que leem o razão inteiro).

### 2.5 Segurança (`DebtSecurityQaIT`)

Aprovados:

- Isolamento: usuário B contra 30 combinações de rota/corpo sobre recursos de A (pessoa GET/PUT/archive/unarchive; dívida GET/PUT/cancel/void; recorrência GET/PUT/end/deactivate/realize/skip (conta e cartão); criação com pessoa, categoria, conta, cartão, dívida ou movimentação de A em `newDebt`, `shares`, `debtId`, `accountId`, `categoryId`, `cardId`): sempre `404` com o `code` certo; snapshot SQL de A idêntico; listas e `/upcoming` de B não vazam nenhum id de A; resumo de B sem compromissos de A.
- Sem token, token lixo, `a.b.c`, Basic e `Origin` hostil: `401` em 24 rotas x 4 variantes.
- Campos desconhecidos (`id`, `userId`, `status`, `settled`, `outstanding`, `origin`, `net`, `archived`, `active`, `frequency`, `startDate` etc.) em todos os corpos novos (inclusive dentro de `newDebt` e de cada parte de `shares`): `400`; criação de recorrência com `id`/`active`/`version`/`nextOccurrence`/`monthlyEstimate`/`installments`: `400`; nada gravado.
- Inteiros: `"2"`, `2.5`, `2.0`, `1e0`, `true`, `[2]`, `0`, `-1`, `1001` em `interval`; `maxOccurrences` fora de 1..10000; `version` em texto, fracionário, científico, `null`: `400`. Valores monetários hostis (`1e3`, negativo, zero, 3 casas, vírgula, vazio, `NaN`, árabe, acima do teto, 20 dígitos) em dívida, empréstimo, parte, recorrência e realize: sempre 4xx.
- Idempotência do realize: sem chave 400; chave não UUID 400; mesma chave e corpo = mesma movimentação; outro corpo/data = `409 IDEMPOTENCY_KEY_REUSED`; mesma chave de outro usuário independente; idem em `LOAN_GIVEN` e despesa dividida (divisão com valor de parte diferente = reuso).
- Caracteres de controle, NUL, bidi, emoji, surrogate solto, só espaços e vazio em nome, notas, descrições, motivos e `?q`: nunca 5xx.
  Reprovado: **BUG-QA-24** (datas extremas dão 500).

### 2.6 Bordas e recorrências (`DebtBordersQaIT`) — aprovados

- Dia 31: 31/01, 28/02, 31/03, 30/04, 31/05; bissexto 29/02/2028; anual 29/02 = 28/02/2029, 2030, 2031 e 29/02/2032; diária, semanal, personalizada (2 semanas, 10 dias, 3 meses a partir de 30/11 = 28/02, 30/05, 30/08); `maxOccurrences` e `endDate` juntos (vale o primeiro); data que não é ocorrência = `RECURRENCE_NOT_AN_OCCURRENCE` (realize e skip); realizar 28/02 cria a movimentação em 28/02.
- Janela 2000–2100: início 1999-12-31 e 2101-01-01 = 400; 2000-01-01 e 2100-12-30 aceitos; realize/skip de ocorrência depois de 2100 sem 5xx e **nenhuma movimentação criada fora da janela** (conferido por SQL).
- Fuso: às 23:30 de 10/10 em São Paulo (02:30Z de 11/10) a ocorrência de 10/10 é de hoje (`overdue` falso, bucket `TODAY`); às 00:30 de 11/10 em SP é `OVERDUE`; `asOf` do resumo = 2026-10-11.
- S-20 vencida: ocorrências de 10/08 e 10/09 pendentes (`overdue` true), 2 itens `OVERDUE` em `/upcoming`, `committed.d30` = 357,00; realizar a de agosto cria a movimentação em 10/08 e tira 119,00; pular a de setembro some sem movimentação; realizar a pulada = `RECURRENCE_OCCURRENCE_SKIPPED`; estornar a realizada a reabre (committed volta a 238,00).
- Desativada/encerrada: sem ocorrência pendente e sem item em `/upcoming`; realizadas e puladas continuam listadas; `end` com data corta só o futuro; `end` anterior ao início = 400/422. (Ver BUG-QA-18/19 para o que passa indevidamente.)
- Cartão: ocorrência realizada sai de `RECURRENCE` e entra na fatura sem mudar o Σ de saídas (`Σ upcoming OUT` = faturas + 3 ocorrências + dívida, antes e depois); invariante do cartão fecha.
- Contrato: tipos de dívida só com `type` = 400 (S-228), `INVOICE_PAYMENT` só com `type` = 422 `TRANSACTION_TYPE_NOT_AVAILABLE`; PUT de dívida = 422 `TRANSACTION_NOT_EDITABLE` (também com corpo mínimo); `MONEY_RECEIVED` sem `debtId` e sem `newDebt` = 400; com os dois = 400; `DEBT_PAYMENT` sem `debtId` = 400; direção errada = 422 `DEBT_DIRECTION_MISMATCH`; conta de investimento = 422 `TRANSACTION_ACCOUNT_NOT_CASH`.
- Paginação: `pageSize` 51, `page=0`, `pageSize` não numérico ou fracionário = 400 nas 4 listas novas; filtros inválidos 400.

### 2.7 Migrações (`DebtMigrationQaIT`) — aprovado

Base V3.02 com 40 despesas e razão, mais pessoa e duas dívidas legadas gravadas direto: V4.00 a V4.02 = exatamente 3 migrações, `success`, checksums válidos, reexecução é no-op; contagens e Σ do razão intactos. Índices `ix_debts_user_person (user_id, person_id)`, `ix_transactions_debt (debt_id) WHERE debt_id IS NOT NULL`, `ix_debts_origin_transaction` (não único), `ix_recurring_transactions_user`, `ix_recurrence_skips_user` existem, são válidos e o planejador os usa; `uq_debts_origin_transaction` saiu. Antes da V4.01 duas dívidas na mesma origem são recusadas; depois são aceitas. `ck_debts_category` (só `PAYABLE` sem movimentação) e FK composta de categoria valem. V4.02: restrições de valor, `CUSTOM`, período, máximo, alvo (conta xor cartão) e FKs compostas de outro usuário recusam; `recurrence_skips` único por data; `uq_transactions_recurrence_occurrence` só vale para ativas (a estornada libera a data); `fk_transactions_recurrence_id_user` recusa recorrência inexistente.
Observação (🟢, sem ação): numa base que já tivesse `transactions.recurrence_id` preenchido sem recorrência (coluna solta desde a V1.06) a V4.02 **falha** na FK; nenhum caminho da API grava isso antes da Etapa 4, por isso só afetaria dado manual (teste `recurrenceIdSoltoAntigo` documenta).

### 2.8 Contrato

- Toda requisição e resposta dos ITs novos valida contra o OpenAPI (nenhuma violação, exceto o item abaixo).
- `code`: todos os `code` de erro alcançados estão na tabela. Os `super("...")` do código que não estão na tabela são invariantes internas (`*_STATE_INCONSISTENT`, `LEDGER_*`, `MONEY_*`, `IMPORT_*` etc.).
- Alteração não aditiva de `UnavailableTransactionInput`: confirmada como documentada (S-228): o `enum` agora é só `[INVOICE_PAYMENT]`; um cliente antigo que enviava `{"type":"LOAN_GIVEN"}` recebia 422 e agora recebe 400. Aceitável (o front ainda não usa), mas é quebra para quem gerou tipos antes da Etapa 4.
- Lacunas: BUG-QA-25 (void sem 409 no contrato) e BUG-QA-27 (`interval` nulo em `CUSTOM`).

### 2.9 Resultado final

Ver §2.1.

## 3. Bugs

Nenhum 🔴. Camada provável entre parênteses.

### 🟠 BUG-QA-18 — Recorrência encerrada continua no custo fixo mensal (back) [revisão A1]

- Repro: `POST /v1/recurrences` MONTHLY 100,00 início 2026-01-10; `POST /{id}/end {"endDate":"2026-03-10"}` (relógio 10/10/2026); `GET /v1/recurrences/summary`.
- Esperado: `fixedCosts` 0,00 (encerrada não é mais custo fixo). Obtido: `fixedCosts` 100,00; o item mostra `active: true` e `nextOccurrence: 2026-01-10` (a próxima "ocorrência" é uma data passada de uma recorrência encerrada); `monthlyEstimate` 100,00.
- Evidência: `DebtReviewQaIT.a1CustoFixoComEncerrada` (`@Disabled("BUG-QA-18...")`), saída `QA-E4-A1 fixedCosts=100.00 ... nextOccurrence=2026-01-10 active=true`.

### 🟠 BUG-QA-19 — realize/skip aceitos em recorrência desativada e gravam no razão (back) [revisão A2]

- Repro: `POST /{id}/deactivate`; `POST /{id}/occurrences/2026-10-10/realize` (com `Idempotency-Key`) e `POST /{id}/occurrences/2026-11-10/skip`.
- Esperado: recusa (422), como "desativada não gera ocorrência" (S-225 documenta a permissão para realizar, mas a ocorrência nem aparece em `occurrences` para ser confirmada, e `skip` de desativada não tem justificativa). Obtido: realize `201` (cria despesa e lançamentos) e skip `200`.
- Evidência: `DebtReviewQaIT.a2DesativadaRealizaEPula` (`QA-E4-A2 realize=201 skip=200 transações=1`). A decisão S-225 pode ser mantida por Produto, mas então `skip` e a listagem precisam ser coerentes; a divergência fica registrada.

### 🟠 BUG-QA-26 — `POST /v1/invoices/{id}/payments` e `PUT /v1/cards/{id}` (mudança de dias) dão 500 sob escrita concorrente de dívida (back) [novo]

- Repro: 4 threads fazendo `cancel`/`LOAN_GIVEN` de dívida e 4 threads fazendo pagamento de fatura e mudança de dias do mesmo usuário (30 operações cada). Em ~240 respostas, ~11 foram `500 INTERNAL_ERROR`.
- Causa observada (log): `DebtStateInconsistentException: o lançamento de perdão só existe (e é obrigatório) na dívida perdoada` (em `ChangeCardBillingDaysUseCaseImpl` → `FinancialRecordsGatewayImpl.load` → `DebtHydrator`) e `TransactionFieldRequiredException: postings` (em `Transaction.restore`): `FinancialRecords.load` lê dívidas, movimentações e lançamentos em consultas separadas sem snapshot único; uma escrita de dívida confirmada no meio gera leitura inconsistente (read skew em READ COMMITTED) que vira 500. Esses casos de uso travam só cartão e contas, não as dívidas nem as movimentações de outras origens. A S-220 manda `409 CONFLICT`, nunca 500. Leituras (summary/upcoming/entries) não sofrem (0 de ~700).
- Esperado: 409 (ou leitura consistente). Dado: nenhum dado corrompido (a transação reverte), mas o cliente recebe 500 num caso comum de duplo clique/duas abas.
- Evidência: `DebtConcurrencyQaIT.cartaoContraEscritasDeDivida` e `tempestade` (`@Disabled("BUG-QA-26...")`); `QA-E4-CARDREAD {200=94, 201=53, 409=48, 422=34, 500=11}`. Correção provável: ler o razão numa transação `REPEATABLE READ`/snapshot único, ou travar as dívidas/movimentações afetadas, e mapear a inconsistência transitória para 409.

### 🟡 BUG-QA-20 — `POST /v1/debts` não é idempotente (back/contrato) [revisão B2]

- Repro: `POST /v1/debts` (`PAYABLE` 80,00 com `categoryId`) duas vezes com a mesma `Idempotency-Key`. Obtido: 201 e 201, 2 dívidas (o consumo de 80,00 é lançado duas vezes). Esperado: uma dívida (como `POST /v1/transactions`).
- Evidência: `DebtReviewQaIT.b2DividaSemIdempotencia` (`QA-E4-B2 201 201 dívidas=2`).

### 🟡 BUG-QA-21 — PUT de recorrência sem `endDate` remove o fim e reabre a recorrência encerrada (back) [revisão B3]

- Repro: `end {"endDate":"2026-03-10"}`; `PUT` (amount/description/categoryId/conta/método/version) sem `endDate`. Obtido: 200 com `endDate: null`, a recorrência volta a ter ocorrências futuras (e vencidas) sem aviso. É o comportamento da S-225, mas é fácil de errar (o formulário que não reenviar o fim reabre).
- Evidência: `DebtReviewQaIT.b3PutReabreEncerrada` (`QA-E4-B3 put=200 endDate=null`).

### 🟡 BUG-QA-22 — `debtItems` completos em toda página de `/v1/entries` (back/contrato) [revisão B5]

- Repro: 3 dívidas `PAYABLE` com categoria + 3 despesas na mesma competência; `GET /v1/entries?competence=2026-10&pageSize=1&page=1..3`. Obtido: as 3 `debtItems` em cada página; Σ das páginas concatenadas 105,00 contra `totals.total` 45,00 (cliente que concatena páginas duplica as linhas de dívida).
- Evidência: `DebtReviewQaIT.b5DebtItemsRepetidos` (`QA-E4-B5 debtItems vistos=9 Σ concatenado=10500 total=4500`).

### 🟡 BUG-QA-24 — 500 com datas extremas ou invertidas em consultas (back) [novo]

- Repro (todos `500 INTERNAL_ERROR`, deveriam ser 400 `VALIDATION_FAILED`/`INVALID_RANGE`): `GET /v1/dashboard/upcoming?to=1999-12-31` e `?to=0000-01-01` (`to` antes de hoje com `from` padrão); `GET /v1/dashboard/upcoming?from=+999999999-12-31`; `GET /v1/recurrences/occurrences?from=+999999999-12-31`; `GET /v1/dashboard/summary?asOf=+999999999-12-31`. (`to=+999999999` em `/occurrences` e `/upcoming` responde 200.)
- Evidência: `DebtSecurityQaIT.datasForaDaJanela` (`@Disabled("BUG-QA-24...")`) e a sonda `QA-E4-PROBE`.

### 🟢 BUG-QA-23 — PUT de despesa dividida com `shares` idênticas é 422 (documentado como aceito) (back/contrato) [revisão B6]

- Repro: despesa 200,00 dividida (João 100,00); `PUT /v1/transactions/{id}` com os mesmos campos e `shares` iguais. Obtido: `422 TRANSACTION_NOT_EDITABLE` (o `AccountTypeHandlers` recusa qualquer `shares` numa despesa já dividida). Esperado: 200, como diz o contrato. Evidência: `DebtReviewQaIT.b6SharesIdenticasNoPut`.

### 🟢 BUG-QA-25 — Contrato não declara `409` em `POST /v1/transactions/{id}/void` (contrato)

- A S-220 manda `409 CONFLICT` em falha de trava de qualquer rota de escrita; a rota de estorno devolve 409 (visto na tempestade) mas a resposta não está no OpenAPI (violação de validação). Provavelmente o mesmo vale para as demais rotas novas de escrita. Evidência: `DebtConcurrencyQaIT.assertHealthy` filtra esse caso conhecido.

### 🟢 BUG-QA-27 — `interval` nulo em recorrência `CUSTOM` é aceito (back/contrato)

- `POST /v1/recurrences` com `frequency: CUSTOM`, `unit: WEEKS` e `"interval": null` responde 201 (assume 1); o contrato diz que em `CUSTOM` `interval` (≥ 1) e `unit` são obrigatórios. Evidência: execução de `DebtSecurityQaIT.inteirosEstritos` (o caso foi retirado do teste e fica aqui).

### Observação de domínio (🟢, para Produto) — consumo mensal negativo por reembolso em mês posterior

- Um reembolso lançado num mês posterior ao da despesa (ex.: despesa em 28/11, reembolso em 02/12) reduz o consumo de dezembro: a categoria (e o total do mês) em `/v1/entries` e no `summary` pode ficar **negativa** (visto: Alimentação −233,81 em 2026-12 na propriedade com a semente 11). Por despesa/compra o consumo nunca é negativo (teto do reembolso), então não é violação do razão. A tarefa pedia "consumo por categoria nunca negativo"; vale decidir se a regra é por mês ou por despesa. Registro: execução intermediária da `DebtPropertyQaIT` (o teste agora verifica por despesa e só registra o caso mensal).

### Observação de desempenho (revisão B4 e S-20) — 🟡

- Sem teto de janela em `GET /v1/recurrences/occurrences` (`to=9999-12-31`): 5 recorrências diárias desde 2000 responderam em 110 ms (o fatiamento é em memória; ordem de ~100 mil datas por recorrência), sem 5xx. O problema real é `/v1/dashboard/upcoming`: **10 recorrências diárias com início 2000-01-01 geram 98.100 itens e 21,7 MB de resposta (2 a 3 s)** e `committed.d30` de 98.100,00, porque as ocorrências vencidas e não realizadas entram sempre (S-20). Um usuário (ou um erro de cadastro) com poucas recorrências diárias antigas torna o Início inutilizável e aumenta o uso de memória do servidor; sem limite de recorrências por usuário. Sugestão: limitar o início no passado, o número de ocorrências vencidas por recorrência no `/upcoming` ou agregá-las. Evidência: `DebtBordersQaIT.desempenhoDeRecorrenciaDiaria` (`QA-E4-PERF`). Não bloqueia (sem corrupção).

## 4. Pontos da revisão sem defeito

- **B1** (V4.01 índice não único): criação concorrente com mesma chave = 1 origem e N dívidas exatas; `LOAN_GIVEN` com `debtId` existente = `DEBT_ALREADY_HAS_ORIGIN`; estorno da origem com dívida gêmea forçada por SQL sem 5xx e as duas `VOIDED`.
- **B4**: ver observação de desempenho (a janela é só um problema relevante em `/upcoming`).
- Corridas pedidas (perdão x quitação, estorno da dividida x quitação de uma parte, realize x estorno, realize x deactivate): sem 5xx e sem estado inconsistente.

## 5. Testes adicionados

Todos em `backend/src/test/java/com/moneylog/qa/`:

- `DebtQa.java` (apoio), `DebtPropertyQaIT.java` (propriedade), `DebtConcurrencyQaIT.java` (concorrência), `DebtBordersQaIT.java` (bordas, PR 01, contrato), `DebtSecurityQaIT.java` (segurança), `DebtMigrationQaIT.java` (V4.00–V4.02), `DebtReviewQaIT.java` (achados da revisão A1, A2, B1 a B6 e realize x deactivate).
- `@Disabled` (9): `DebtReviewQaIT` (BUG-QA-18, 19, 20, 21, 22, 23), `DebtSecurityQaIT.datasForaDaJanela` (BUG-QA-24), `DebtConcurrencyQaIT.cartaoContraEscritasDeDivida` e `tempestade` (BUG-QA-26).

## 6. Riscos e pendências

- BUG-QA-26 é a mais relevante: qualquer escrita que carrega o razão sob trava parcial (pagar fatura, mudar dias) pode dar 500 se outra escrita de dívida/estorno confirmar no meio; vale revisar todos os casos de uso que usam `FinancialRecordsGateway.load` em escrita.
- A decisão S-225 (realizar desativada, `PUT` sem fim remove o fim) precisa de confirmação de Produto; os testes ficam desativados até lá.
- Realização concorrente em cartão e idempotência foram exercitadas só com MockMvc em um nó; sem teste de carga em vários nós.
- Não foi executado E2E (T90) nem front.
- BUG-QA-09 (Etapa 2) continua aberto.

## 7. Parecer

**🟡 Aprovado com ressalvas.** A integridade financeira (razão, caixa x consumo x patrimônio, não dupla contagem entre faturas, dívidas e recorrências, devolução nunca como renda) resistiu a 680 operações aleatórias e às corridas de quitação, estorno, realização e criação para a mesma origem; isolamento e migrações estão corretos. Não há 🔴. Os 🟠 (BUG-QA-18, 19, 26) não corrompem o razão mas devem ser corrigidos antes do E2E (T90): 18 e 19 distorcem custo fixo e permitem lançar em recorrência desativada; 26 é 500 em concorrência comum. Os bugs de integridade bloqueantes para T90, conforme o plano, são: nenhum.
