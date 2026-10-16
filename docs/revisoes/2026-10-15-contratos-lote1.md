# Revisão: contratos 2.24.1 a 2.31.0 e ADRs 022 (emendada), 023, 024, 025, 026, 027, 029, 031

Data: 2026-10-15. Base: `git diff HEAD` de `backend/contracts/openapi.yaml` (versão 2.20.0 no HEAD, 2.31.0 no working tree), plano rev 3, parecer r3, PR 01, código em `backend/src/main` (somente leitura). Sem dado real nos textos revisados (Ana/Beto, Cartão A/B, valores redondos).

## 1. Resumo
A contabilidade proposta fecha: soma zero em todos os casos (rateio, "já no saldo", consignado, Pix no crédito), nenhum trata transferência, investimento ou empréstimo como despesa, e a parcela futura/assinatura tem chave de dedup. A ADR-022 está coerente após a emenda (A-3 do r3 resolvido). Faltam: o `PostingSource` próprio e a idempotência do "já no saldo" (A-4 do r3 segue aberto), o contrato 2.28.0 / ADR-030 do simulador (não existe; P-7 não é revisável), e três decisões de negócio com recomendação abaixo.

## 2. Conformes
- ADR-022: nenhum `accountId` obrigatório residual (o grep só acha "obrigatórios" de dry-run e teste). §4, §5, §8, Consequências, Pendências e "o que o dono precisa aprovar" estão alinhados com o contrato (`accountId` opcional, `settlement`, `SHARES_BELOW_RECEIVED`, sem `RECEIPT_ACCOUNT_REQUIRED`).
- Sinais do razão conferem com `Debt.java:326-328,440`: `RECEIVABLE -X / EQUITY +X` reduz patrimônio em X (espelho de `ACCOUNT +saldo / EQUITY -saldo`); `PAYABLE +p` baixa passivo. Consignado: `ACCOUNT +N, PAYABLE +(p-j), EXPENSE +j, INCOME -(N+p)` soma zero.
- Pix no crédito (ADR-031): principal não é renda nem consumo; só os juros são `EXPENSE`; fatura e dívida do cartão cheias (regra 4); `CARD_CASH_OUT_INVALID` cobre os dois modos de total.
- Compra agrupada (ADR-024): grupo sem posting, total derivado, `commitments` com chave `(transactionId, parcela)`. Não há como duplicar a compra parcelada nem contá-la inteira no mês.
- Moeda estrangeira (ADR-025): razão em BRL, um arredondamento, `amount` do cliente ignorado, sem `double`.
- Imóvel (ADR-029): cota em valor (regra 8), sem lançamento ao marcar pago, financiamento fora do pendente.
- Ativos (ADR-027): FGTS nunca disponível nem reserva (validado em `ASSET_INVALID`), fora do razão e de `owner-statement`; sem ativos o patrimônio não muda.
- Leituras de consumo: `view` com padrão `MINE` declarado em `parameters/View` e nos endpoints; `ThirdPartyReceipt.settlement` novo é só acréscimo na resposta.

## 3. Achados

### 🟠 C-1. "Já no saldo" sem `PostingSource` próprio nem idempotência (A-4 do r3 não atendido)
`backend/src/main/java/com/moneylog/core/sk/ledger/PostingSourceType.java` só tem `TRANSACTION, ACCOUNT_OPENING, DEBT_RECOGNITION, DEBT_CANCELLATION`; nem a ADR-022 (§4) nem o contrato citam fonte própria. Um `RECEIVABLE -X / EQUITY +X` fica indistinguível de saldo inicial e de cancelamento/perdão no mesmo livro `EQUITY`; o relatório de conciliação do r3 não tem como listar só esses. Impacto: auditoria e relatório de conciliação impossíveis, e repetição do POST sem `Idempotency-Key` (opcional no contrato) baixa o recebível duas vezes até o limite do devido, reduzindo o patrimônio indevidamente. Correção: acrescentar na ADR-022 §4 e no contrato (a) fonte de posting `THIRD_PARTY_RECEIPT_IN_BALANCE` (id = id do recebimento), (b) data do posting = `receivedOn`, (c) `Idempotency-Key` obrigatório quando não há `accountId`, (d) teste do relatório de conciliação e do replay. Bloqueia A4 (não o merge do contrato).

### 🟠 C-2. Contrato 2.28.0 e ADR-030 (simulador, E1) não existem; P-7 não é revisável
`openapi.yaml` salta de 2.27.0 para 2.29.0 (sem `/v1/simulations/purchase`) e não há `ADR-030` em `docs/adrs/`. Mantenho o A-2 do r3 aberto: a regra de P-7 só olha `months[]` de novembro e dá falso `SUSTAINABLE` para parcelamento que aperta depois. Correção: quando `installments` ultrapassa a janela, `reasons[]` inclui `HORIZON_LIMITED` e a resposta nunca é `SUSTAINABLE` (no máximo `RISKY`/"parcial"); `RISKY` por item `ESTIMATED` só depois de I2 (E2 depende de I2 ou o ramo sai); a ADR-030 fixa que a classificação é do cenário sem cortes e `VIABLE_WITH_PLANNING` vem da segunda simulação com cortes. Decisão do dono: aprovar essa ressalva. Registrar também que 2.28.0 é reservada (lacuna de versão intencional) na descrição do contrato.

### 🟡 C-3. `settlement = ALREADY_IN_BALANCE` com dois significados
`openapi.yaml` (`ThirdPartyReceiptSettlement`): em compra rateada grava `RECEIVABLE -X / EQUITY +X`; no recebimento legado (marca ou sem vínculo) "nada é lançado no razão" e devolve o mesmo valor. O front e o relatório não distinguem "baixou recebível e patrimônio caiu X" de "só registro informativo". Correção: terceiro valor (`NONE_LEGACY`) ou campo `ledgerEffect` (`EQUITY_OFFSET`|`NONE`). Também o texto de `ThirdPartyReceiptInput.accountId` diz que sem vínculo a rateio dá `422 THIRD_PARTY_EXPENSE_INVALID`, enquanto o resumo do endpoint diz que o legado sem `transactionId` aceita: unificar a descrição (legado só sem `accountId`).

### 🟡 C-4. Consignado: renda `N + p` no razão x `N` na tela (dúvida 1)
ADR-026 §3 grava `INCOME -(N+p)`; `owner-statement` mostra `N`. Dois números de renda para o mesmo mês violam a regra 10 se o `month.income` do Início sair do razão. Ver recomendação na seção 5.

### 🟡 C-5. Fonte fiscal da ADR-026 só confirmada pelo próprio dev (A-5 do r3)
A tabela INSS/IRRF/redutor e as URLs da seção 1 não foram validadas por pessoa; esta revisão não consegue verificar as normas e não aprova os números. Impacto: renda de novembro errada alimenta todo o `owner-statement`. Correção: dono confere norma, vigência e faixas antes do merge de `V9.06`; manter o líquido informado manualmente como alternativa quando `TAX_TABLE_UNAVAILABLE`; fixture calculada por pessoa.

### 🟡 C-6. Ativo `OTHER`/`AVAILABLE` pode duplicar conta de investimento no patrimônio (dúvida 4)
ADR-027 deixa contas de investimento fora de `availableCash` e da reserva, e o dono pode lançar um `Asset` com o mesmo dinheiro de uma conta de investimento já no razão: dupla contagem do patrimônio (regra 1). Correção: aviso no contrato/tela "não informe saldo que já está numa conta" e, se a conta de investimento passar a contar na reserva, usar flag na conta, não ativo espelho. Ver seção 5.

### 🟡 C-7. Compatibilidade com o frontend
- `frontend/contracts/openapi.yaml` está em 2.20.0: exige `./moneylog contract sync` e regenerar tipos; sem isso nada compila contra os novos campos.
- `view` padrão `MINE` muda silenciosamente os números de quem tem rateio ou marca: aceito pelo dono (P-27), mas toda tela precisa rotular a visão (já previsto) e o front tem de enviar `view` explicitamente onde precisa de `GROSS`.
- Acréscimos de enum (`ThirdPartyItem.source = CARD_SHARE`, `Debt.kind`, `NotificationKind` em 2.32.0) quebram `switch` exaustivo; o front deve ter ramo padrão.
- Resposta nova com campo obrigatório (`ThirdPartyReceipt.settlement`, `Transaction.personShares`, `Debt.kind`): compatível para quem lê, mas fixtures/mocks do front precisam ser atualizados.
- `Transaction.shares` (dívidas da despesa de conta) x `personShares` (rateio de cartão): nomes próximos, risco de uso trocado; documentar no `description` dos dois.

### 🟢 C-8. Texto
ADR-022 linha 8 ainda diz "uma parente usa" (A-8 do r3): trocar por "usada por outra pessoa". ADR-022 Consequências ainda cita dependência de `V8.18` (A-1 do r3): confirmar estado real do DG antes de numerar as migrações V9.xx. ADR-023, 024, 025, 026, 027, 029, 031 estão `PROPOSTA`: o contrato já avançou; as tasks de implementação só começam após aceite.

## 4. Riscos
- Patrimônio subestimado se o modo "já no saldo" for marcado sem o dinheiro estar no saldo (mitigado por escolha explícita, falta a fonte de posting, C-1).
- Falso `SUSTAINABLE` no simulador (C-2).
- Líquido de novembro errado por tabela fiscal não validada (C-5).
- Divergência entre `month.income` e `owner-statement` com consignado (C-4).
- Contrato e front desalinhados até o sync (C-7).
- Contrato 2.24.x–2.31.0 ainda não commitado: perda ou conflito se outro bump entrar antes.

## 5. Recomendação por dúvida do dev
1. **Consignado no razão: `N + p` ou `N`?** Manter **`N + p` no razão** (a renda recebida de fato; o passivo cai contra renda, sem `EQUITY` sem rastro, e o patrimônio sobe corretamente em `N + p`). Para não ter dois números: o contrato de `month.income` e do `owner-statement` expõe os dois componentes (`receivedInAccount = N`, `appliedToDebt = p`); o "sobra" do `owner-statement` usa `N` (caixa), o razão usa `N + p`, e um teste prova que `receivedInAccount + appliedToDebt` do Início é igual à soma do razão. Não usar a alternativa `N` + `EQUITY`.
2. **Assinatura: toda recorrência de despesa ou marca explícita?** **Marca explícita** (`isSubscription`, booleano, padrão `false`). Aluguel, luz e parcela de cartão são recorrência de despesa e inflariam `totalMonthly`, sobreposição e `SUBSCRIPTION_UNUSED`. Migração: recorrência `CARD_PURCHASE` existente vira `true`; o dono revisa. Acréscimo compatível no contrato 2.27.0 (campo opcional na entrada, obrigatório na saída). Se o dono preferir manter a regra simples, aceitar apenas com o filtro `scope`/`overlapGroup` visível e sem alerta de "sem uso" para quem não marcou.
3. **Juros da parcela do consignado (pendência 2 da ADR-026, assumida como dúvida 3):** aceitar `interestAmount` opcional por ocorrência da rubrica `LOAN`; sem ele, toda a parcela baixa principal, `confidence = ESTIMATED` e aviso `PAYROLL_INTEREST_NOT_SPLIT`. Nunca inventar a divisão.
4. **Reserva de emergência:** manter a escolha mínima (ativos `AVAILABLE` marcados, FGTS nunca). Perguntar ao dono se conta de investimento do razão conta; se sim, flag `countsAsReserve` na conta (sem ativo espelho, C-6). Não somar conta e ativo do mesmo dinheiro.
5. **P-7 do simulador só em novembro (A-2):** aceitar a janela de novembro apenas com `HORIZON_LIMITED` e sem `SUSTAINABLE` quando houver parcela além da janela (C-2).

## 6. Pendências por dono
- Produto/dono: validar fonte fiscal e vigências (C-5); responder dúvidas 1, 2, 4 acima; aprovar a ressalva do P-7 (C-2).
- Arquitetura: emendar ADR-022 §4 com fonte de posting, data e idempotência (C-1); ADR-030 (C-2); `ledgerEffect` ou terceiro valor de `settlement` (C-3).
- Backend: sync do contrato para o front e commit do contrato antes de novo bump; `PostingSourceType` novo; `interestAmount` do consignado.
- UX: aviso de efeito no patrimônio no modo "já no saldo"; aviso de dupla contagem de ativo; rótulos `MINE`/`GROSS`.

## 7. Parecer
🟡 **Aprovado com ajustes.** Nenhum achado crítico e nada viola o PR 01; o contrato 2.24.1 a 2.31.0 pode ser commitado após C-3 (descrição) e o `description` de C-7. Antes de A4 é obrigatório fechar C-1 (fonte de posting e idempotência). C-2 bloqueia a task E1/E2, não o Lote 1. As ADRs seguem `PROPOSTA` até o dono responder as dúvidas.
