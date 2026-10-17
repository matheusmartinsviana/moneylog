# Revisão de código backend: A2a, A2b, A2c, A4, B2b, F3 (lotes 2 a 4)

Data: 2026-10-15 · Revisor · Plano `docs/planos/2026-10-15-adequacao-ao-resumao.md` (rev 3) · ADR-022, 023, 026 · PR 01 · BE 00..09.
Base: árvore de trabalho não commitada de `backend/` (leitura de `git diff`/`git status`; os arquivos tocados foram lidos por inteiro nos pontos críticos). `test-compile` passou; a execução do `ArchitectureTest` foi tentada, mas a árvore mudou no meio da execução (outra tarefa mexendo em `Provenance`), então a análise de ciclo abaixo é estática, por imports.

## 1. Resumo

A base do razão está certa: o rateio gera `EXPENSE (minha parte) + RECEIVABLE(pessoa) − CARD cheio` por parcela (soma zero), o recebimento "já no saldo" usa `RECEIVABLE −X / EQUITY +X`, o consignado em folha lança `ACCOUNT + principal baixado na dívida + juros em despesa − renda bruta` (soma zero, principal nunca vira despesa) e o `OwnerOutflow` deduplica por chave de fonte. A ordem de travas do `apply` da A2c (transações ordenadas, depois pessoas ordenadas) bate com a ADR-008.

Há porém dois furos que quebram a integridade em produção (estorno de compra rateada e edição/cancelamento de "Pix no crédito"), um ciclo de pacotes que derruba o CI, desvios da ADR-022 (fonte `THIRD_PARTY_RECEIPT_IN_BALANCE`, `Idempotency-Key`), violação da ordem de travas em dois fluxos e ausência quase total de testes dos critérios de aceite.

## 2. Itens conformes

- `PurchaseShares.split`: resto da parcela fica com o dono, terceiros arredondados para baixo por parcela (P-5), validação de soma/duplicidade (`SHARES_INVALID`).
- `CardTransactions.installmentEntries`: soma zero por parcela; compra sem rateio gera os mesmos postings de antes.
- `RecordThirdPartyReceiptUseCaseImpl.recordOnShare`: ordem tx → pessoa → conta (ADR-008/ADR-022 §7), recusa acima do pendente (`DEBT_SETTLEMENT_EXCEEDS_OUTSTANDING`), conta só `CASH`, escopo por `userId` em todos os gateways, replay por `Idempotency-Key` devolve o recebimento original.
- `PUT shares`: trava tx → pessoas (ordenadas) → checa versão; `SHARES_BELOW_RECEIVED` (P-28) antes de gravar; revisão auditada; reclassifica só `EXPENSE` x `RECEIVABLE`.
- `ShareSettlement`/`SharePayables`: conversão do excedente em `PAYABLE` é idempotente (`alreadyConverted`), auditada e soma zero. Fiação em `TransactionConfig` passa o `ShareSettlement` (nada fica `null`).
- A2c: dry-run não grava; `apply` recusa hash divergente, é idempotente (`existsApplied`), arquiva a marca em `third_party_mark_migrations` (nada some), recusa `r > t` como exceção, a prova `MINE + pendente + reembolsado = P` é checada por compra no planner (`INVARIANT_BROKEN`).
- Migrações V9.00, V9.02, V9.05, V9.07, V9.11, V9.12, V9.13: FKs compostas `(id, user_id)`, checks de forma, índices parciais únicos por pessoa/dono; sem FK para tabela de outro usuário. Numeração sequencial (exceto V9.14, ver L1).
- F3: `PayrollTransactions.incomeWithLoan` soma zero e `principal + juros = parcela`; `payroll_loan_applications` com check de consistência; `DebtLinkRow` usa `principal_cents` (a baixa da dívida é o principal, não o líquido); `generate-occurrences` é idempotente (trava do perfil + `uq (profile, competence, kind)`); `DebtOverviewCalculator` e `CommitmentSchedule` não listam a parcela do consignado como a vencer.
- B2b: dedup por `(recurrenceId, occurrenceDate)` e `(transactionId, installmentId)`; fatura cai no mês do vencimento (P-3); pagamento de fatura e transferência não entram (só `EXPENSE` fora do cartão); `COMPANY` vai para `companyReimbursable`; cota de imóvel com `sharesDefined`; escopo por usuário.
- Nenhum valor financeiro em logs nos arquivos novos (as únicas linhas de log trazem só o nome da exceção ou o erro técnico).

## 3. Achados

### 🔴 Críticos

**C1. Estorno (REFUND) de compra rateada ignora o rateio: abate a despesa inteira e deixa o recebível de pé** · `core/transaction/domain/CardTransactions.java:168-181` (`refundToCard`), `core/finance/app/transactions/handlers/CardRefundHandler.java:41-44`
- Problema: o estorno continua gerando `CARD +valor / EXPENSE −valor` sem olhar `refundOf.purchaseShares()`. Numa compra de 100,00 rateada 50/50, um estorno de 100,00 gera `EXPENSE −100` contra `EXPENSE +50` (consumo `MINE` = −50) e o `RECEIVABLE(Ana) +50` permanece. É exatamente a dupla contagem (`P − t − r`) que a ADR-022 §6 e o aceite da A2b proíbem; a conversão do excedente em `PAYABLE` (P-28b) também só existe para void/cancelamento, nunca para estorno.
- Impacto: consumo e resultado do mês errados, Ana continua devendo algo que foi devolvido, `consumo(MINE) + a receber + recebido ≠ consumo(GROSS)`.
- Correção: no estorno de uma compra com `purchaseShares`, dividir o valor pela mesma regra da parcela (`EXPENSE −minha parte`, `RECEIVABLE(pessoa) −parte`, `CARD +valor`), validar `RefundExceedsOriginal` pelas partes e acionar `ShareSettlement.planConversion` quando o recebido passar do novo devido. Teste: estorno total e parcial, 50/50, e a propriedade de 200 cenários.

**C2. "Pix no crédito" pode ser reescrito como compra comum: o principal do empréstimo vira despesa e o caixa some; cancelar parcelas não reverte o principal** · `core/finance/app/transactions/usecase/UpdateTransactionUseCaseImpl.java` (`editCardPurchase`), `core/transaction/domain/CardTransactions.java` (`editPurchaseDetails`, `reshare`), `core/finance/app/transactions/usecase/UpdateTransactionSharesUseCaseImpl.java`, `core/finance/app/transactions/usecase/CancelInstallmentsUseCaseImpl.java:75-100`
- Problema: a compra `CARD_CASH_OUT` é um `CARD_PURCHASE` com `categoryId` (categoria dos juros), sem `debtId` na transação, então passa em todas as travas de edição. `PUT /v1/transactions/{id}` (mudar só a descrição) e `PUT /v1/transactions/{id}/shares` reconstroem as entradas com `installmentEntries(categoria, cartão)`: cada parcela cheia (280) vira `EXPENSE`, o `ACCOUNT +principal`/`EQUITY` da 1ª parcela é substituído e o `RECEIVABLE(debt)` da compra para terceiro some. Resultado: empréstimo tratado como despesa (PR 01, regra de empréstimo) e saldo da conta perdendo o principal recebido.
- Cancelar as parcelas restantes (`CancelInstallments`) desativa só `CARD`, juros e `EQUITY` das parcelas canceladas; o `ACCOUNT +principal` e a dívida (`principal` fixo) ficam, e a TIR passa a ser calculada sobre o cronograma parcial (`canceled_at IS NULL`). Não há guarda nem reversão do principal proporcional. (Estorno total, via void, está tratado pelo `markOriginVoided`.)
- Correção: recusar edição de detalhes, `PUT shares` e estorno parcial de transação ligada a dívida `CARD_CASH_OUT` (`TRANSACTION_NOT_EDITABLE`), ou reconstruí-la por `CardCashOutTransactions`; para o cancelamento, decidir com Produto (recusar ou reverter o principal das parcelas canceladas contra `EQUITY`) e testar.

### 🟠 Altos

**H1. Ciclos de pacotes `core.finance ↔ core.thirdparty` e `core.finance ↔ core.commitment` (ArchUnit `featuresDoCoreSemCiclos`)** · `core/thirdparty/app/RecordThirdPartyReceiptUseCaseImpl.java`, `UnmarkThirdPartyExpenseUseCaseImpl.java`, `migration/ApplyShareMigrationUseCaseImpl.java`, `PreviewShareMigrationUseCaseImpl.java` (importam `core.finance.*`) × `core/finance/app/transactions/ShareSettlement.java`, `GetThirdPartyReceivablesUseCaseImpl`, `ThirdPartyReceivables`, `CardShareReceivables`, `OwnerStatement` (importam `core.thirdparty.*`); `core/commitment/app/CommitmentByPersonCsv.java` (importa `core.finance`) × `core/finance/app/debts/*` e `GetOwnerStatementUseCaseImpl` (importam `core.commitment`).
- Impacto: o teste `featuresDoCoreSemCiclos` falha (HEAD estava sem esses ciclos: `thirdparty` e `commitment` não importavam `finance`). `core.income` e `core.purchasegroup` não fecham ciclo hoje (`finance → income`; `purchasegroup → finance`), mas `purchasegroup → finance` fecha se `finance` passar a ler grupos.
- Correção: mover `LedgerWriteGateway`/`LedgerReadGateway` para `core.sk.ledger` (ou um port em `thirdparty`), e o `ShareSettlement` para `core.transaction.app` ou `core.thirdparty.app`; mover o CSV por pessoa para `finance`/`infra`.

**H2. Fonte `THIRD_PARTY_RECEIPT_IN_BALANCE` e `Idempotency-Key` obrigatória não implementadas (ADR-022 §4, decisão C-1)** · `core/sk/ledger/PostingSourceType.java`, `core/thirdparty/domain/ThirdPartyReceipt.java:ledgerEntries/refundNeutralizationEntries`, `infra/thirdparty/ThirdPartyController.java:97-110`, `V9.01`/`V9.08`
- Problema: os dois modos de recebimento e o ajuste do `REFUND` migrado usam a mesma fonte `THIRD_PARTY_RECEIPT`; o relatório de conciliação do modo "já no saldo" não consegue isolar esses postings, e o recebimento migrado (`EXPENSE +r / RECEIVABLE −r`) é indistinguível de um recebimento comum. `Idempotency-Key` é `required = false` e o caso de uso só a respeita quando vem: sem conta, um retry dentro do pendente baixa o recebível duas vezes e reduz o patrimônio em dobro. A coluna `source_type` é `VARCHAR(20)`; o novo valor (30 caracteres) exige migração que a amplie.
- Correção: novo `PostingSourceType`, migração que alarga a coluna e atualiza o check, chave obrigatória quando `accountId == null` (`422`), e teste de replay e de conciliação.

**H3. `DELETE /v1/third-party-receipts/{id}` não é seguro para recebimento lançado no razão** · `core/thirdparty/app/UnmarkThirdPartyExpenseUseCaseImpl.java:29-38`
- Problema: (a) lê o recebimento antes de travar e trava só a transação (sem pessoa, sem conta: fora da ordem da ADR-022 §7); (b) apagar um recebimento migrado (`migratedRefund`) desativa o ajuste `EXPENSE +r / RECEIVABLE −r` e o `REFUND` original volta a abater o consumo, recriando `P − t − r`; (c) não desfaz a conversão `SHARE_PAYABLE` quando o recebimento apagado era o que gerou o excedente (sobra `RECEIVABLE +x / PAYABLE −x` sem origem).
- Correção: recusar a exclusão de recebimento migrado; travar tx → pessoa → conta e recalcular `planConversion` na exclusão (ou recusar quando houver conversão).

**H4. Ordem de travas da ADR-008 violada em dois fluxos** · `core/finance/app/transactions/usecase/VoidTransactionUseCaseImpl.java:139-160` (`cards` → pessoas → `accounts` → **dívidas**), `core/finance/app/recurrences/usecase/RealizeOccurrenceUseCaseImpl.java:~120-150` (`accounts.lockForUpdate` → `debts.lockForUpdate`)
- Problema: a ordem canônica é movimentações → recorrência → cartão → dívidas → pessoas → metas → contas. Nos dois pontos a dívida é travada depois da conta (e, no void, depois das pessoas). O fluxo de pagar/receber dívida trava dívida e depois conta, então estorno de Pix no crédito × pagamento da dívida, ou realização de folha com consignado × pagamento da dívida, podem entrar em deadlock (`409`/`500`).
- Correção: travar dívidas (ordenadas) antes das pessoas e das contas; adicionar teste de concorrência no padrão `GoalLockConcurrencyIT` (só `200`/`422`).

**H5. A2c: a invariante "patrimônio antes = depois" é falsa e não é medida** · `ApplyShareMigrationUseCaseImpl.apply`, `ShareMigrationPlanner`, `ShareMigrationReport`
- Problema: `NetWorth` soma todo o `RECEIVABLE`. Antes da migração a parte do terceiro não existia como ativo; depois, o patrimônio sobe `t − r − recebido legado` (o pendente). O aceite do plano e a seção 10 da ADR-022 prometem patrimônio e caixa iguais por mês, e o relatório do dry-run não traz o efeito no patrimônio, então o dono aprovaria o hash sem saber.
- Correção: decisão de Produto/Arquitetura (aceitar e declarar o efeito na ADR e no relatório, ou compensar por `EQUITY` como no modo "já no saldo"); incluir `netWorthDelta` no relatório e teste de propriedade antes/depois.

**H6. Quase nenhum teste dos critérios de aceite** · `src/test`
- Só existem testes de domínio (`PurchaseSharesTest`, `PayrollTransactionsTest`, `CardCashOutTransactionsTest`, `PayrollLoanPreviewTest`, `EffectiveRateTest`). Faltam: criação rateada (postings, preview idêntico), `PUT shares` (revisão, P-28), estorno/cancelamento/void com `PAYABLE`, os dois modos de recebimento, excesso e concorrência, replay, a migração A2c (dry-run, apply, idempotência, `r > t`), `OwnerOutflow` (dedup antes/depois de lançada, P-3, imóvel, `COMPANY`, consignado), propriedades de 200 cenários e escopo por usuário (`404`). Sem eles, C1 e C2 passam despercebidos.

### 🟡 Médios

**M1. Consignado ainda aparece como vencido fora do `DebtOverview`** · `core/debt/domain/Debt.java:301` (`isOverdue`), `core/debt/app/DebtView.java:64`, `core/debt/app/DebtSummary.java:18`, `infra/debt/gateways/DebtGatewayImpl.java:117-123` (`list`, filtro `overdue`)
- O `DebtOverviewCalculator` zera `overdue` e `expectedDate` para `deductedInPayroll()`, mas `Debt.isOverdue` não, e o SQL do filtro `overdue` não exclui `kind = 'PAYROLL'`. Uma dívida PAYROLL com `expectedDate` no passado aparece como vencida em `GET /v1/debts`, no resumo e em qualquer alerta derivado, e some do `DebtOverview`. Correção: `isOverdue` falso para PAYROLL e `AND d.kind <> 'PAYROLL'` nas duas pontas do filtro (mesmo para `CARD_CASH_OUT` pagador, cujo `outstanding()` é zero mas o SQL ainda o enxerga como aberto).

**M2. A marca `PAYROLL` nunca é desfeita** · `core/income/app/usecase/IncomeDebts.java:linkPayrollDebts`, `ArchiveIncomeProfileUseCaseImpl`, `UpdateIncomeProfileUseCaseImpl`
- Quando a rubrica deixa de apontar para a dívida, é arquivada ou termina (`endsOn`), a dívida segue `PAYROLL` e continua excluída de `CommitmentSchedule` e sem data no `DebtOverview`, sem nenhuma outra forma de pagamento prevista: a obrigação some do "a pagar". Correção: desmarcar quando não houver rubrica ativa vinculada, ou manter a exclusão só enquanto houver rubrica vigente.

**M3. Realizar a folha pode ficar bloqueada ou desatualizada** · `RealizeOccurrenceUseCaseImpl.realizeWithPayrollLoan`, `GenerateIncomeOccurrencesUseCaseImpl.generate`
- O plano do consignado é um retrato gravado na geração. Se a dívida for quitada/cancelada antes, `ensureCanSettle` lança e o salário não pode ser realizado; se a rubrica mudar depois, a ocorrência já gerada mantém o valor antigo (a idempotência devolve a existente sem recalcular). Correção: tratar a dívida encerrada como "sem parcela" com aviso, e documentar/recalcular ocorrências ainda previstas.

**M4. Conversão `SHARE_PAYABLE` não é considerada ao reabrir o devido** · `CardTransactions.reshare` (confere só recebido × devido), `RecordThirdPartyReceiptUseCaseImpl.owedBy`
- Depois que o excedente vira `PAYABLE` e o rateio sobe de novo, o pendente soma o valor já convertido enquanto o `PAYABLE` continua de pé. O `PAYABLE(personId)` também não tem entidade e não aparece em `DebtOverview`/obrigações, ainda que entre no patrimônio. Correção: abater `alreadyConverted` no `reshare`/recebimento (ou reverter a conversão) e expor o a pagar à pessoa na leitura de dívidas.

**M5. A2c: leitura antes da trava e confirmações autodeclaradas** · `ApplyShareMigrationUseCaseImpl.handle`
- O plano é calculado com `records.load` antes de travar; um recebimento legado gravado entre a leitura e as travas não entra no hash nem na migração (o `apply` só confere versão e soma de `REFUND`), e fica órfão depois que a marca é apagada. `backupConfirmed` é só um booleano do chamador. A regra S-3 do plano (resto nas primeiras parcelas) foi trocada por recusa (`MARK_NOT_REPRESENTABLE`) quando a marca não divide em centavos exatos; deve ser decisão registrada. Correção: recarregar e comparar recebimentos legados depois das travas; ajustar plano/ADR para a recusa ou implementar o resto.

**M6. `OwnerStatement` com `from` no passado soma a sobra de meses já realizados ao saldo de hoje** · `core/finance/domain/OwnerStatement.java:of`
- `opening` é o caixa em `asOf` e `running` acumula a sobra de todos os meses de `from`; para `from` anterior ao mês corrente, essa sobra já está no saldo (dupla contagem no `endBalance`). Correção: recusar `from` no passado (`422`) ou usar o saldo do início de `from`; teste.

**M7. V9.06: item de compromisso sem o usuário na FK** · `V9.06__alter_commitment_items_shares_and_clauses.sql`
- `fk_tracked_commitment_item_shares_item` referencia `(commitment_id, position)` e a pessoa é composta com `user_id`, mas nada liga o `user_id` da linha ao dono do compromisso; um bug de aplicação poderia gravar partes de um usuário em compromisso de outro. Correção: UNIQUE `(commitment_id, position, user_id)` no item e FK composta, ou `user_id` derivado por trigger/consulta.

### 🟢 Baixos

- **L1.** Lacuna em `V9.14` (existem `V9.13` e `V9.15`). Com `outOfOrder` desligado, uma migração criada depois com esse número é rejeitada. Confirmar que o número é de outra task ou renumerar antes de mesclar; o plano também manda não mesclar V9.xx antes de DG-28 (V8.18).
- **L2.** `ApplyShareMigration` expõe `POST /v1/third-party-expenses/share-migration/*` para qualquer usuário autenticado sobre os próprios dados; o plano pedia comando administrativo ou decisão de Arquitetura (e contrato). Registrar a decisão.
- **L3.** `ShareSettlement` e vários casos de uso mantêm construtores antigos que aceitam `null` (`CancelInstallmentsUseCaseImpl`, `VoidTransactionUseCaseImpl`, `RealizeOccurrenceUseCaseImpl`), o que desliga o rateio em silêncio. A fiação atual passa tudo, mas remover os construtores antigos evita regressão.

## 4. Riscos

- Dupla contagem silenciosa no consumo por C1 (e por H3b) até haver teste de propriedade com estorno.
- Empréstimo virando despesa por C2, em dado de produção, sem sinal visível (a soma do razão continua zero).
- CI quebrado por H1; deadlocks raros por H4.
- Migração A2c altera patrimônio e pode ser aprovada sem o dono ver (H5).

## 5. Pendências por dono

- **Produto:** efeito da A2c no patrimônio (H5); cancelar parcelas restantes de Pix no crédito: recusar ou reverter o principal (C2); regra de recebimento em dívida já encerrada na folha (M3); recusa em vez de resto na migração de marcas (M5).
- **UX:** aviso de patrimônio na tela de migração e no recebimento "já no saldo" (H2/H5); estado vazio de consignado desvinculado (M2).
- **Backend:** C1, C2, H2, H3, H4, M1 a M4, M6, M7, L3, mais os testes de H6.
- **Arquitetura:** ciclos de pacote (H1) e onde mora o port de razão; endpoint x comando administrativo da A2c (L2); numeração V9.14 (L1).

## 6. Parecer

🔴 **Reprovado.** C1 (estorno de compra rateada duplica o abatimento) e C2 (Pix no crédito editável como despesa) violam as regras 1, 4 e a de empréstimo do PR 01 e não têm teste que os pegue; H1 derruba o CI. Voltar ao `dev-backend` para C1, C2, H1 a H4 e os testes de H6; H5 depende de decisão do dono. Re-revisão focada nesses pontos, sem reabrir o que está nos itens conformes.
