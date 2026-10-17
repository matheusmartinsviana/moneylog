# ADR-028: Proveniência (origem e confiança), alertas novos e dados do cartão

Status: **PROPOSTA** (2026-10-15). P-12, P-21, P-22, P-23, P-24, P-31a e P-33 são decisões provisórias delegadas pelo dono. Plano: `docs/planos/2026-10-15-adequacao-ao-resumao.md` (bloco I, tasks I1 a I3). Contrato: 2.32.0. Complementa a ADR-012 (notificações idempotentes, sem IA).

## Contexto
O resumão traz dados de fontes diferentes (print, holerite, contrato, informado) e alertas que o sistema ainda não gera. É preciso dizer de onde cada dado veio e quão firme ele é, sem criar um fluxo de aprovação, e gerar os alertas no backend, sem IA e sem duplicar.

## Decisão

### 1. Proveniência (P-23)
- Objeto opcional `provenance { origin, confidence }` em item de compromisso, recorrência, perfil de renda, ativo e rateio. `origin`: `PRINT`, `PAYSLIP`, `CONTRACT`, `INFORMED`. `confidence`: `CONFIRMED`, `ESTIMATED`.
- Ausente: `INFORMED`/`CONFIRMED`. Registros antigos migram assim (nada muda de formato).
- **Não há campo `status` persistido**: o status é derivado na leitura (ex.: renda `PLANNED`/`RECEIVED` pela data).
- O `OwnerStatement` marca cada ponto com o **pior** `confidence` dos itens que o compõem (`ESTIMATED` vence `CONFIRMED`). O simulador (ADR-030) lê essa confiança para o ramo `RISKY`.

### 2. Cartão (P-24, P-31a)
- `autoDebit: boolean | null`: `null` = desconhecido; os cartões existentes migram `null` e **não geram alerta** até o dono marcar.
- `brand`, `bestPurchaseDay` e `lastDigits` (finais de 4 dígitos, até 5 por cartão) são informativos. A compra aceita `lastDigits` opcional e precisa pertencer ao cartão (`422 PURCHASE_LAST_DIGITS_NOT_FROM_CARD`). A **fatura é uma só por cartão**, sem quebra por final.

### 3. Novos `NotificationKind`
| Tipo | Quando |
|---|---|
| `INVOICE_DUE_AUTODEBIT_OFF` | fatura vence em até `invoiceDueLeadDays` (padrão 3, P-21) com `autoDebit = false`; com `true` ou `null`, só o `INVOICE_DUE` existente |
| `NEGATIVE_MONTH_PROJECTED` | mês projetado com sobra negativa (`owner-statement`), com o mês |
| `NEW_DEBT_BEFORE_FINANCING` | nova compra parcelada ou Pix no crédito com financiamento pendente (P-20); no preview, `FINANCING_PENDING` |
| `CARD_CASH_OUT_COST` | Pix no crédito registrado (P-33): taxa efetiva mensal (TIR) e valor da parcela, uma vez |
| `SUBSCRIPTION_OVERLAP` | duas ou mais assinaturas ativas no mesmo `overlapGroup` |
| `SUBSCRIPTION_UNUSED` | `lastUsedOn` mais antigo que `subscriptionUnusedDays` (P-12); **inativo** enquanto o valor for `null` |
| `WEEKLY_CHARGE` | assinatura semanal, uma vez |
| `THIRD_PARTY_OVERDUE` | recebível pendente com a fatura que o contém vencida (P-21) |
| `BALANCE_BELOW_REAL_ESTATE` | saldo `CASH` menor que a próxima obrigação "minha cota" |
| `DOCUMENT_DIVERGENCE` | diferença maior que `documentDivergenceTolerance` entre o informado e o documento (P-22) |

Geração no backend, idempotente por dia (chave da ADR-012), sem IA.

**`DOCUMENT_DIVERGENCE` (decisão do dono, BUG-11):** o valor do documento é um campo que o **próprio dono preenche e edita**; o sistema não o deduz. Primeiro escopo: **fatura do cartão**
(o valor que consta no documento da fatura). Fica fora, para depois e sem mudar o desenho: lançamento e renda (basta alimentar `AlertInputs.documents` com a nova fonte).
- Campo `credit_card_invoices.document_amount_cents` (opcional, maior ou igual a 0, BRL), editado por `PUT /v1/invoices/{id}/document-amount` (`{ documentAmount: "123.45" | null, version? }`; `null` limpa).
- O `total` calculado pelo backend segue sendo a fonte da verdade; o valor do documento só compara. Não cria lançamento nem altera saldo, razão ou fatura (PR 01).
- O `GET` da fatura expõe `documentAmount`, `documentDivergence` (`total` − `documentAmount`, com sinal, `null` quando fecham ou sem valor) e `documentVersion`.
- O alerta nasce quando `|total − documentAmount|` passa de `documentDivergenceTolerance` (igual à tolerância não avisa), com `refType` `INVOICE`, `refId` = id da fatura e `params` `label`, `informed` (total calculado),
  `documented` e `difference` (absoluta). Segue a idempotência por dia dos demais; quando a diferença volta à tolerância ou o valor é removido, deixa de ser gerado (notificações antigas ficam no histórico).

### 4. Configurações (`/v1/settings/notifications`)
`kinds` aceita os tipos novos (liga/desliga) e o objeto `alerts` traz os parâmetros:
| Campo | Padrão | Faixa |
|---|---|---|
| `subscriptionUnusedDays` | `null` (alerta inativo) | 1 a 3650 |
| `invoiceDueLeadDays` | 3 | 1 a 30 |
| `documentDivergenceTolerance` | 0,00 BRL | maior ou igual a 0 |
Fora da faixa: `422 NOTIFICATION_THRESHOLD_INVALID`. Campo ausente no `PUT` mantém o valor salvo.

### 5. Integridade financeira (PR 01)
Alertas só leem; nenhum cria lançamento. `CARD_CASH_OUT_COST` não trata o principal como despesa (ADR-031). Proveniência é metadado: não altera valor nem soma.

## Consequências
- Migrações aditivas (colunas opcionais, `autoDebit` nulo); nada muda de formato para dado antigo.
- O front exibe selo "estimado" e liga/desliga cada alerta; títulos e textos por chave de i18n.

## Pendências (dono)
- Confirmar os padrões (3 dias, tolerância 0) e que `subscriptionUnusedDays` não tem padrão.
