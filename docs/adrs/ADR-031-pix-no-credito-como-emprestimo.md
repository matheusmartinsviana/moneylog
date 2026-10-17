# ADR-031: Pix no crédito como empréstimo (`kind`, `channel` e alerta de custo)

Status: **PROPOSTA** (2026-10-15). P-30 e P-33 são decisões provisórias delegadas pelo dono. Contrato: 2.29.0 (o alerta `CARD_CASH_OUT_COST` entra no `NotificationKind` em 2.32.0, ADR-028). Complementa a ADR-013 (total de dívidas e parcelado em andamento).

## Contexto
O Pix no crédito (saque de crédito) coloca dinheiro na conta e cobra juros, parcelado na fatura do cartão. Se for lançado como compra comum, o principal vira **consumo** e a renda, o consumo e o patrimônio ficam errados; se for lançado só como entrada em conta, vira **renda**. Nenhum dos dois é correto: é dinheiro emprestado (PR 01: "dinheiro emprestado não é renda; empréstimo não é despesa"; regras 2 e 4).

## Decisão

### Provisórias (delegadas pelo dono em 2026-10-15)
| # | Decisão |
|---|---|
| P-30 | Pix no crédito é **empréstimo**: o principal entra em conta sem consumo, os juros são o custo e as parcelas vão na fatura. Para terceiro, o principal vira `RECEIVABLE`. O empréstimo ganha `kind` (`PERSONAL`, `PAYROLL`, `CARD_CASH_OUT`) e `channel`. |
| P-33 | Além de `NEW_DEBT_BEFORE_FINANCING`, o `NotificationKind` `CARD_CASH_OUT_COST` avisa ao registrar um Pix no crédito, com a taxa efetiva mensal (TIR, P-17) e o valor das parcelas. |

### 1. Lançamentos (soma zero)
Exemplo sintético: principal 1.000,00, 4 parcelas de 280,00 no Cartão A (total 1.120,00, juros 120,00).

| Caso | Lançamentos |
|---|---|
| Para mim (`accountId` na conta que recebe) | `ACCOUNT +1.000,00`, `EXPENSE(juros) +120,00`, `CARD -1.120,00` |
| Para uma pessoa (`beneficiaryPersonId`, sem conta) | `RECEIVABLE(pessoa) +1.000,00`, `EXPENSE(juros) +120,00` (o juro que eu absorvo), `CARD -1.120,00` |

- O recebimento em conta **não é renda**; o principal **não é consumo**: o consumo do mês não sobe 1.000,00. Só os juros são despesa.
- A parcela de 280,00 compõe a fatura cheia (caixa e dívida do cartão cheios, regra 4) e entra em `cardsMine` do `owner-statement` como saída de caixa (ADR-023); para terceiro, o principal fica em "a receber" e não em `cardsMine` da minha parte.
- Os juros são distribuídos pelas parcelas; a parte do principal de cada parcela é o principal dividido, e o resto de centavo vai para a primeira parcela (S-3).
- Juros em categoria própria (`interestCategoryId`; padrão, a categoria padrão de despesa).

### 2. Cálculo do total
Informar `totalWithInterest` **ou** `rateBps` (taxa mensal em pontos-base, parcelas iguais pelo sistema de parcelas fixas), nunca os dois (`422 CARD_CASH_OUT_INVALID`). Total abaixo do principal: `422`. Todo cálculo em inteiros, sem ponto flutuante (ArchUnit), arredondamento único.

### 3. `kind`, `channel` e taxa efetiva
- `Debt.kind`: `PERSONAL` (padrão), `PAYROLL` (consignado em folha, ADR-026), `CARD_CASH_OUT`. `Debt.channel`: texto livre (até 60).
- `Debt.effectiveRate` (`monthlyBps`, `annualBps`, `method: IRR`) existe quando há valor recebido e cronograma conhecido: no Pix no crédito, o principal e as parcelas da fatura; no consignado, as parcelas da rubrica `LOAN`. Parcelas que somam o principal: taxa 0. Sem cronograma, ausente. (O `Debt` hoje não guarda cronograma próprio; a F4 deriva do cartão ou da folha.)
- O `CARD_CASH_OUT` entra no total de dívidas (ADR-013) e na TIR.

### 4. Alertas
- Ao registrar: `NEW_DEBT_BEFORE_FINANCING` se há financiamento pendente (P-20) e `CARD_CASH_OUT_COST` uma vez, com a taxa efetiva mensal e o valor da parcela (idempotente por dia, ADR-012; funciona sem IA).

### 5. Contrato
`POST /v1/card-cash-outs` `{ cardId, accountId?, principal, installments, totalWithInterest | rateBps, firstInvoiceDate, beneficiaryPersonId?, interestCategoryId?, channel? }` devolve a `Debt` (`201` + `Location`). **Desvio do plano:** o plano não listava `accountId`; ele é necessário para o `ACCOUNT +principal` (obrigatório sem beneficiário, proibido com beneficiário) e `interestCategoryId` é opcional.

## Alternativas consideradas
1. **Compra comum parcelada**: rejeitada (principal viraria consumo).
2. **Só entrada em conta**: rejeitada (viraria renda; sem custo registrado).
3. **Juros sem categoria**: rejeitada, o custo precisa aparecer nos relatórios.

## Consequências
- Migração `V9.08__alter_debts_kind_channel.sql` (F5; nome a renumerar no merge); dívidas antigas ficam `PERSONAL`.
- O backup precisará incluir `kind`/`channel` (pendência de contrato do backup em F5).
- A fatura reflete a parcela cheia; para terceiro, a parte do principal sai do meu consumo e fica em "a receber" (ADR-022 não se aplica: aqui o principal é `RECEIVABLE`, sem rateio por parcela).

## Plano de quitação
F5 (backend), F7 (tela), I3 (alerta), F8/I5 (QA). Revisar P-30/P-33 depois do primeiro uso real.

## O que o dono precisa aprovar
1. Pix no crédito como empréstimo, com principal fora do consumo e da renda.
2. A categoria dos juros e o `accountId` obrigatório sem beneficiário.
3. O alerta `CARD_CASH_OUT_COST` ao registrar.
