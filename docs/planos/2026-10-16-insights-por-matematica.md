# Plano: insights por matemática (mês a mês e no dia), sem IA

Data: 2026-10-16 · Tasks T284 a T303 · Exemplos 100% sintéticos.

## 1. Objetivo
Gerar insights financeiros reais e determinísticos (sem IA, sem provedor, offline) a partir do razão, em dois horizontes (mensal e do dia), e tirar a IA do papel de motor dos insights.

## 2. Escopo
Entra: catálogo de insights calculados no backend; contrato aditivo `monthly` e `daily`; ordenação, limite, deduplicação e dispensa (snooze) auditável; faixa compacta na Home; tela Insights com abas Hoje/Mês e histórico; rebaixar a IA a recurso opcional em Configurações.
Não entra (MVP): sazonalidade ano contra ano, efeito de juros em parcelamentos (não há dado de taxa), regra 50/30/20 (exige categorizar tudo e é arbitrária), sequência de dias sem gastar (gamificação, risco de tom punitivo), melhor dia de compra no cartão, push/notificação dos insights (ADR-012 fica para depois), novas categorias "essencial/discricionário" editáveis.

Estado atual lido: `GET /v1/insights?month=` (em `AiController`) usa `InsightEngine` (pacote `core/ai/domain`, já determinístico, S-188) com só `CATEGORY_DELTA` (mês anterior, mínimo 10% e R$ 50) e `CARD_COMMITTED`. Contrato atual: `type`, `key`, `params`, `factRefs`. A página `insights.page.ts` mostra os calculados e embute `AiActions`; `pt.ts` tem `askAi` ("Perguntar à IA"). Ou seja, o motor já não é IA; o que falta é riqueza matemática, o horizonte "dia" e remover a IA do caminho principal. O motor mora no pacote `ai`, o que acopla insight a IA: será movido (ADR-019).

## 3. Decisões abertas (com recomendação)
Todas aguardam o dono; nenhum agente decide regra de negócio.

| # | Pergunta | Dono | Recomendação |
|---|---|---|---|
| Q1 | Janela de histórico para baselines | Produto | 6 meses fechados; mínimo 3 para emitir. Menos que isso: `insufficientData`. |
| Q2 | Limiares de comprometimento e dívida (50%/70% e 30%/40% da renda) | Produto | Adotar 30% (atenção) e 40% (alerta) para serviço da dívida (referência comum de crédito) e 50%/70% para comprometimento; configuráveis só por constante nomeada agora. |
| Q3 | O que é "essencial" sem categorizar tudo | Produto | Essencial = recorrências + parcelas + pagamentos de dívida (fontes já estruturadas). Variável = o resto do consumo. "Discricionário" fica de fora do MVP. |
| Q4 | Orçamento do dia considera parcelas e fixos? | Produto | Sim: só desconta o que ainda vai vencer no mês (parcelas, recorrências, faturas a pagar) e reservas de metas; nunca desconta o que já foi pago (evita dupla contagem). |
| Q5 | Base de renda do orçamento do dia | Produto | Renda recebida no mês por competência (ADR-017). Sem renda recebida: não emite (`insufficientData`), não estima. |
| Q6 | Entradas futuras no fluxo projetado (saldo mínimo) | Produto | Contar só recorrências de entrada confirmadas; não contar a receber de terceiros (ADR-014). Conservador; `basis` informa. |
| Q7 | Fuso | Arquitetura | O "dia" é do `TimeProvider` no fuso do usuário (`America/Sao_Paulo` por padrão); aritmética com `LocalDate`, nunca 24h em milissegundos. |
| Q8 | Tom dos textos | UX | Factual, sem culpa, uma ação possível ("Você pode gastar R$ X hoje"), nunca "você gastou demais". Revisar com `DS 01`. |
| Q9 | Dispensar: por quanto tempo | UX | "Hoje" (some até o fim do dia), "Este mês", "Parar de avisar deste tipo" (até reverter). |
| Q10 | Cartão tem limite cadastrado? | Backend | Verificar no modelo; se não houver, `CARD_LIMIT_USAGE` fica fora e vira nota. |
| Q11 | Lançamento tem descrição/estabelecimento normalizável? | Backend | Verificar antes de T290; se não, detecção de assinatura usa descrição normalizada (minúsculas, sem acento, sem dígitos). |

## 4. Catálogo de insights

Convenções: `m` = mês de competência consultado, `D` = dias do mês, `d` = dias decorridos (inclui hoje). "Fechados" = meses completos anteriores a `m`. Renda sempre por competência (ADR-017). Consumo = despesa de verdade, sem transferência/investimento/empréstimo (como `EntryReport`). Reembolsos entram como valor negativo no consumo da categoria; categoria líquida é limitada a zero para fins de delta. Compromissos de terceiros (ADR-014) não entram no peso próprio do usuário. Toda moeda em `Money` (centavos inteiros); percentuais com `BigDecimal` escala 6 e arredondamento `HALF_UP` só na saída. Estatística: `median`, `MAD = median(|xi - median|)`, `z = 0,6745 (x - median) / max(MAD, 0,05 median)` (piso evita divisão por zero em série constante).

Severidade: `ALERT` > `ATTENTION` > `POSITIVE` > `INFO`. Todos têm `source: COMPUTED`.

### 4.1 Mensais (`type`, fórmula, entradas, janela, limiares, `insufficientData`)

Escolhidos (11): a coluna "Custo" indica se usa só o razão existente.

| Tipo | Fórmula | Entradas (fonte única) | Janela | Limiares e severidade | Sem dado suficiente | Custo |
|---|---|---|---|---|---|---|
| `SAVINGS_RATE` | `s = (renda - consumo) / renda`; `Δpp = s - média(s dos 3 fechados)` | `MonthlySummary` (renda por competência, consumo) | mês + 3 fechados | `s < 0` ALERT; `Δpp <= -5` ATTENTION; `Δpp >= +5` POSITIVE; senão INFO só na tela | renda do mês = 0 ou menos de 3 fechados com renda > 0 | barato |
| `SPEND_VS_BASELINE` | `z` robusto do consumo total contra os 6 fechados; mês corrente usa o fechamento projetado (`MONTH_PROJECTION`) | `IncomeExpenseSeries` | 6 fechados (mín. 3) | `z >= 2,5` ATTENTION, `z >= 3,5` ALERT (Iglewicz-Hoaglin); exige também desvio >= 10% e >= R$ 100; `z <= -2,5` POSITIVE | `d < 10` no mês corrente ou < 3 fechados | barato |
| `CATEGORY_DELTA` (evolui o atual) | `Δ = atual - mediana(até 3 fechados da categoria)`; `% = Δ / mediana` | `ConsumptionReport` por categoria | 3 fechados (com 1 ou 2, usa o mês anterior como hoje) | `abs(%) >= 20` e `abs(Δ) >= R$ 50`; ALERT se `z >= 3,5` e `Δ >= R$ 200`, senão ATTENTION (alta) ou POSITIVE (queda) | categoria sem mediana positiva | barato |
| `MONTH_PROJECTION` | `fechamento = gastoVariávelAteHoje + médiaDiáriaVariável * (D - d) + aVencerNoMês`; intervalo 80%: `± 1,28 * sd(gasto diário variável) * sqrt(D - d)` | `ConsumptionReport` do dia a dia, `CommitmentSchedule` | mês corrente | ATTENTION se o limite inferior do intervalo já ultrapassa a renda recebida; ALERT se o fechamento esperado ultrapassa | `d < 7` ou menos de 5 dias com gasto | barato |
| `FREE_MONEY` | `livre = rendaRecebida - fixos - parcelas - reservasDeMetas`; `livreRestante = livre - gastoVariávelAteHoje` | `MonthlySummary`, recorrências, parcelas, `GoalReserves` | mês corrente | `livreRestante < 0` ALERT; `< 15% livre` ATTENTION; senão INFO | sem renda recebida no mês | barato |
| `COMMITMENT_INDEX` | `(fixos + parcelas) / renda`, fixos = recorrências de saída; parcelas disjuntas dos fixos por id | `recurrences/summary`, `CommitmentSchedule` | mês | >= 50% ATTENTION, >= 70% ALERT (Q2) | renda 0 | barato |
| `DEBT_SERVICE` | `(parcelas + pagamento mínimo de dívidas) / renda líquida`; também `dívidaTotal / (renda * 12)` como parâmetro | `DebtOverview` (ADR-013) | mês | >= 30% ATTENTION, >= 40% ALERT (Q2) | renda 0 ou sem dívida (não emite) | barato |
| `INSTALLMENT_LOAD` | `carga[k] = soma das parcelas vencendo no mês m+k`, k = 0..11; pico = max | `CommitmentSchedule` | 12 meses à frente | pico >= 1,25 * carga atual e >= R$ 100: ATTENTION (informa mês do pico); queda >= 30% nos próximos 3 meses: POSITIVE | sem parcelas | barato |
| `EMERGENCY_COVERAGE` | `meses = saldoLíquido / essencialMédio3`, essencial = fixos + parcelas + dívidas; runway igual com consumo total | `CashPosition` (saldo líquido, sem cartão), recorrências | 3 fechados | < 1 ALERT, < 3 ATTENTION, >= 6 POSITIVE | essencial médio = 0 | barato |
| `INCOME_STABILITY` | `CV = desvio padrão / média` da renda por competência | `IncomeExpenseSeries` | 6 fechados (mín. 4) | `CV >= 0,30` ATTENTION; só mensal, prioridade baixa | < 4 meses com renda | barato |
| `GOAL_PACE` | repete `onTrack` e `requiredPace` vs ritmo do ADR-016 | `GoalReadModel` | meta ativa | `onTrack = false` ATTENTION; `consistency` alta e `onTrack` POSITIVE | meta sem plano | barato |

Também selecionados, com ressalva:
- `RECURRING_DETECTED` (assinaturas): agrupa lançamentos por descrição normalizada com >= 3 ocorrências, intervalo mediano entre 28 e 32 dias, valor dentro de ±10% da mediana, e que ainda não esteja em recorrências. Custo anual = mediana * 12. INFO, com ação "criar recorrência" (Q11; exige T290).
- `CONCENTRATION`: share das 3 maiores categorias = `soma(top3)/consumo`; INFO, só na tela, prioridade mínima, emite com >= 60%. Fraco como alerta, útil como contexto.
- `CARD_COMMITTED` (existente, mantido); `CARD_LIMIT_USAGE` = `faturaAberta / limite`, >= 70% ATTENTION, >= 90% ALERT (Q10).

Descartados: 50/30/20 (exige categorizar), sazonalidade (>= 13 meses raros), juros do parcelamento (sem dado), sequência sem gastar (gamificação), melhor dia de compra (marginal).

### 4.2 Do dia (data `t`, fuso do usuário)

| Tipo | Fórmula | Entradas | Limiares e severidade | Sem dado | Custo |
|---|---|---|---|---|---|
| `DAILY_BUDGET` | `max(0, livreRestante) / (D - d + 1)` (inclui hoje; Q4, Q5) | mesma base de `FREE_MONEY` | `livreRestante < 0`: ALERT com chave própria "orçamento estourado"; senão INFO (sempre o 1º) | sem renda recebida | barato |
| `TODAY_VS_AVERAGE` | `gastoHoje / mediaDiáriaVariável(1..t-1)` | `ConsumptionReport` do mês | `>= 2x` e `gastoHoje >= R$ 50`: ATTENTION | `d < 7` | barato |
| `DUE_SOON` | soma e contagem de vencimentos em `[t, t+7]` (faturas, parcelas, recorrências, dívidas) e `comprometido / saldoLíquido` | `CommitmentSchedule`, `CashPosition` | vence hoje: ATTENTION; comprometido > saldo líquido: ALERT; senão INFO | nada vencendo (não emite) | barato |
| `MIN_BALANCE_FORECAST` | `saldo[i] = saldoLíquido + soma(entradas conhecidas - saídas conhecidas até i)`, i = 1..30; mínimo e data do mínimo | `CashPosition`, `CommitmentSchedule`, recorrências de entrada (Q6) | primeiro `saldo < 0` em <= 7 dias ALERT, <= 14 ou <= 30 ATTENTION, com `firstNegativeDate`; `basis = KNOWN_SCHEDULE` | sem saldo/agenda | barato |
| `ATYPICAL_ENTRY` | lançamento de hoje `x` > p95 da categoria (n >= 20 nos 6 fechados) ou, com 8 <= n < 20, `z >= 3,5`; e `x >= 2 * mediana` e `x >= R$ 50` | `EntryReport` | ATTENTION; `confidence` = n | n < 8 | barato |
| `CARD_CLOSING_SOON` | fatura que fecha em <= 7 dias e valor parcial | `CardInvoices` | INFO; ATTENTION se fecha em <= 2 dias | sem fatura aberta | barato |

Falso alarme: toda estatística exige mínimo de meses e de observações, materialidade absoluta e relativa, e `insufficientData` explícito (nunca emite um número inventado). Fórmulas nunca usam divisão por zero (pisos nomeados).

### 4.3 Como evitar N leituras (ADR-008)
Um `InsightContext` é montado uma vez por requisição: uma leitura do razão (já em memória pelo ADR-008) cobrindo mês + 6 fechados, agregada em estruturas por mês e por categoria, mais uma consulta de agenda de compromissos, uma de recorrências e uma de metas. Todos os insights são funções puras `(InsightContext, referência) -> Optional<Insight>` em `core/insights/domain`. Proibido leitura por insight. Meta: `monthly` e `daily` com <= 1 leitura do razão cada, e o endpoint combinado da Home (`daily` com `limit=3`) reaproveita o mesmo contexto.

### 4.4 Textos i18n (chaves; só `key` + `params` no contrato, texto em pt/en/es no front)
`insight.savings.rate.up|down|negative`, `insight.spend.high|low`, `insight.category.up|down`, `insight.projection.over|near`, `insight.freeMoney.low|negative`, `insight.commitment.high`, `insight.debt.service.high`, `insight.installments.peak|drop`, `insight.coverage.low|ok`, `insight.income.unstable`, `insight.goal.behind|ahead`, `insight.recurring.detected`, `insight.concentration.top3`, `insight.card.committed|limit`, `insight.daily.budget|over`, `insight.today.high`, `insight.due.today|week|exceeds`, `insight.balance.negativeSoon|negativeLater`, `insight.entry.atypical`, `insight.card.closing`. Exemplo de texto: "Hoje você pode gastar {amount}" (params `amount`, `daysLeft`). Valores já formatados pelo front a partir de strings de `Money`; o front não calcula.

## 5. Contrato de API (aditivo, `/v1`)

Item `Insight` (campos novos são opcionais para clientes antigos; os antigos `type`, `key`, `params`, `factRefs` ficam iguais):
```
{ "id": "ins_<fingerprint>", "type": "DAILY_BUDGET", "key": "insight.daily.budget",
  "params": {"amount":"120.00","daysLeft":"14"}, "factRefs": ["summary.2026-10"],
  "severity": "INFO", "priority": 80, "period": {"kind":"DAY","value":"2026-10-16"},
  "source": "COMPUTED", "basis": "KNOWN_SCHEDULE", "confidence": null, "dismissed": false }
```
`fingerprint = hash(userId, type, period, subjectId)`. `confidence`/`basis` só em tipos estatísticos (`n`, `window`, `z`).

- `GET /v1/insights/monthly?month=YYYY-MM&limit=&includeDismissed=` -> `Slice<Insight>` (mesmo envelope de hoje) + `insufficient: [{type, reason}]` (por que um insight não saiu).
- `GET /v1/insights/daily?date=YYYY-MM-DD&limit=` -> idem. `date` padrão = hoje no fuso do usuário; futuro rejeitado (`INSIGHTS_DATE_INVALID`).
- `GET /v1/insights?month=` permanece como alias de `monthly` (sem quebrar clientes antigos).
- `GET /v1/insights/history?from=YYYY-MM&to=YYYY-MM` -> insights mensais já calculados por mês (recalculados, não armazenados), para o histórico mês a mês; máx. 12 meses.
- `POST /v1/insights/{id}/dismissals` body `{ "scope": "TODAY" | "MONTH" | "TYPE" }` -> `201` com o insight atualizado (`dismissed: true`). `DELETE /v1/insights/{id}/dismissals` -> insight atualizado. Auditoria: tabela append-only `insight_dismissal(id, user_id, fingerprint, type, scope, created_at, revoked_at)`; revogar grava `revoked_at`, nunca apaga linha.

Ordenação: severidade (ALERT, ATTENTION, POSITIVE, INFO), depois `priority` desc, depois magnitude em centavos desc, depois `type` e `id` (estável). Limites: Home mostra até 3 do dia (1 visível na faixa); tela até 5 do mês na aba Mês em destaque e o resto em "Ver mais"; padrão da API `limit=20` máx. 50. Deduplicação: um insight por `fingerprint`; `CATEGORY_DELTA` e `SPEND_VS_BASELINE` não repetem a mesma categoria; `DUE_SOON` suprime `CARD_CLOSING_SOON` se a mesma fatura já está nele; `DAILY_BUDGET` ALERT substitui o INFO.

## 6. Remoção e rebaixamento da IA
- Backend: mover `InsightEngine`, `Insight` para `core/insights` (sem dependência de `ai`); `/v1/ai/*` e `AIService` inalterados (opcional, com consentimento e prévia). Insights nunca chamam `AIService`; teste de arquitetura (ArchUnit ou grep no CI) garante `core/insights` sem import de `core/ai`. `/v1/insights` continua respondendo igual (campos antigos).
- Frontend: Home sem nenhum bloco ou texto de IA; "Perguntar à IA" (`askAi`) deixa de ser caminho principal: sai da tela Insights e do menu primário; o assistente fica em Configurações > "Assistente (opcional)", rotulado como comentário gerado por IA, separado dos insights calculados (que ganham o selo "Calculado"). `insight-text.ts` passa a traduzir as chaves novas.
- Sem quebra: chaves antigas (`insight.category.up|down`, `insight.card.committed`) continuam traduzidas; chave desconhecida mostra um texto neutro e não quebra.

## 7. Tela
- Home (cabe sem rolar): uma faixa de 1 linha (altura de um chip, abaixo do cabeçalho do workspace) com o insight do dia de maior prioridade, ícone de severidade e o texto curto; à direita "+N" que abre um `overlay-panel` com os até 3 do dia, cada um com "Dispensar" (menu: hoje / este mês / parar de avisar). Sem insight, a faixa não ocupa espaço. Remove a seção de insights existente da Home se houver.
- Tela Insights: abas Hoje e Mês (`tabs` existentes). Hoje: lista dos do dia + bloco "Orçamento do dia" e linha do tempo de vencimentos (apenas dados da API). Mês: seletor de mês, até 5 em destaque, "Ver mais", e abaixo "Mês a mês" com os últimos 6 meses (chips de severidade por mês) abrindo o detalhe. Estados carregando/vazio/erro/`insufficient` ("Ainda não temos histórico suficiente: faltam N meses") em todas.

## 8. Tasks

### T284 · dev-backend · ADR-019 e contrato
Objetivo: ADR-019 (insights calculados em `core/insights`, desacoplados de IA; fingerprint; dispensa auditada) e documento do contrato em `docs/arquitetura/` (exemplos sintéticos).
Arquivos: `docs/adrs/ADR-019-insights-calculados.md`, `docs/arquitetura/insights.md`.
Aceite: Dado o ADR, Quando revisado, Então registra decisão, alternativas (IA como motor) e consequências, e o contrato lista os 4 endpoints, `severity`, `priority`, `period`, `source`, `basis`, `confidence`, erros.
Depende de: nenhuma.

### T285 · dev-backend · Estatística pura e modelo `Insight` evoluído
Objetivo: `Stats` (median, MAD, robustZ com piso, percentil p95, CV, média móvel, desvio) em `core/insights/domain`; `Insight` com campos novos mantendo os antigos; `Severity`, `Period`, `Basis`.
Aceite: Dado série `[100,102,98,101,300]`, Quando `robustZ(300)`, Então z >= 3,5 e `robustZ(101) < 0,7`; Dado série constante, Quando MAD = 0, Então usa o piso de 5% e não divide por zero; Dado `Money`, Então nenhuma conta usa `double`; Dado o `Insight` antigo serializado, Então continua com os 4 campos originais.
Depende de: T284.

### T286 · dev-backend · `InsightContext` (uma leitura)
Objetivo: montar o contexto por requisição (razão uma vez, 7 meses; agenda; recorrências; metas; `CashPosition`) em `core/insights/app`.
Aceite: Dado um usuário com 7 meses de lançamentos, Quando monta o contexto para `monthly` e para `daily`, Então faz no máximo 1 leitura do razão, 1 de agenda, 1 de recorrências e 1 de metas (contado em teste); Dado renda com competência de outro mês (ADR-017), Quando agrega, Então a renda cai na competência e o caixa não muda.
Depende de: T285.

### T287 · dev-backend · Mensais A: poupança, desvio, categorias, projeção, dinheiro livre
Objetivo: `SAVINGS_RATE`, `SPEND_VS_BASELINE`, `CATEGORY_DELTA` (evoluído), `MONTH_PROJECTION`, `FREE_MONEY` como funções puras.
Aceite: Dado renda 5.000,00 e consumo 4.000,00 no mês e média de poupança dos 3 fechados de 10%, Quando calcula, Então `s = 20%`, `Δpp = +10` e sai POSITIVE; Dado 2 meses fechados, Quando calcula `SAVINGS_RATE`, Então não emite e registra `insufficient: HISTORY`; Dado dia 5 do mês, Quando calcula `MONTH_PROJECTION`, Então não emite; Dado categoria com reembolso que a leva a valor líquido negativo, Então é tratada como 0; Dado limiar exato (20% e R$ 50,00), Então emite (limite inclusivo, como hoje).
Depende de: T286.

### T288 · dev-backend · Mensais B: compromisso, dívida, parcelas, reserva
Objetivo: `COMMITMENT_INDEX`, `DEBT_SERVICE`, `INSTALLMENT_LOAD`, `EMERGENCY_COVERAGE`.
Aceite: Dado fixos 1.500,00, parcelas 900,00 e renda 4.000,00, Quando calcula, Então índice = 60% e ATTENTION, sem contar a mesma parcela duas vezes; Dado compromisso de terceiro (ADR-014), Então não entra no índice; Dado saldo líquido 6.000,00 e essencial médio 2.000,00, Então cobertura = 3,0 meses (sem alerta) e, com 1.500,00, 0,75 mês ALERT; Dado parcelas até o mês 12 com pico no mês 4, Então `peakMonth` correto.
Depende de: T286.

### T289 · dev-backend · Mensais C: estabilidade, concentração, metas, cartão
Objetivo: `INCOME_STABILITY`, `CONCENTRATION`, `GOAL_PACE` (reusa `GoalReadModel`, sem recalcular), `CARD_LIMIT_USAGE` (se Q10 positivo) e `CARD_COMMITTED` existente.
Aceite: Dado renda `[3000,3000,3000,3000]`, Então CV = 0 e não emite; Dado `[2000,4000,1500,4500]`, Então CV >= 0,30 e ATTENTION; Dado meta com `onTrack=false`, Então `GOAL_PACE` ATTENTION com `requiredPace` vindo do ADR-016, não recalculado; Dado cartão sem limite, Então `CARD_LIMIT_USAGE` não emite.
Depende de: T286.

### T290 · dev-backend · Detecção de assinaturas
Objetivo: `RECURRING_DETECTED` sem IA (Q11).
Aceite: Dado 4 lançamentos "streaming x" de R$ 39,90 a cada 30 dias e nenhuma recorrência cadastrada, Quando detecta, Então emite com `annualCost = 478.80`; Dado 2 ocorrências, Então não emite; Dado valores variando mais que ±10%, Então não emite; Dado recorrência já cadastrada igual, Então não duplica.
Depende de: T286.

### T291 · dev-backend · Do dia A: orçamento, hoje×média, vencimentos, fatura
Objetivo: `DAILY_BUDGET`, `TODAY_VS_AVERAGE`, `DUE_SOON`, `CARD_CLOSING_SOON`.
Aceite: Dado livre restante 1.400,00 no dia 17 de um mês de 30 dias (14 dias incluindo hoje), Quando calcula, Então orçamento = 100,00; Dado livre restante negativo, Então ALERT "estourado" e valor 0; Dado dia 31, Então `daysLeft = 1`; Dado vencimentos hoje de 300,00 e saldo líquido 200,00, Então ALERT; Dado gasto de hoje 40,00 com média 10,00, Então não emite (materialidade R$ 50).
Depende de: T287, T288.

### T292 · dev-backend · Do dia B: saldo mínimo previsto e gasto atípico
Objetivo: `MIN_BALANCE_FORECAST` (30 dias, `basis KNOWN_SCHEDULE`) e `ATYPICAL_ENTRY`.
Aceite: Dado saldo 500,00 e saída agendada de 800,00 em 5 dias, Quando calcula, Então ALERT com `firstNegativeDate` = hoje+5 e `minBalance = -300.00`; Dado a receber de terceiro (ADR-014), Então não conta como entrada; Dado categoria com 25 lançamentos e lançamento hoje acima do p95, 2x a mediana e >= R$ 50, Então emite com `confidence = 25`; Dado 5 lançamentos na categoria, Então não emite.
Depende de: T286.

### T293 · dev-backend · Endpoints, ordenação, deduplicação e dispensa
Objetivo: `/v1/insights/monthly`, `/daily`, `/history`, alias `/v1/insights`, dispensas com migração Flyway `insight_dismissal`; agregador que ordena, deduplica e limita.
Aceite: Dado dois ALERT e um INFO, Quando lista, Então ordem ALERT, ALERT (por prioridade/magnitude), INFO, estável; Dado `POST dismissals {scope:TODAY}`, Quando lista `daily` no mesmo dia, Então o insight some (ou vem `dismissed:true` com `includeDismissed`) e no dia seguinte volta; Dado `DELETE`, Então a linha ganha `revoked_at` e continua existindo; Dado `date` futura, Então 400 `INSIGHTS_DATE_INVALID`; Dado cliente antigo em `/v1/insights?month=`, Então resposta com os 4 campos originais; Dado outro usuário, Então 404 na dispensa (isolamento).
Depende de: T287, T288, T289, T290, T291, T292.

### T294 · dev-backend · Desacoplar insights de `ai`
Objetivo: mover `InsightEngine`/`Insight` para `core/insights`, `AiController` deixa o `/v1/insights` para um controller próprio; teste de arquitetura.
Aceite: Dado a build, Quando roda o teste de arquitetura, Então `core/insights` não importa `core/ai`; Dado `AI_PROVIDER` vazio, Quando chama `daily` e `monthly`, Então 200 com insights; Dado `/v1/ai/status`, Então inalterado.
Depende de: T293.

### T295 · dev-frontend · Módulo, facade e textos (i18n pt/en/es)
Objetivo: `modules/insights` (tipos, gateway, facade) com os endpoints novos; `insight-text` com todas as chaves de 4.4 e fallback neutro para chave desconhecida.
Aceite: Dado cada chave do catálogo, Quando traduz com `params`, Então texto em pt/en/es sem placeholder sobrando; Dado chave desconhecida, Então texto neutro sem erro; Dado `amount` de `Money`, Então o front só formata, não soma nem divide.
Depende de: T293 (contrato fechado em T284; pode começar com mock do contrato).

### T296 · dev-frontend · Faixa de insight do dia na Home
Objetivo: faixa de 1 linha + "+N" abrindo painel com até 3, dispensar por escopo.
Aceite: Dado viewport 390x844, Quando a Home carrega com 3 insights, Então não há rolagem vertical e a faixa mostra só o primeiro; Dado 0 insights, Então a faixa não ocupa altura; Dado "Dispensar > Hoje", Então o insight some sem recarregar a página e volta no outro dia; Dado erro da API, Então a Home segue funcional e a faixa some (sem bloquear o resto).
Depende de: T295.

### T297 · dev-frontend · Tela Insights: abas Hoje/Mês e histórico
Objetivo: abas, seletor de mês, 5 em destaque + "Ver mais", "Mês a mês" (6 meses), estados vazio/`insufficient`/erro, selo "Calculado".
Aceite: Dado mês com `insufficient: HISTORY`, Quando abre, Então mostra "faltam N meses" e não um insight vazio; Dado troca de mês, Então chama `monthly?month=` e mantém foco/leitor de tela; Dado teclado, Então abas navegáveis (WCAG).
Depende de: T295.

### T298 · dev-frontend · Rebaixar a IA
Objetivo: remover `AiActions`/"Perguntar à IA" da tela Insights, Home e menu primário; assistente em Configurações > "Assistente (opcional)".
Aceite: Dado a Home e a tela Insights, Quando inspeciono, Então nenhum texto "IA" nem botão de perguntar; Dado Configurações, Então o assistente continua funcionando com prévia e consentimento; Dado `AI_PROVIDER` desligado, Então Insights funciona igual.
Depende de: T297.

### T299 · tester · Backend: oráculo e propriedade
Objetivo: oráculo independente (BigDecimal, fórmulas do catálogo) e testes de propriedade (jqwik ou equivalente).
Aceite: Dado séries aleatórias, Quando compara cada fórmula com o oráculo, Então diferença 0 centavos e percentuais ao arredondamento; Dado invariantes, Então orçamento do dia >= 0, soma de top3 <= consumo, z invariante a escala e translação, nenhum insight em `insufficientData`; Dado renda/consumo permutados no tempo, Então medianas iguais.
Depende de: T287 a T292.

### T300 · tester · Backend: bordas e integridade
Aceite: Dado mês parcial, mês sem histórico, mês com renda de outra competência (ADR-017), reembolso/valor negativo, terceiros (ADR-014), virada de mês às 23:59 e 00:00 em `America/Sao_Paulo`, fevereiro bissexto e mês de 31 dias, Então resultados esperados sem dupla contagem (PR 01) e determinísticos (mesma entrada, mesma saída); Dado uma dispensa revogada, Então a linha de auditoria continua.
Depende de: T293, T294.

### T301 · tester · Desempenho
Aceite: Dado usuário com 5 anos de dados (>= 20 mil lançamentos sintéticos), Quando `daily` e `monthly`, Então 1 leitura do razão por requisição e p95 < 500 ms local; Dado `history` com 12 meses, Então ainda uma leitura de razão.
Depende de: T293.

### T302 · tester · Frontend e E2E
Aceite: Dado a Home, Então sem rolagem e sem texto de IA; fluxo dispensar hoje, ver o painel "+N", abrir a tela Insights, trocar de aba e mês; acessibilidade (foco, contraste do selo de severidade, leitor de tela); três idiomas sem chave faltando.
Depende de: T296, T297, T298.

### T303 · tester · Regressão do contrato antigo
Aceite: Dado um cliente com o parser antigo (só `type`, `key`, `params`, `factRefs`), Quando chama `/v1/insights?month=`, Então parseia sem erro; Dado `/v1/ai/*`, Então testes existentes passam sem mudança.
Depende de: T294.

## 9. Ordem de execução
1. T284 (contrato) sozinho.
2. T285, depois T286.
3. Em paralelo: T287, T288, T289, T290, T292 (todas dependem só de T286); T291 depois de T287 e T288.
4. T293 (agregador e endpoints), depois T294.
5. Em paralelo ao backend a partir do contrato fechado: T295 (com mock) e, depois dele, T296 e T297 em paralelo; T298 por último no front.
6. Testes: T299 e T301 após o backend; T300 após T294; T303 após T294; T302 após T296 a T298.

## 10. Riscos e ADRs
- ADR-019 (T284). Risco de falso alarme: mitigado por mínimos de histórico, materialidade e `insufficient`. Risco de dupla contagem (parcela dentro de fixo, renda de competência): disjunção por id e teste T300. Risco de desempenho: contexto único (T286, T301). Risco de insights ruidosos: limite 3/5 e dispensa. Risco de dados faltantes (limite do cartão, descrição normalizável): Q10 e Q11 antes de T289/T290. Risco de tom: Q8 e revisão de UX. Home já tem mudanças locais não commitadas (`app-shell`, `home`): T296 deve rebasear sobre elas.

## 11. Registro de execução do backend (T284 a T294, dev-backend, 2026-10-10)
- **Feito:** ADR-019, `docs/arquitetura/insights.md` e contrato 2.20.0 (`/v1/insights/monthly|daily|history`, `POST|DELETE /v1/insights/{id}/dismissals`, alias `GET /v1/insights` na forma original); migração V8.17 (`insight_dismissals`, só inserção com gatilho); `core/insights` (Stats, 15 mensais, 6 do dia, agregador, `InsightContext` com uma leitura do razão); `Insight`/`InsightEngine` saíram de `ai` (preview da IA intocado, `/v1/ai/*` inalterado); teste ArchUnit proíbe `insights` → `ai`.
- **Decisões aplicadas:** histórico de 6 meses (mín. 3); 50%/70% e 30%/40%; essencial = recorrências + parcelas + dívidas; orçamento do dia sobre a renda recebida por competência, sem renda não emite; fluxo projetado só com recorrências e lançamentos futuros (nunca a receber de terceiros).
- **Q10:** o cartão tem limite e agora pode ser nulo; `CARD_LIMIT_USAGE` usa `(limite − disponível)/limite` do `AvailableLimitCalculator` e não emite sem limite (`insufficient NO_LIMIT`). **Q11:** a descrição é opcional e livre, mas a detecção é conservadora (≥ 3 ocorrências, 28 a 32 dias, ±10%, ainda ativa, não cadastrada) e só sugere (INFO), então `RECURRING_DETECTED` entrou.
- **Desvios do plano:** (1) tabela `insight_dismissals` no plural (convenção do projeto) com `subject_id` e `dismissed_on` extras, necessários para os escopos MONTH e TYPE; (2) `MONTH_PROJECTION`: ALERT quando o fechamento esperado passa da renda recebida e ATTENTION quando só o limite superior do intervalo passa (o texto do plano invertia as duas condições); (3) `FREE_MONEY`/`DAILY_BUDGET` usam base de competência (recebido − consumo até hoje − o que já é conhecido e ainda vai acontecer − reservado no mês), sem fatura de cartão, para não contar a compra duas vezes; (4) o alias `GET /v1/insights` devolve só os dois tipos e os cinco campos originais (o catálogo inteiro é `/monthly`), para não quebrar tipos estreitos de clientes antigos; (5) insights de estado atual só no mês corrente.
- **Testes:** unitários dos cálculos contra oráculo (Stats, 41 mensais, do dia, assinaturas, agregador), contexto com os casos do PR 01, 5 propriedades com 150 cenários (partição do consumo, parcelas, competência da renda, invariantes, orçamento), fuso/DST/virada de mês, desempenho (20,5 mil lançamentos: 1 leitura do razão; ~80 a 400 ms), `InsightsIT` (13 ITs: contrato, dispensa auditada, isolamento, alias, sem IA, gatilho do banco).
- **Pendências para o frontend:** ver o resumo de entrega (rotas, `InsightItem`, chaves i18n novas, `insufficient`). O front ainda lê `/v1/insights` (alias), que segue válido.
