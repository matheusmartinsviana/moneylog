# Insights calculados (ADR-019, contrato 2.20.0)

Insights financeiros determinísticos, calculados no backend sobre o razão, sem IA, sem provedor e offline. O front **só exibe**: traduz `key` + `params` (decimais em texto, já calculados) e formata. Todos os exemplos abaixo são sintéticos.

## Rotas (`/v1`, todas autenticadas, `Cache-Control: private, no-store`)

| Rota | O que faz |
|---|---|
| `GET /v1/insights/monthly?month=AAAA-MM&limit=&includeDismissed=` | Insights do mês (padrão: corrente). `limit` 1..50, padrão 20. |
| `GET /v1/insights/daily?date=AAAA-MM-DD&limit=&includeDismissed=` | Insights do dia no fuso do usuário (padrão: hoje). Data futura: `400 INSIGHTS_DATE_INVALID`. |
| `GET /v1/insights/history?from=AAAA-MM&to=AAAA-MM` | Um item por mês, até 12 meses (`400 INSIGHTS_RANGE_INVALID` se passar ou se invertido), até 10 insights por mês, uma leitura do razão. |
| `POST /v1/insights/{id}/dismissals` `{ "scope": "TODAY" \| "MONTH" \| "TYPE" }` | Dispensa. `201` + `Location`, devolve o insight com `dismissed: true`. Id que não é do usuário: `404 INSIGHT_NOT_FOUND`. |
| `DELETE /v1/insights/{id}/dismissals` | Reverte (grava `revoked_at`; a linha de auditoria continua). Devolve o insight atualizado. |
| `GET /v1/insights?month=&page=&pageSize=` | **Alias** para clientes antigos, na forma original: só `CATEGORY_DELTA` e `CARD_COMMITTED`, só `type`, `key`, `params`, `factRefs`, `source` (schema `Insight` inalterado), paginado como sempre. O catálogo inteiro e os campos novos vêm de `/monthly` (schema `InsightItem`). |

Erros 400 de entrada: `INSIGHTS_MONTH_INVALID`, `INSIGHTS_DATE_INVALID`, `INSIGHTS_RANGE_INVALID`, `INSIGHTS_LIMIT_INVALID`, `VALIDATION_FAILED` (escopo desconhecido).

## Item `InsightItem`

```json
{ "id": "ins_0123456789abcdef0123456789abcdef", "type": "DAILY_BUDGET", "key": "insight.daily.budget",
  "params": {"amount": "168.18", "daysLeft": "22", "free": "3700.00"}, "factRefs": ["summary.2026-10"],
  "severity": "INFO", "priority": 100, "period": {"kind": "DAY", "value": "2026-10-10"}, "source": "COMPUTED",
  "basis": null, "confidence": null, "subjectId": null, "dismissed": false }
```

- `severity`: `ALERT` > `ATTENTION` > `POSITIVE` > `INFO`. `priority`: desempate dentro da severidade. A lista já vem **ordenada** (severidade, prioridade, magnitude, tipo, id) e sem repetição.
- `period`: `MONTH` (`AAAA-MM`) ou `DAY` (`AAAA-MM-DD`). `source` é sempre `COMPUTED`.
- `basis` (só nos estatísticos/previsões): `KNOWN_SCHEDULE` (só a agenda conhecida), `HISTORY`, `PROJECTION`. `confidence`: `{ n, window, z }`.
- `subjectId`: o que o insight descreve dentro do tipo (categoria, meta, cartão, lançamento, descrição normalizada).
- Lista: `{ items, hasNext, insufficient: [{ type, reason, missing }] }`. `insufficient` diz por que um insight **não** saiu: `HISTORY` (faltam `missing` meses), `NO_INCOME`, `PARTIAL_MONTH`, `NO_DATA`, `NO_BASELINE`, `NO_ACCOUNTS`, `NO_SCHEDULE`, `NO_LIMIT`, `NO_PLAN`, `FUTURE_MONTH` (`type = ALL`).

## Catálogo

Limites inclusivos. Dinheiro em centavos exatos; razões com `BigDecimal`. Percentuais nos `params` já vêm em pontos percentuais com 2 casas (`"20.00"` = 20%).

### Mensais (`monthly`, `history`)

| Tipo | Chaves (`key`) | Regra | `params` principais |
|---|---|---|---|
| `SAVINGS_RATE` | `insight.savings.rate.up` / `.down` / `.negative` / `.flat` | `s = (renda − consumo)/renda`; Δpp contra a média de `s` dos 3 fechados com renda. `s<0` ALERT; Δpp ≤ −5 ATTENTION; ≥ +5 POSITIVE; senão INFO. Mês corrente usa o fechamento projetado. | `rate`, `average`, `deltaPp`, `income`, `consumption`, `projected` |
| `SPEND_VS_BASELINE` | `insight.spend.high` / `.low` | z robusto do consumo contra os 6 fechados (mín. 3); z ≥ 2,5 ATTENTION, ≥ 3,5 ALERT, ≤ −2,5 POSITIVE; exige desvio ≥ 10% e ≥ R$ 100. Mês corrente: só com ≥ 10 dias, usa a projeção. | `amount`, `median`, `deltaAmount`, `deltaPercent`, `z`, `projected` |
| `CATEGORY_DELTA` | `insight.category.up` / `.down` | Atual contra a mediana de até 3 fechados da categoria: `|Δ%| ≥ 20` e `|Δ| ≥ R$ 50`; ALERT se z ≥ 3,5 e Δ ≥ R$ 200. Com 1 ou 2 fechados: contra o mês anterior (10% e R$ 50). Categoria líquida negativa conta como 0. No mês corrente a queda não é dita. `subjectId` = id da categoria. | `categoryId`, `categoryName`, `current`, `previous` (a base), `deltaAmount`, `deltaPercent`, `baseline` (`MEDIAN_3` \| `PREVIOUS_MONTH`), `months` |
| `MONTH_PROJECTION` | `insight.projection.over` / `.near` | Só mês corrente, ≥ 7 dias e ≥ 5 dias com gasto. Fechamento = consumo do mês + recorrências ainda previstas + média diária variável × dias restantes; intervalo de 80% (± 1,28 · dp · √dias). `over` (ALERT): fechamento > renda recebida; `near` (ATTENTION): limite superior > renda recebida. Só emite nesses casos. | `closing`, `lower`, `upper`, `received`, `daysLeft` |
| `FREE_MONEY` | `insight.freeMoney.ok` / `.low` / `.negative` | Só mês corrente. `livre = recebido − gasto até hoje − a acontecer (lançamentos datados depois de hoje + recorrências previstas) − reservado em metas no mês`. `livre<0` ALERT; `< 15%` da renda recebida ATTENTION; senão INFO. Sem renda recebida: `NO_INCOME`. | `received`, `spent`, `upcoming`, `reserved`, `free` |
| `COMMITMENT_INDEX` | `insight.commitment.high` | `(fixos + parcelas)/renda` do mês; ≥ 50% ATTENTION, ≥ 70% ALERT. Parcela e recorrência são classes disjuntas. | `fixed`, `installments`, `income`, `percent` |
| `DEBT_SERVICE` | `insight.debt.service.high` | `(parcelas + pagamentos de dívida a vencer no mês)/renda`; ≥ 30% ATTENTION, ≥ 40% ALERT. Sem dívida não emite. | `service`, `installments`, `debtPayments`, `income`, `percent`, `debtTotal`, `debtToAnnualIncome` |
| `INSTALLMENT_LOAD` | `insight.installments.peak` / `.drop` | Parcelas por mês nos próximos 12. Pico ≥ 1,25× a carga atual e ≥ R$ 100 a mais: ATTENTION. Queda ≥ 30% em 3 meses (e ≥ R$ 100): POSITIVE. | `peak`/`current`/`peakMonth`/`increase` ou `current`/`later`/`laterMonth`/`dropPercent` |
| `EMERGENCY_COVERAGE` | `insight.coverage.low` / `.ok` | Só mês corrente. `saldo líquido em contas / essencial médio dos 3 fechados` (essencial = recorrências + parcelas + dívidas). < 1 ALERT; < 3 ATTENTION; ≥ 6 POSITIVE. | `months`, `balance`, `essentialMonthly`, `runwayMonths` |
| `INCOME_STABILITY` | `insight.income.unstable` | CV (desvio populacional/média) da renda dos fechados (mín. 4 meses com renda); CV ≥ 0,30 ATTENTION. | `cv`, `average`, `months` |
| `GOAL_PACE` | `insight.goal.behind` / `.ahead` | Só mês corrente. Repete o plano da meta (ADR-016), sem recalcular: `onTrack = false` ATTENTION; no ritmo com sequência ≥ 3 POSITIVE. `subjectId` = id da meta. | `goalId`, `goalName`, `requiredPace`, `monthsLeft`, `gap`/`streak` |
| `CONCENTRATION` | `insight.concentration.top3` | 3 maiores categorias ≥ 60% do consumo positivo por categoria (≥ 4 categorias). INFO, prioridade mínima. | `share`, `top3`, `total` |
| `CARD_COMMITTED` | `insight.card.committed` | Fatura com saldo que vence no mês (existente). INFO. | `amount` |
| `CARD_LIMIT_USAGE` | `insight.card.limit` | Só mês corrente. `(limite − disponível)/limite`; ≥ 70% ATTENTION, ≥ 90% ALERT. Cartão **sem limite cadastrado** não emite (`NO_LIMIT`). `subjectId` = id do cartão. | `cardId`, `cardName`, `used`, `limit`, `percent` |
| `RECURRING_DETECTED` | `insight.recurring.detected` | Descrição normalizada com ≥ 3 ocorrências, intervalo mediano 28..32 dias, valor ±10% da mediana, ativa (última há ≤ 45 dias) e ainda não cadastrada como recorrência. INFO, "parece recorrente". `subjectId` = descrição normalizada. | `description`, `amount`, `annualCost`, `occurrences`, `intervalDays` |

### Do dia (`daily`)

| Tipo | Chaves | Regra | `params` |
|---|---|---|---|
| `DAILY_BUDGET` | `insight.daily.budget` (INFO, prioridade 100) / `insight.daily.over` (ALERT) | `max(0, livre restante)/(dias do mês − dia + 1)`, contando hoje, arredondado para baixo. Livre restante = `FREE_MONEY` na data. Sem renda recebida no mês: não emite (`NO_INCOME`). | `amount`, `daysLeft`, `free` ou `overBy` |
| `TODAY_VS_AVERAGE` | `insight.today.high` | Gasto variável de hoje ≥ 2× a média diária variável do mês e ≥ R$ 50; só a partir do dia 7. | `today`, `average`, `ratio` |
| `DUE_SOON` | `insight.due.exceeds` (ALERT) / `.today` (ATTENTION) / `.week` (INFO) | Saídas com vencimento de hoje a hoje + 7 (primeiro nível: a parcela já está na fatura). `exceeds`: total > saldo líquido em contas. Inclui faturas e dívidas vencidas e não pagas. | `total`, `count`, `today`, `balance` |
| `MIN_BALANCE_FORECAST` | `insight.balance.negativeSoon` (ALERT, ≤ 7 dias) / `.negativeLater` (ATTENTION, ≤ 30) | Saldo + agenda conhecida dos próximos 30 dias (`basis = KNOWN_SCHEDULE`); entradas só de recorrência e lançamento futuro, nunca "a receber de terceiros". Só emite se ficar negativo. | `minBalance`, `minDate`, `firstNegativeDate`, `daysUntil`, `balance` |
| `ATYPICAL_ENTRY` | `insight.entry.atypical` | Lançamento de hoje acima do p95 da categoria (n ≥ 20 nos 6 fechados) ou, com 8 ≤ n < 20, z ≥ 3,5; e ≥ 2× a mediana e ≥ R$ 50. `confidence.n` = observações. | `categoryId`, `categoryName`, `amount`, `median`, `p95` |
| `CARD_CLOSING_SOON` | `insight.card.closing` | Fatura aberta que fecha em ≤ 7 dias (ATTENTION se ≤ 2). Suprimida se a mesma fatura já está no `DUE_SOON`. | `cardName`, `closingDate`, `daysUntil`, `partial` |

## Regras de integridade (PR 01)
- Consumo = despesa de verdade (sem transferência, investimento, empréstimo, pagamento de fatura). Parcela entra pelo mês da competência dela (200 em cada mês), nunca a compra inteira. Reembolso abate na categoria original. A despesa de terceiro continua consumo bruto até o reembolso (ADR-014); compromissos acompanhados e "a receber" nunca entram.
- Renda por competência (ADR-017): a renda de outubro recebida em setembro conta em outubro; o caixa não muda.
- Fatura de cartão nunca entra no dinheiro livre (as compras já são consumo). Fatura histórica não gera consumo.
- Cada linha de consumo cai em uma classe só (parcela, recorrência, dívida, variável); a soma das classes é o consumo do mês.

## Limites conhecidos
- Insights de estado atual só no mês corrente (projeção, dinheiro livre, cobertura, metas, limite do cartão).
- `daily` com data passada usa a agenda e o caixa de hoje (a data só define o dia de referência do mês e do gasto).
- Ocorrências de recorrência vencidas e não realizadas não entram no que "ainda vai acontecer" (podem ser só não registradas).
- Detecção de assinaturas depende da descrição, que é opcional e livre.
