# ADR-024: compra parcelada agrupada (`PurchaseGroup`)

Status: **PROPOSTA** (2026-10-15). P-26 é decisão provisória delegada pelo dono. Plano: `docs/planos/2026-10-15-adequacao-ao-resumao.md` (bloco C, task C1). Contrato: 2.26.0. Complementa a ADR-006 (persistência de faturas e parcelas).

## Contexto
Um mesmo item pode ser pago em parcelas em mais de um cartão (exemplo sintético: um "Notebook" em 10x de 100,00 no Cartão A, na 5ª parcela, mais 3x de 50,00 no Cartão B). Hoje cada compra é independente: o dono não vê o total do item, quanto falta, o mês em que acaba nem a parcela do mês somada entre cartões. O pedido do dono é ver "compra parcelada agrupada entre cartões".

Regras do PR 01: 1 (sem dupla contagem), 4 (caixa e dívida do cartão cheios), 7 (sem reescrever o passado), 8 (dinheiro exato), 10 (mesma fonte). Um agrupador que **lançasse** algo repetiria o valor das compras (dupla contagem); por isso ele só lê.

## Decisão

### Decidida (provisória, delegada pelo dono em 2026-10-15)
| # | Decisão |
|---|---|
| P-26 | O total do grupo é **derivado** da soma dos membros. Se o usuário informar `declaredTotal` e ele diferir, o grupo é criado e `divergence` mostra a diferença (nunca bloqueia; é a divergência de documento da P-22). |

### 1. Modelo
- `PurchaseGroup`: identidade do usuário, `name`, `interest` (informativo), `version`, e a lista de **membros**. Cada membro aponta para uma compra (`transactionId`); uma compra pertence a no máximo um grupo.
- O grupo **não tem lançamento, posting nem valor próprio**. Todo número (`total`, `remaining`, `myRemaining`, `lastDueDate`, `installmentAmountPerMonth`, `status`) é derivado das parcelas dos membros no momento da leitura.
- Tabela nova (`purchase_groups` e vínculo por compra); migração `V9.04__create_table_purchase_groups.sql` (nome a renumerar no merge, depois da `V8.18`).

### 2. Criação
`POST /v1/purchase-groups` cria o grupo e, para cada membro, a compra **pelos caminhos existentes**: compra comum (`installmentAmount x totalInstallments`) ou compra em andamento (`remainingInstallments` menor que o total: só as parcelas que faltam, sem consumo retroativo, `source = ONGOING`). O rateio do membro segue a ADR-022. A operação é tudo ou nada. Também é possível vincular (`POST /members`) ou desvincular (`DELETE /members/{transactionId}`) compra já existente, sem alterar a compra.

### 3. Derivações
- `total` = Σ `total` dos membros; `remaining` = Σ parcelas restantes (não vencidas, não canceladas); `lastDueDate` = a maior última parcela dos membros; `installmentAmountPerMonth` = Σ das parcelas que caem na competência corrente.
- `myRemaining` e `committedMine` usam a **minha parte** (ADR-022); `remaining` e `committed` são cheios.
- `status`: `ACTIVE` se algum membro ainda tem parcela a vencer; senão `DONE`.

### 4. Comprometido até um mês
`GET /v1/purchase-groups/commitments?until=AAAA-MM` soma as parcelas não pagas das compras parceladas de cartão, da fatura corrente até `until`. Compras fora de grupo e de grupo entram **uma única vez** (chave `(transactionId, parcela)` da ADR-023); o grupo não duplica nada. Na janela de aceite desta rodada: `until=2026-11`.

### 5. Reação a estorno, cancelamento e rateio
Estorno de parcela, cancelamento das parcelas restantes e edição de rateio de um membro (ADR-022) fazem o grupo se recalcular na próxima leitura (é derivado). Estornar ou cancelar toda a compra mantém o vínculo; o membro passa a valer 0 e o grupo vira `DONE` se nada mais resta. Compra de outro usuário: `404`.

### 6. Contrato
`/v1/purchase-groups` (GET lista paginada, POST), `/v1/purchase-groups/{id}` (GET, PUT só `name`/`interest` com `version`), `/v1/purchase-groups/{id}/members` (POST), `/v1/purchase-groups/{id}/members/{transactionId}` (DELETE, devolve o grupo), `/v1/purchase-groups/commitments`. Erros: `404 PURCHASE_GROUP_NOT_FOUND`, `422 PURCHASE_GROUP_INVALID`, `422 PURCHASE_GROUP_MEMBER_INVALID`.

## Alternativas consideradas
1. **Grupo com lançamento próprio ("compra mãe")**: duplicaria o valor das compras dos cartões (regra 1). Rejeitada.
2. **Total informado como verdade**: contraria a derivação e esconderia erro de digitação. Rejeitada; a divergência é exibida.
3. **Só uma tag na compra, sem entidade**: não dá nome, juros nem total por item. Rejeitada.

## Consequências
- Nenhum posting novo; o risco de dupla contagem está só nas leituras (`commitments`), cobertas por teste com compras dentro e fora de grupo.
- Compras ganham um vínculo opcional de grupo (migração aditiva).
- O backup precisará incluir grupos e vínculos quando C2 for implementada (pendência de contrato do backup).

## Plano de quitação
C2 (backend), C3 (tela), C4 (QA). Revisar P-26 depois do primeiro uso real.

## O que o dono precisa aprovar
1. Grupo apenas de leitura (sem lançamento próprio).
2. Total derivado e `declaredTotal` só como divergência.
3. Vincular compras existentes ao grupo.
