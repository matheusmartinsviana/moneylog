# Revisão final de código: adequação ao resumão (backend e frontend, árvore sem commit)

Data: 2026-10-15 · Revisor · Plano `docs/planos/2026-10-15-adequacao-ao-resumao.md` (rev 3) · ADR-022, 023, 024, 026, 031 · PR 01 · QA `docs/qa/2026-10-15-qa-backend.md` e `qa-frontend.md` · parecer anterior `docs/revisoes/2026-10-15-codigo-backend-lotes-2-4.md` (🔴).

Método: leitura dos arquivos tocados (CardTransactions, SharePayables, HandlerSupport, CardRefundHandler, ShareSettlement, UpdateTransactionSharesUseCaseImpl, ApplyShareMigrationUseCaseImpl, Record/UnmarkThirdPartyReceipt, CardShareReceivables, ThirdPartyReceivables, OwnerStatement/Outflow/Income, CreateCardCashOutUseCaseImpl, CardCashOutTransactions, VoidTransactionUseCaseImpl, RestoreBackupUseCaseImpl, BackupRestoreController/Mapper, JdbcRestoreTargetGateway, TaxTableGatewayImpl, DebtEntity, V9.22) e execução própria numa cópia isolada do backend (fora do repositório): `com.moneylog.infra.resumao.*IT` + `BackupRestoreIT` = 160 testes, 159 verdes, 1 vermelho (ver A1). Também rodei `ArchitectureTest` (10/10 verde), `npm run typecheck` (verde) e os specs do front dos bugs QA-FE-01/02/03/04/06/07 (6 arquivos, 127 testes verdes). Não rodei a suíte inteira (unitários, demais ITs, e2e): confiar no QA para o restante.

## 1. Resumo

O parecer anterior (🔴) está resolvido nos pontos que quebravam a integridade: o estorno de compra rateada agora divide pela mesma regra do rateio e converte o excedente recebido em a pagar; o Pix no crédito deixou de ser editável, rateável, reembolsável parcialmente e cancelável por parcelas; o ciclo de pacotes sumiu (ArchitectureTest verde); a ordem de travas da ADR-008 foi respeitada em estorno do Pix, folha com consignado, recebimento, exclusão de recebimento, `PUT shares` e migração; os 🔴 do QA (BUG-01 SQL das tabelas fiscais, BUG-02 `updatable=false`, BUG-03 a receber maior que o razão) e os 🔴 do front (QA-FE-01/03/04, mais QA-FE-02) estão corrigidos. A restauração de backup é tudo-ou-nada, isola por usuário e valida referências e razão.

Restam ajustes de severidade média/alta (um teste vermelho por decisão de Produto pendente, saldo final errado para `from` no passado que atravessa o mês corrente, ADR e contrato com uma afirmação aritmeticamente falsa, tela de Pix no crédito ausente) e nenhum achado crítico. A varredura de dado real não achou valor, pessoa, banco, final de cartão nem empresa copiados do resumão em valores concretos; achou ecos estruturais e dois nomes (seção 6).

## 2. Itens conformes

- **C1 (estorno de compra rateada).** `SharePayables.refundSplit/refundPostings` dividem o estorno em `EXPENSE −minha parte`, `RECEIVABLE(pessoa) −parte`, `CARD/ACCOUNT +valor`, por acumulado proporcional (arredondamento para baixo no terceiro, resto no dono), com teto no devido; `HandlerSupport.refundedThirds` considera estornos anteriores e reembolsos migrados; `refundSettlement` aciona `planConversion` quando o recebido passa do novo devido (excedente vira `PAYABLE`, soma zero, idempotente por `alreadyConverted`). Estorno de estorno é recusado para rateada; desfazer estorno com conversão é recusado (`requireRefundOfSharedVoidable`). Testes: `CardRefundOfSharedPurchaseTest`, `SharedPurchaseLifecycleIT` (12), propriedade de 200 cenários verde.
- **C2 (Pix no crédito).** `isCardCashOut()` agora bloqueia `editPurchaseDetails`, `reshare`, `cancelRemainingInstallments` e reembolso (`validateRefundOrigin`). Só o estorno total (void) é permitido e `markOriginVoided` fecha a dívida. Razão por parcela soma zero (`CARD −parcela`, `EXPENSE +juros`, `EQUITY +principal da parcela`; 1ª parcela `ACCOUNT/RECEIVABLE(debt) +P`, `EQUITY −P`): só os juros são despesa, o principal nunca é consumo (PR 01, regra de empréstimo). TIR em `EffectiveRate` com `BigDecimal` e saída em bps. `CardCashOutIT` 10/10.
- **A2a/A2b/A2c.** Criação rateada soma zero por parcela e a prévia usa o mesmo código; `PUT shares` trava tx → pessoas (ordenadas) → confere versão, recusa abaixo do recebido (`SHARES_BELOW_RECEIVED`), recusa com estorno ativo, grava revisão, reclassifica só `EXPENSE`↔`RECEIVABLE`, abate conversão já feita (`netReceived`); migração das marcas: dry-run não grava, hash, idempotência por `existsApplied`, trava tx → pessoas, reconferência de versão/rateio/estornos dentro da trava, arquivo da marca, `r > t` vira exceção, `receivableRecognized` no relatório (o aumento de patrimônio está declarado na ADR-022 §10).
- **B2b.** Fatura entra no mês do vencimento e só o `outstanding` no mês corrente; dedup por recorrência/ocorrência e por transação/parcela; pagamento de fatura e transferência fora; `COMPANY` à parte; imóvel com e sem cota; mês corrente não soma de novo o que já está no caixa (`alreadyInBalance`).
- **Restauração de backup.** Um único caso de uso transacional (`TransactionalProxies.required`); recusa destino com dado (`hasData` cobre 15 tabelas + categorias não-sistema, 409) e schema desconhecido antes de gravar; o mapper sobrescreve o `userId` de todas as entidades pelo do token (o arquivo não escolhe dono) e `References` exige que toda referência (conta, cartão, categoria, pessoa, dívida, recorrência, transação, perfil, rateio, grupo, rubrica, recebimento) exista no próprio arquivo, que não haja id repetido e que todo livro do razão exista; o razão passa pelo `LedgerWriteGatewayImpl` (todo grupo soma zero, senão `LEDGER_UNBALANCED`); estorno é inserido depois do original com detecção de ciclo; `DataIntegrityViolation` (id que já existe em outro usuário) vira `409 RESTORE_CONFLICT` genérico, e as entidades têm `@Version` nulo na criação, então `save` insere e nunca faz `merge` sobre linha alheia. `BackupRestoreIT` 4/4 verde.
- **BUG-01/02/05/12 e contrato.** SQL de `TaxTableGatewayImpl` corrigido; `DebtEntity.kind` atualizável; `PAYROLL` marcado e desmarcado em `IncomeDebts`; `Debt.isOverdue` e o filtro SQL excluem `PAYROLL`/`CARD_CASH_OUT`; V9.22 exige adiantamento completo ou nulo; `ContractShapeBugsIT` (BUG-04, 05, 06, 07, 08) verde; tabela de erros do contrato (BUG-10) corrigida; `openapi.yaml` idêntico nos dois repositórios (2.33.1).
- **PR 01.** Todo grupo do razão soma zero (checado no gateway); dinheiro em `Money`/centavos (nenhum `double`/`float` no código novo; `BigDecimal` só em taxa e cobertura de reserva); cálculo só no backend (nenhum `parseFloat`/`toFixed`/`*100` nas telas novas); idempotência por `Idempotency-Key` em recebimento (obrigatória sem conta), Pix no crédito, criação de transação e geração de ocorrências; consignado: principal baixa a dívida, só juros viram despesa; FGTS nunca disponível nem reserva (backend e, após correção, front); assinatura da empresa e "a receber" fora da sobra.
- **Regras do CLAUDE.md.** Nenhum comentário nas linhas adicionadas de Java, TS, HTML e CSS (varredura do diff e dos arquivos novos; as únicas ocorrências estão em `schema.gen.ts`, arquivo gerado); `ArchitectureTest` 10/10; `core` não importa `infra`; portas de razão movidas para `core.sk.ledger` (fim do ciclo `finance ↔ thirdparty/commitment`).
- **Front.** QA-FE-01 (`[formGroup]` no modal de rateio), QA-FE-02 (FGTS envia `countsAsReserve: false`), QA-FE-03 (`splitOn` restaurado com evento), QA-FE-04 (`[allowZero]` na tolerância) corrigidos e os `it.fails` correspondentes viraram `it`; `typecheck` verde.

## 3. Achados

### 🟠 Altos

**A1. Teste de aceite vermelho e decisão de Produto pendente: "a receber" do mês no resumo** · `core/finance/domain/OwnerStatement.java:pendingReceivables` · `OwnerStatementNovemberIT.receivablesPendingDeNovembro:101` (único teste vermelho dos 160 que rodei)
- Problema: `receivablesPending` do mês soma por competência do consumo (`CardShareReceivables.lines().months()`), enquanto as saídas do mesmo quadro seguem o vencimento da fatura (P-3). O teste espera a leitura "o que me devem das saídas do mês"; o código dá só a parte com competência de consumo no mês. Nenhuma das duas leituras está registrada na ADR-023.
- Impacto: o quadro mostra saídas por vencimento e "a receber" por competência; o dono pode achar que a Ana deve menos do que as faturas do mês carregam. Não afeta caixa nem consumo (o campo não entra na sobra).
- Correção: Produto decide (BUG-09 do QA); registrar na ADR-023; ajustar código ou teste. Sem isso o CI do backend fica vermelho.

**A2. Escopo pendente do plano no front: não há como registrar o Pix no crédito nem ver a taxa efetiva (F7)** · `frontend/src/app` (sem `card-cash-outs`, `effectiveRate`, formulário) · QA-FE-11
- Problema: o backend expõe `POST /v1/card-cash-outs`, TIR e o alerta `CARD_CASH_OUT_COST`, mas nenhuma tela cria ou mostra isso; o alerta chega sem ação possível. Também faltam `lastDigits` por compra, `nature` e `commitments.byMonth` na tela de compras agrupadas.
- Impacto: critério de pronto do plano (F7) não cumprido; funcionalidade do PR 01 (empréstimo no crédito) só utilizável por API.
- Correção: dev-frontend (F7) ou decisão de Produto de adiar com registro no plano.

### 🟡 Médios

**M1. `from` no passado que atravessa o mês corrente entrega saldo final errado** · `core/finance/domain/OwnerStatement.java:of` (linhas de `openingDate` e `alreadyInBalance`)
- Problema: com `from` anterior ao mês corrente, o saldo de abertura é o do fim do mês anterior a `from`, os meses passados somam o realizado inteiro e o mês corrente soma `renda total − saídas não pagas − renda já recebida`. Faltam as saídas já pagas e a renda já recebida do mês corrente até hoje (o caixa de hoje não é usado). O saldo final fica errado em `(recebido − pago)` do mês corrente. O teste `fromNoPassadoNaoDuplicaASobra` só cobre um `from` totalmente passado com `months=1`.
- Impacto: coluna de saldo errada para uma consulta que o contrato permite.
- Correção: para `from < mês corrente`, partir do caixa de hoje para o mês corrente e seguintes (e recuar os passados) ou somar também o realizado do mês corrente e não subtrair `alreadyInBalance`; teste com `from` passado e `months` cobrindo o mês corrente.

**M2. Restauração sem trava por usuário (corrida entre duas restaurações)** · `RestoreBackupUseCaseImpl.handle` (`target.hasData` sem trava) · `BackupRestoreController` (limitador em memória)
- Problema: duas restaurações simultâneas do mesmo usuário com arquivos de ids diferentes passam as duas pelo `hasData` e gravam misturado (mesmo arquivo falha por chave primária). O limitador por usuário não serializa.
- Impacto: conta com dados de dois backups, razão consistente mas conteúdo híbrido. Raro, mas irreversível sem novo backup.
- Correção: travar a linha do usuário (`SELECT ... FOR UPDATE` em `users`) no início do caso de uso, antes do `hasData`; teste de concorrência no padrão `GoalLockConcurrencyIT`.

**M3. ADR-022 §7/§"Critérios" e o contrato afirmam algo falso: "o patrimônio é o mesmo antes e depois de editar o rateio"** · `docs/adrs/ADR-022-rateio-e-minha-parte.md:69` e `:99`, `backend/contracts/openapi.yaml` e `frontend/contracts/openapi.yaml` (descrição de `PUT /v1/transactions/{id}/shares`), `frontend/src/util/api/schema.gen.ts`; plano A2b
- Problema: reclassificar `RECEIVABLE` em `EXPENSE` (mais minha parte) reduz o patrimônio exatamente no aumento da minha parte; o código está certo, o texto não (D-1 do QA, confirmado pelo teste do ledger). `CARD` e caixa de fato não mudam.
- Correção: Arquitetura/Produto corrigem ADR, plano e contrato ("caixa, fatura e limite não mudam; o patrimônio muda com a reclassificação") e regeneram `schema.gen.ts` com `./moneylog contract sync`.

**M4. `PersonMonth.pending` pode ser negativo e não bate com o `MonthView`** · `core/finance/domain/ThirdPartyReceivables.java` (`PersonMonth` sem piso; `month()` com piso em zero)
- Problema: no mês de um estorno parcial o `owed` do mês é negativo e o `pending` da pessoa nesse mês fica negativo (a soma dos meses bate com o total, o que corrige o BUG-03), mas o `MonthView` trunca em zero. As duas leituras do mesmo mês divergem.
- Impacto: tela que mostra "a receber" por mês pode exibir valor negativo ou somas diferentes.
- Correção: definir com UX/Produto como exibir o estorno no mês (linha de ajuste) e usar a mesma regra nas duas leituras; teste do caso (compra 100,00 rateada, estorno 20,00 em outro mês).

**M5. A2c: recebimentos legados lidos antes da trava** · `ApplyShareMigrationUseCaseImpl.handle`
- Problema: o plano (inclusive `legacyReceipts` e o hash) é montado antes de `transactions.lockForUpdate`. A versão, o rateio e os estornos são reconferidos dentro da trava, mas um recebimento legado gravado entre a leitura e a trava não entra no plano e fica órfão quando a marca é apagada. `backupConfirmed` é só booleano (decisão registrada no plano).
- Correção: recarregar recebimentos legados depois das travas e comparar com o plano (ou refazer o plano sob trava e comparar o hash).

**M6. Zero de rateio sem teste para estorno da compra com `EXPENSE` do dono zerado** · `SharePayables.refundPostings`
- Problema: quando `split.mine()` é zero o estorno não lança `EXPENSE`; a soma zero se mantém, mas se o estorno é do tamanho exato do que sobrou para a pessoa e arredondamento desloca centavos, o limite `part <= total - already` empurra o resto para o dono. Coberto pela propriedade de 200 cenários; não há teste de borda explícito com centavos (ex.: 3 pessoas, compra 100,00 em 3x, estorno de 0,01).
- Correção: teste de borda de centavos no estorno.

### 🟢 Baixos

- **B1.** Arquivo vazio `backend/src/main/resources/db/migration/_x` (criado hoje). Remover antes do commit.
- **B2.** Lacunas `V9.14` e `V9.17` e migrações de correção `V9.20`, `V9.21` e `V9.22` sobre migrações V9 ainda não publicadas (todas sem commit): enquanto nada foi para produção, dá para incorporar as correções nas migrações originais e renumerar. Decidir antes do merge (achado L1 anterior). `V9.22` falharia em base com `advance_day` preenchido e `advance_bps` nulo; só vale se nenhuma V9.05 rodou fora de testes.
- **B3.** Construtores antigos que aceitam `null` (`CreateTransactionUseCaseImpl`, `HandlerSupport`, `AccountTransactionFactory`): a fiação atual passa tudo, mas o construtor curto desliga rateio ou câmbio em silêncio (L3 anterior).
- **B4.** Restauração aceita números do arquivo como verdade (um backup adulterado pode criar saldo, desde que cada grupo some zero). Só afeta o próprio usuário; registrar que o backup não é assinado.
- **B5.** Resíduos do QA do front: QA-FE-05 (salto h1→h3 em `/planning/income`), QA-FE-06 (7 códigos de erro sem mensagem), QA-FE-07 (finais repetidos ou acima de 5 não validados), QA-FE-08 (falha de busca ao vincular compra aparece como vazio), QA-FE-09 (formato de casas decimais), QA-FE-10 (orçamento de build estourado em 2,5 kB) e `shares: []` não documentado no contrato. Os specs `it.fails` de QA-FE-05 a 08 seguem como marcadores; nenhum bloqueia.
- **B6.** BUG-11 (`DOCUMENT_DIVERGENCE` nunca gerado, `AlertInputsLoader` passa lista vazia) e D-3 (simulador só classifica bem compra à vista na janela de novembro) continuam como limitação declarada, sem regra de negócio decidida.

## 4. Riscos

- Dono vê "a receber" por competência ao lado de saídas por vencimento (A1) e um saldo final errado para `from` passado (M1).
- Corrida de restauração (M2) em instalação com mais de uma aba/dispositivo.
- A suíte completa do backend (unitários, ITs antigos) e os e2e do front não foram reexecutados por mim depois das correções; a cobertura nova (160 testes) foi.
- Migrações V9 acumulam correções (B2); o histórico do Flyway em ambiente de desenvolvimento do dono pode divergir se alguma já foi aplicada.

## 5. Pendências por dono

- **Produto:** A1 (leitura do "a receber" do mês); exibição de estorno parcial por mês (M4); F7 adiar ou fazer (A2); D-3 do simulador; BUG-11.
- **UX:** como mostrar mês com estorno na visão de terceiros (M4); mensagens dos 7 códigos (B5).
- **Backend:** M1, M2, M5, M6, B1, B3.
- **Frontend:** F7 (A2), B5.
- **Arquitetura:** corrigir ADR-022 e contrato (M3); decisão de renumerar ou incorporar V9.20 a V9.22 (B2).

## 6. Varredura de dado real (resumão × repositório)

Escopo: backend, frontend, docs na raiz, ADRs, planos, revisões, QA, fixtures, specs, contrato e e2e; arquivos rastreados e não rastreados (sem `node_modules`, `target`, binários). Busca por valores monetários (formato brasileiro e ponto decimal), números redondos de cronograma, finais de cartão, datas, bancos, empresas, produtos e nomes de pessoas do arquivo `/Users/matheusmartinsviana/Downloads/resumão.md`. Os valores não são reproduzidos aqui.

**Nenhum valor monetário não redondo do resumão (renda, descontos, faturas, parcelas, patrimônio, projeção), nenhum final de cartão, nenhum nome de pessoa, nenhum nome de banco/cartão do dono com final, nenhum nome de incorporadora, endereço, empregador ou fornecedor de compra apareceu em código, fixture, spec, ADR ou doc.** As ocorrências abaixo são o que sobrou.

| Sev. | Caminho:linha | Natureza |
|---|---|---|
| 🟡 | `docs/planos/2026-10-15-adequacao-ao-resumao.md:53` | nome da empresa do dono (agência) citado no plano |
| 🟡 | `docs/revisoes/2026-10-15-plano-adequacao-ao-resumao-r3.md:37` | mesmo nome, em nota de revisão que já recomenda trocar por "empresa do dono" |
| 🟡 | `docs/revisoes/2026-10-15-plano-adequacao-ao-resumao.md:30` | nome de fornecedor de curso/consultoria do dono ("estorno do ...") |
| 🟡 | `docs/revisoes/2026-10-15-plano-adequacao-ao-resumao.md:59` | exemplo de mensalidade de terceiro de parentesco do dono (academia da irmã) |
| 🟢 | `backend/src/test/resources/db/it/novembro-2026/cenario.json:220`, `backend/src/test/java/com/moneylog/infra/resumao/SubscriptionsIT.java:37`, `.../AlertsIT.java:162`, `backend/src/test/java/com/moneylog/core/recurrence/domain/SubscriptionCostTest.java:43,45`, `docs/adrs/ADR-025-moeda-estrangeira-como-metadado.md:34`, `docs/planos/2026-10-15-adequacao-ao-resumao.md:455`, `docs/qa/2026-10-15-qa-backend.md:157` | valor da assinatura semanal do resumão (mesmo centavo). O mesmo valor já existia em testes antigos commitados (`OccurrencesIT`, `RecorrenciasUseCasesTest` etc.), então pode ser coincidência ou eco antigo; trocar por valor sem relação |
| 🟢 | `backend/src/test/resources/db/it/novembro-2026/cenario.json` (campos `amount`), `docs/qa/2026-10-15-qa-backend.md:157` | eco de estrutura, com valores redondos: imóvel com três valores de parcela na mesma proporção e na mesma divisão com a irmã, compra agrupada em dois cartões com 10 e 3 parcelas, USD 5,00, consignado e Pix no crédito em 4 parcelas, gastos rateados em três. Não permite reconstruir a finança real, mas deixa a fixture reconhecível para quem leu o resumão; variar valores e prazos |
| 🟢 | `docs/revisoes/2026-10-15-codigo-backend-lotes-2-4.md`, `docs/planos/2026-10-15-adequacao-ao-resumao.md` (seção que descreve a origem) | citam o arquivo `resumão` como fonte (sem valores) |
| histórico | `backend/contracts/openapi.yaml:13666`, `frontend/contracts/openapi.yaml:13666`, `frontend/src/util/api/schema.gen.ts:7626`, testes de notas (`NoteTextPropertyTest`, `WikilinkParserTest`, `WikilinkResolverTest`, `NoteSearchIT`, `NotesIT`, `VaultIT`, specs de notas do front) | o nome da empresa do dono já está em exemplos de notas commitados desde a Etapa 6 (`HEAD`), fora desta mudança; citado só para que a limpeza da história, se desejada, o inclua |

Ocorrências que parecem do resumão mas não são: valores redondos (1.000, 2.000, 3.000...) e `4650.00` em `ListaDashboardConsistenciaTest.java:71` (conta 5.000 menos 350, commitado antes); datas de cronograma comuns; nomes genéricos de banco ou produto (Itaú, Nubank, iPhone, MacBook, Anthropic) em docs técnicos e no cliente de IA; "Lei 15.270/2025" e a data de publicação em `V9.04` e ADR-026 (norma pública); `15/11/2026` em `purchases.page.spec.ts:281` (data de teste). Nada em `~/.moneylog` está no repositório. Recomendação: trocar os quatro 🟡 por termos genéricos antes de qualquer commit ou push do repositório principal e suavizar a fixture (🟢).

## 7. Parecer

🟡 **Aprovado com ajustes.**

Justificativa: os dois 🔴 do parecer anterior (C1 e C2) estão corrigidos no domínio e na camada de aplicação, com testes de propriedade e de integração verdes, o razão fecha em todos os grupos, nenhuma mudança trata transferência, investimento ou empréstimo como despesa, conta compra parcelada inteira no mês ou duplica consumo, e a restauração de backup é segura quanto a isolamento e atomicidade. O QA reprovado (BUG-01, 02, 03 e QA-FE-01/03/04) foi corrigido e confirmado por mim. Não aprovo sem ressalvas porque ficou um teste de aceite vermelho dependente de decisão de Produto (A1), um saldo final errado em consulta permitida (M1), a corrida da restauração (M2), a falta da tela de Pix no crédito (A2) e um texto de ADR e contrato que afirma o contrário do que o razão faz (M3). Sequência: Produto decide A1 e A2; dev-backend corrige M1, M2, M5 e B1; Arquitetura corrige M3 e sincroniza o contrato; trocar os nomes da seção 6 antes de commitar. Após isso, uma re-revisão curta dos itens M1/M2 basta.
