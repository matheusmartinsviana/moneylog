# ADR-025: moeda estrangeira como metadado (USD, câmbio por cobrança, IOF) e assinaturas

Status: **PROPOSTA** (2026-10-15). P-9, P-10, P-11 e P-12 são decisões provisórias delegadas pelo dono. Contrato: 2.27.0. Delimita o S-2 da ADR-002 (dinheiro só em BRL, centavos `long`).

## Contexto
Várias assinaturas são cobradas em dólar no cartão. O dono quer o custo mensal equivalente, o câmbio de cada cobrança, o IOF, separar pessoal de empresa, marcar "ativo até" e ver sobreposição. A ADR-002 fixa o razão em BRL; multimoeda no razão está fora do escopo. A fatura traz o valor já em BRL, então o que falta é guardar de onde veio.

Regras do PR 01: 1 (sem dupla contagem: a previsão da assinatura some quando a cobrança é lançada, ADR-023), 8 (dinheiro exato, sem ponto flutuante).

## Decisão

### Provisórias (delegadas pelo dono em 2026-10-15)
| # | Decisão |
|---|---|
| P-9 | O câmbio é informado **a cada cobrança**; o IOF padrão é 350 bps (editável); arredonda-se **uma vez**, no total. |
| P-10 | Assinatura `COMPANY` no meu cartão fica fora da minha parte (`totalMonthlyMine`) e entra em "a ressarcir pela empresa". |
| P-11 | `overlapGroup` é manual; a API só avisa grupos com 2 ou mais ativas. |
| P-12 | `lastUsedOn` é manual; "sem uso" = mais de N dias, com N em configuração do usuário (`subscriptionUnusedDays`) **sem valor padrão**: o alerta `SUBSCRIPTION_UNUSED` fica inativo até o dono definir N. |

### 1. Moeda como metadado
- O razão e todo valor devolvido pela API continuam em BRL (`Money`). USD e EUR aparecem só em `originalAmount` (`{ amount, currency }`), `fxRate` (string decimal de até 6 casas) e `iofBps`, gravados no lançamento.
- Fórmula, em inteiros e um único arredondamento `HALF_UP` no fim: `BRL = original x fxRate x (10000 + iofBps) / 10000`. Exemplo sintético: USD 5,00 a 5,000000 com 350 bps = 25,00 + 0,875 = **25,88**. A cobrança do mês seguinte, a 5,200000, usa 5,2; a anterior permanece intacta.
- O backend nunca usa `double`/`float` (ArchUnit); a conta é em `BigDecimal` com escala fixa ou centavos `long`.
- Com moeda estrangeira, o `amount` BRL enviado pelo cliente é **ignorado e recalculado** (o cliente não calcula). Sem moeda estrangeira, o contrato é o de hoje.

### 2. Caminho do câmbio por cobrança
- **Confirmação de ocorrência:** `POST /v1/recurrences/{id}/occurrences/{date}/realize` (endpoint existente) aceita `originalAmount`, `fxRate` e `iofBps` em `RealizeOccurrenceInput`. Recorrência em moeda estrangeira sem `fxRate` na confirmação: `422 FX_RATE_REQUIRED`. O lançamento grava os três campos.
- **Recorrência:** guarda `originalAmount` e `referenceFxRate` (só a base da previsão) e `iofBps`.
- **Compra de cartão** (`CardPurchaseInput` e `PurchasePreviewRequest`): aceita os mesmos três campos, para que a prévia e a criação coincidam.
- Moeda `BRL` com `fxRate` ou `iofBps`, câmbio não positivo: `422 FX_INVALID`.

### 3. Assinatura
- **Escopo:** `scope = PERSONAL|COMPANY` (padrão `PERSONAL`). Finanças separadas da empresa como segundo usuário ficam fora desta rodada (só o marcador).
- **Custo mensal equivalente:** semanal x 52/12, diária x 365/12, anual / 12, somado sem arredondar antes e arredondado uma vez. Ex.: semanal de 5,30 = 5,30 x 52 / 12 = **22,97**.
- **Ativa até:** `POST /v1/recurrences/{id}/end` aceita `activeUntil` (sinônimo de `endDate`): ocorrências até a data seguem previstas, depois dela não, a última lançada permanece, e devolve a recorrência atualizada. `Recurrence.activeUntil` espelha o `endDate` de um cancelamento.
- **Sobreposição e uso:** `overlapGroup`, `lastUsedOn`, `channel` manuais; `overlaps[]` em `GET /v1/subscriptions` só lista grupos com 2 ou mais ativas.
- **Lista:** `GET /v1/subscriptions?status=ACTIVE|ENDED|ALL&scope=` devolve `items`, `totalMonthly`, `totalMonthlyMine` (só `PERSONAL`, pela minha parte da ADR-022), `byScope` e `overlaps`. **Quais recorrências são assinaturas:** só as recorrências de despesa marcadas com `isSubscription = true` (decisão provisória delegada pelo dono, contrato 2.32.1; padrão `false`). Aluguel, luz e parcela de cartão não marcados ficam fora de `totalMonthly`, sobreposição e `SUBSCRIPTION_UNUSED`. Migração conceitual: toda recorrência `CARD_PURCHASE` existente passa a `true` e o dono revisa.
- **Anti dupla contagem:** assinatura no cartão aparece uma única vez no resumo do mês, antes e depois de lançada (ADR-023). `subscriptionsMine` é recorte informativo de `cardsMine`.

### 4. Desvios do plano
O plano previa `monthlyEquivalent` na `Recurrence`. A `Recurrence` já tem `monthlyEstimate` (mesma normalização, zerada quando encerrada); para não duplicar, `monthlyEquivalent`, `monthlyEquivalentMine` e `lastChargedAmount` ficam em `Subscription` (que embrulha a `Recurrence`), onde o valor de uma assinatura encerrada não zera. `activeUntil` não vira campo de entrada (já existe `endDate`).

## Alternativas consideradas
1. **Razão multimoeda**: rejeitada (ADR-002).
2. **Câmbio fixo na recorrência**: rejeitada, o câmbio muda a cada cobrança (P-9).
3. **Cotação automática de câmbio**: fora do escopo (o câmbio é informado).
4. **Arredondar por etapa (câmbio e IOF)**: acumula erro; rejeitada.

## Consequências
- Migração `V9.05__alter_recurrences_subscription_fields.sql` (D2; nome a renumerar no merge) e campos opcionais em lançamentos; registros antigos ficam em BRL, `PERSONAL`, sem grupo.
- O backup precisará incluir os campos novos de recorrência e lançamento em D2 (pendência de contrato do backup).
- O alerta `SUBSCRIPTION_UNUSED` depende de N configurado pelo dono; sem ele, não dispara.

## Plano de quitação
D2 (backend), D3 (tela), D4 (QA). Revisar P-9 a P-12 depois do primeiro uso real.

## O que o dono precisa aprovar
1. Moeda estrangeira só como metadado, com BRL recalculado pelo backend.
2. Câmbio informado na confirmação de cada cobrança e IOF padrão 350 bps.
3. Resolvido provisoriamente: marca explícita `isSubscription` (ver Lista).
4. `COMPANY` fora de "minha parte".
