---
tipo: revisão de código
etapa: 3 (cartões, faturas, parcelas) - backend, tasks T49 a T60
data: 2026-10-06
revisor: revisor
escopo: backend/src/main (card, finance/app/cards, transaction/domain Card*, handlers, infra/card, infra/transaction), contracts/openapi.yaml, migrações V3.01 e V3.02
referências: plano da Etapa 3, revisão dos planos 3-9, ADR-006, D1 §2.5/§2.8/§8.3, PR 01
parecer: aprovado com ajustes (1 achado 🟠 a corrigir antes do merge)
---

# Revisão do código do backend da Etapa 3

## 1. Resumo

O ciclo compra → parcela → fatura → pagamento está correto e contado uma vez só. Refiz por conta, em um teste descartável (não commitado) sobre o domínio, o cenário padrão (1.200 em 6x em 10/10, fechamento 25, vencimento 5; fatura corrente 1.283; pagamento a maior de 1.300 em 06/11 → `creditCarry` 17,00 → fatura seguinte com `carryIn` 17,00 e `outstanding` 183,00; `creditBalance` 0,00) e os números batem com o plano. Os testes de unidade selecionados de cartão/fatura/mudança de dias/ArchUnit passam numa cópia do projeto (ver §6).

**Não há 🔴.** Há **um 🟠**: cancelar as parcelas restantes de uma compra que já tem reembolso ativo deixa o consumo da categoria **negativo** (reproduzido: −800,00). É a metade que faltou da correção A1/S-9 (a ordem "cancelar e depois reembolsar" está guardada e testada; "reembolsar e depois cancelar" não). O resto são 🟡/🟢: janela de deadlock já conhecida (S-215), leitura sem trava com estado velho no pagamento, `committedFuture` bruto × `/upcoming` líquido, ids de fatura da lista que não resolvem em lacunas longas, e o desvio de processo.

Pontos fortes: id determinístico UUID v5 correto (RFC 4122 §4.3) e `ON CONFLICT DO NOTHING` sem nomear a restrição (justificado: PK e unicidade colidem juntas); status e valores sempre derivados (nenhuma coluna de status; `credit_card_invoices` só guarda datas); `TransactionVoiding` é o único caminho de estorno (método de domínio package-private); preview e criação passam pela mesma fábrica (`CardPurchaseHandler.plan`, `PayInvoiceUseCaseImpl.plan`); FKs compostas `(id, user_id)` em tudo que é novo; nenhum campo de número/CVV/bandeira em contrato, schema, entidade ou DTO.

## 2. Itens conformes

- **Dupla contagem (PR 01).** Pagamento de fatura = `CARD +X / ACCOUNT −X`, sem posting de `EXPENSE` (`CardTransactions.invoicePayment`). Parcela = `EXPENSE +p / CARD −p` na data efetiva (competência), caixa 0. Reembolso no cartão = `CARD +X / EXPENSE −X`. `CommitmentSchedule` soma só o `outstanding` de faturas não pagas (parcelas aninhadas são `informational` e fora das somas); `Card.totalCommitted` (corrente + fechadas) e `committedFuture` (parcelas em faturas `FUTURE`) são disjuntos; `impact.commitment` = parcelas em `FUTURE` (a parcela 1 fica na corrente). Invariante `Σ outstanding − creditCarry da última = Σ total − Σ paid` verificado algebricamente e coberto por propriedade (100 sementes, comparando com o saldo do livro `CARD`, que vem dos postings: não é tautologia).
- **Alocação (S-12, S-14, S-50).** Fechamento é estritamente posterior à data; `FUTURE`/`OPEN` recebem; `CLOSED`/`OVERDUE` recebem como `lateEntry`; `PAID` redireciona para a corrente; cada parcela segue a anterior e nunca cai em fatura `PAID` (`InvoiceAllocator.forInstallments` empurra para `next(previous)`).
- **Mudança de dias (S-42).** `planBillingChange` vale a partir do mês seguinte ao fechamento da corrente; `confirmedEffectiveFrom` compara a primeira fatura afetada do calendário antigo (detecta a virada do dia); `BillingChange` realoca "k-ésimo ciclo → k-ésimo ciclo" (inclui parcelas canceladas/estornadas, para não deixar linha referenciando fechamento inexistente); `CardBillingChanges` calcula tudo em memória antes de gravar e valida a cadeia antes e depois; `InvoiceRowGateway.refresh` atualiza colunas de data das linhas que mantêm o fechamento e poda só linha sem nenhuma referência (parcela ou movimentação, ativas ou não); referência órfã vira `IllegalStateException` (rollback, 500), nunca silêncio.
- **Concorrência (ordem movimentações → cartão → contas por id).** Respeitada em: compra e reembolso (`AccountTransactionFactory.lockFor`: movimentações de origem, depois cartão, depois contas ordenadas), edição, estorno (`VoidTransactionUseCaseImpl.voidCardTransaction`), cancelamento (movimentação → cartão), mudança de dias (`lockAllOfCard` em ordem de id, `FOR UPDATE` com `ORDER BY`, depois cartão), pagamento (cartão → conta; não trava movimentações, não precisa), arquivar (cartão) e realização de recorrência (recorrência → cartão). `UpdateCardDetailsUseCaseImpl` decide o caminho com uma projeção escalar (`latestDays`) para não deixar entidade velha no contexto: bom cuidado.
- **Fatura persistida × calculada.** Linha só nasce com item ou pagamento; `GET /v1/invoices/{id}` resolve por linha (id + user) ou varrendo os fechamentos dos cartões do usuário em [−24m, +36m]; o id é calculado pela mesma função pura nas duas pontas; o status é sempre `statusAt(hoje)`.
- **Isolamento.** Todo gateway novo filtra por `user_id` (`findByIdAndUserId`, `lockByIdAndUserId`, `rowsByIds`, `findById` da fatura, `lockIdsOfCard`, `deactivateByInstallments`, parcelas por `userId`); cartão/fatura/conta de outro usuário respondem 404 pelo mesmo caminho do inexistente; hidratação confere que a fatura da parcela é do cartão da compra.
- **Idempotência do pagamento.** Escopo próprio (`POST /v1/invoices/{id}/payments`), hash canônico com fatura, conta, valor e data, `claim` e movimentação na mesma transação (rollback desfaz a chave), replay devolve o estado atual da fatura, corpo diferente = `409 IDEMPOTENCY_KEY_REUSED`.
- **Edição limitada (S-212).** `CardPurchaseHandler.edit` recusa mudança de valor, data, parcelas e cartão com `TRANSACTION_NOT_EDITABLE`; categoria não muda com reembolso ativo; lançamentos regravados preservam o estado de cada parcela (canceladas ficam inativas). Contrato: `TransactionUpdate` discrimina `CARD_PURCHASE → CardPurchaseUpdate` e os demais tipos de cartão/dívida → `UnavailableTransactionUpdate`, coerente com `UpdateTransactionUseCaseImpl` (pagamento e crédito no cartão não editam).
- **Estorno (S-214).** Compra com parcela não cancelada em fatura fechada → `TRANSACTION_IN_CLOSED_INVOICE`; compra com reembolso ativo → `HAS_ACTIVE_REFUNDS`; crédito em fatura fechada recusado; pagamento sempre estornável (status recalculado), exceto conta arquivada. `TransactionFlags.ofCard` usa as mesmas funções (`CardVoidRules`), então `voidable`/`voidBlockedBy` não divergem do `POST /void`.
- **Contrato.** `usedRatio` é `number` 0..1 (BigDecimal com 4 casas; `overLimit` → 1); `Idempotency-Key` obrigatório; `ContractCoverageIT` com `PENDING` vazio nos dois sentidos; ITs de cartão validam resposta contra o arquivo (`ContractValidation`); nenhum campo de PAN/CVV/bandeira/últimos dígitos (o contrato diz que nunca guarda).
- **Arquitetura.** `ArchitectureTest` (core sem Spring/JPA/Jackson/infra, sem ponto flutuante, sem ciclos entre features do core, `*UseCaseImpl` só em `core.*.app..`, `*Entity` só em `infra.*.persistence`) passa; todos os `UseCaseImpl` novos estão em `core/finance/app/...`. As fronteiras `core.card` ← `core.transaction` ← `core.finance` ficaram sem ciclo (por isso `CardTransactions`/`CardInvoices` vivem em `core.transaction`).
- **Migrações.** V3.01 e V3.02 só criam índices (nenhuma tabela/linha muda), parciais onde cabe (`card_id IS NOT NULL`, `installment_id IS NOT NULL`, `invoice_id IS NOT NULL`), coerentes com as consultas (`findAllOfCard`, parcelas por usuário+movimentação, desativação por parcela, poda de fatura). O schema (V1.03/V1.04/V1.07 + FKs compostas da V2.00) bate com o domínio: sem coluna de status, `due_date > closing_date` e `period_start < closing_date` garantidos pelo calendário (S-77), `UNIQUE (card_id, closing_date)`.

## 3. Achados

### 🟠 A1. Cancelar parcelas depois de um reembolso deixa o consumo negativo (dupla reversão, PR 01)

- **Onde:** `core/transaction/domain/CardTransactions.java:98-105` (`cancelRemainingInstallments`), `core/finance/app/transactions/usecase/CancelInstallmentsUseCaseImpl.java:62-86` (não lê `sumActiveRefundsOf`), `core/transaction/domain/Transaction.java:284-292` (`replaceInstallments` desativa os postings das canceladas sem olhar reembolso).
- **Problema:** a regra S-9/A1 limita o reembolso ao valor **cobrado** (`chargedAmount` = Σ parcelas não canceladas) e está testada na ordem "cancelar → reembolsar" (`ReembolsoComParcelasCanceladasTest`). A ordem inversa não tem guarda: com a compra de 1.200 em 6x, parcela 1 em fatura fechada, um reembolso de 1.000,00 (aceito, porque o cobrado ainda era 1.200) e depois `cancel-installments` das parcelas 2..6, o consumo da categoria fica em **−800,00** (200 cobrados − 1.000 reembolsados) e a fatura de 25/10 fica com `total −800,00` e `creditCarry` 800,00 transportado por todas as faturas seguintes. Reproduzido com `InvoiceScenario` (saída: `CONSUMO apos cancelar: BRL -800.00 charged=BRL 200.00`, saldo `CARD` +800,00). O estorno da compra já recusa reembolso ativo (S-89); o cancelamento não.
- **Impacto:** o consumo da categoria cai abaixo de zero e o crédito de 800,00 aparece no cartão sem que o banco tenha devolvido nada além do reembolso: é exatamente a "reversão do consumo duas vezes" que a A1 quis impedir, só por outro caminho. Nenhuma trava de concorrência é necessária para o problema: é lógica.
- **Correção sugerida:** passar a soma dos reembolsos ativos da compra para o domínio (`transactions.sumActiveRefundsOf` já é chamado sob a trava da movimentação, que o caso de uso já tem) e recusar quando `Σ reembolsos ativos > chargedAmount depois do cancelamento` (por exemplo `REFUND_EXCEEDS_ORIGINAL`, ou `TRANSACTION_HAS_ACTIVE_REFUNDS` se preferirem a simetria com o estorno; decisão de produto, registrar como S-NNN). A guarda fica em `CardTransactions.cancelRemainingInstallments(purchase, chain, today, now, activeRefunds)` (domínio), com teste "reembolso de 1.000 + cancelar restantes → recusado; reembolso de 200 + cancelar → aceito". Acrescentar ao teste de propriedade a asserção "consumo por compra ≥ 0" (hoje ele só confere o invariante da cadeia, que vale mesmo com o consumo negativo, por isso não pegou).

### 🟡 B1. Pagamento lê o estado do cartão antes da trava e depois reaproveita o contexto de persistência

- **Onde:** `PayInvoiceUseCaseImpl.java:84-93` (`records.load(...)` em `InvoiceResolver.resolve` **antes** de `cards.lockForUpdate`; depois `cards.findById` e `transactions.findAllOfCard`).
- **Problema:** `FinancialRecordsGatewayImpl.load` carrega `CardEntity`, `BillingRuleEntity`, `TransactionEntity`, parcelas e lançamentos como entidades JPA gerenciadas. Dentro da mesma transação, as consultas feitas **depois** da trava devolvem as instâncias já gerenciadas (o Hibernate não sobrescreve estado já carregado). Se outra transação (estorno, cancelamento, mudança de dias) confirmar entre o `load` e a obtenção da trava, a cadeia usada na validação do pagamento é a velha, contra o que o Javadoc da classe promete ("a cadeia só é lida depois das travas"). O efeito é na **validação** (por exemplo aceitar pagamento em fatura que já estaria `PAID`, ou recusar a que voltou a ser pagável): como tudo é derivado, nenhum valor grava errado. Não reproduzi com IT (exigiria forçar o intervalo); o resto do código toma esse cuidado (`latestDays` por projeção, `lockIdsOfCard` só ids).
- **Correção sugerida:** resolver a fatura sem carregar as entidades (cartão por id e usuário via `cards.findById` já travado, ou projeção escalar dos cartões do usuário), ou `entityManager.clear()`/`refresh` logo depois das travas; e um IT que segura o cartão numa transação enquanto o pagamento espera e confirma um cancelamento no meio.

### 🟡 B2. Deadlock residual de mudança de dias × estorno (S-215) vira 500, sem mapeamento

- **Onde:** `ChangeCardBillingDaysUseCaseImpl.java:50-70`, `TransactionRepositoryJpa.lockIdsOfCard`, `GlobalExceptionHandler` (não há tratamento de `CannotAcquireLockException`/`DeadlockLoserDataAccessException`).
- **Problema:** a trava de "todas as movimentações do cartão" é um retrato tirado antes do `FOR UPDATE` do cartão. Uma compra criada (e confirmada) entre esse retrato e a trava do cartão não é travada pela mudança de dias; o `UPDATE` dela, mais adiante, pode esperar um estorno que já segura a linha e espera o cartão: ciclo. O IT `deveSerializarMudancaEEstorno` cobre a compra **já existente**, não essa janela. É estreito (exige estornar a compra no instante em que ela acabou de ser criada), não corrompe nada (o Postgres derruba uma das duas), mas a resposta é 500.
- **Correção sugerida:** (a) mapear `CannotAcquireLockException`/`PessimisticLockingFailureException` para `409 CONFLICT` com `Retry-After` curto (o cliente repete, a operação é idempotente em estado); e (b) se quiserem fechar a janela, repetir `lockAllOfCard` **depois** de travar o cartão e relê-las ali (a segunda lista só traz o que apareceu no intervalo, em ordem de id). Registrar a decisão como S-215 definitivo.

### 🟡 B3. `committedFuture` é bruto; `/upcoming` é líquido do crédito transportado

- **Onde:** `CardViews.java:66-69` (soma `item.amount()` das parcelas em `FUTURE`) × `CommitmentSchedule.java:59-68` (usa `invoice.outstanding()`, já abatido do `carryIn`).
- **Problema:** com crédito transportado entrando numa fatura `FUTURE` (pagamento a maior com a fatura seguinte ainda sem item), `Card.committedFuture` mostra 200,00 e o `/upcoming` mostra 183,00 para a mesma fatura; e `limite − disponível` (183,00) deixa de bater com `totalCommitted + committedFuture` (200,00) mesmo com `creditBalance = 0` (a afirmação de S-193 só vale sem crédito atravessando faturas futuras). Não é dupla contagem, mas são dois números diferentes para o mesmo compromisso, visíveis lado a lado na UI.
- **Correção sugerida:** ou definir `committedFuture` como Σ `outstanding` das faturas `FUTURE` (e ajustar S-193/D1 §2.5.3), ou documentar a exceção no contrato do campo e na UI. Decisão de Produto.

### 🟡 B4. Id devolvido pela lista pode não resolver em `GET /v1/invoices/{id}`

- **Onde:** `ListInvoicesUseCaseImpl.java:65-79` (janela padrão: da primeira fatura com item até 12 meses à frente, contígua) × `InvoiceResolver.java:23-24` (janela [−24m, +36m]).
- **Problema:** fatura vazia no meio de uma sequência contígua mais antiga que 24 meses (cartão usado, parado por mais de dois anos e retomado) aparece na lista com id sem linha, e o `GET` responde 404. A ADR-006 §6 afirma "todo id devolvido por ela resolve". Caso raro.
- **Correção sugerida:** na lista padrão, devolver só faturas com movimento ou dentro da janela do resolvedor (as demais não têm o que mostrar), ou alargar o resolvedor até a primeira fatura com linha.

### 🟡 B5. Custo das leituras cresce com o histórico inteiro

- **Onde:** `FinancialRecordsGatewayImpl.load` (todas as movimentações, parcelas e lançamentos do usuário em cada GET de cartão/fatura/pagamento/prévia/dashboard); `InvoiceChain.statusOf`/`invoice` recalculam a cadeia inteira a cada chamada (`invoicesThrough`, O(meses × itens)) e `TransactionDetailsAssembler.cardInfo/commitment` chamam por parcela.
- **Problema:** aceito por S-79 no MVP, mas a lista de movimentações com 100 compras parceladas faz centenas de recálculos da cadeia por requisição. Risco de latência, não de correção.
- **Correção sugerida:** memoizar `invoicesThrough` por `closingDate` dentro da `InvoiceChain` (ela é efetivamente imutável depois de montada; hoje `addItem`/`registerPayment` mutam, então invalidar o cache neles) e medir com 5 mil movimentações antes da Etapa 5.

### 🟢 B6. Detalhes menores

- `CardInput.name`/`institution` aceitam texto livre: nada impede o usuário de colar um número de cartão (PR 00 §26 fala de nunca **guardar**; a aplicação não guarda campo de PAN, mas aceita o texto). Sugestão: recusar sequência de 13 a 19 dígitos nesses dois campos (`CARD_NAME_LOOKS_LIKE_PAN`) e registrar como decisão de Produto.
- ADR-006 §8 cita `V3.00` e `V3.01` "nomeadas"; só existem `V3.01` e `V3.02`. Corrigir o texto da ADR (ou renomear), para ninguém procurar a V3.00.
- Falta na migração/schema uma amarra de que o `card_id` da fatura da parcela é o `card_id` da compra (só o usuário é garantido pela FK composta); a hidratação detecta e lança `TransactionStateInconsistentException`, o que é suficiente enquanto só o gateway grava. Anotar como invariante do gateway.
- `PaymentPreview.kind` devolve `PREPAY` para qualquer valor em fatura `OPEN`; o plano (T55 CA8) só descreve "acima do total". Confirmar com Produto o texto da UI para pagamento parcial de fatura aberta.

## 4. Riscos

1. **Consumo negativo (A1)** é silencioso: nenhum erro, só números errados no relatório por categoria. Corrigir antes do T61 fechar.
2. **Janela de contenção de travas.** Qualquer operação futura (Etapa 4: dívidas, recorrências) que trave nesta ordem e **depois** escreva linhas que ela não travou reproduz o padrão do S-215. Sugestão: regra ArchUnit/teste que proíba `UPDATE` de movimentação sem trava prévia, ou a documentação da ordem em `TransactionTypeHandler` virar checklist de revisão.
3. **Leitura total do histórico** (B5) combinada com `REPEATABLE READ` somente leitura aumenta o tempo de snapshot em bases grandes.
4. **Relógio único.** Todo status depende de `TimeProvider.today()` global (não há fuso por usuário); a virada do dia na fronteira do fechamento dá 409 `CARD_BILLING_CHANGE_STALE` (previsto) mas também muda estornabilidade entre dois cliques. Aceito, só registrar.

## 5. Pendências por dono

- **Backend:** A1 (guarda de cancelamento com reembolso ativo + testes + propriedade de consumo ≥ 0); B1 (ler depois da trava no pagamento + IT); B2a (mapear deadlock/lock para 409); B3/B4/B5/B6 conforme decisão.
- **Produto:** definir se o cancelamento com reembolso ativo é recusado (`REFUND_EXCEEDS_ORIGINAL`/`TRANSACTION_HAS_ACTIVE_REFUNDS`) ou se o excedente do reembolso vira ajuste (A1); `committedFuture` bruto ou líquido (B3); recusa de texto que parece PAN em nome/instituição (B6); texto de `PREPAY` parcial.
- **Arquitetura:** corrigir a ADR-006 §8 (V3.00); registrar S-207 a S-217 no D1 §8.3 (hoje a tabela termina em S-206; os S-212/S-214/S-215 citados no pedido não estão escritos no D1, só no código e nos comentários).
- **UX:** nenhuma pendência de backend; a UI deve tratar 409 por trava (B2).
- **Tester (T61):** acrescentar "reembolso → cancelar parcelas" e "pagamento esperando trava + cancelamento confirmado no meio" à matriz de concorrência/propriedade.

### Desvio de processo (gates acumulados em T55-T59)

O fluxo do CLAUDE.md exige revisor e tester **por task**. Não há nenhuma revisão de código de task da Etapa 3 em `docs/revisoes/` (só a de planos), e o relato é de que os gates de T55 a T59 foram acumulados. Consequências verificáveis: o A1 acima é uma interação entre T56 (reembolso) e T57 (cancelamento) que uma revisão por task, olhando as regras cruzadas, teria pego; o texto de ADR/D1 ficou atrás do código (S-207 a S-217 sem registro). Esta revisão cobre o conjunto, mas não substitui o gate de cada task: recomendo (1) registrar o desvio e o motivo no plano da Etapa 3, (2) não repetir nas Etapas 4+ (uma task, um gate), e (3) tratar o T61 como a segunda barreira, não como a primeira.

## 6. Verificações executadas (somente leitura do código-fonte; cópia do projeto em diretório temporário)

- Teste descartável sobre `InvoiceScenario`: reembolso 1.000 → cancelar restantes → consumo −800,00 (A1); cenário 1.283 + pagamento 1.300 em 06/11 → `PAID`, `creditCarry` 17,00, seguinte `carryIn` 17,00 / `outstanding` 183,00, `creditBalance` 0,00 (conforme T54 CA5).
- `mvn test` (unidade, cópia): `ArchitectureTest`, `Invariante*`, `MudancaDeDias*`, `CardBillingChangesTest`, `ReembolsoComParcelasCanceladasTest`, `Card*Test`, `Invoice*Test`: sem falha.
- ITs de cartão (`Card*IT`, `Invoice*IT`, Testcontainers/Postgres) na cópia: 94 testes, 0 falhas, 0 erros (T51 a T59). Eles não cobrem o A1 (ordem reembolso → cancelamento) nem a janela do B1.
- Nada foi alterado em `backend/src`; testes novos do tester (T61) em andamento foram ignorados.

## 7. Parecer

🟡 **Aprovado com ajustes.** Integridade financeira do ciclo e do transporte de crédito correta, isolamento por usuário sem furo, concorrência bem pensada e testada nos caminhos principais, contrato coerente com o código. Condição para o merge: **A1** (consumo negativo por reembolso → cancelamento) corrigido com teste. B1 a B5 podem ir como tasks de ajuste antes do T61 fechar; B6 e o desvio de processo são registros.
