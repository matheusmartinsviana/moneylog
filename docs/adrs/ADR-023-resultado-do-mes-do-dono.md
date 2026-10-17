# ADR-023: resultado do mês do dono (defasagem da renda, saldo acumulado, mês da fatura e composição sem dupla contagem)

Status: **PROPOSTA** (2026-10-15). P-1, P-2, P-3 e P-27 foram decididas pelo dono em 2026-10-15 (seção "Decididas"); o detalhe de P-2 (só contas `CASH`, sem cheque especial) e P-29, P-32 são provisórios (delegação do dono) e esperam a aprovação. Contrato: 2.25.0. Complementa a ADR-017 (competência de renda); usa a visão `MINE` da ADR-022.

## Contexto
O dono quer ver, por mês, quanto do salário sobra depois de tudo que é dele: entradas, saídas (fatura no mês do vencimento, parcelas, assinaturas, fixas e variáveis fora do cartão, minha cota do imóvel), sobra e saldo acumulado. O sistema já tem peças (`MonthlySummary`, `Projection`, `CommitmentSchedule`, faturas por parcela da ADR-006), mas nenhuma compõe "o mês do dono" e nenhuma impede que o mesmo item entre por duas fontes: uma assinatura no cartão aparece como ocorrência prevista da recorrência **e** como parcela da fatura (PR 01, regra 1: dupla contagem).

Regras do PR 01 que valem: 1 (sem dupla contagem), 3 (pagar fatura e transferência não são despesa), 4 (caixa e dívida do cartão cheios), 10 (mesma fonte para tela e lista), 11 (o que me devem não é renda).

## Decisão

### Decididas pelo dono em 2026-10-15
| # | Decisão |
|---|---|
| P-1 | Renda de competência M-1 paga a coluna do mês M (`incomeLagMonths = 1`, parâmetro de configuração). |
| P-2 | Âncora do saldo acumulado = saldo atual das contas. Visível na API (`openingBalance`). |
| P-3 | A fatura conta no mês do **vencimento**. |
| P-27 | A leitura é `MINE` (ADR-022); o bruto da fatura aparece ao lado como `cardsGross`. |

### Provisórias (delegadas pelo dono, revisáveis)
| # | Decisão |
|---|---|
| P-2 (detalhe) | `openingBalance` soma só contas `CASH`, sem cheque especial. |
| P-29 | Despesa antiga: forma `OTHER`, natureza `VARIABLE`; recorrência ativa de despesa conta como `FIXED`. |
| P-32 | Para `from` posterior ao mês corrente, `openingBalance` = saldo atual das contas `CASH`, sem projetar o resto do mês corrente, com aviso `OPENING_BALANCE_NOT_PROJECTED`. |
| P-10 | Assinatura `COMPANY` no meu cartão fica fora de `outflow.total` e vai em `companyReimbursable` (informativo). |
| P-19 | Imóvel sem cota definida: conta 100% minha, aviso `REAL_ESTATE_SHARE_UNDEFINED`, `confidence = ESTIMATED`. |

### 1. Fórmula do mês M
```
income.total(M)  = Σ parcelas de pagamento da competência (M - incomeLagMonths), com a data real de cada uma
outflow.total(M) = cardsMine + offCard.fixed + offCard.variable + realEstateMine
surplus(M)       = income.total(M) - outflow.total(M)
endBalance(M)    = openingBalance + surplus(M)                  (primeiro mês)
endBalance(M)    = endBalance(M-1) + surplus(M)                 (meses seguintes)
```
`cardsGross` (fatura cheia), `subscriptionsMine` (recorte de `cardsMine`) e `receivablesPending` (o que me devem) são informativos: **nunca** entram em `outflow.total`, `surplus` nem `endBalance`. O recebível não é renda (regra 11).

### 2. Composição de `outflow` por fonte, com chave de deduplicação
| Fonte | Entra em | Chave de dedup |
|---|---|---|
| Faturas (lançadas e abertas) com vencimento em M | `cardsMine` / `cardsGross` | `invoiceId` |
| Parcelas futuras de compras existentes, na fatura-alvo (ADR-006) | `cardsMine` | `(transactionId, número da parcela)` |
| Ocorrências **previstas** de recorrência no cartão, ainda sem lançamento, na fatura da data | `cardsMine` (recorte `subscriptionsMine` se for assinatura) | `(recurrenceId, occurrenceDate)` |
| Despesas fora do cartão lançadas, por `method` e `nature` | `offCard` (fixas e variáveis) | `transactionId` |
| Ocorrências previstas de recorrência fora do cartão | `offCard.fixed` | `(recurrenceId, occurrenceDate)` |
| Itens de compromisso/imóvel não pagos (minha cota, bloco H) | `realEstateMine` ou `offCard` | `(commitmentId, position)` (o item de cronograma não tem id próprio no contrato) |

Regras:
1. Quando uma ocorrência prevista é lançada, o lançamento carrega `(recurrenceId, occurrenceDate)` e a prevista **deixa de existir** na composição. Assim a assinatura aparece uma única vez antes e depois de lançada.
2. Um item só entra por uma fonte. Se a fatura-alvo já contém a parcela, a parcela futura não é somada de novo (a fatura é a fonte; a parcela é a fonte só enquanto não há fatura materializada para ela).
3. Pagamento de fatura e transferência entre contas nunca entram (regra 3).
4. Parcela de consignado vinculada a rubrica `LOAN` da folha não entra (ADR-026): já foi descontada da renda líquida.
5. A parte de terceiro (`RECEIVABLE`) não entra em `cardsMine`; só em `cardsGross` e em `receivablesPending`.

### 3. Defasagem, âncora e mês da fatura
- **Defasagem (P-1):** `income` da coluna M usa as parcelas da competência M-1. `income.total` e `income.items` usam a mesma base. A leitura alternativa (**leitura B**, por data de recebimento) está documentada abaixo e, se o dono a quiser, vira o parâmetro `incomeBasis = COMPETENCE|RECEIPT_DATE`; o contrato 2.25.0 não o expõe.
- **Âncora (P-2, P-32):** `openingBalance` é o saldo atual das contas `CASH`. Quando `from` é posterior ao mês corrente, o resto do mês corrente não é projetado e o aviso `OPENING_BALANCE_NOT_PROJECTED` é devolvido.
- **Mês da fatura (P-3):** fatura com fechamento em M-1 e vencimento em M cai em M.
- **Mês corrente:** só o que ainda falta acontecer; `openingBalance` já reflete o que passou.

Exemplo sintético da diferença entre as leituras: adiantamento de 40% no dia 16 da competência e saldo no dia 1 do mês seguinte. Competência setembro: líquido 5.000 (2.000 em 16/set, 3.000 em 01/out). Competência outubro: líquido 6.000 (2.400 em 16/out, 3.600 em 01/nov).

| Coluna | Leitura A (decidida: competência M-1) | Leitura B (alternativa: por data) |
|---|---|---|
| Outubro | 5.000 | 3.000 + 2.400 = 5.400 |
| Novembro | 6.000 | 3.600 + 2.400 = 6.000 |

### 4. Contrato e dados
- `GET /v1/owner-statement?from=AAAA-MM&months=1..12&asOf=AAAA-MM-DD` (padrão `months=3`); a janela de aceite da rodada é novembro de 2026 (`from=2026-11`, `months=1`); `months` maior que 1 tem o mesmo cálculo, sem aceite.
- `Transaction` e `Recurrence` ganham `nature` (`FIXED|VARIABLE`). **Desvio do plano:** o plano previa também `paymentMethod`; o contrato já tem `method` (`PaymentMethod`: `CASH`, `DEBIT`, `PIX`, `TRANSFER`, `BOLETO`, `OTHER`) em despesa e recorrência, e criar um segundo campo para a mesma coisa duplicaria a fonte. `OwnerOutflow.offCard.byMethod` usa o `PaymentMethod` existente. Migração `V9.03__add_payment_method_and_nature.sql` (B2a) passa a ser só de `nature` (nome a renumerar no merge).
- `status` do item de renda é derivado na leitura (`PLANNED` ou `RECEIVED` contra `asOf`); `confidence` é `CONFIRMED` até a proveniência (bloco I).
- Avisos: `OPENING_BALANCE_NOT_PROJECTED`, `INCOME_MISSING` (mês sem renda de competência: `income.total = 0`), `REAL_ESTATE_SHARE_UNDEFINED`.
- Erro `400 OWNER_STATEMENT_PERIOD_INVALID`; `422 TRANSACTION_NATURE_INVALID`.

### 5. Mês previsto do "a receber" (decisão do dono, 2026-10-16; contrato 2.36.0)
- `receivablesPending` de um mês usa o **mês em que o recebimento está previsto**, não o mês do consumo. O consumo (`grossConsumption`, `ThirdPartyPersonMonth`) segue na competência do consumo.
- **Recebível** = a parte de uma pessoa em **uma parcela** de compra de cartão rateada. **Padrão** = mês do vencimento da fatura daquela parcela (compra de 10/out no cartão que fecha dia 25 e vence dia 5 aparece em novembro).
- O dono pode **editar o mês por recebível** ("a pessoa não pagou neste mês, vai pagar só em dezembro"): `PUT /v1/third-party-receivables/{transactionId}/installments/{installmentId}/people/{personId}/expected-month`, corpo `{expectedMonth: 'AAAA-MM' | null, version?}`. `null` volta ao padrão. Vale o último valor; o valor só conta no mês escolhido e some dos outros. Tabela `receivable_expected_months` (migração `V9.24`).
- Recebível já recebido por inteiro não é editável (`422 RECEIVABLE_ALREADY_RECEIVED`); mês fora de 2000-01..2100-12 é `422 RECEIVABLE_EXPECTED_MONTH_INVALID`; inexistente ou de outro usuário é `404 RECEIVABLE_NOT_FOUND`.
- Não move dinheiro, não é renda, não entra em `endBalance` e não altera o razão. `NetWorthOverview.receivablesPending` é o total a receber e não muda.
- Recebimentos parciais continuam sendo aplicados às parcelas da mais antiga para a mais nova (por competência de consumo); o mês previsto só reagrupa o pendente.

## Alternativas consideradas
1. **Somar parcelas e recorrências sem dedup**: rejeitada (dupla contagem, regra 1).
2. **Projeção só por `Projection` existente**: não separa fixas/variáveis nem usa a minha parte; rejeitada.
3. **Leitura B como padrão**: totais diferentes em meses de transição; mantida como alternativa documentada.
4. **Campo novo `paymentMethod`**: rejeitada, reaproveita-se `method`.

## Consequências
- Um serviço de leitura novo (`OwnerStatement`) com testes obrigatórios de dedup (assinatura antes e depois de lançada, parcela futura x fatura, fatura no vencimento, pagamento de fatura e transferência fora).
- `nature` entra nos registros; antigos viram `VARIABLE` (recorrência de despesa `FIXED`) por migração, sem mudar formato.
- `openingBalance` pode divergir do saldo real no 1º do mês seguinte ao corrente (P-32); o aviso é exibido.
- Backup (`BackupTransaction`, `BackupRecurrence`) precisará incluir `nature` em B2a (pendência de contrato).

## Plano de quitação
B2a (campo), B2b (composição), B2c (renda, sobra, saldo e endpoint), B3 (tela). Revisar a leitura A x B e o detalhe de P-2 depois do primeiro uso real.

## O que o dono precisa aprovar
1. A fórmula e a lista de fontes com dedup da seção 2.
2. A leitura A (competência M-1) como padrão, com a B documentada.
3. A âncora só em contas `CASH` sem cheque especial e a regra de não projetar o resto do mês corrente.
4. Reaproveitar o `method` e acrescentar só `nature`.
