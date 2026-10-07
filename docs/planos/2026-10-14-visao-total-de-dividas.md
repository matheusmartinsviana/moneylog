---
tags: [moneylog, plano, dividas, metas]
data: 2026-10-14
tasks: T237 a T253
status: aguardando respostas das perguntas P1 a P8
---

# Plano: visão total de dívidas, custo fixo e meta "quitar todas as dívidas"

## 1. Objetivo

Mostrar, calculado só pelo backend, **quanto o usuário ainda deve** (cartão parcelado + dívidas com pessoas + outras), separado do **custo fixo mensal**, comparado com renda e saldo, e permitir a meta "quitar todas as dívidas" com progresso honesto.

## 2. O que já existe e será reaproveitado (nada disso é reescrito)

| Peça | Onde | Uso |
|---|---|---|
| Livro `CARD` e faturas (`outstanding`, status derivado, `creditCarry`, invariante Σ outstanding − creditCarry = −saldo do livro) | `dominio-financeiro.md` §2.5.3 | **Fonte do total de cartão** |
| `InstallmentPlan`/`TransactionInstallment` (nº, total, fatura, `CANCELED` gravado) | §2.5.2, `core/card/domain` | Quebra por compra parcelada |
| `Card.totalCommitted` (fatura corrente + fechadas) e `Card.committedFuture` (parcelas em faturas `FUTURE`, **bruto**, S-219) | contrato `Card` | Conferência; **não** são a fonte (ver §4.1) |
| `Debt` `PAYABLE` com `outstanding`, status derivado, `expectedDate`, perdão e estorno | §2.6, `/v1/debts` | Dívidas com pessoas |
| `GET /v1/recurrences/summary` (`fixedCosts`, `recurringIncome`, normalizado por mês, estimativa) | contrato | **Custo fixo** e renda recorrente |
| `netWorth` (`cardLiabilities`, `payables`, `cardFutureInstallments` informativo, S-8), `balances.inAccounts/available`, `month.income` | `/v1/dashboard/summary` | Saldo e renda para a comparação |
| `/v1/dashboard/upcoming` e `/v1/projections` (faturas por vencimento, dívidas por `expectedDate`) | contrato | Mesma regra de calendário para a curva |
| `Goal` (reserva lógica, `target`, `current`, `progress`, `remaining`, `monthlyNeeded`, ACHIEVED derivado) | §2.9 | Base da meta; **não serve como está** (ver §6) |

**Lacunas encontradas:**
1. **Não existe "outras dívidas"** (financiamento, cheque especial, empréstimo bancário). `Debt` exige `Person`.
2. **Não existe compra parcelada em andamento.** `CardPurchaseInput` aceita data passada, mas o alocador (§2.5.3) joga as parcelas passadas em faturas `CLOSED`/`OVERDUE` com `lateEntry`, cria consumo retroativo e gera atraso falso. Hoje não dá para dizer "faltam 8 parcelas de R$ 150".
3. Não existe visão agregada nem meta de quitação.

## 3. Escopo

**Entra:** `GET /v1/debts/overview`; compra parcelada em andamento; meta `DEBT_PAYOFF`; página "Dívidas totais" em Planejamento; cartão no Início; gráfico de vencimentos por mês; fluxo de cadastro do que já está parcelado; "outras dívidas" **condicionado a P1**.

**Não entra (MVP):** juros, rotativo, CET, simulação de amortização/antecipação, estratégias (bola de neve/avalanche), notificações da meta, desfazer perdão.

## 4. Definição de "total de dívidas" (regra de cálculo, só backend)

`total = cartões + pessoas + outras`, tudo em **saldo devedor atual** lido do **estado** (faturas e dívidas), nunca somando movimentos. Por isso compra → parcela → fatura → pagamento não duplica (PR 01, regra 1).

### 4.1 Cartões (por cartão)
`cardTotal` = Σ `outstanding` de **todas as faturas não `PAID`** do cartão (`OPEN`, `CLOSED`, `OVERDUE` e `FUTURE`), **líquido** do crédito transportado. Igual a −saldo do livro `CARD` quando `creditBalance = 0` (invariante já testada). Usa `outstanding` (líquido) e **não** `committedFuture` (bruto, S-219), para a soma fechar com `/upcoming`.
- `invoiced` = faturas `OPEN`/`CLOSED`/`OVERDUE` (= `Card.totalCommitted`); `future` = faturas `FUTURE`. `cardTotal = invoiced + future`.
- **Por compra** (`plans[]`): parcelas **não canceladas** em faturas não `PAID`, com `remainingInstallments`, `nextInstallmentNumber`, `remaining` (Σ das parcelas) e `lastDueDate`. Compras à vista/1x em fatura não paga vão em `otherCharges`; pagamento parcial e crédito transportado entram em `adjustment`. **Identidade testada:** `cardTotal = Σ plans.remaining + otherCharges + adjustment`, com `adjustment` ≤ 0 e igual a 0 sem pagamento parcial/crédito.
- Cartão arquivado com saldo entra (a dívida existe).

| Situação | Efeito no total |
|---|---|
| 1.200 em 6x hoje | +1.200 (parcela 1 de 200 na fatura aberta + 1.000 em `FUTURE`); a parcela 1 **não** é somada de novo |
| Pagar fatura de 1.283 (inclui 200 da parcela 1) | −1.283; sobram 1.000 |
| Pagamento parcial de 500 | −500 |
| Pagamento a maior (crédito transportado) | cai o pago; excedente abate a fatura seguinte (líquido) |
| Cancelar parcelas restantes | cai o valor cancelado |
| Reembolso no cartão | cai |

### 4.2 Dívidas com pessoas
Σ `outstanding` de `Debt` `PAYABLE` com status `OPEN`/`PARTIALLY_SETTLED`, **inclusive sem `expectedDate`**. `CANCELED` (perdão), `VOIDED` e `SETTLED` não entram. `RECEIVABLE` nunca entra: vai em `receivablesInfo` (informativo, fora do total).

### 4.3 Outras dívidas
Sem entidade hoje (P1). Contrato já traz `other` (total 0,00 e lista vazia) até a decisão.

### 4.4 Custo fixo (nunca soma no total)
`fixedCosts` de `/v1/recurrences/summary` (recorrências de despesa ativas e não encerradas, normalizadas por mês, sempre `estimate`). Recorrência `CARD_PURCHASE` à vista, uma vez realizada, vira item de fatura (dívida) e o custo fixo é só a **previsão** das próximas: não há soma entre eles, pois são grandezas diferentes (fluxo mensal × saldo devedor). Parcelas de compra parcelada **não** são custo fixo.

### 4.5 Renda e comparação
Renda base mensal: ver P4. Razões em `Ratio` (4 casas, podem passar de 1), `null` + `reason: NO_INCOME` quando a renda é 0 (sem divisão por zero).

### 4.6 Curva de quitação
Pontos por mês de **vencimento da fatura** (caixa) e `expectedDate` das dívidas. É o **cronograma contratual**: "se pagar tudo no vencimento", não uma previsão. Faturas vencidas e não pagas ficam em `overdue`; dívidas sem data em `undated`; o que passa do horizonte em `beyondHorizon`. **Identidade:** `overdue + Σ points.total + undated + beyondHorizon = total`.

## 5. Contrato de API (aditivo; `contracts/openapi.yaml`)

### 5.1 `GET /v1/debts/overview?months=12`
`months` 1..36 (padrão 12; fora disso `400 VALIDATION_FAILED`). `200`:

```
{
  asOf: date,
  total: Money,
  parts: { cards: Money, people: Money, other: Money },
  cards: {
    total, invoiced, future: Money,
    items: [{ card: {id,name}, total, invoiced, future, otherCharges, adjustment: Money,
              plans: [{ purchaseId, description, ongoing: bool, installmentAmount: Money,
                        totalInstallments, remainingInstallments, nextInstallmentNumber,
                        remaining: Money, nextDueDate: date, lastDueDate: date }] }]
  },
  people: { total, items: [{ debtId, person:{id,name}, description, outstanding, expectedDate|null, overdue }] },
  other:  { total, items: [ ...mesmo formato de people... ] },
  receivablesInfo: Money,                       // informativo, fora do total
  fixedCosts: { monthly: Money, estimate: true },
  income: { monthly: Money|null, source: RECURRING_ESTIMATE|LAST_FULL_MONTH|NONE },
  liquidity: { inAccounts: Money, available: Money },
  comparison: { debtToIncome: Ratio|null, fixedCostToIncome: Ratio|null,
                debtMinusInAccounts: Money, reason: null|NO_INCOME },
  schedule: { months, points: [{ competence, cards, people, other, total, remainingAfter: Money }],
              overdue, undated, beyondHorizon: Money,
              payoffCompetence: Competence|null, payoffReason: null|UNDATED_DEBTS|BEYOND_HORIZON },
  payoffGoal: { goalId, baselineSet: bool, progress: Ratio, remaining: Money }|null
}
```
Erros: `401`, `400`, `500`. `remainingAfter_i = total − overdue − Σ points_1..i` (o vencido é considerado pago no 1º mês).

### 5.2 `POST /v1/cards/{id}/ongoing-installments` (compra parcelada em andamento)
Corpo: `description` (obrigatório), `installmentAmount` (valor de **cada** parcela, `AmountInput`), `totalInstallments` (2..36), `remainingInstallments` (1..`totalInstallments`; inclui a próxima a pagar), `firstInvoiceDate` (data dentro do ciclo da fatura da próxima parcela; padrão: hoje, ou seja, fatura corrente), `categoryId?`.
`201` devolve a **compra** (mesmo schema de detalhe de `CARD_PURCHASE`, com `origin: ONGOING` e as parcelas numeradas `total−restantes+1 .. total`).
Erros: `404` cartão; `422 ONGOING_INVALID_COUNT`; `422 ONGOING_FIRST_INVOICE_NOT_PAYABLE` (a fatura alvo está `PAID`); `422 CARD_ARCHIVED`; `400 VALIDATION_FAILED`.
Edição: só descrição e categoria; corrigir valor/quantidade = estornar e recriar. Reuso de `void`, `cancel-installments`, `future-installments`, fatura e limite **sem** novo leitor (um único caminho de leitura).

### 5.3 Metas (aditivo em `Goal`)
- `POST /v1/goals` com `kind: DEBT_PAYOFF` (sem `target`; `name` padrão "Quitar todas as dívidas", `deadline?`, `priority?`). Padrão de `kind` = `SAVINGS` (clientes atuais não mudam). `201` devolve a `Goal`.
- `POST /v1/goals/{id}/baseline` ("cadastrei tudo"): grava `baseline = total atual` e `baselineAt`. Pode ser repetido (re-ancorar). Devolve a `Goal` atualizada.
- Novos campos de `Goal`: `kind`, `baselineSet` (bool), `baseline` (Money|null), `baselineAt` (datetime|null), `grewSinceBaseline` (bool). Para `DEBT_PAYOFF`: `target = baseline`, `remaining = total atual`, `current = max(0, baseline − remaining)`, `progress = current/target` (`0.0000` com `baselineSet = false`), `monthlyNeeded` = remaining ÷ meses até `deadline` (estimativa), `reservations = []`.
- Erros: `422 DEBT_PAYOFF_GOAL_EXISTS` (uma ativa por usuário), `422 GOAL_KIND_NOT_RESERVABLE` (reservar numa `DEBT_PAYOFF`), `422 DEBT_PAYOFF_NOTHING_TO_BASELINE` (total = 0 ao ancorar).

## 6. Meta "quitar todas as dívidas" e convivência com o domínio de metas

A meta atual é **reserva lógica** (valor guardado em conta, S-147). Quitar dívida é o contrário (valor que **diminui**). Misturar quebraria `Reservado`, `uncovered`, `ACHIEVED` e `monthlyNeeded`. Proposta:
- `Goal.kind` aditivo; `DEBT_PAYOFF` **não tem reservas**, não entra em `balances.reserved` nem em `uncovered`, e o progresso vem do `overview` (mesma função de cálculo; nunca dois números).
- **Progresso = 1 − restante ÷ baseline**, com `baseline` fixado quando o usuário confirma "cadastrei tudo". Antes da confirmação a meta fica em **"montando"** (`baselineSet = false`, sem percentual). Isso responde ao dono: o progresso só vale depois de cadastrar tudo que está parcelado e as demais dívidas.
- Dívida nova depois do baseline: o restante sobe; progresso é limitado a [0, 1] e `grewSinceBaseline = true` mostra o aviso; "re-ancorar" é ação explícita do usuário. Nada muda sozinho.
- `ACHIEVED` quando `baselineSet` e total = 0. Total 0 sem baseline nunca é "conquistado".
- Dívidas a receber ficam fora (P6).
- Prazo opcional; "no ritmo do cronograma você quita em MM/AAAA" vem de `schedule.payoffCompetence`.

## 7. UI (frontend; seguir `DS 00..01` e `FE`)

- **Página `/planning/debts` "Dívidas totais"** (nova aba em `planning-nav`; Planejamento já reúne custo fixo e projeções). Seções: total + três partes; comparação (dívida ÷ renda, custo fixo ÷ renda, dívida − em contas); cartões (cartão → compras com "restam 8 de 10 · R$ 1.200,00"); pessoas; outras; custo fixo (rotulado "estimativa"); gráfico de vencimentos por mês; bloco da meta.
- **Gráfico simples** (barras por mês, usando `schedule.points`, e linha de `remainingAfter`), com tabela equivalente acessível; `overdue`/`undated`/`beyondHorizon` como chips fora do eixo.
- **Cartão no Início** ("Você deve R$ X", três partes, link para a página), no mesmo padrão dos cartões existentes de `home/components`.
- **Cadastrar o que já está parcelado**: no detalhe do cartão, ação "Adicionar compra parcelada em andamento" (sheet): descrição, valor da parcela, "quantas parcelas no total", "quantas faltam pagar" (texto do campo a validar com UX, P7), "cai na fatura de" (padrão: corrente), categoria opcional. Mostra prévia: "Faltam R$ 1.200,00 em 8 parcelas, até MM/AAAA. Não entra no seu consumo passado."
- **Estados de tela:** carregando (esqueleto); vazio ("Nada cadastrado ainda", com os dois caminhos: parcelado em andamento e dívida com pessoa; sem número nem barra fingindo); vazio com sucesso ("Sem dívidas" só quando o backend devolve total 0 **e** existe ao menos um cartão/dívida cadastrado; caso contrário é "nada cadastrado", não "livre de dívidas"); erro com tentar de novo; parcial (renda 0: razões ocultas com o motivo); meta "montando" × ativa × `grewSinceBaseline` × conquistada.
- O front **não soma nem divide**: exibe o que a API devolve (PR 01/ADR-001).

## 8. Perguntas em aberto (não decididas; o plano trabalha com o "padrão sugerido")

| # | Pergunta | Dono | Padrão sugerido (não é decisão) | Bloqueia |
|---|---|---|---|---|
| P1 | O que é "outras dívidas" (financiamento, cheque especial, empréstimo bancário, consignado)? Modela como `Debt` com credor não-pessoa (`kind`) ou entidade nova? | Produto | `Debt` `PAYABLE` + `kind` (`PERSON`, `FINANCING`, `OVERDRAFT`, `LOAN`, `OTHER`) | T244, T253 parcial |
| P2 | A fatura **aberta** entra no total ou só parcelas futuras? Fatura fechada e vencida entram? | Produto | Entra tudo (já foi gasto e será pago), com `invoiced`/`future` separados para a UI poder destacar | T238 |
| P3 | Juros/rotativo/multa: calcular? | Produto | Não (S-17); a dívida vale o saldo informado; aviso na UI | Fora do MVP |
| P4 | Base da renda: `recurringIncome` (estimativa), renda do último mês completo ou do mês corrente (parcial)? | Produto | `RECURRING_ESTIMATE`, e se for 0 usa `LAST_FULL_MONTH`, senão `NONE` | T239 |
| P5 | Compra antiga em andamento: a contrapartida é `EQUITY` (consumo 0, histórico intacto) ou `EXPENSE` na competência de cada parcela restante (consumo futuro)? Informar valor da parcela ou total? | Produto + Arquitetura | `EQUITY` por padrão e `categoryId` opcional gera `EXPENSE` por competência, igual ao precedente de dívida com categoria (§2.6.1); informa o valor da parcela | T241 |
| P6 | A meta ignora dívidas a receber (não abate o restante)? | Produto | Ignora; recebíveis só informativos | T243 |
| P7 | Texto do campo: "parcela 3 de 10" significa 8 restantes (3 a 10) ou 3 restantes? | UX | Perguntar "quantas faltam pagar" e mostrar a prévia | T250 |
| P8 | Pode haver mais de uma meta de quitar dívidas? Re-ancorar zera o progresso aceito? Meta tem prazo? | Produto | Uma ativa; re-ancorar permitido com aviso; prazo opcional | T243, T251 |
| P9 | A previsão de custo fixo inclui recorrência que paga uma dívida (ex.: "parcela do carro" recorrente)? Evitar contar nos dois (custo fixo e dívida) | Produto | Recorrência não é dívida; avisar na UI se a descrição sugerir; sem regra automática | T239 |
| P10 | `kind` em `Goal` (mesmo recurso) × recurso separado `payoff-goal`? | Arquitetura | `kind` em `Goal` (aparece na lista de metas), com ADR-013 | T237 |

## 9. Tasks

Numeração a partir de T237. Cada uma cabe em um PR.

**T237 · dev-backend · Contrato e ADR**
- Objetivo: escrever em `contracts/openapi.yaml` os §5.1 a §5.3 (schemas, exemplos, erros), seção nova em `dominio-financeiro.md` (§2.11) com as regras do §4 e as suposições S-300+ para P1..P10 (marcadas "a validar"), e `docs/adrs/ADR-013-total-de-dividas-e-parcelado-em-andamento.md` (fonte = estado das faturas, `Goal.kind`, parcelado em andamento reaproveitando `CARD_PURCHASE`).
- Camadas: `contracts/`, `docs/`.
- Aceite: **Dado** o contrato, **quando** o lint do OpenAPI roda, **então** passa e nenhum campo/rota existente muda (diff só aditivo); **dado** `Goal` sem `kind`, **então** o padrão documentado é `SAVINGS`; **dado** o §4.1, **então** a identidade `cardTotal = Σ plans.remaining + otherCharges + adjustment` está escrita no schema.
- Depende de: respostas de P2, P5, P10 (as demais podem seguir o padrão sugerido).

**T238 · dev-backend · Cálculo do total (cartões, pessoas, outras)**
- Objetivo: `DebtOverviewCalculator` puro em `core/finance/domain` + caso de uso/gateway de leitura em `core/finance/app` (e `infra/finance/gateways`) que reaproveita as leituras de faturas e dívidas já existentes (nenhuma query paralela de saldo).
- Aceite:
  - **Dado** compra de 1.200 em 6x hoje, **quando** consulta, **então** `cards.total` = 1.200,00, `invoiced` = 200,00, `future` = 1.000,00, plano com `remainingInstallments` = 6 e `remaining` = 1.200,00.
  - **Dado** o mesmo cenário e a fatura de 1.283 paga, **então** `cards.total` = 1.000,00 e a parcela 1 não aparece mais.
  - **Dado** pagamento parcial de 500 na fatura, **então** `cards.total` cai 500 e `adjustment` = −500.
  - **Dado** dívida `PAYABLE` de 200 com quitação de 50, **então** `people.total` = 150; **dado** `RECEIVABLE` de 300, **então** `people.total` não muda e `receivablesInfo` = 300.
  - **Dado** dívida perdoada, estornada ou quitada, **então** não entra.
  - **Dado** cancelamento das parcelas restantes, **então** as parcelas canceladas saem de `plans` e do total.
  - **Dado** qualquer cenário, **então** `total = parts.cards + parts.people + parts.other`.
- Depende de: T237.

**T239 · dev-backend · Custo fixo, renda, comparação e curva**
- Objetivo: completar o cálculo com `fixedCosts` (via `RecurrenceSummary`), `income` (P4), `liquidity`, `comparison` e `schedule`.
- Aceite:
  - **Dado** custo fixo 3.000,00 e renda 6.000,00, **então** `fixedCostToIncome` = "0.5000" e o custo fixo **não** aparece em `total`.
  - **Dado** renda 0, **então** razões `null` e `reason = NO_INCOME`, sem erro.
  - **Dado** 1.200 em 6x com a fatura da parcela 1 vencendo em novembro, **então** `points` tem 200,00 em cada mês de vencimento, novembro a abril, e `remainingAfter` decresce até 0,00.
  - **Dado** fatura vencida e não paga, **então** o valor está em `overdue` e fora de `points`; **dado** dívida sem data, **então** está em `undated` e `payoffCompetence = null` com `payoffReason = UNDATED_DEBTS`.
  - **Dado** `months` fora de 1..36, **então** `400`.
  - **Dado** qualquer cenário, **então** `overdue + Σ points.total + undated + beyondHorizon = total`.
- Depende de: T238.

**T240 · dev-backend · Endpoint `GET /v1/debts/overview`**
- Objetivo: controller em `infra/debt` (ou `infra/finance`) + DTOs + teste de integração (Testcontainers) contra o contrato.
- Aceite: **Dado** usuário autenticado com dados, **quando** `GET /v1/debts/overview`, **então** `200` com o schema do contrato; **dado** sem token, **então** `401`; **dado** dados de outro usuário, **então** não aparecem; **dado** usuário sem cartão e sem dívida, **então** `total` = 0,00 e listas vazias (não erro).
- Depende de: T239.

**T241 · dev-backend · Compra parcelada em andamento (domínio + persistência)**
- Objetivo: `OngoingInstallmentPurchase` em `core/card/domain` reaproveitando `InstallmentPlan`/`TransactionInstallment` e o alocador, só com as parcelas restantes (numeração `k..N`, valor fixo por parcela, sem `allocate`); lançamentos conforme P5; origem `ONGOING` com migração Flyway aditiva; leitura única em `future-installments`, fatura, limite, dashboard e projeções.
- Aceite:
  - **Dado** parcela de 150,00, 10 no total e 8 restantes com `firstInvoiceDate` = hoje, **então** existem 8 parcelas numeradas 3/10 a 10/10, a primeira na fatura corrente, e `cards.total` sobe 1.200,00.
  - **Dado** P5 = `EQUITY` e sem categoria, **então** o consumo de **todos os meses** (passados e futuros) não muda; o livro soma zero; patrimônio −1.200,00.
  - **Dado** `categoryId`, **então** cada parcela gera `EXPENSE` só na competência da fatura dela e nenhum mês passado muda.
  - **Dado** a fatura alvo `PAID`, **então** `422 ONGOING_FIRST_INVOICE_NOT_PAYABLE` e nada é gravado.
  - **Dado** `remainingInstallments > totalInstallments`, **então** `422 ONGOING_INVALID_COUNT`.
  - **Dado** estorno da compra (sem parcelas em fatura fechada), **então** o total volta ao valor anterior; `cancel-installments` funciona como nas demais.
  - **Dado** o limite do cartão, **então** `availableLimit` cai pelo valor restante (S-46).
- Depende de: T237.

**T242 · dev-backend · Endpoint `POST /v1/cards/{id}/ongoing-installments`**
- Objetivo: controller + DTO + IT; devolve o detalhe da compra (`201` com `Location`).
- Aceite: **Dado** payload válido, **quando** `POST`, **então** `201` com a compra e as parcelas; **dado** cartão de outro usuário, **então** `404`; **dado** cartão arquivado, **então** `422 CARD_ARCHIVED`; **dado** payload inválido, **então** `400` com campos; **dado** o mesmo POST repetido, **então** cria outra compra (sem idempotência no MVP, documentado) e o total sobe duas vezes.
- Depende de: T241.

**T243 · dev-backend · Meta `DEBT_PAYOFF`**
- Objetivo: `Goal.kind` (migração Flyway com padrão `SAVINGS`), criação sem `target`, `POST /v1/goals/{id}/baseline`, progresso derivado do mesmo `DebtOverviewCalculator`; exclusão de `balances.reserved`/`uncovered`; testes de que metas `SAVINGS` não mudam.
- Aceite:
  - **Dado** meta `DEBT_PAYOFF` recém-criada, **então** `baselineSet = false` e `progress = 0.0000`.
  - **Dado** total 5.000,00 e baseline confirmada, e depois 1.000,00 pagos, **então** `current` = 1.000,00, `remaining` = 4.000,00 e `progress` = "0.2000".
  - **Dado** nova dívida de 2.000,00 após a baseline, **então** `progress` não fica negativo, `grewSinceBaseline = true` e nada é re-ancorado sozinho.
  - **Dado** total 0 antes da baseline, **então** `422 DEBT_PAYOFF_NOTHING_TO_BASELINE` e a meta não vira `ACHIEVED`; **dado** baseline > 0 e total 0, **então** `ACHIEVED`.
  - **Dado** uma meta ativa, **quando** criar outra, **então** `422 DEBT_PAYOFF_GOAL_EXISTS` (sujeito a P8).
  - **Dado** reservar em `DEBT_PAYOFF`, **então** `422 GOAL_KIND_NOT_RESERVABLE`.
  - **Dado** meta `DEBT_PAYOFF`, **então** `balances.reserved` do dashboard não muda.
- Depende de: T240, P6, P8.

**T244 · dev-backend · Outras dívidas** (condicionada a P1)
- Objetivo: implementar o `kind` escolhido em P1 (migração, domínio, `POST/PUT /v1/debts`), preencher `other` no overview.
- Aceite: **Dado** dívida `FINANCING` de 30.000,00 com quitação de 1.000,00, **então** `other.total` = 29.000,00 e `people.total` não muda; **dado** dívida `PERSON`, **então** continua em `people`; **dado** cliente antigo sem `kind`, **então** é `PERSON`.
- Depende de: T240, P1.

**T245 · tester · Backend: propriedades e cenários**
- Objetivo: testes de propriedade (jqwik ou equivalente já usado no projeto) e ITs ponta a ponta.
- Aceite:
  - **Propriedade 1:** para sequências aleatórias de compras (1..36x), pagamentos totais/parciais/a maior, cancelamentos, reembolsos, dívidas e quitações, `total = cards + people + other` e `cards.total = Σ plans.remaining + otherCharges + adjustment`.
  - **Propriedade 2 (nada em dobro):** `cards.total` = −saldo do livro `CARD` (com `creditBalance = 0`) e = Σ `outstanding` de `/upcoming` + faturas `FUTURE`; `people.total` = Σ `payables` do `netWorth`; pagar uma fatura reduz o total exatamente pelo valor pago.
  - **Propriedade 3:** `overdue + Σ points + undated + beyondHorizon = total`.
  - **Propriedade 4:** criar compra em andamento não altera `month.consumption` de nenhum mês passado (P5 = EQUITY).
  - Regressão: custo fixo nunca altera `total`; `RECEIVABLE` nunca altera `total`; metas `SAVINGS` inalteradas.
- Depende de: T240, T242, T243 (e T244 se P1 aprovado).

**T246 · dev-frontend · Cliente da API, modelos e mock do overview**
- Objetivo: serviço/gateway e tipos do §5, mock fiel ao contrato (todos os estados), rota lazy `/planning/debts` com página vazia.
- Aceite: **Dado** o mock, **quando** o serviço carrega, **então** os tipos batem com o `openapi.yaml` (verificação de contrato do projeto passa); **dado** erro de rede, **então** o estado de erro com "Tentar de novo".
- Depende de: T237 (integração real: T240; marcar a página como "contra mock" até lá).

**T247 · dev-frontend · Página "Dívidas totais"**
- Objetivo: seções do §7 (total e partes, comparação, cartões com compras, pessoas, outras, custo fixo "estimativa"), aba em `planning-nav`, i18n, estados.
- Aceite: **Dado** `total` 6.500,00 no mock, **então** a tela mostra exatamente o valor e as três partes da API e **nenhuma conta** é feita no front; **dado** renda `null`, **então** razões ocultas com o motivo; **dado** nada cadastrado, **então** o vazio com os dois caminhos, nunca "sem dívidas"; **dado** `overLimit`/vencida, **então** destaque em texto e ícone (não só cor); axe sem violações; tema claro/escuro.
- Depende de: T246.

**T248 · dev-frontend · Gráfico de vencimentos por mês**
- Objetivo: componente de barras e linha de `remainingAfter` a partir de `schedule`, tabela alternativa, chips `overdue`/`undated`/`beyondHorizon`, seletor de 6/12/24 meses.
- Aceite: **Dado** 6 pontos de 200,00, **então** seis barras com rótulos de mês e valor acessíveis; **dado** `payoffCompetence = null`, **então** o texto explica o motivo (`UNDATED_DEBTS` ou `BEYOND_HORIZON`); **dado** pontos vazios, **então** estado vazio; leitor de tela lê a tabela.
- Depende de: T247.

**T249 · dev-frontend · Cartão "Dívidas totais" no Início**
- Objetivo: componente em `home/components` com total, três partes e link; não quebra o layout do redesign.
- Aceite: **Dado** `total` > 0, **então** mostra o valor e leva a `/planning/debts`; **dado** nada cadastrado, **então** convida a cadastrar, sem número; **dado** erro, **então** o cartão degrada sem derrubar o Início.
- Depende de: T246.

**T250 · dev-frontend · Fluxo "compra parcelada em andamento"**
- Objetivo: sheet no detalhe do cartão e atalho no vazio da página de dívidas; formulário com validação, prévia, erros do servidor mapeados aos campos.
- Aceite: **Dado** parcela 150,00, total 10, faltam 8, **então** a prévia mostra "8 parcelas, R$ 1.200,00" (valor de uma conta de exibição vinda da API ou mock; sem somar no front: usar o campo de prévia/`remaining` devolvido); **dado** `422 ONGOING_INVALID_COUNT`, **então** o erro aparece no campo; **dado** sucesso, **então** navega/atualiza a lista e o total; **dado** duplo toque em salvar, **então** um só envio.
- Depende de: T242, P7.
- Observação: se a prévia exigir cálculo, o contrato ganha `POST /v1/cards/{id}/ongoing-installments/preview` (como o `purchase-preview` existente); decidir em T237 para não somar no front.

**T251 · dev-frontend · UI da meta "quitar todas as dívidas"**
- Objetivo: criação (kind), estado "montando" com botão "cadastrei tudo", progresso, aviso `grewSinceBaseline`, conquistada; aparece na lista e no detalhe de metas sem reservas.
- Aceite: **Dado** `baselineSet = false`, **então** sem percentual e com o passo a passo "cadastre parcelado e dívidas, depois confirme"; **dado** confirmar, **então** chama `POST .../baseline` e mostra o progresso devolvido; **dado** `grewSinceBaseline`, **então** aviso com a opção "re-ancorar" e confirmação; **dado** `ACHIEVED`, **então** estado de conquista; **dado** meta `SAVINGS`, **então** tela inalterada.
- Depende de: T243 (contra mock até lá), T247.

**T252 · tester · E2E do frontend**
- Objetivo: fluxos com mock e contra o backend (webkit incluído): ver total, cadastrar parcelado em andamento e ver o total subir, pagar fatura e ver cair, criar e ancorar meta, estados vazio/erro.
- Aceite: **Dado** parcelado em andamento 8 × 150, **quando** salva, **então** o total sobe 1.200,00 e o consumo do mês passado não muda; **dado** pagar fatura, **então** o total cai pelo valor; axe sem violações nas telas novas.
- Depende de: T247, T248, T249, T250, T251 e T245.

**T253 · dev-backend + dev-frontend** (não planejar até P1 resolvida): exibição de "outras dívidas" (formulário de `kind`). Dividir em duas tasks (backend já em T244; frontend nova) quando P1 sair.

## 10. Ordem de execução

```
Perguntas P2, P5, P10 respondidas
  → T237 (contrato + ADR-013)
     ├─ backend:  T238 → T239 → T240 ──→ T243 ──┐
     │            T241 → T242 (paralelo a T238..T240)
     │            T244 (só após P1)
     └─ frontend: T246 (mock) → T247 → T248
                                  ├─ T249 (paralelo)
                                  ├─ T250 (após T242)
                                  └─ T251 (após T243)
  → T245 (tester back) após T240, T242, T243
  → T252 (tester front/E2E) por último
```
Paralelo: [T238..T240] com [T241, T242] e com [T246]; depois [T248, T249]. Integração real do front só depois de T240/T242/T243; antes disso, só contra mock marcado.

## 11. Riscos

- **Dupla contagem** entre `Card.committedFuture` (bruto) e `outstanding` (líquido): mitigado usando só `outstanding` e a propriedade 2 do T245.
- **Parcelado em andamento distorce histórico** se a contrapartida for `EXPENSE` retroativo: mitigado por P5 (padrão `EQUITY`) e teste da propriedade 4.
- **Progresso enganoso** se o usuário não cadastrou tudo: mitigado pelo estado "montando" e pelo baseline explícito; a UI nunca diz "sem dívidas" sem cadastro.
- **`Goal.kind` quebra telas que supõem reservas**: mitigado pelo padrão `SAVINGS`, testes de regressão (T243/T245) e `reservations = []`.
- **Custo fixo confundido com dívida**: rótulos e seções separadas; recorrência que paga dívida (P9).
- **Valor desatualizado do cartão** quando faturas `FUTURE` não estão materializadas (ADR-006): o cálculo precisa usar a janela de faturas futuras já usada por `future-installments`; cobrir com teste de parcela em 36x.
- **Desempenho**: o overview agrega várias leituras (ADR-008, leitura do razão inteiro): medir com 36 parcelas × vários cartões; cache fora do escopo.
- **ADR necessária:** ADR-013 (T237). Atualizar `dominio-financeiro.md` §2.11, §2.9 (kind) e §8 (suposições).

## Decisões do dono (2026-10-07)
- **P2 (fatura aberta):** entra no total. Total do cartão = fatura aberta + fechada + vencida + parcelas futuras, líquido do crédito transportado.
- **P5 (compra em andamento):** grava só as parcelas restantes, sem consumo retroativo (não altera consumo dos meses passados); entra na fatura e na dívida.
- **P7 (parcela "3 de 10"):** faltam 8 parcelas (da 3 até a 10): o usuário informa a próxima a vencer e o total.
- **P1 (outras dívidas):** dívida com credor livre (banco, loja, financiamento): nome do credor, valor e parcelas, sem exigir Person.
- **Demais perguntas (P3, P4, P6, P8, P9, P10):** adotar o padrão sugerido neste plano; registrar cada uso como suposição S-nn e listar ao dono no fim.
