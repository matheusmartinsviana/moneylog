# QA · Backend da Etapa 1 (T12)

- **Plano:** `docs/planos/2026-10-03-etapa-1-dominio-arquitetura.md`, T12
- **Escopo:** domínio puro (T2–T10, incluindo T6a/T6b e T8a/T8b) e migrações (T11)
- **Data:** 2026-10-04 · **Agente:** tester
- **Ambiente:** JDK 21 (`/opt/homebrew/opt/openjdk@21`), Maven Wrapper, Docker Desktop (Testcontainers `postgres:17`)
- Nenhum código de produção foi alterado. Só foram adicionados testes. Nada foi commitado.

## 1. Resumo

O build passa: `./mvnw clean verify` termina verde com 485 testes unitários e 59 de integração, e a cobertura de linhas do `core` é de 99,36% (o mínimo é 90%). Os 9 casos do PR 01 e o ciclo do cartão sem dupla contagem passam. Também passou um **teste de propriedade novo**: 40 sementes fixas × 160 operações aleatórias válidas. Ele confirma que o razão fecha em zero, que não há dupla contagem e que o saldo do livro `CARD` bate com Σ outstanding − crédito.

As lacunas que achei ficam **nas bordas**. São 6 bugs: 4 🟠 e 2 🟡, nenhum 🔴. Três deles são divergências entre o schema e o domínio, que a T12 CA5 classifica como 🟠. Os outros três são regras de D1 que o domínio não cumpre em caminhos que só entram em uso nas Etapas 3 e 4 (mudança do dia de fechamento e recorrência no cartão) ou que dependem de decisão de produto (teto de valor). Cada bug tem um teste `@Disabled("BUG-QA-xx ...")` que falha hoje e vai passar quando o bug for corrigido.

**Parecer: 🟡 Aprovado com ressalvas** (ver §6).

## 2. Execução real

### 2.1 Linha de base (antes de qualquer teste novo)

```
[INFO] Tests run: 403, Failures: 0, Errors: 0, Skipped: 0
[INFO] Tests run: 56, Failures: 0, Errors: 0, Skipped: 0
[INFO] All coverage checks have been met.
[INFO] BUILD SUCCESS
core: 2006/2020 linhas = 99,31%
```

### 2.2 Final (com os testes da T12), `./mvnw clean verify`

```
[INFO] Tests run: 5, Failures: 0, Errors: 0, Skipped: 0 -- in com.moneylog.architecture.ArchitectureTest
[INFO] Tests run: 485, Failures: 0, Errors: 0, Skipped: 4      (surefire, *Test)
[INFO] Tests run: 59, Failures: 0, Errors: 0, Skipped: 2       (failsafe, *IT)
[INFO] All coverage checks have been met.
[INFO] BUILD SUCCESS
[INFO] Total time:  22.711 s
core: 2007/2020 linhas = 99,36%   (jacoco.csv, pacote com.moneylog.core..)
```

Os 6 testes pulados são exatamente os `@Disabled` que documentam os bugs da §3. Rodando com `-Djunit.jupiter.conditions.deactivate=org.junit.*DisabledCondition`, todos os 6 falham, e essa saída é a evidência de cada bug.

### 2.3 CA6: violação temporária `core → infra`

Criei temporariamente `core/qatemp/QaViolacaoTemp`, que instancia `infra/qatemp/QaInfraTemp`, e rodei `./mvnw test -Dtest=ArchitectureTest`:

```
[ERROR] com.moneylog.architecture.ArchitectureTest.coreNaoDependeDeFrameworkNemDeInfra <<< FAILURE!
Constructor <com.moneylog.core.qatemp.QaViolacaoTemp.<init>()> calls constructor <com.moneylog.infra.qatemp.QaInfraTemp.<init>()> in (QaViolacaoTemp.java:3)
Field <com.moneylog.core.qatemp.QaViolacaoTemp.x> has type <com.moneylog.infra.qatemp.QaInfraTemp> in (QaViolacaoTemp.java:0)
[INFO] BUILD FAILURE
```

Removi as duas classes e o `clean verify` final passou sem elas. ✅

## 3. Bugs

### BUG-QA-01 · 🟠 · Fatura com vencimento igual ao fechamento é recusada pelo schema (contrato schema × domínio)

- **Reproduzir:** cartão com fechamento 30 e vencimento 31 (ou 29/30, 28/29, ou 29/31 em ano bissexto). Gerar `calendar().periodClosingIn(2027-02)` e gravar a fatura em `credit_card_invoices`.
- **Esperado:** toda fatura que o domínio gera é gravável. Pela regra 3 do D1 §2.5.1, o vencimento cai depois do fechamento.
- **Obtido:** o clamp leva as duas datas para 28/02/2027, e o domínio gera `dueDate == closingDate`. O mesmo acontece em todo mês de 30 dias com fechamento 30 e vencimento 31. O Postgres recusa a linha:
  ```
  ERROR: new row for relation "credit_card_invoices" violates check constraint "ck_credit_card_invoices_due_after_closing"
  ```
- **Evidência:** `SchemaDominioLimitesQaIT.deveGravarFaturaComClampDoVencimento` e `BordasCalendarioQaTest.deveVencerDepoisDoFechamento` (5 combinações). As duas falham com o `@Disabled` desativado.
- **Camada:** back (domínio `InvoiceCalendar`/`BillingRule.dueInSameMonth` × migração V1.04). É preciso decidir se, depois do clamp, o vencimento vai para o mês seguinte ou se o CHECK passa a aceitar `>=`. A decisão é de produto.

### BUG-QA-02 · 🟠 · A recorrência no cartão realizada com atraso cai em fatura PAID (back)

- **Reproduzir:** compra de 100 em 05/10 (fatura que fecha em 25/10), paga em 05/11, e a fatura fica `PAID`. Em 06/11, `RecurringTransaction.realize(10/10, ...)` de uma recorrência mensal no cartão iniciada em 10/10.
- **Esperado (S-14, D1 §2.5.3):** "fatura PAID nunca recebe item novo". O item deveria ir para a fatura corrente (25/11) com `lateEntry`.
- **Obtido:** a parcela entra na fatura de 25/10:
  ```
  expected: 2026-11-25
   but was: 2026-10-25
  ```
  A fatura paga volta a ter saldo devedor (`OVERDUE`). A causa é que `realize()` chama `CardTransactions.purchase(header, value, card, category, 1)`, a versão que usa só o calendário e não recebe a `InvoiceChain` nem "hoje".
- **Evidência:** `BordasCalendarioQaTest.naoDeveRealizarRecorrenciaEmFaturaPaga`.
- **Camada:** back (`RecurringTransaction.realize`). Risco relacionado: a sobrecarga pública `CardTransactions.purchase(...)` sem cadeia pode ser usada por engano pelo caso de uso da Etapa 2/3 e causar o mesmo efeito.

### BUG-QA-06 · 🟠 · Mudar o dia de fechamento deixa parcelas futuras órfãs e quebra a invariante do cartão (back)

- **Reproduzir:** cenário base, compra de 1.200 em 6x em 10/10/2026, depois `roxinho.changeBillingDays(10, 20, 15/10/2026)`. Comparar Σ `total` das faturas da `InvoiceChain` com −saldo `CARD`.
- **Esperado (D1 §2.5.1 regra 6 / S-42, invariante D1 §4 item 11):** as faturas `FUTURE` têm as datas recalculadas, as parcelas continuam no mesmo ciclo e Σ total − Σ paid = −CARD.
- **Obtido:**
  ```
  expected: BRL 1200.00
   but was: BRL 200.00
  ```
  As parcelas 2 a 6 guardam o `invoiceClosingDate` antigo (25/11, 25/12...). A cadeia monta as faturas pela regra nova (10/11, 10/12...) e filtra os itens por data de fechamento igual, então 1.000,00 somem das faturas, dos compromissos e do status. Não existe operação de domínio que realoque as parcelas. Mudar só o vencimento não dispara o bug, porque o fechamento não muda.
- **Evidência:** `MudancaDeDiaQaTest.deveManterAsParcelasNasFaturasDepoisDaMudanca`.
- **Camada:** back (`CreditCard.changeBillingDays` + `InvoiceChain`). A T5 CA9 só testou as datas do calendário, sem parcelas existentes.

### BUG-QA-05 · 🟠 · Textos aceitos pelo domínio não cabem nas colunas (contrato schema × domínio)

- **Reproduzir:** `Debt.withoutMovement(..., description = "x" × 300)` e `Account.open(..., institution = "i" × 150, ...)`. Gravar em `debts` e `accounts`.
- **Esperado:** o domínio valida o tamanho (422 com `code`), e o banco não precisa recusar.
- **Obtido:** o domínio aceita, e o Postgres recusa: `ERROR: value too long for type character varying(200)`. Na Etapa 2 isso viraria 500. A mesma lacuna aparece em `accounts.institution` e `credit_cards.institution` (VARCHAR(100)), porque `Account`/`CreditCard` só fazem `strip()`. Já `Debt.TEXT_MAX_LENGTH = 500` vale só para o motivo, não para a descrição.
- **Evidência:** `SchemaDominioLimitesQaIT.deveCaberOsTextosAceitosPeloDominio`.
- **Camada:** back (Debt, Account, CreditCard) × migrações V1.02, V1.03 e V1.05.

### BUG-QA-04 · 🟡 · Duplicata forçada: o domínio diverge de S-43, e a reimportação depois de estornar a original duplica (back/contrato)

- **Reproduzir:** forçar uma linha `DUPLICATE` (`forceImport(lote)`), gravar a movimentação com `effectiveKey()`, estornar a movimentação original e reclassificar a mesma linha.
- **Esperado (D1 §6, S-43, comentário da V1.06):** a forçada fica com `dedup_key = NULL` e a chave original fica em `original_dedup_key`, de modo que a reimportação continua `DUPLICATE`.
- **Obtido:** `effectiveKey()` devolve uma chave derivada do lote (`forcedIn`), e não `null`. Com o que o domínio entrega, a reimportação vira `PENDING` (`expected: DUPLICATE but was: PENDING`) e a mesma linha seria importada uma terceira vez. Isso fere a regra 9 do PR 01.
- **Evidência:** `DeduplicacaoQaTest.naoDeveDuplicarDepoisDeForcarEEstornar`.
- **Camada:** back (`ImportLineReview`, `ExistingEntry`), na etapa de importação (Etapa 7). O plano diz que "T10 não muda", mas o domínio e o schema precisam concordar antes do gateway.

### BUG-QA-03 · 🟡 · Sem teto de valor: dois lançamentos gigantes travam as lentes (back)

- **Reproduzir:** duas despesas de `Long.MAX_VALUE/2 + 1` centavos na mesma categoria e depois `ledger.balance(categoria)`.
- **Esperado:** um erro de digitação desse tamanho é barrado na entrada (regra transversal 5: as validações existem para impedir erro de digitação).
- **Obtido:** cada valor é aceito, mas toda leitura que soma o livro lança `MoneyOverflowException`. Não há wrap silencioso, o que está correto, mas o dashboard e os saldos ficam indisponíveis.
- **Evidência:** `MoneyOverflowQaTest.deveDocumentarOverflowNaAgregacao`. O teste passa e documenta o comportamento atual.
- **Camada:** back. Proposta: teto por movimentação (ex.: R$ 1 trilhão), a decidir com o produto.

## 4. Casos executados

### 4.1 CA2: matriz PR 01 (vault) × D1 §3 × teste

| #   | Situação                                    | Vault PR 01                                                   | D1 §3                                                                                           | Teste                                                                                                | Resultado     |
| --- | ------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------- |
| 1   | Pix 100 restaurante                         | caixa −100, consumo +100, patrim. −100                        | igual                                                                                           | `IntegridadeFinanceiraPR01Test.caso1`, `CompromissosPR01Test.naoDeveMudarCompromisso[1]`             | ✅            |
| 2   | 1.200 em 6x                                 | caixa 0; 200/mês; patrim. "—"; compromisso +1.000 + parcela 1 | patrim. −200 em out/26 (S-8), `cardFutureInstallments` 1.000; compromisso +1.200; limite −1.200 | `...PR01Test.caso2`, `CompromissosPR01Test.caso2`                                                    | ✅ (ver nota) |
| 3   | Pagar fatura 1.283                          | caixa −1.283, consumo 0, compromisso −1.283                   | igual + fatura e parcelas `PAID`                                                                | `...PR01Test.caso3`, `CompromissosPR01Test.caso3`                                                    | ✅            |
| 4   | Nubank → XP 1.000                           | 0 líquido, consumo 0, patrim. 0                               | igual                                                                                           | `...PR01Test.caso4`, `naoDeveMudarCompromisso`                                                       | ✅            |
| 5   | Investir 10.000                             | −10.000 / +10.000, consumo 0                                  | igual                                                                                           | `...PR01Test.caso5`, `naoDeveMudarCompromisso`                                                       | ✅            |
| 6   | Emprestar 300                               | −300, consumo 0, recebível +300, cobrança prevista            | igual                                                                                           | `...PR01Test.caso6`, `CompromissosPR01Test.caso6`                                                    | ✅            |
| 7   | João devolve 300                            | +300, não é renda, recebível −300                             | igual + dívida `SETTLED`                                                                        | `...PR01Test.caso7`, `CompromissosPR01Test.caso7`                                                    | ✅            |
| 8   | Devo 200 sem movimentação                   | caixa 0, passivo +200, pagamento previsto                     | igual                                                                                           | `...PR01Test.caso8`, `CompromissosPR01Test.caso8`                                                    | ✅            |
| 9   | Reembolso 50                                | +50, −50 na categoria original                                | igual                                                                                           | `...PR01Test.caso9`, `naoDeveMudarCompromisso`                                                       | ✅            |
| —   | Ciclo do cartão, 6 faturas, a maior/a menor | regra 1                                                       | §2.5.4                                                                                          | `CicloCartaoSemDuplaContagemTest` (2 variantes) + **`PropriedadesRazaoAleatorioTest` (40 sementes)** | ✅            |
| —   | Lista × dashboard (regra 10)                | regra 10                                                      | §2.10                                                                                           | `ListaDashboardConsistenciaTest` + propriedade 6 do teste aleatório                                  | ✅            |

**Nota sobre o caso 2:** o vault diz "Patrimônio —" e o D1 diz −200 em out/26 com o resto por competência. A divergência é deliberada (S-8, impacto alto, "a validar com o usuário"), e o teste segue o D1. Se o usuário escolher a alternativa (−1.200 na data da compra), mudam os dados de `IntegridadeFinanceiraPR01Test.caso2` e o `NetWorth`.

### 4.2 CA3: máquinas de estado e status derivados

Já havia cobertura com matriz completa: `CreditCardInvoiceTest` (status hoje × outstanding, CA9 status × operação), `DebtTest` (CA10 operações × status), `TransactionVoidTest` (ACTIVE/VOIDED, `@EnumSource`), `AccountTest` (status × ação) e `CardLimitAndVoidTest` (guardas S-36). Acrescentei `EstornosEGuardasQaTest`, que cobre:

- a guarda vira exatamente no dia do fechamento (estornável em 24/10, recusada em 25/10, sem mudar o estado);
- correção pós-fechamento (cancelar as restantes + reembolso tardio de 200 no ciclo) fecha com CARD = 0, EXPENSE = 0 e fatura `PAID`;
- estorno do pagamento: `PAID` → `CLOSED` até o vencimento e `OVERDUE` depois; o crédito transportado some;
- reembolso no cartão estornável em `FUTURE` e recusado depois que a fatura fecha;
- reembolso maior que o original (soma com os anteriores) é recusado, e o reembolso exato é aceito. ✅

### 4.3 CA4: bordas

| Borda                                                                                                                                          | Teste                                                                                                                                                                  | Resultado                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Fechamento 29/30/31, fevereiro bissexto e não bissexto, abril (30)                                                                             | `BordasCalendarioQaTest.deveAlocarNasBordas` (16 casos)                                                                                                                | ✅                                          |
| Virada de ano (fechamento em 31/12, compra em 25/12 e 31/12)                                                                                   | idem                                                                                                                                                                   | ✅                                          |
| Vencimento 31 com clamp em mês curto                                                                                                           | idem; com vencimento = fechamento → **BUG-QA-01**                                                                                                                      | 🟠                                          |
| Parcelas de 31/01 (28/02, 31/03, 30/04)                                                                                                        | `deveFazerClampDasParcelas`                                                                                                                                            | ✅                                          |
| 0,01 em 1x; resto na 1ª parcela (100,00/7)                                                                                                     | `deveAceitarCentavo`                                                                                                                                                   | ✅                                          |
| Fuso America/Sao_Paulo (23h30 de 24/10 em SP é 25/10 em UTC)                                                                                   | `deveUsarADataLocalDeSaoPaulo`                                                                                                                                         | ✅                                          |
| Propriedade: 31 × 31 dias × 1.240 datas (2027–2029): período contíguo, compra dentro do período, fechamento > compra, ref. = mês do vencimento | `deveSerContiguoParaTodosOsDias`                                                                                                                                       | ✅ (com `due ≥ closing`; `>` é o BUG-QA-01) |
| Pagamento a maior, antecipado, parcial, estorno do pagamento, reembolso > fatura aberta, lançamento tardio com fatura paga e não paga          | `CreditCardInvoiceTest`, `CardLimitAndVoidTest`, `EstornosEGuardasQaTest` e o gerador aleatório (pagamentos parcial/total/a maior, compras retroativas de até 25 dias) | ✅                                          |
| Mudança de vencimento                                                                                                                          | `InvoiceCalendarTest`                                                                                                                                                  | ✅                                          |
| Mudança de fechamento com parcelas existentes                                                                                                  | `MudancaDeDiaQaTest`                                                                                                                                                   | 🟠 **BUG-QA-06**                            |
| Recorrência no cartão realizada com atraso                                                                                                     | `BordasCalendarioQaTest.naoDeveRealizarRecorrenciaEmFaturaPaga`                                                                                                        | 🟠 **BUG-QA-02**                            |
| Invariante do cartão (D1 §4, item 11)                                                                                                          | `PropriedadesRazaoAleatorioTest` (todo passo, 6.400 verificações)                                                                                                      | ✅                                          |
| Overflow de Money                                                                                                                              | `MoneyOverflowQaTest` (limites de string, abs/negate do mínimo, soma, times, allocate de `Long.MAX` em 36, compra no limite)                                           | ✅ + **BUG-QA-03** 🟡                       |
| Importação: extrato estendido, janela ±1 dia exata, virada de ano, 29/02, descrição vazia                                                      | `DeduplicacaoQaTest`                                                                                                                                                   | ✅ + **BUG-QA-04** 🟡                       |

### 4.4 Teste de propriedade (sem dependência nova)

`PropriedadesRazaoAleatorioTest` usa `Random(seed)` com as sementes 1..40 e roda 160 passos por semente, com "hoje" avançando de 0 a 4 dias por passo a partir de 01/10/2026. As operações sorteadas são: despesa (todos os meios), receita, transferência nos dois sentidos, aplicação/resgate, compra parcelada 1..12x com data retroativa de até 25 dias (lançamento tardio e fatura paga), reembolso no cartão retroativo, pagamento total/parcial/a maior em fatura `OPEN`/`CLOSED`/`OVERDUE`, estorno aleatório com a guarda real e cancelamento das parcelas restantes. Depois de cada passo, o teste verifica:

1. Σ dos postings ativos = 0, e cada grupo (origem + parcela) também fecha em zero;
2. Σ EXPENSE = despesas + parcelas vivas − reembolsos; nenhuma compra é contada além do valor dela; `INVOICE_PAYMENT`, `TRANSFER` e `INVESTMENT` nunca tocam EXPENSE/INCOME; Σ das parcelas = valor da compra;
3. Σ outstanding − creditCarry = Σ total − Σ paid = −CARD (todas as datas), e há no máximo uma fatura `OPEN`;
4. limite disponível = limite + CARD;
5. nenhum item entra em fatura `PAID`, e item em fatura fechada não paga sempre tem `lateEntry`;
6. em 12+ competências: despesas pagas + crédito − reembolsos = consumo = `EntryReport(CONSUMPTION).total`, e `EntryReport(INCOME).total` = receita;
7. fluxo de caixa líquido = Σ postings de movimentação nas contas CASH.

Resultado: 40/40 ✅ (cerca de 7 s).

### 4.5 CA5: migrações × domínio

O IT de alinhamento já existente (`SchemaDomainAlignmentIT`) cobre os enums (`TransactionType` com 11 valores, `source_type` com 4, etc.). Ainda faltavam os limites e as datas. Acrescentei `SchemaDominioLimitesQaIT`, que cria os dados pelo domínio e grava no Postgres real:

- faturas de fechamento 31 em jan/fev/mar de 2027, fev/2028 e dez/2026 gravam ✅;
- vencimento = fechamento depois do clamp → **BUG-QA-01** 🟠;
- `debts.description` (200) e `accounts.institution`/`credit_cards.institution` (100) não são validados no domínio → **BUG-QA-05** 🟠;
- conferido sem divergência: `transactions.description` 200 = `TransactionHeader` 200; `reason`/`void_reason`/`closure_reason` 500 = domínio; `categories.name` 60 = `Category` 60; nomes de conta, cartão e pessoa 100 = domínio; parcelas 1..36; dias 1..31; fatura sem coluna de status; `uq (card_id, closing_date)`.
- `dedup_key` da duplicata forçada: o schema e o D1 dizem NULL, o domínio devolve a chave derivada → **BUG-QA-04** 🟡 (lado do contrato).

## 5. Testes adicionados

| Arquivo                                                                               | Testes                                   | Observação                                         |
| ------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------- |
| `backend/src/test/java/com/moneylog/core/finance/PropriedadesRazaoAleatorioTest.java` | 40                                       | propriedade com seed fixa                          |
| `backend/src/test/java/com/moneylog/core/card/domain/BordasCalendarioQaTest.java`     | 22 (2 `@Disabled`: BUG-QA-01, BUG-QA-02) | bordas de data e fuso                              |
| `backend/src/test/java/com/moneylog/core/card/domain/EstornosEGuardasQaTest.java`     | 5                                        | guardas e correções                                |
| `backend/src/test/java/com/moneylog/core/card/domain/MudancaDeDiaQaTest.java`         | 1 (`@Disabled`: BUG-QA-06)               | S-42 com parcelas                                  |
| `backend/src/test/java/com/moneylog/core/sk/money/MoneyOverflowQaTest.java`           | 5                                        | overflow (inclui BUG-QA-03, que passa e documenta) |
| `backend/src/test/java/com/moneylog/core/importing/domain/DeduplicacaoQaTest.java`    | 9 (1 `@Disabled`: BUG-QA-04)             | dedup                                              |
| `backend/src/test/java/com/moneylog/infra/migration/SchemaDominioLimitesQaIT.java`    | 3 (2 `@Disabled`: BUG-QA-01, BUG-QA-05)  | Postgres real                                      |

Para rodar só os bugs: `./mvnw verify '-Djunit.jupiter.conditions.deactivate=org.junit.*DisabledCondition'` (falha com os 6 bugs). Quando um bug for corrigido, o dev remove o `@Disabled` correspondente.

## 6. Riscos e pendências

- **`CardTransactions.purchase` sem cadeia** é pública. Na Etapa 2/3, o caso de uso precisa usar a sobrecarga com `InvoiceChain` + "hoje", senão a S-14 é violada (o mesmo mecanismo do BUG-QA-02).
- **S-8 (patrimônio do caso 2)** diverge do texto do vault por decisão registrada e ainda pendente com o usuário.
- `FlywayMigrationIT` usa `UUID.randomUUID()` nos helpers, o que vai contra a convenção de BE 07 (UUIDs fixos). É menor e não afeta o resultado.
- `Debt`: a quitação datada antes da data da dívida não é validada. Não encontrei regra para isso no D1. É uma pergunta para o produto, não um bug.
- Os bugs 02 e 06 só entram em uso nas Etapas 3/4 (cartões e recorrências), mas a correção é de domínio e deve vir antes do gateway da etapa que expuser essas operações. Os bugs 01 e 05 afetam a gravação a partir da Etapa 2/3.
- O caminho de API (400/401/403/404/409/422/500) ainda não existe nesta etapa. Fica para a T12 da Etapa 2.

## 7. Parecer: 🟡 Aprovado com ressalvas

Todos os critérios de aceite da T12 foram verificados com testes rodados. O build está verde com cobertura de 99,36% no `core`. Os 9 casos do PR 01, o ciclo sem dupla contagem e a invariante do cartão se mantêm, inclusive sob 6.400 passos aleatórios, e o `ArchitectureTest` barra `core → infra`. Não há 🔴: nenhum caminho usado na Etapa 1 gera dupla contagem nem trata transferência, investimento ou empréstimo como despesa. As ressalvas são os quatro 🟠: BUG-QA-01 e BUG-QA-05, que são divergências entre schema e domínio, e BUG-QA-02 e BUG-QA-06, que são regras do D1 (S-14, S-42) não cumpridas fora do caminho feliz. Os 🟠 devem voltar ao dev-backend antes de começar os gateways da Etapa 2 (01 e 05) e antes da etapa de cartões e recorrências (02 e 06). Os 🟡 (03 e 04) precisam de decisão de produto ou de contrato.
