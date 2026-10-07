# ADR-013: total de dívidas, parcelado em andamento e meta de quitação

Status: aceita (2026-10-14). Plano: `docs/planos/2026-10-14-visao-total-de-dividas.md`.

## Decisão
1. **Fonte do total = estado, não movimento.** `GET /v1/debts/overview` lê `outstanding` das faturas não pagas (aberta, fechada, vencida e futura, líquido do crédito transportado; decisão P2) e das dívidas `PAYABLE` abertas. Nunca soma movimentos, então compra → parcela → fatura → pagamento não conta em dobro (PR 01). `committedFuture` (bruto) não é fonte. Custo fixo e recebíveis ficam fora do total.
2. **Compra parcelada em andamento = `CARD_PURCHASE` com origem `ONGOING`** (`TransactionSource.ONGOING`, V8.02). Grava só as parcelas restantes numeradas `total−restantes+1..total` (P7: "parcela 3 de 10" = 8). Sem categoria a contrapartida é `EQUITY` (consumo 0, como a dívida reconhecida sem movimentação); com categoria, `EXPENSE` só na competência de cada parcela, e a primeira não pode ser de mês passado (P5). Reaproveita o alocador, a fatura, o limite, o estorno e o cancelamento; nenhum leitor novo.
3. **`Goal.kind`** (`SAVINGS` padrão, `DEBT_PAYOFF`; V8.03). A meta de quitação não tem reservas, não entra em `reserved`/`uncovered`; o progresso vem do mesmo total (`DebtOverviewCalculator.total`) contra a `baseline` fixada por "cadastrei tudo".
4. **Outras dívidas (P1)** = `Debt` `PAYABLE` com `creditor_name` e sem `Person` (V8.04). Vai em `other` no overview.

## Consequências
Contrato só aditivo (2.13.0). Cálculo só no backend (`core/finance/domain/DebtOverviewCalculator`). Migrações V8.02 a V8.04 aditivas. Sem juros nem rotativo (S-17).
