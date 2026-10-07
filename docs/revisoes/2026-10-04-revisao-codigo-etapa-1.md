---
data: 2026-10-04
autor: revisor
alvo: código da Etapa 1 (backend T2–T11, frontend T13–T19), working tree sem commits
referências: docs/planos/2026-10-03-etapa-1-dominio-arquitetura.md, docs/arquitetura/{dominio-financeiro,arquitetura}.md, ADR-001/002/004, vault PR 01, docs/qa/2026-10-04-qa-frontend-etapa-1.md
---

# Revisão de código: Etapa 1 (domínio, migrações e frontend)

## 1. Resumo

**Backend.** O núcleo financeiro está bem construído. Dinheiro em centavos `long` com `Math.*Exact`. Razão de partidas dobradas com `assertBalanced` por grupo de origem. Status de fatura e de dívida derivados. Despesa existe só como livro `EXPENSE`, então transferência, investimento, empréstimo e pagamento de fatura não têm como virar gasto. Os 9 casos do PR 01 e o ciclo do cartão estão cobertos por testes com valores exatos. **Não encontrei dupla contagem nos fluxos principais.**

Encontrei quatro problemas de integridade nas bordas:

- a mudança de dia de fechamento (S-42) faz faturas perderem itens em silêncio;
- o reembolso não desconta as parcelas canceladas, então o consumo é revertido duas vezes;
- um caminho de alocação ignora o status da fatura e coloca item em fatura `PAID`;
- as fábricas do cartão aceitam cadeia de faturas e data de fechamento sem conferir que pertencem ao cartão.

**Frontend.** As camadas estão respeitadas e verificadas pelo `dependency-cruiser`. O front não faz nenhum cálculo de dinheiro (`Money` como string, formatação sem `Number()`), os estados de tela (`loading`/`empty`/`error`/`ready`) são explícitos e a i18n está nos 3 idiomas. Não há achado novo além dos que o QA já registrou.

## 2. Itens conformes

- **`Money`** (`core/sk/money/Money.java`): centavos `long`, entrada com no máximo 2 casas e sem arredondamento silencioso, `add`/`subtract`/`negate`/`abs`/`times` com `*Exact`, e `allocate` com o resto na 1ª parte e parte < 1 centavo rejeitada. Não há `double`/`float` (o ArchUnit verifica).
- **Razão:** `Posting` rejeita zero; `LedgerEntry.activeGroup` fecha cada grupo em zero, inclusive cada parcela (`CardTransactions.build`); desativar um grupo inteiro não desequilibra o razão; posting nunca é reativado.
- **Lentes:** caixa = `ACCOUNT` até a data; consumo = `EXPENSE` por competência da data efetiva; patrimônio = Σ livros de balanço; `cardFutureInstallments` fica fora do total (S-8). `CashFlowReport` exclui o saldo inicial e as transferências CASH↔CASH. A identidade consumo = pagas + crédito − reembolsos vale por construção.
- **Fatura:** a fórmula de `outstanding`/`creditCarry` satisfaz algebricamente a invariante 11 (Σ outstanding − creditCarry final = Σ total − Σ paid). O status é derivado, sem job. O pagamento é recusado em `FUTURE`/`PAID` e aceito acima do devido.
- **Calendário:** clamp do dia 31, virada de ano e compra no dia do fechamento indo para a fatura seguinte (S-12) estão corretos. As parcelas seguem sempre a fatura anterior (`forInstallments` nunca repete a fatura).
- **Dívida:** status derivado; quitação ≤ saldo devedor; perdão contra `EQUITY` com os sinais certos para `RECEIVABLE` e `PAYABLE`; devolução nunca gera `INCOME`.
- **Tempo:** `TimeProvider`/`ClockTimeProvider` com fuso `America/Sao_Paulo` (S-1) e `Instant` truncado em micro (compatível com `TIMESTAMPTZ`).
- **Invariantes do domínio:** as entidades não têm setters públicos; o `Transaction.Builder` é package-private; as fábricas validam dono (outro usuário = not found), arquivamento, moeda, categoria e meio de pagamento.
- **Migrações:**
  - checks de enum, valor > 0, BRL e estorno consistente (`ck_transactions_voided`);
  - posting ≠ 0, competência = `to_char(effective_date)` e EQUITY sem id;
  - índices parciais das lentes (`WHERE active`) e unicidade de fatura por `(card_id, closing_date)`;
  - dívida: origem coerente com `origin_transaction_id` e FK diferida.
- **Testes do PR 01** (`IntegridadeFinanceiraPR01Test`, `CompromissosPR01Test`, `CicloCartaoSemDuplaContagemTest`): verificam deltas exatos das lentes antes e depois de cada caso, inclusive "out/26 = 200, não 1.200", consumo e receita inalterados nos casos 3 a 8 e `CARD = 0` ao fim do ciclo. Não encontrei asserção tautológica.
- **Frontend:**
  - `util/money.ts` só formata (string → `Intl.NumberFormat`, sem `Number()`);
  - o mapper só copia campos;
  - `DashboardFacade` usa signals + `switchMap` + `takeUntilDestroyed`;
  - o HTTP fica isolado em `DashboardRequestsFacade`, com mocks atrás de `API_MOCKS`;
  - os limites de camada são verificados pelo `dependency-cruiser` (o QA provou com violações propositais).

## 3. Achados

### 🔴 C1 · Mudança de dia de fechamento faz faturas perderem parcelas em silêncio

- **Onde:** `core/card/domain/CreditCard.java:83-88` (`changeBillingDays`); `core/card/domain/InvoiceChain.java:121-136` (filtro por igualdade de `closingDate`, linhas 130-131).
- **Problema:** D1 §2.5.1, regra 6 (S-42), manda recalcular as faturas `FUTURE` que já existem e realocar os itens delas. O código só troca a regra.
  - Cada `TransactionInstallment` guarda o `invoiceClosingDate` antigo, que é imutável.
  - O `InvoiceChain` monta as faturas pelo calendário novo e pega os itens com `closingDate` **igual**. O item cuja data não existe mais no calendário não entra em nenhuma fatura, e nenhum erro é lançado.
  - Exemplo: compra de 1.200 em 6x em 10/10 com fechamento 25. Em 15/10 o fechamento muda para 10. As parcelas 2 a 6 apontam para 25/11..25/03, mas o calendário passa a gerar 10/11..10/03, então 1.000 somem das faturas e dos compromissos.
- **Impacto:**
  - o livro `CARD` continua com −1.000, mas Σ outstanding cai 1.000: a invariante 11 (D1 §4) quebra;
  - "Comprometido", "Disponível" e as previsões de fatura ficam subestimados;
  - a guarda de estorno passa a avaliar faturas vazias.
- **Correção sugerida:**
  1. Fazer o `InvoiceChain` rejeitar (`DomainException`, invariante interna) item ou pagamento cujo `invoiceClosingDate` não seja um fechamento do calendário. Assim o erro nunca fica silencioso.
  2. Implementar a realocação de S-42 como função pura: o item na k-ésima fatura depois da fatura da compra continua no k-ésimo ciclo do calendário novo, e item datado é realocado pela regra 2. `changeBillingDays` (ou um serviço do pacote `transaction`) devolve as parcelas e os créditos realocados para o gateway gravar na mesma transação.
  3. Teste: compra em 6x, depois a troca 25 → 10. Verificar Σ outstanding − creditCarry = −saldo `CARD` e compromissos +1.200 mantidos.

### 🟠 A1 · O reembolso não desconta as parcelas canceladas: o consumo é revertido duas vezes

- **Onde:** `core/transaction/domain/AccountTransactions.java:209-212` (`validateRefundOrigin`), usado também por `CardTransactions.refundToCard`.
- **Problema:** o teto do reembolso é `original.amount − alreadyRefunded`. Numa `CARD_PURCHASE` com parcelas canceladas, o consumo efetivo já é menor que `amount`.
  - Exemplo: compra de 1.200 em 6x, `cancelRemainingInstallments` cancela 5 parcelas, e um reembolso de 1.200 com `refundOf` é aceito.
  - O consumo líquido da compra fica −1.000.
  - É exatamente o fluxo de correção que o próprio D1 recomenda (cancelar as parcelas restantes + reembolso no cartão), então o usuário vai passar por ele.
- **Impacto:** consumo negativo e patrimônio inflado. É a mesma redução contada duas vezes, que é o que o PR 01 proíbe.
- **Correção sugerida:** teto = Σ parcelas não canceladas (para `EXPENSE`, o `amount`) − `alreadyRefunded`. Ajustar o texto de S-9 no D1 e adicionar o teste "cancelar parcelas restantes + reembolso acima do cobrado → `RefundExceedsOriginalException`".

### 🟠 A2 · Um caminho público de alocação ignora o status da fatura e coloca item em fatura `PAID`

- **Onde:** `core/transaction/domain/CardTransactions.java:38-44` (sobrecarga `purchase` sem `InvoiceChain`, que usa `InvoiceAllocator.byCalendar`); `core/recurrence/domain/RecurringTransaction.java:119` (`realize` de recorrência no cartão usa essa sobrecarga).
- **Problema:** `byCalendar` aloca só pelo calendário. Exemplo: o usuário confirma em dezembro a ocorrência de 15/10 de uma assinatura no cartão. A compra entra na fatura de 25/10, que já está `PAID`.
  - Isso viola "Fatura `PAID` nunca recebe item novo" (S-14, S-50).
  - A fatura reabre como `CLOSED`/`OVERDUE`, com o valor do item.
- **Impacto:** a fatura do app diverge da do banco; o app mostra um "atrasado" falso e um compromisso `INVOICE` vencido. A compra também passa a ser não estornável (fatura fechada).
- **Correção sugerida:** remover a sobrecarga sem cadeia, ou torná-la package-private só para testes. Fazer `realize` receber `InvoiceChain` + `today` e usar `forInstallments`.

### 🟠 A3 · As fábricas e a guarda do cartão aceitam cadeia de faturas e data de fechamento sem validar

- **Onde:** `CardTransactions.java:64-78` (`invoicePayment`) e `:84-98` (`refundToCard`); `CardTransactionVoidPolicy.java:22-26`; `InvoiceChain.java:51-57, 88-94`.
- **Problema:**
  1. `InvoiceChain` não tem `cardId`. Uma cadeia de outro cartão passa por `ensurePayable` e pela guarda de estorno sem erro.
  2. `invoice(closingDate)` devolve a fatura do **mês** da data. Por isso `ensurePayable(24/10)` avalia a fatura de 25/10 e aceita. O pagamento é gravado com `invoiceClosingDate = 24/10` e depois some da cadeia, pelo mesmo mecanismo de C1.
- **Impacto:** o pagamento sai do caixa e entra no livro `CARD`, mas não abate nenhuma fatura. A fatura fica `OVERDUE` mesmo paga, e a guarda pode decidir o estorno com a cadeia errada.
- **Correção sugerida:**
  - `InvoiceChain` carrega `cardId`, e as fábricas e a policy exigem `chain.cardId() == card.id()`;
  - `ensurePayable`/`ensureCanReceiveItem` exigem que `closingDate` seja exatamente um fechamento do calendário;
  - teste com data inválida e com cadeia de outro cartão.

### 🟡 M1 · Guarda de estorno dividida (desvio relatado): o desenho é bom, mas a entrada está aberta

- **Onde:** `Transaction.java:114-132` (`voidTransaction` público e que aceita qualquer policy); `DebtTransactionVoidPolicy` público; `DebtTransactions.java:55-62`.
- **Avaliação:** manter as **regras** em `card` (`CardVoidRules`) e `debt` (`DebtVoidRules`) e os **adaptadores** em `transaction` está certo. Evita o ciclo card ↔ transaction, e `VoidDecision` no shared kernel é a fronteira correta. A policy padrão de conta lança exceção quando recebe um tipo de cartão ou de dívida, o que é uma boa defesa.
- **Problema:** nada impede o caso de uso de chamar `tx.voidTransaction(motivo, agora, t -> VoidDecision.allow())`. Também nada impede chamar `tx.voidTransaction(..., new DebtTransactionVoidPolicy(debt))` sem passar por `DebtTransactions.voidTransaction`. No segundo caso, a origem da dívida é estornada no razão, mas a `Debt` continua `OPEN` (sem `closure`) e aparece como entrada prevista em compromissos.
- **Correção sugerida (antes dos casos de uso da Etapa 2):**
  - tornar `voidTransaction` package-private;
  - expor um único ponto (`TransactionVoiding.voidTransaction(tx, VoidContext)`) que escolhe a policy pelo tipo (conta, cartão ou dívida) e aplica os efeitos colaterais (dívida). A alternativa mínima é um `appliesTo(type)` obrigatório na porta;
  - em `DebtTransactions.voidTransaction`, validar a dívida (existência da quitação) **antes** de mudar a transação, para não deixar estado parcial em memória (linhas 56-61).

### 🟡 M2 · O check `due_date > closing_date` conflita com o clamp do calendário

- **Onde:** `V1.04__create_table_credit_card_invoices.sql:20`; `BillingRule.java:21-23`; `CreditCard.java:172-181`.
- **Problema:** o domínio aceita, por exemplo, fechamento 28 e vencimento 30 (ou 29/30 e 31). Em fevereiro de ano não bissexto os dois dias viram 28/02: vencimento = fechamento. O insert da fatura falha e o cartão fica impossível de usar nesse mês.
- **Correção sugerida:** o domínio passa a recusar as combinações em que o clamp pode igualar as duas datas, ou empurra o vencimento para o mês seguinte. Regra para Produto: definir um intervalo mínimo entre fechamento e vencimento. Adicionar teste com fevereiro.

### 🟡 M3 · Deduplicação: S-43 (chave nula) × T10 (chave derivada). Recomendo T10, com um ajuste

- **Onde:** `ImportLineReview.java:72-79`, `DedupKey.java:66-69`, `ExistingEntry.java`, `DuplicateClassifier.java:32-39`, `V1.06:32-35`.
- **Recomendação: chave derivada (`DedupKey.forcedIn(lote)`).**
  - Toda movimentação importada continua com chave efetiva não nula. O índice único então protege também contra aplicar duas vezes a mesma linha forçada no mesmo lote (retry da requisição de aplicar o lote). Com chave nula, o retry duplicaria a linha em silêncio.
  - A chave é determinística e auditável.
- **Ajuste necessário:** o classificador só compara `ExistingEntry.dedupKey` (a chave efetiva). Exemplo: a linha original A é estornada depois e a forçada B continua ativa. A reimportação do mesmo arquivo não acha nenhuma ativa com a chave original e importa uma terceira cópia.
  - `ExistingEntry` precisa de `originalDedupKey`, e o classificador marca `DUPLICATE` se a chave da linha for igual à efetiva **ou** à original de uma movimentação ativa.
  - Atualizar S-43 em D1 §6 e §8, o adendo 6 da ADR-002 e o comentário da `V1.06` ("nula na duplicata forçada"), que hoje contradizem o código.

### 🟡 M4 · Tabela `credit_card_billing_rules` (desvio relatado): aprovada, com duas ressalvas

- **Avaliação:** a tabela corresponde 1:1 ao `BillingRule` (S-42), a unicidade `(card_id, effective_from)` está correta e `CHAR(7)` 'AAAA-MM' ordena bem. É a forma certa de manter o histórico sem mexer em faturas fechadas.
- **Ressalvas:**
  1. `credit_cards.closing_day`/`due_day` duplicam a regra mais recente: são duas fontes de verdade. Remover essas colunas, ou documentá-las como cópia atualizada na mesma transação, com um teste de integração que garanta a sincronia.
  2. Como nas demais tabelas, `user_id` não é amarrado ao dono do pai. Considerar uma FK composta `(card_id, user_id) → credit_cards(id, user_id)` ou um teste do gateway (regra transversal 3).

### 🟡 M5 · `Transaction` e `Debt` não têm reidratação

- **Onde:** `Transaction.java:67-97` (sempre nasce `ACTIVE`); `Debt.java` (não há `restore`; as quitações entram por `registerSettlement`, que revalida).
- **Problema:** `Account`, `CreditCard` e `Person` têm `restore`. Já `Transaction` e `Debt` não podem ser reconstruídas a partir do banco como `VOIDED`, com parcelas canceladas ou dívida `CANCELED` com quitações, sem repetir as operações (e o `voidTransaction` exige policy).
- **Correção sugerida:** criar `restore(...)` package-private ou via mapper, com as mesmas invariantes estruturais (grupos balanceados, coerência entre status e postings). Não bloqueia a Etapa 1, mas bloqueia o primeiro gateway da Etapa 2.

### 🟡 M6 · As suposições S-51 a S-55 não estão registradas

- **Onde:** D1 §8 e plano §3 vão até S-48. O código só cita **S-49** (`V1.06:75`, a ocorrência estornada pode ser realizada de novo) e **S-50** (`InvoiceAllocator.java:16`, a parcela nunca cai em fatura paga).
- **Avaliação:**
  - concordo com S-49: o índice parcial `WHERE status = 'ACTIVE'` e o `markRealized` na reidratação estão coerentes;
  - concordo com S-50: é coerente com S-14 e o `forInstallments` implementa;
  - S-51 a S-55 não aparecem em nenhum arquivo do repositório, então **não consegui avaliá-las**.
- **Correção sugerida:** o dev registra S-49 a S-55 em D1 §8 (impacto e dono = Produto) e no plano §3, com referência no código, antes da validação com o usuário. Nenhum agente decide regra de negócio sozinho.

### 🟢 Baixos

- `Debt.java:71`: a descrição não tem limite no domínio, mas a coluna é `VARCHAR(200)` (`V1.05`). Haverá erro de banco em vez de 422.
- `Account.java:108` (`archive`): o chamador passa o saldo até hoje. Com movimentação de data futura, a conta é arquivada com saldo futuro diferente de zero (S-4). Sugestão: saldo em todas as datas.
- Movimentação com data anterior à `openingDate` da conta é aceita: o saldo fica negativo antes da abertura. Validar ou documentar.
- `CommitmentSchedule.java:82-86`: a recorrência no cartão aparece como saída na data da ocorrência, e não no vencimento da fatura. Não conta em dobro, mas antecipa a saída nos horizontes.
- `ledger_postings`: o banco não garante Σ = 0 por grupo. Opcional: uma constraint trigger diferida, já que o domínio garante.
- Testes do PR 01: os casos 1 e 9 verificam o consumo total, e não a categoria Alimentação (+100 / −50) que a tabela pede. O caso 3 não verifica que as parcelas da fatura ficam `PAID`, nem que a fatura fica `PAID` (o `CompromissosPR01Test` só verifica que ela sai da agenda). Sugiro asserções diretas.
- Frontend: `formatToParts` recebe uma string decimal, o que exige suporte a `Intl.NumberFormat` v3. Num motor antigo a string vira `Number`; sem impacto até 2^53 centavos, mas convém registrar o navegador mínimo.

## 4. Riscos

- **S-42 sem realocação (C1):** a primeira troca de vencimento ou fechamento num cartão com compras parceladas corrompe as faturas sem nenhum erro. Precisa ser corrigido antes de expor `changeBillingDays` na API.
- **Guardas dependem do caso de uso (M1):** a regra está certa no core, mas a escolha da policy e o efeito na dívida ficam a cargo da Etapa 2.
- **Suposições não validadas** (S-8, S-14 a S-18, S-36, S-42, S-43, S-49 a S-55) já estão cravadas em código e schema. As `V1.*` continuam editáveis até o primeiro deploy, então a hora barata de mudar é agora.

## 5. Pendências por dono

| Dono        | Pendência                                                                                                                                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend     | C1, A1, A2, A3 (obrigatórios). M1, M3, M5 antes dos casos de uso da Etapa 2. M2, M4 e os 🟢                                                                                                                            |
| Produto     | Validar S-49 a S-55 depois de registradas (M6); intervalo mínimo entre fechamento e vencimento (M2); confirmar S-9 com o teto pelas parcelas não canceladas (A1); confirmar a chave derivada na duplicata forçada (M3) |
| Arquitetura | Ponto único de estorno (M1); reidratação dos agregados (M5); fonte única da regra vigente do cartão (M4)                                                                                                               |
| UX          | Nenhuma nova (o BUG-01 do QA, foco na sidebar, segue com o frontend)                                                                                                                                                   |

## 6. Parecer

**Backend: 🔴 Reprovado (volta ao dev-backend).** A base está sólida e os casos do PR 01 estão corretos, mas C1 é um caminho real (S-42, com operação pública e já testada como pronta) que deixa fatura e razão divergentes sem nenhum erro. A1 reverte o consumo duas vezes no fluxo de correção que o próprio D1 recomenda. A2 e A3 deixam a fatura do app diferente da do banco. Os quatro são pontuais e não exigem redesenho. Depois de corrigidos e com os testes indicados, a expectativa é 🟡 com M1, M3 e M5 agendados para o início da Etapa 2.

**Frontend: ✅ Aprovado.** A arquitetura em camadas está verificada por ferramenta, não há nenhum cálculo financeiro no front, os estados de tela são explícitos e a i18n está completa. A única pendência é o BUG-01, já registrado pelo QA.
