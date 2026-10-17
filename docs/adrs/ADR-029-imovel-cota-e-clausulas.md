# ADR-029: imóvel com cota por co-comprador e cláusulas

Status: **PROPOSTA** (2026-10-15). P-19 é decisão provisória delegada pelo dono. Contrato: 2.31.0. Complementa a ADR-014 (compromissos acompanhados: o financiamento fica fora do pendente direto).

## Contexto
O imóvel é um `LONG_TERM_PROJECT` com cronograma (`DOWN_PAYMENT`, `INSTALLMENT`, `EXTRAORDINARY`, `FINANCING`). Ele é comprado com outra pessoa: parte das parcelas é do dono e parte do co-comprador, e a cota varia por parcela. Hoje o item tem um valor só, sem cota. Para "o que é MEU" (ADR-023) e para formalizar com o co-comprador, o sistema precisa da cota por item, dos totais por pessoa e das cláusulas do contrato.

Regras do PR 01: 1 (sem dupla contagem), 4, 8 (dinheiro exato), 10 (mesma fonte). Marcar um item como pago **não** movimenta conta (ADR-014).

## Decisão

### Provisória (delegada pelo dono em 2026-10-15)
| # | Decisão |
|---|---|
| P-19 | (a) Sem cota padrão: item sem cota é "cota não definida" e conta 100% minha, estimado. (b) A cota é guardada como **valor** (não percentual). (c) A formalização é em tela e CSV (PDF fora). |

### 1. Cota por item
- `CommitmentItem` (de `LONG_TERM_PROJECT`) ganha `shares[{ personId|null, amount }]` (`null` = eu), `coBuyerPersonId?` e `sharesDefined`. Σ das cotas = valor do item (`422 COMMITMENT_SHARES_INVALID`); pessoa não repete; `coBuyerPersonId`, se informado, está nas cotas; pessoa de outro usuário: `422` (nunca revela existência).
- Exemplo sintético, 3 parcelas de 2.000, 6.000 e 3.000: cota do dono 1.000 na de 2.000 (a outra metade do co-comprador); 2.000 do dono e 4.000 da Ana na de 6.000; a de 3.000 sem cota definida (100% minha, estimada).
- Marcar como pago registra a cota vigente naquele momento como a **paga**. O `FINANCING` continua fora do pendente direto (ADR-014).
- Correção posterior: `PUT /v1/commitments/{id}/schedule/{position}/shares` (acréscimo ao plano; sem ele a cota informada não seria corrigível, regra 7 pede edição real com histórico). Vale para o que falta; o pago mantém a cota registrada.

### 2. Totais e cláusulas
- `Commitment.totalsByPerson[{ personId|null, paid, pending, total }]`: a soma por pessoa de todos os itens é o total do compromisso; item sem cota soma em "eu". Só no projeto; vazio nos demais.
- `Commitment.clauses { lateFeeBps, monthlyInterestBps, terminationRetentionBps, notes?, terminationRetentionAmount }` em pontos-base (multa 200 = 2%; juros 100 = 1% a.m.; retenção 700 = 7%). A **retenção sobre o preço** (`terminationRetentionAmount = piso(total x bps / 10000)`) é calculada pelo backend. As cláusulas são registro e cálculo informativo; não geram lançamento.
- `PUT /v1/commitments/{id}/clauses` define/corrige as cláusulas (acréscimo ao plano; o compromisso hoje não tem edição geral).

### 3. Formalização
`GET /v1/commitments/{id}/by-person` devolve, por pessoa, os itens (cota, pago ou pendente, `estimated`), os totais e a lista de itens sem cota. `format=csv` entrega o mesmo recorte para o dono enviar ao co-comprador (UTF-8 com BOM, `;`, proteção contra injeção de fórmula, no-store). PDF fica fora desta rodada.

### 4. Efeito no resumo do mês
O `owner-statement` (ADR-023) usa a **minha cota** do item não pago em `realEstateMine`; item sem cota entra com o valor total e o aviso `REAL_ESTATE_SHARE_UNDEFINED`. O alerta `BALANCE_BELOW_REAL_ESTATE` (ADR-028) compara o saldo `CASH` com a próxima obrigação "minha cota".

## Alternativas consideradas
1. **Cota em percentual**: rejeitada, o valor da parcela muda por item e o percentual vira arredondamento (regra 8). Cota é valor.
2. **Cota padrão (ex.: 50%)**: rejeitada, o dono não definiu (P-19a); a ausência é visível.
3. **Modelar o co-comprador como `Person` com `RECEIVABLE`**: rejeitada, o imóvel é acompanhamento sem movimento de conta (ADR-014).

## Consequências
- Migração `V9.10__alter_commitment_items_shares_and_clauses.sql` (H2; nome a renumerar no merge); compromissos antigos ficam sem cota e sem cláusulas, sem mudar de formato.
- Dedup do imóvel no `owner-statement`: o item não tem id próprio; a chave é `(commitmentId, position)` (ADR-023, ajustada).
- O backup precisará incluir cotas e cláusulas (pendência de contrato do backup em H2).

## Plano de quitação
H2 (backend), H3 (tela e CSV), H4 (QA). Revisar P-19 depois do primeiro uso real e, se o dono quiser, abrir ADR para PDF.

## O que o dono precisa aprovar
1. Cota em valor, por item, sem padrão (ausente = "não definida", 100% minha, estimada).
2. As cláusulas em pontos-base e a retenção calculada sobre o preço.
3. Os dois `PUT` de correção (cota e cláusulas).
4. Formalização só em tela e CSV.
