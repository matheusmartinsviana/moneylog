# QA backend, Etapa 3 (T61)

Data: 2026-10-05/06. Agente: tester. Escopo: `backend/` (cartões, faturas, parcelas, pagamento, reembolso no cartão, cancelamento de parcelas, mudança de fechamento/vencimento, dashboard com cartões, migrações V3.01 e V3.02). Nenhum código de produção foi alterado; nada em `frontend/` nem em `contracts/`. Sem commits.

## 1. Resumo

- Baseline (`./mvnw clean verify`, JDK 21, Docker ativo, antes dos meus testes, 02:16): sem falhas. Unitários **885 verdes** (o dev falou em 888; a contagem real dos XML do surefire é 885), ITs **376 verdes, 1 ignorado** (o `BUG-QA-09` da Etapa 2, ainda aberto).
- Execução final com os meus testes (`./mvnw clean verify`, exit 0, `BUILD SUCCESS`, gate de cobertura do `core` ok): unitários **885 / 0 falhas**; ITs **409 executados, 0 falhas, 8 ignorados** (1 antigo + 7 meus, todos `@Disabled("BUG-QA-xx")`).
- Escrevi 6 arquivos de IT/apoio em `backend/src/test/java/com/moneylog/qa/` (33 testes). Eles encontraram **5 bugs reais** (2 🟠, 2 🟡, 1 🟢) mais 2 observações. Nenhum 🔴.
- Integridade financeira: o ciclo completo fecha (CA1 do T61), a propriedade com 4 sementes x 170 operações (680 operações) não achou violação do razão, do invariante do cartão, de `PAID` imutável nem do dashboard. A exceção é o BUG-QA-14 (consumo negativo após reembolso + cancelamento), que o gerador padrão não alcança porque seus reembolsos são pequenos; com reembolsos grandes a propriedade o reproduz.
- **Prova do dev/revisor sobre S-215 confirmada**: deadlock real, 6 de 6 rodadas, vira `500 INTERNAL_ERROR`.

## 2. Casos executados

### 2.1 Baseline

`./mvnw clean verify` registrado acima. As mensagens `ERROR ... falha injetada` / `Application run failed` no log são de testes que injetam falha de propósito. `[ERROR] Surefire is going to kill self fork JVM` é um aviso de encerramento da JVM de teste, não falha.

### 2.2 Ciclo e propriedade (`CardBordersQaIT`, `CardPropertyQaIT`)

Aprovados:

- **T61 CA1**: compra 1.200,00 em 6x (10/10/2026) e as seis faturas pagas uma a uma (relógio avançado): cada pagamento `PAID`; invariante do cartão após cada pagamento; Σ consumo (competências 2026-10 a 2027-04) = 1.200,00 e nenhum mês com mais de 200,00; Nubank 18.800,00; livro `CARD` = 0; limite disponível volta a 10.000,00; nenhuma violação de contrato.
- **Propriedade** (sementes 20261005, 7, 42, 1234567; 170 operações cada; compra 1/2/3/6/12x, reembolso ligado e solto, pagamento total/metade/a maior (+17,00)/aleatório/antecipado, estorno, cancelamento, mudança de dias 1..31 x 1..31, avanço do relógio de 1 a 45 dias, tentativas inválidas). Histograma real (semente 20261005): compra 201 x54, pagamento 200 x10 e 422 x32, mudança de dias 200 x11, cancelamento 200 x6 e 422 x8, estorno 200 x2 e 422 x6, reembolso 201 x17. Verificado a cada 5 operações:
  - razão fecha em zero e cada grupo de origem fecha;
  - `Σ outstanding − creditCarry da última = −saldo CARD` e `availableLimit = limite + livro CARD`;
  - nenhum `outstanding`/`paid`/`creditCarry` negativo; `PAID` sempre com `outstanding` 0;
  - `Card.totalCommitted` = Σ outstanding das faturas nem `PAID` nem `FUTURE`; `Card.committedFuture` = `future-installments.total`;
  - fatura `PAID` nunca muda de itens enquanto continua `PAID`;
  - `/upcoming` por vencimento = faturas não pagas com saldo por vencimento (um item por fatura, nenhum item sem saldo, nenhum `INSTALLMENT` de primeiro nível); Σ `/upcoming` OUT = Σ outstanding;
  - `committed.d30` = Σ outstanding das faturas vencidas ou vencendo em 30 dias; `available = inAccounts − committed.d30`;
  - `month.consumption` do resumo = Σ dos lançamentos da competência (`/v1/entries`);
  - consumo de cada compra (Σ EXPENSE da compra e dos reembolsos ativos ligados) nunca negativo;
  - nenhum 5xx, nenhum 400 em corpo válido; todo `code` de erro devolvido está na tabela do contrato (vistos: `CARD_NO_INSTALLMENTS_TO_CANCEL`, `INVOICE_NOT_FOUND`, `INVOICE_NOT_PAYABLE`, `REFUND_EXCEEDS_ORIGINAL`, `TRANSACTION_ALREADY_VOIDED`, `TRANSACTION_AMOUNT_NOT_POSITIVE`, `TRANSACTION_IN_CLOSED_INVOICE`, `TRANSACTION_NOT_FOUND`); toda requisição e resposta valida contra o OpenAPI.
- **Bordas de data** (oráculo independente, fora do domínio): fechamento 1/28/29/30/31 x vencimento 1/15/30/31, 19 datas de compra (fim de mês, 29/02/2028, virada de ano 2027/2028, 31/10, 28/02/2027), 4 parcelas cada: fatura alvo, vencimento, referência e competência da prévia batem em todas; vencimento sempre posterior ao fechamento. S-77 (fecha 30, vence 30 → vence no mês seguinte; compra no dia do fechamento cai na fatura seguinte; fevereiro bissexto fecha em 29). Fuso: às 22:30 de 24/10 em São Paulo (01:30Z de 25/10) a fatura de 25/10 ainda é `OPEN`; às 23:30 de 25/10 (02:30Z de 26/10) a corrente fecha 25/11 e `asOf` é 25/10. Fatura vazia e fatura passada: `GET` devolve 200 com total 0,00; pagar/prever nunca dá 5xx. (Observação: uma fatura passada vazia é `PAID`; por isso uma compra datada nela entra na corrente como `lateEntry`, coerente com S-14.)
- **Migração** (`CardMigrationQaIT`): base V2.06 com dados (50 despesas e 50 lançamentos) → V3.02: exatamente 2 migrações, `success`, checksums válidos, reexecução é no-op, contagem e Σ do razão intactos; os 4 índices (`ix_transactions_user_card`, `ix_installments_user_transaction`, `ix_ledger_postings_installment`, `ix_transactions_invoice`) existem, são válidos, têm os predicados parciais documentados e o planejador os usa nas consultas que os justificam (`EXPLAIN` com seqscan desligado). O `MigrationUpgradeQaIT` da Etapa 2 já cobre V1 → V3.02 com dados de dois usuários e continua verde.

### 2.3 Concorrência (`CardConcurrencyQaIT`)

Aprovados (todos com contrato validado, razão e invariante conferidos):

- 6 pagamentos de 300,00 simultâneos (chaves diferentes) numa fatura de 1.283,00: 5 x 200 em série e o 6º `422 INVOICE_NOT_PAYABLE` (já `PAID`); `paid` 1.500,00, `creditCarry` 217,00, conta 18.500,00.
- 8 pagamentos com a mesma `Idempotency-Key`: 1 pagamento, 8 x 200.
- **S-14 compra x pagamento** (8 rodadas, fatura `CLOSED` de 1.283,00, pagamento total x compra tardia de 90,00): nunca um pagamento que viu `PAID` com a compra entrando na fatura quitada.
- Reembolso ligado x estorno da mesma compra (10 rodadas): nunca os dois dão certo.
- `cancel-installments` x pagamento antecipado (6 rodadas), estorno de pagamento x novo pagamento (5 rodadas): sem 5xx e invariante fecha.
- Mudança de dias x 8 compras simultâneas (4 rodadas): todas 201, mudança 200 ou 409, sem linha órfã, invariante ok. Mudança de dias x 12 estornos de compras existentes: sem 5xx.
- **Criação concorrente de fatura** (12 compras de 3 parcelas no mesmo ciclo, cartão sem linhas, 5 rodadas): 12 x 201, exatamente 3 linhas de fatura, sem exceção de unicidade (UUID v5 + `ON CONFLICT DO NOTHING` funcionam). Cinco cartões de mesmo fechamento de usuários diferentes: 5 ids distintos.
  Reprovados: BUG-QA-13 e BUG-QA-15 abaixo.

### 2.4 Segurança (`CardSecurityQaIT`)

Aprovados:

- Isolamento: usuário B contra 20 rotas/corpos sobre recursos de A (cartão: GET/PUT/archive/unarchive/invoices/future-installments/purchase-preview/billing-change-preview; fatura: GET/payment-preview/payments com conta de B e de A; compra e reembolso com cartão de A; compra com categoria de A; cancel-installments, void, GET e PUT de movimentação de A): sempre `404` com o `code` do recurso certo; a lista de B não traz o cartão de A; snapshot SQL de A idêntico antes e depois.
- Sem token, token lixo, `a.b.c`, Basic e `Origin` hostil: `401` em 16 rotas novas x 4 variantes.
- Campos desconhecidos (`number`, `cvv`, `brand`, `lastDigits`, `cardNumber`, `id`, `status`, `userId`, `version`, `availableLimit` no POST do cartão; `number`, `cvv`, `status`, `id` no PUT; campo extra em prévia, pagamento, cancelamento e compra): `400`, nada gravado.
- Nenhuma coluna de `credit_cards`, `credit_card_billing_rules` ou `credit_card_invoices` (nem chave do JSON de `Card`) guarda número, CVV, bandeira, finais, titular ou validade.
- Número fracionário/científico/tipo errado em campo inteiro (`25.5`, `25.0`, `1e1`, `true`, `null`, `[25]`; `installments` 2.5, 2.0, 1e0, 0, 37, -1, null; `version` 0.5): `400`. Valores monetários hostis (`1e3`, `-5.00`, `0.00`, `10.001`, espaço, vírgula, vazio, null, dígito árabe, `NaN`, 18 dígitos) em pagamento, compra e `payment-preview`: nunca 200/201, nunca 5xx, nada gravado.
- IDs malformados e query hostil (`from`, `to`, `pageSize`, `page`, dias da prévia): nunca 5xx.
- Idempotência do pagamento: sem chave `400`; chave não UUID `400`; mesma chave e corpo = mesmo pagamento (replay); mesmo corpo com valor diferente ou outra fatura = `409 IDEMPOTENCY_KEY_REUSED`; a mesma chave de outro usuário é independente.
  Reprovado/observado: BUG-QA-17.

### 2.5 Contrato

- Todo IT novo valida requisição e resposta pelo OpenAPI (`ContractValidation`); violações são coletadas e o teste falha se houver (nenhuma).
- `ContractCoverageIT.PENDING` vazio (conferido). `code`: todo `code` de erro alcançado nos testes está na tabela; conferência estática dos `code` do domínio: nenhum `CARD_*`/`INVOICE_*` lançado fora da tabela (os não documentados são de dívidas, pessoas, recorrências e importação, de etapas futuras, e internos como `TRANSACTION_STATE_INCONSISTENT`).
- `BUG-QA-09` (Etapa 2, `ACCOUNT_CURRENCY_NOT_SUPPORTED`) continua aberto.

## 3. Bugs

### BUG-QA-13 · 🟠 · Deadlock mudança de dias x estorno/cancelamento de compra criada na janela (S-215): `500 INTERNAL_ERROR`

- **Camada:** back (`ChangeCardBillingDaysUseCaseImpl`, `TransactionRepositoryJpa.lockIdsOfCard`, `GlobalExceptionHandler`).
- **Reprodução** (`CardConcurrencyQaIT.mudancaDeDiasContraEstornoDeCompraNova` e `...CancelamentoDeCompraNova`, `@Disabled`): cartão com 30 compras; uma conexão à parte trava a linha do cartão (`SELECT ... FOR UPDATE`); enfileiram-se uma compra nova P e depois o `PUT /v1/cards/{id}` de mudança de dias A (A já travou as linhas de movimentação existentes e espera o cartão); libera-se a trava. P confirma e cria T; imediatamente `POST /v1/transactions/{T}/void` (ou `cancel-installments`). A ganha o cartão e tenta `UPDATE` em T (que não estava no retrato das travas); o estorno segura T e espera o cartão.
- **Esperado:** os dois terminam (ou 409 retentável). **Obtido:** `ERROR: deadlock detected ... while locking tuple in relation "credit_cards"`; o estorno responde `500 INTERNAL_ERROR` (**6 de 6 rodadas**, para estorno e para cancelamento). A mudança de dias fecha com 200.
- **Evidência:** `Process 71 waits for ShareLock on transaction 1079; blocked by process 73. Process 73 waits for ShareLock on transaction 1080; blocked by process 71.` A ordem do plano (movimentações → cartão) é violada na prática porque a trava "todas as movimentações" é um retrato anterior à trava do cartão.
- **Efeito:** o Postgres derruba uma transação, nada é gravado pela perdedora, sem corrupção (razão e invariante intactos nas rodadas). Mas o usuário vê um 500. A janela real é estreita (estornar/cancelar uma compra no instante em que a mudança de dias está esperando o cartão).
- **Correção sugerida (do revisor, confirmo):** (a) mapear `CannotAcquireLockException`/`PessimisticLockingFailureException` (SQLState 40P01/55P03) para `409` retentável; (b) fechar a janela: depois de travar o cartão, repetir `lockAllOfCard` (a segunda lista traz só o que apareceu no intervalo) antes de ler/atualizar.

### BUG-QA-14 · 🟠 · Cancelar parcelas depois de reembolso aceito deixa o consumo da compra negativo (dupla reversão, PR 01)

- **Camada:** back (`CardTransactions.cancelRemainingInstallments`, `CancelInstallmentsUseCaseImpl`). Confirma o achado A1 do revisor. **Bloqueia o T72** (integridade financeira, T61 CA7).
- **Reprodução** (`CardBordersQaIT.reembolsoDepoisCancelamentoNaoDeixaConsumoNegativo`, `@Disabled`; também `CardPropertyQaIT.propriedadeComReembolsosGrandes`): compra 1.200,00 em 6x (10/10); relógio 30/10 (parcela 1 em fatura `CLOSED`); `REFUND` ligado de 1.000,00 (aceito, `201`); `POST /v1/transactions/{compra}/cancel-installments`.
- **Esperado:** recusa (`REFUND_EXCEEDS_ORIGINAL` ou `TRANSACTION_HAS_ACTIVE_REFUNDS`, decisão de produto), como o estorno da compra já faz. **Obtido:** `200`; consumo da compra −800,00 (200 cobrados − 1.000 reembolsados) e crédito de 800,00 transportado por todas as faturas seguintes.
- **Evidência na propriedade:** semente 7, op 39: `consumo negativo na compra ...: -27305` (−273,05), persistente até o fim da execução. O invariante da cadeia continua valendo (por isso o teste anterior não pegava): só a asserção "consumo por compra ≥ 0" o detecta. Já está no teste de propriedade padrão (reembolsos pequenos não o provocam) e no teste `propriedadeComReembolsosGrandes`.
- **Controle que passa:** reembolso de 200,00 e depois cancelar as restantes é aceito e o consumo fica 0,00 (`reembolsoPequenoDepoisCancelamento`).

### BUG-QA-15 · 🟡 · Pagamento valida contra a cadeia lida antes da trava do cartão (achado B1 do revisor)

- **Camada:** back (`PayInvoiceUseCaseImpl`: `records.load` dentro de `InvoiceResolver.resolve` antes de `cards.lockForUpdate`; as leituras depois da trava devolvem as instâncias JPA já gerenciadas).
- **Reprodução** (`pagamentoEsperandoATravaVeOEstadoConfirmadoNoMeio`, `@Disabled`): fatura `CLOSED` de 100,00 paga (fica `PAID`); trava do cartão numa conexão à parte; enfileiram-se o estorno desse pagamento e, depois, um novo pagamento de 100,00 da mesma fatura (que já carregou o estado `PAID` e espera a trava); libera-se a trava. O estorno confirma primeiro (fatura volta a `CLOSED`).
- **Esperado:** o novo pagamento vê a fatura `CLOSED` e é aceito (200). **Obtido:** `422 INVOICE_NOT_PAYABLE` ("A fatura PAID não pode ser paga"): a validação usou o estado velho. O Javadoc promete "a cadeia só é lida depois das travas".
- **Efeito:** recusa indevida (o contrário também é possível: aceitar pagamento em fatura que ficou `PAID`); nenhum valor grava errado, tudo é derivado. A variante com `cancel-installments` no meio (`pagamentoEsperandoACancelamento`) passou: invariante fecha.
- **Correção:** resolver a fatura sem carregar entidades antes da trava (ou `clear`/`refresh` do contexto logo depois das travas).

### BUG-QA-16 · 🟡 · Lista de faturas devolve ids que dão 404 em `GET /v1/invoices/{id}` (achado B4 do revisor)

- **Camada:** back (`ListInvoicesUseCaseImpl` x `InvoiceResolver`, janela [−24 meses, +36 meses]); a ADR-006 §6 afirma que todo id da lista resolve.
- **Reprodução** (`CardBordersQaIT.idsDaListaResolvem`, `@Disabled`): relógio 10/01/2024; cartão novo (25/5); compra de 50,00 em 10/01/2024; relógio 10/10/2026; compra de 60,00 em 10/10/2026; `GET /v1/cards/{id}/invoices` (paginado) devolve 34 faturas contíguas; `GET /v1/invoices/{id}` das 8 vazias mais antigas (fechamentos de 25/02/2024 a 25/09/2024, total 0,00) responde `404 INVOICE_NOT_FOUND`.
- **Esperado:** todo id listado resolve (200). **Obtido:** 8 de 34 dão 404. Cartão usado, parado por mais de dois anos e retomado.
- **Correção:** a lista padrão devolve só faturas com movimento ou dentro da janela do resolvedor, ou o resolvedor alarga até a primeira fatura com linha.

### BUG-QA-17 · 🟢 · Numeral entre aspas é aceito em campo inteiro (contra o schema `integer`)

- **Camada:** back (provável coerção de String para int no Jackson; `ACCEPT_FLOAT_AS_INT` já foi desligado em S-207, a coerção de texto não; causa não investigada).
- **Reprodução** (`CardSecurityQaIT.stringNumericaEmCampoInteiro`, `@Disabled`): `POST /v1/cards` com `"closingDay":"25"` → `201`; `POST /v1/transactions` (CARD_PURCHASE) com `"installments":"2"` → `201`; `purchase-preview` com `"installments":"2"` → `200`.
- **Esperado:** `400 VALIDATION_FAILED`/`INVALID_FORMAT`, como `25.5`. **Obtido:** aceito e convertido. Sem efeito financeiro (a conversão é exata), mas diverge do contrato e da regra "inteiro estrito" de S-207.

## 4. Observações (sem bug aberto)

- **B3 (revisor):** `Card.committedFuture` é bruto e `/upcoming` é líquido do `carryIn`; com crédito atravessando faturas `FUTURE`, `limite − disponível` deixa de bater com `totalCommitted + committedFuture`. A minha propriedade confere `committedFuture` só contra `future-installments.total` (que concorda) e não a identidade `limite − disponível`; é decisão de produto, não testei como bug.
- Sob falha de trava, qualquer endpoint de escrita responde 500 (ver BUG-QA-13): o mapeamento de `CannotAcquireLock` para 409 vale para todas as rotas de escrita, não só mudança de dias.
- O teste de bordas de calendário (`calendarioContraOraculo`) faz ~380 chamadas e é o mais lento do pacote (cerca de 20 s). `CardPropertyQaIT` leva ~30 s.

## 5. Testes adicionados (`backend/src/test/java/com/moneylog/qa/`)

- `CardQaWorld.java`, `CardInvariants.java`: apoio (usuário com Nubank/cartão/categorias, chamadas com validação de contrato, invariantes do cartão).
- `CardConcurrencyQaIT.java` (14 testes, 3 `@Disabled`: BUG-QA-13 x2, BUG-QA-15).
- `CardPropertyQaIT.java` (2 testes, 1 `@Disabled`: BUG-QA-14).
- `CardBordersQaIT.java` (8 testes, 2 `@Disabled`: BUG-QA-14, BUG-QA-16).
- `CardSecurityQaIT.java` (8 testes, 1 `@Disabled`: BUG-QA-17).
- `CardMigrationQaIT.java` (1 teste).
  Para reproduzir um bug, remova o `@Disabled` do teste citado e rode, por exemplo: `./mvnw -o verify -Dtest=NONE -Dsurefire.failIfNoSpecifiedTests=false -Dit.test=CardConcurrencyQaIT -Djacoco.skip=true`.

## 6. Riscos e pendências

- BUG-QA-14 precisa de decisão de produto (recusar o cancelamento ou transformar o excedente em ajuste) e corrige antes do T72.
- Não cobri: `realizeOnCard` (T60, sem controller até a Etapa 4), importação de fatura (Etapa 7), carga de desempenho (revisor B5: custo cresce com o histórico inteiro; não medi).
- Prévia de pagamento x pagamento real: igualdade já coberta pelos ITs do dev; na propriedade, os valores de `PREPAY`/`OVERPAY` aparecem nas operações mas não comparo a prévia a cada passo.
- Reproduções de deadlock dependem de duas conexões e de `pg_locks`; funcionam no Testcontainers Postgres 17. Os testes ignorados continuam compilando, então qualquer renomeação de API os quebra.

## 7. Parecer

🟡 **Aprovado com ressalvas** para seguir com o frontend em paralelo, **com o T72 (E2E com backend real) condicionado à correção do BUG-QA-14** (integridade financeira, 🟠 que bloqueia pela regra do T61 CA7) e, de preferência, do BUG-QA-13 (mapear deadlock para 409 e fechar a janela) antes de qualquer uso real. BUG-QA-15, 16 e 17 podem ir para a fila normal. O núcleo do cartão (ciclo, transporte de crédito, status derivado, dashboard, isolamento entre usuários, contrato, migrações, criação concorrente de faturas) passou sem achados.
