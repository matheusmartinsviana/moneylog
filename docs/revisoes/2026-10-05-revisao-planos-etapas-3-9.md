---
tipo: revisão de planos (antes da implementação)
data: 2026-10-05
revisor: revisor
escopo: T49–T180 (Etapas 3 a 9 e UI própria), sem código ainda para essas etapas
planos:
  - docs/planos/2026-10-05-etapa-3-cartoes-faturas-parcelas.md       (T49–T72, revisão profunda)
  - docs/planos/2026-10-05-etapa-ui-propria.md                       (T153–T174, revisão profunda + reconciliação)
  - docs/planos/2026-10-05-etapa-4-dividas-pessoas-recorrencias.md   (T73–T90, revisão leve)
  - docs/planos/2026-10-05-etapa-5-metas-resumo-projecoes.md         (T91–T105, revisão leve)
  - docs/planos/2026-10-05-etapa-6-vault-notas.md                    (T106–T120, revisão leve)
  - docs/planos/2026-10-05-etapa-7-importacao-notificacoes.md        (T121–T138, revisão leve)
  - docs/planos/2026-10-05-etapa-8-ia.md                             (T139–T152, revisão leve)
  - docs/planos/mvp-roadmap.md                                       (ordem, marcos, Etapa 9)
contra: backend/ e frontend/ reais, D1, D2, ADR-001 a 004, revisões e QAs anteriores, vault (PR 00 a 02, DS 00/01)
---

# Revisão dos planos das Etapas 3 a 9 e da UI própria

## 1. Resumo

Os planos são de boa qualidade: tasks pequenas com Dado/Quando/Então, suposições numeradas com dono, cenário comum, dependências explícitas, e o princípio "o backend calcula, o front mostra" levado a sério (prévias de compra, de pagamento e de mudança de dias). A numeração fecha (133 tasks: 58 BE, 57 FE, 18 tester/revisor) e as dependências entre etapas do roadmap batem com os planos, com um erro de referência.

Conferi o domínio real (`CardTransactions`, `InvoiceChain`, `InvoiceAllocator`, `InstallmentPlan`, `CreditCardInvoice`, `CardBillingChanges`/`BillingChange`, `CreditCard.planBillingChange`, `CommitmentSchedule`, `Horizon`, `DuplicateClassifier`, `AccountTransactionFactory`, `ArchitectureTest`, migrações `V1.03`–`V2.06`) e refiz à mão os critérios numéricos da Etapa 3 (6x de 1.200,00, fechamento no dia 25, crédito transportado, lançamento tardio, mudança de dia, limite, estorno). **A maior parte bate**: parcelas 200,00 com competências 2026-10…2027-03 e fechamentos 25/10…25/03, 333,34/333,33/333,33, fatura 25/10 com referência 2026-11 e vencimento 05/11, `lateEntry` em fatura `CLOSED`, fatura `PAID` redirecionando para a corrente, 7.717,00 de limite, 18.717,00 de disponível, 20.000 − 1.283 − 8.500 = 10.217, `monthlyNeeded` 766,67 (15 meses, arredondado para cima), resumo de outubro (consumo 250,00, `net` 2.750,00, `savingsRate` 0,9167).

Achei **8 problemas 🟠 e nenhum 🔴 na Etapa 3**, mais 2 🟠 na Etapa 4, 3 na Etapa 7 e 1 na Etapa 8 (privacidade). Os de nome, pacote, número e dependência foram **corrigidos nos planos** (§4). Os de decisão de produto/arquitetura ficam abertos, com dono (§6). Para a UI própria, o achado central é de **reconciliação**: o dev-frontend já entregou, sem seguir o plano, boa parte de T155–T161 (§5).

Nenhum plano foi reprovado. A Etapa 3 pode começar pela T49/T50 depois que o orquestrador conferir as correções.

## 2. Pareceres por plano

| Plano                        | Parecer                                                                                  | Justificativa curta                                                                                                                                                                                                                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Etapa 3 (T49–T72)            | 🟡 Aprovado com ajustes (ajustes de texto já aplicados; restam 3 decisões abertas, §3.1) | Domínio e números corretos; falhavam: pacotes que quebram o ArchUnit, trava de concorrência no nível errado, id de fatura sem caminho de leitura, datas gravadas da fatura que ficam velhas na mudança de dia, `PUT` sem como detectar prévia velha, 2 números contraditórios (`totalCommitted`, `creditBalance`) |
| UI própria (T153–T174)       | 🟡 Aprovado com ajustes (reconciliar com o trabalho em andamento, §5)                    | FE-S-112 e FE-S-113 razoáveis; o plano precisa assumir o que já existe (OverlayPanel único, `calendar/`, `Select` sem alias) e o ADR/spike virar retroativos                                                                                                                                                      |
| Etapa 4 (T73–T90)            | 🟡 Aprovado com ajustes (já aplicados)                                                   | Domínio de dívida e divisão correto contra o PR 01; erro numérico no horizonte `d30` (1.521 → 1.402) e pacotes que gerariam ciclo                                                                                                                                                                                 |
| Etapa 5 (T91–T105)           | ✅ Aprovado (ressalvas 🟡/🟢)                                                            | Reserva lógica sem posting, resumo e projeção sem dupla contagem, exportação segura; números conferem                                                                                                                                                                                                             |
| Etapa 6 (T106–T120)          | ✅ Aprovado (ressalvas 🟡/🟢)                                                            | Vault isolado das lentes financeiras, XSS e zip hostil tratados                                                                                                                                                                                                                                                   |
| Etapa 7 (T121–T138)          | 🟡 Aprovado com ajustes (2 aplicados, 1 aberto: espelho de transferência)                | Nenhuma transferência automática, dedup e idempotência bem desenhadas; contradição T124 × T126 sobre estornadas, índice único com `NULL` e lacuna no pareamento de transferência já registrada                                                                                                                    |
| Etapa 8 (T139–T152)          | 🟡 Aprovado com ajustes (1 🟠 aberto: nomes de favorecido em PIX/TED)                    | Chave só no backend, prévia aprovada por hash, registro de análises e funcionamento sem IA completos                                                                                                                                                                                                              |
| `mvp-roadmap.md` (+ Etapa 9) | 🟡 Aprovado com ajustes (1 referência corrigida, 3 recomendações)                        | Ordem, marcos e caminho crítico coerentes; regra de contrato e Flyway precisam de duas salvaguardas                                                                                                                                                                                                               |

## 3. Achados

Legenda de status: **corrigido** (editado no plano), **aberto** (decisão ou texto novo do orquestrador/dono).

### 3.1 Etapa 3 (prioridade máxima)

**E3-01 🟠 Pacotes dos casos de uso quebram o `ArchitectureTest` (corrigido)**

- Onde: T51, T53, T54, T55, T56, T57, T58, T60 (campo "Arquivos/camadas").
- Problema: o plano põe `PayInvoice`, `ChangeCardBillingDays`, `ListInvoices`, `RealizeCardRecurrence` etc. em `core/card/app` e `core/recurrence/app`, e os handlers em `core/transaction/app/handlers`. No código, `core.card` só depende de `sk`; `core.transaction` depende de `card`/`debt`/`importing`; `core.recurrence` depende de `transaction`; `core.finance` depende de tudo. `ArchitectureTest.featuresDoCoreSemCiclos` falha com card↔transaction e recurrence↔finance. Além disso o ponto de extensão real é `AccountTransactionFactory` + `CreateTransactionCommand` selado (hoje `Refund` com `cardId` cai em `TransactionTypeNotAvailableException`), em `core/finance/app/transactions`, não `CreateTransactionUseCaseImpl`.
- Impacto: a primeira task de caso de uso (T51 já, pois `ArchiveCard` precisa da cadeia) quebraria o build; T53 refatoraria o lugar errado.
- Correção aplicada: regra de pacotes em §2.3 e caminhos reescritos para `core/finance/app/{cards,transactions,recurrences}`; portas ficam em `core/<feature>/app/gateways`. Mesma regra propagada às Etapas 4 e 7 e ao roadmap.

**E3-02 🟠 Trava de concorrência no nível errado (corrigido)**

- Onde: T55 CA5 ("lock da fatura"), T61 CA3, T53.
- Problema: a cadeia é um agregado do cartão (o `carryIn` atravessa as faturas) e a fatura pode não ter linha (S-119). Uma compra que decidiu `lateEntry` contra uma fatura `CLOSED` pode ser gravada depois de um pagamento concorrente ter deixado essa fatura `PAID`, violando S-14 ("nunca item novo em fatura paga"). Também faltava a ordem global de travas: a Etapa 2 já fixou "movimentações → contas por id" em `AccountTransactionFactory.lockFor`; `INVOICE_PAYMENT` trava conta e cartão.
- Correção aplicada: trava `FOR UPDATE` na linha de `credit_cards` em toda operação que escreve na cadeia, ordem movimentações → cartão → contas por id, em T53 (estende `lockFor`) e T55 CA5.

**E3-03 🟠 `GET /v1/invoices/{id}` de fatura sem linha não tem como resolver o id (corrigido)**

- Onde: S-119, T50, T54 CA6.
- Problema: UUID v5 de `cardId+closingDate` é de mão única; o backend não extrai `(card, closing)` do id. "200 com id determinístico e total 0,00" para a fatura corrente vazia é inimplementável como escrito.
- Correção aplicada: T50 CA4 define o algoritmo (busca por id; senão recalcula os ids dos fechamentos de cada cartão do usuário na janela `[hoje−24m, hoje+36m]`); T54 CA6 remete a ele.

**E3-04 🟠 Linhas de fatura guardam datas derivadas que ficam velhas (corrigido)**

- Onde: T58 (e `V1.04`).
- Problema: `credit_card_invoices` tem `period_start`, `due_date`, `reference_month` `NOT NULL`. Na mudança só do vencimento (T58 CA1: 5 → 28, fechamento igual) o `closing_date` das faturas `FUTURE` não muda, então o `findOrCreate` (`ON CONFLICT DO NOTHING`) mantém o vencimento antigo; o mesmo vale para `period_start` da fatura seguinte a um fechamento alterado. As linhas divergiriam do calendário (a leitura usa o calendário, mas relatórios/SQL/exportação não). Também: a poda de linhas "sem referência" deve contar itens de movimentações estornadas/canceladas, que a reidratação carrega.
- Correção aplicada: T58 CA7 estendido e novo CA7b (atualizar as colunas de data das linhas `FUTURE` que mantêm o `closing_date`; IT compara linha × calendário).

**E3-05 🟠 `409 CARD_BILLING_CHANGE_STALE` não é detectável com o contrato escrito (corrigido)**

- Onde: T58 CA4, §4 (linha do `PUT`), T69.
- Problema: a virada do dia não muda `version`. O `PUT` não carrega nada da prévia, então o backend não sabe se a prévia ficou velha.
- Correção aplicada: `confirmedEffectiveFrom` no `PUT` com mudança de dia (valor `effectiveFromClosingDate` da prévia); backend recalcula e compara; T69 envia o campo.

**E3-06 🟠 `totalCommitted` contradiz os critérios (corrigido; confirmar com Produto)**

- Onde: S-129 × T54 CA1 × T65 CA1.
- Problema: S-129 definia `totalCommitted` = Σ `outstanding` das faturas **não `PAID`** (inclui as `FUTURE`: 1.283 + 1.000 = 2.283), mas T54 CA1 e T65 CA1 esperam 1.283,00 ("as futuras entram em `committedFuture`").
- Correção aplicada: `totalCommitted` = corrente + fechadas/atrasadas (sem `FUTURE`), disjunto de `committedFuture`; `limite − disponível = totalCommitted + committedFuture` (10.000 − 7.717 = 1.283 + 1.000). **Pergunta ao Produto**: "Total comprometido no cartão" (PR 00 §4) deve mostrar 1.283,00 (como agora) ou 2.283,00 (tudo que consome limite)? A UI mostra os dois números lado a lado, então a ambiguidade é de rótulo.

**E3-07 🟠 `creditBalance` 17,00 conta o crédito duas vezes (corrigido)**

- Onde: T54 CA5.
- Problema: D2 §4.3 e `InvoiceChain.creditBalance()` definem `creditBalance` = `creditCarry` da **última** fatura da cadeia. No cenário (5 parcelas futuras) a última fatura (25/03) tem `creditCarry` 0; os 17,00 já abateram a fatura de dez (183,00). O CA dizia `creditBalance` 17,00 e ao mesmo tempo `carryIn` 17,00 na seguinte.
- Correção aplicada: 0,00 no cenário, com o caso que dá 17,00 (cartão sem parcelas futuras).

**E3-08 🟠 T53 CA1 depende de campo que só a T54 entrega (corrigido)**

- Onde: T53 CA1 ("`Card.availableLimit` passa a 8.800,00").
- Correção aplicada: T53 confere o saldo do livro `CARD` (−1.200,00) e `availableLimitAfter` da prévia; o `Card.availableLimit` fica para T54 CA1.

**E3-09 🟡 Lista de `code` incompleta (corrigido)**: `CARD_INVALID_INSTALLMENT`, `TRANSACTION_NOT_CANCELABLE`, `CARD_NAME_*`, `CARD_INSTITUTION_TOO_LONG` existem no domínio e são usados nos critérios; `CARD_BILLING_CHANGE_NOT_HERE` é provisório. Adicionados à lista de T49.

**E3-10 🟡 Texto do risco dizia "6 componentes" (corrigido)** para o gate G-UI-E3, que são 8 tasks.

**Achados que ficam abertos (Etapa 3)**

- **E3-11 🟡 `impact.commitment` de `CARD_PURCHASE` (T53 CA1: 1.000,00).** `TransactionImpactCalculator` hoje devolve 0. O PR 01 diz "+1.000 (5 parcelas) + parcela 1 na fatura atual". O `/upcoming` conta a parcela 1 (200,00) dentro da fatura de 1.283,00 como compromisso. Se `impact.commitment` = 1.000,00, a tela do detalhe e o dashboard divergem em 200,00 até a fatura ser paga. Decidir (Arquitetura): `commitment` = Σ parcelas ativas em faturas não pagas (1.200,00 no dia da compra), alinhado ao dashboard; ou documentar que é "parcelas futuras" e rotular assim na API.
- **E3-12 🟡 `usedRatio`** deve ser limitado a 0..1 (disponível negativo ou crédito no cartão) e a barra precisa de texto para `overLimit`.
- **E3-13 🟡 T54 CA4/CA5 usam pagamentos antes de T55 existir.** Montar o estado por fábrica/gateway (T52 CA4 já grava `INVOICE_PAYMENT`), não pelo endpoint.
- **E3-14 🟡 T59 CA2**: `committed.d90` em 10/10 vai até 08/01 e inclui também a fatura de 05/01 (1.283 + 200 + 200 = 1.683,00), não só a de 05/12.
- **E3-15 🟡 `INVOICE_PAYMENT` na lista**: a resposta do `POST` é a `Invoice`, mas T52 grava a `Transaction`; definir qual `id` o front guarda para estornar (o do pagamento em `payments[].transactionId`, já no D2).
- **E3-16 🟢 Paralelismo FE na onda 2/3**: "T62 ∥ UI própria" pressupõe dois dev-frontend; com um só, a Etapa 3 de tela espera as 18 tasks de UI da faixa. Já anotado no roadmap (até 2 FE).

**Dependências, ondas e tamanho (Etapa 3)**: ordem T49/T50 → T51 → T52 → T53 → (T54 ∥ T56 ∥ T60) → T55 → (T57 ∥ T59) → T58 → T61 está correta e sem ciclos; T52 e T53 são as mais pesadas (mapper + gateway com carregamento único; refatoração do despacho), mas coerentes com um dono por task. Migrações: só `V3.00`/`V3.01`; por precaução reservar `V3.02`–`V3.05` para T53–T58 (ver R-02).

### 3.2 Etapa 4

- **E4-01 🟠 Contas de pacote (corrigido).** `LoanGivenHandler` etc. em `core/finance/app/transactions/handlers`; `CreateDebt`/`VoidDebtRecord` gravam no razão (`LedgerWriteGateway` é de `finance`) e vão para `core/finance/app/debts/usecase`; `RealizeOccurrence`/`SkipOccurrence` para `core/finance/app/recurrences/usecase`. CRUD de pessoa e leituras continuam em `core/debt/app`.
- **E4-02 🟠 Número errado em T81 CA2 (corrigido).** `Horizon.D30.endFrom(10/10)` = **09/11**; a Internet de 10/11 é o dia 31 e não entra em `d30`. `committed.d30` = 119 + 1.283 = **1.402,00** (1.521,00 só em `d60`). Cenário de T81 passou a fixar "início 10/10" (com início 10/09, como em T79 CA1, a ocorrência de 10/09 seria vencida e pendente e entraria em todos os horizontes, S-20).
- 🟡 T78: `Σ shares = amount` (pagar tudo "pelo João") é recusado como `SHARES_EXCEED_AMOUNT`; o caminho correto é `LOAN_GIVEN`. Documentar na mensagem/UX.
- 🟡 `V4.02` deve criar também a FK de `transactions.recurrence_id` (hoje coluna solta em `V1.06`).
- Conferido sem erro: caso 6/7/8 do PR 01 (caixa −300/+300, consumo 0, patrimônio 0 e recebível ±300; passivo 200 sem caixa); divisão de despesa (caixa −200, consumo 100, patrimônio −100; quitação do João não é renda); perdão sem despesa/receita (S-19); recorrência realizada sai das previsões e entra uma vez (índice `uq_transactions_recurrence_occurrence` já existe).
- Dependências: T75 (T52), T76/T80 (T53), T79 (T60) corretas; "T79 ∥ T74" na onda 2 só vale depois de T60 (E3 onda 5): o texto da onda já avisa.

### 3.3 Etapa 5 (✅)

- Números conferem (T92 CA4, T94 CA1, T95 CA1). Reserva sem posting (`T93 CA2`) e `reserved` só de contas `CASH` coerentes com S-21.
- 🟡 T94 e T95/T96 estendem `core.finance` enquanto a Etapa 4 mexe no mesmo `FinancialRecordsGatewayImpl`/dashboard: o plano já manda rebase.
- 🟡 `core/export` depende de quase tudo; está em fatia própria, sem ciclo (nenhuma feature depende dela). Ok.
- 🟢 T96: o último ponto da série M6 (abril) é parcial (hoje + 6 meses = 10/04); rotular o ponto como parcial.

### 3.4 Etapa 6 (✅)

- Isolamento das lentes financeiras garantido por teste (T113 CA1), markdown sem HTML bruto + sanitização, zip com limites. 🟡 `unaccent` não é `IMMUTABLE`: a busca é por varredura (aceitável até 5.000 notas, como o plano mede). 🟡 vínculo `INVOICE` precisa da regra de resolução de id de fatura sem linha (E3-03).
- Dependência corrigida no roadmap: PERSON/DEBT dependem de T74/T75, não de T79.

### 3.5 Etapa 7

- **E7-01 🟠 Contradição T124 CA3 × T126 CA7 (corrigido).** O `DuplicateClassifier` real só considera movimentações **ativas**; depois de estornar a original, a reimportação volta a `PENDING`. T124 dizia `DUPLICATE` por `original_dedup_key`. Alinhado com o código e com T126 CA7.
- **E7-02 🟠 `ref_id` nulo no índice único de notificações (corrigido).** No Postgres `NULL`s não colidem em índice único: `DAILY_SUMMARY` e `COMMITTED_NEXT_MONTH` (sem entidade) duplicariam a cada execução do job, contradizendo a garantia 4 de §4.3. `ref_id` nunca nulo (usa `user_id` ou chave do mês).
- **E7-03 🟠 Espelho da transferência importada é inimplementável como escrito (aberto).** S-167/T126 CA3 dizem que a linha espelhada do outro extrato "é `DUPLICATE`" da `TRANSFER` criada. A chave de dedup (`DedupKey`: conta, data, valor, descrição normalizada) não casa entre extratos de contas diferentes (descrições distintas: "TED ENVIADA" × "TED RECEBIDA"), e o `DuplicateClassifier` só compara com movimentação **manual** de **mesma conta e direção**. Sem um mecanismo novo, o segundo extrato importa a perna como `INCOME`/`EXPENSE` e conta a transferência em dobro (viola PR 01 regra 4). Exigir em T125/T126: `ExistingEntry` com as duas pernas de `TRANSFER` (ambas contas, direções opostas), regra "valor igual, data ±1 dia, conta contraparte, direção oposta → `POSSIBLE_TRANSFER`/`DUPLICATE_OF_TRANSFER` com decisão", e um IT com os dois extratos importados em ordem trocada. Também cobrir transferência **manual anterior** à importação.
- 🟡 `INVOICE_DUE`/`DEBT_*` "atrasada" geram 1 notificação por dia indefinidamente (limite semanal só existe para recorrência, T128 CA4): aplicar a mesma regra de frequência decrescente.
- 🟡 Job `@Scheduled`: ok para uma instância (ADR-001); registrar que escalar exige trava (índice único já protege).
- 🟡 T126 em `core/importing/app` formaria ciclo (corrigido: `core/finance/app/imports`).
- Verificado: nenhuma criação automática de `TRANSFER` (marca + decisão obrigatória, lote não aplica sem decisão, T125 CA5), pagamento de fatura no extrato do cartão `REJECTED` por padrão (S-168), parcela exige decisão, aplicar em uma transação, `Idempotency-Key` + índice único de `dedup_key` + `IMPORT_BATCH_NOT_PENDING` para `apply` concorrente, desfazer respeitando guardas e listando bloqueios, arquivo bruto não guardado, XXE e zip/arquivo grandes tratados.

### 3.6 Etapa 8

- **E8-01 🟠 Redação não cobre nomes de terceiros em PIX/TED (aberto).** S-182/T141b só mascaram nomes de **pessoas cadastradas** e números. Descrições de extrato brasileiro trazem o nome completo do favorecido ("PIX ENVIADO MARIA DA SILVA", "TED JOSE A. SOUZA") e CPF mascarado parcial. O nome de quem não está cadastrado seguiria ao provedor. Pedir regra adicional: para linhas de PIX/TED/transferência/DOC, enviar só o tipo (e a direção), descartando o trecho de favorecido; manter o resto da heurística; incluir esses casos no fuzz (T141b CA2, T148 CA3). A prévia aprovada mitiga (o usuário vê), mas não substitui a minimização.
- 🟡 Mensagem diária com IA (S-181, T147 CA4): a aprovação única ao ligar a opção precisa mostrar **o que será enviado** (os mesmos agregados) no consentimento da T149; hoje T149 só descreve o diálogo por prévia.
- 🟡 `AiPreview`: onde fica guardado o payload entre a prévia e a aprovação (15 min)? Tabela/cache servidor; se em memória, perde-se no reinício. Especificar.
- 🟡 O texto devolvido pela IA deve ser renderizado só como texto (sem Markdown/links) no front; o aterramento valida números, não links nem conselhos. Adicionar ao T150/T151.
- Verificado: chave só no backend (`AI_API_KEY`, mascarada em `toString`, logs, `/actuator`, `/v3/api-docs`, varredura do bundle), `none` padrão, app não sobe sem chave com `anthropic`/`fake` em `prod`, prévia → aprovação → envio do mesmo payload (hash), `AIAnalysis` com payload redigido apagado em 90 dias, limites/orçamento/disjuntor, prompt injection (dado delimitado + esquema + aterramento), sugestões em `PENDING_REVIEW` que usam os casos de uso do app, nada de notas do vault, regressão sem IA (T148 CA1, T152 CA1).

### 3.7 Roadmap e Flyway/contratos

- **R-01 🟡 Referência errada (corrigida):** matriz E6 B citava T75/T79 para PERSON/DEBT.
- **R-02 🟡 Flyway `out-of-order`.** Seguro desde que: (a) `out-of-order: true` **só** em `application-dev.yaml` (nunca no padrão/`prod`); (b) cada task tenha número reservado (E4, E5, E6, E7, E8 já têm; E3 só nomeia V3.00/V3.01: reservar V3.02–V3.05); (c) CI rode `flyway migrate` em banco limpo na ordem final e `validate` com `outOfOrder=false`, para provar que a ordem lexicográfica final é válida; (d) ITs e stack de E2E usam banco descartável, então só o banco de dev persistente sofre. Verifiquei que as migrações previstas são independentes entre etapas (V7.00 só acrescenta FK em `transactions`, V4.02 só tabelas novas), então a ordem de aplicação não importa. Prefixos numéricos: Flyway compara `3.01 < 3.10` como inteiros, sem armadilha.
- **R-03 🟡 "Contrato uma etapa à frente".** É viável (T62 só precisa de T49; `api:check` garante tipos = contrato), mas "só adições" não deve valer para operações ainda na lista de **pendentes** do `ContractCoverageIT`: os achados E3-03/E3-05 já mostram que o contrato escrito antes do código muda. Regra proposta: operação pendente pode mudar de forma incompatível (avisando o dev-frontend e regenerando tipos); depois que o handler é mesclado, só adições.
- **R-04 🟡 Concorrência de contrato:** T49 e T73 no M0 editam o mesmo `openapi.yaml`; manter merges sequenciais.

## 4. Correções aplicadas nos planos (registro)

| #   | Arquivo                                        | O que mudou                                                                                                                                                                                                                                 |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Etapa 3 §2.3                                   | Nova regra de pacotes (ArchUnit) e portas × casos de uso                                                                                                                                                                                    |
| 2   | Etapa 3 T51, T53, T54, T55, T56, T57, T58, T60 | Caminhos de `core/card/app`, `core/transaction/app`, `core/recurrence/app` → `core/finance/app/{cards,transactions,recurrences}`; T53 descreve o ponto de extensão real (`AccountTransactionFactory`/`CreateTransactionCommand`, `lockFor`) |
| 3   | Etapa 3 S-129                                  | `totalCommitted` = corrente + fechadas (sem `FUTURE`), identidade com o limite usado                                                                                                                                                        |
| 4   | Etapa 3 T54 CA5                                | `creditBalance` 0,00 (e o caso que dá 17,00)                                                                                                                                                                                                |
| 5   | Etapa 3 T53 CA1                                | Limite via livro `CARD`; `Card.availableLimit` é da T54                                                                                                                                                                                     |
| 6   | Etapa 3 T55 CA5                                | Trava do cartão e ordem global de travas; escopo de idempotência próprio                                                                                                                                                                    |
| 7   | Etapa 3 T58 CA4, CA7, CA7b; §4 `PUT`; T69 CA1  | `confirmedEffectiveFrom`; refresco das colunas de data das linhas; poda conta itens inativos                                                                                                                                                |
| 8   | Etapa 3 T50 CA4; T54 CA6                       | Resolução do id de fatura sem linha                                                                                                                                                                                                         |
| 9   | Etapa 3 §4 erros; riscos                       | Lista de `code` completa; "6 componentes" → 8 tasks                                                                                                                                                                                         |
| 10  | Etapa 4 T76, T77, T80                          | Pacotes (`finance/app/...`); `DebtGateway` em `core/debt/app/gateways`                                                                                                                                                                      |
| 11  | Etapa 4 T81                                    | Início 10/10; `committed.d30` = 1.402,00                                                                                                                                                                                                    |
| 12  | Etapa 7 T124 CA3                               | Estornada não bloqueia reimportação (alinha T126 CA7 e `DuplicateClassifier`)                                                                                                                                                               |
| 13  | Etapa 7 T126                                   | `ApplyImportBatch`/`UndoImportBatch` em `core/finance/app/imports`                                                                                                                                                                          |
| 14  | Etapa 7 T128                                   | `ref_id` nunca nulo no índice único                                                                                                                                                                                                         |
| 15  | Roadmap                                        | PERSON/DEBT dependem de T74/T75; nota de pacotes                                                                                                                                                                                            |

Nenhuma correção mudou escopo do MVP; nada foi commitado.

## 5. UI própria × trabalho em andamento do dev-frontend

### 5.1 O que existe hoje em `frontend/src` (verificado no código)

`overlay/{overlay-panel, popover-positioner, scroll-lock, live-announcer, viewport.service}`, `calendar/{calendar, month-grid, calendar-math}`, `forms/{select, checkbox, switch, date-picker, month-picker}` (já sem `option-select` nem `date-field`: sem alias), `disclosure/`, `tooltip/`, `segmented-control` sem `title`, tokens `--z-*`/`--shadow-popover`, i18n `common`. Telas migradas: Configurações, formulário de conta, Categorias. **Ainda nativos**: `filters-bar` (5 `<select>`, 2 `type=date`, `type=month`, `checkbox`, `<details>`, `type=search`) e `refund-form` (`type=search`). Não existem: guarda de controles nativos, `/dev/ui-kit`, `focus-trap`, Dialog/Sheet/Menu como componentes, NumberStepper/TimePicker, Combobox, Tabs/Chip/ProgressBar/Skeleton, FilePicker/SearchField/PasswordField, DateRangePicker.

### 5.2 Mapa task × estado

| Task                            | Estado                                                                       | Observação                                                                                                                                                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T153 ADR-007 + spike            | **Pulada**                                                                   | A decisão FE-S-113 foi tomada de fato (primitivo próprio). Escrever a ADR **retroativa** com medições de bundle e uma checagem WebKit do código existente; não descartar nada                                           |
| T154 Guarda                     | **A fazer (o dev pretende fazer)**                                           | Reconciliar com a especificação (§5.4)                                                                                                                                                                                  |
| T155 Primitivos                 | **Parcial**                                                                  | Há popover/sheet (OverlayPanel), posicionamento, scroll-lock, anúncios, `visualViewport`. Faltam: `focus-trap` e `inert` no fundo, trava de rolagem robusta no iOS, UI Kit (`/dev/ui-kit`), teste de ausência no `dist` |
| T156 Select                     | **Feito** (verificar CA4 virtualização, CA7 ARIA, grupos/opção desabilitada) | Sem alias do nome antigo                                                                                                                                                                                                |
| T157 Checkbox/Switch/RadioGroup | **Parcial**                                                                  | Falta `RadioGroup`                                                                                                                                                                                                      |
| T158 Disclosure                 | **Feito** (verificar acordeão e `lazy`)                                      |                                                                                                                                                                                                                         |
| T159 Tooltip                    | **Feito** (verificar toque longo, `check-contrast`)                          |                                                                                                                                                                                                                         |
| T160 DatePicker                 | **Feito** (verificar máscara, 3 fusos, `todayIso`)                           | O plano manda manter a API de `DateField` e `calendar-grid` em `forms/date-picker`; na prática `DateField` foi removido e a grade ficou em `common/components/calendar`                                                 |
| T161 MonthPicker                | **Feito**                                                                    |                                                                                                                                                                                                                         |
| T162 DateRangePicker            | **A fazer** (o dev listou)                                                   | Reusar `app-calendar`                                                                                                                                                                                                   |
| T163 NumberStepper/TimePicker   | **A fazer**                                                                  | NumberStepper é do G-UI-E3                                                                                                                                                                                              |
| T164 Menu/Dialog/Sheet          | **A fazer**                                                                  | Sheet existe como modo do OverlayPanel; falta Dialog, Menu, refatorar `ConfirmDialog`                                                                                                                                   |
| T165–T167                       | **A fazer**                                                                  | Combobox, Tabs/Chip/ProgressBar/Skeleton, FilePicker/SearchField/PasswordField                                                                                                                                          |
| T168 Filtros                    | **A fazer**                                                                  | Bloqueada por T162, T165, T166, T167 (e SearchField)                                                                                                                                                                    |
| T169 Zerar baseline             | **A fazer**                                                                  | CA4 (nome antigo) já cumprido                                                                                                                                                                                           |
| T170–T172 UX                    | **Antecipação parcial**                                                      | O dev diz que faz "revisão de UX da jornada" e corrige o BUG-E2E-01                                                                                                                                                     |
| T173–T174                       | **A fazer**                                                                  |                                                                                                                                                                                                                         |

### 5.3 Conflitos e como reconciliar (sem retrabalho e sem dois conjuntos)

1. **Um só primitivo: `OverlayPanel`.** O plano descreve `Popover` (diretiva) + `Dialog` + `Sheet` separados; o código tem um painel único com modo `popover|sheet|auto`. Adotar o `OverlayPanel` como **o** primitivo (renomear no plano). T164 deve **extrair/compor** `Dialog` e `Sheet` a partir dele (e `Menu`), não criar uma segunda pilha de overlays. Corrigir antes de T164: foco preso hoje é só tratamento de `Tab` no modo sheet (sem `inert` no fundo, leitor de tela ainda lê a página atrás); `scroll-lock` por `overflow:hidden` não segura o rubber-band do iOS (T155 CA4 pede lock sem pular para o topo); a pilha de `Esc` está em variável de módulo (ok, documentar).
2. **T153 retroativa.** Escrever a ADR-007 agora com: lista FE-S-112, decisão FE-S-113 (própria, com o plano B CDK), tabela APG, tokens de z-index, e **uma medição WebKit/iPhone do overlay existente** (teclado virtual, rolagem de fundo). Se a medição reprovar, a ADR registra a troca; a API dos componentes não muda (cláusula já prevista).
3. **z-index.** `--z-toast: 40 < --z-dialog: 50 < --z-popover: 60`: um toast de erro disparado de dentro de um `Sheet` (ex.: falha de pagamento da fatura) ficaria **atrás** do modal. Definir toast acima de dialog/popover (tooltip por último).
4. **Guarda (T154) × a que o dev vai escrever.** Se for um script mais simples (regex), **evoluir** para a especificação (AST com `@angular/compiler`, baseline que só diminui, allowlist com motivo, fixtures `bad/good`, runtime Playwright) em vez de manter duas guardas. O baseline real hoje é de 12 ocorrências em 2 arquivos (T154 CA2 fala em 18: atualizar o número para o que existir no dia da criação; o script falha se a lista divergir).
5. **Nomes e caminhos.** Atualizar T156/T160/T169 (sem alias, `OptionSelect`/`DateField` já removidos), T160–T162 (`common/components/calendar/*` em vez de `forms/date-picker/calendar-grid`).
6. **UI Kit (`/dev/ui-kit`).** Não existe e T173 depende dele. Criar antes de T163+ (junto de T155), para cada componente novo já nascer documentado e testável por teclado.
7. **Revisão de UX (T170–T172).** Tratar a passada do dev como **auto-revisão prévia**: insumo para T170. Manter T171 independente (revisor) depois de T169, com o projeto WebKit; não contar a passada como substituta, para a revisão cobrir as telas novas e as de cartão.
8. **BUG-E2E-01.** É 🟡 de front (scroll horizontal a 375 px em `/quick-add`, causado pela dica `visually-hidden` do botão desabilitado "Crédito" dentro do `SegmentedControl`). A correção natural já é parte do `Tooltip` (T159 CA5) e da habilitação do "Crédito" (S-132, Etapa 3): remover o `test.fail` de `matrix.e2e.ts` quando corrigir.
9. **Gate G-UI-E3 (T155, T156, T158, T159, T160, T163, T164, T166).** Hoje cumprido: T156, T158, T159, T160; parcial: T155; **faltam: T163 (NumberStepper), T164, T166 (Tabs, ProgressBar)**. Para destravar T64–T71 mais cedo: ordenar T163 com NumberStepper primeiro (TimePicker depois), T164 com Dialog/Sheet/Menu e T166 com Tabs+ProgressBar primeiro (Chip/Skeleton depois). T62/T63 (tipos e módulos) não dependem da UI e podem rodar já após T49.

### 5.4 FE-S-112 e FE-S-113 para um PWA mobile-first

- **FE-S-112 (proibir `title` e `<form>` sem `novalidate`): razoável.** `title` nunca aparece no toque, é inconsistente no teclado e some em leitores; trocar por texto visível ou `aria-label` + `Tooltip` (FE-S-118) é correto. A regra de `novalidate` é barata: o Angular já injeta `novalidate` em `<form>` com `FormsModule`/`ReactiveFormsModule`, então ela só pega formulário fora desses módulos. Ressalvas: permitir `<svg><title>`; manter `type="email"/"tel"/"url"` (os formulários têm `novalidate`); registrar que `type="number"` é proibido por UX no iOS e substituído por `inputmode` + `NumberStepper`.
- **FE-S-113 (overlay próprio, sem `@angular/cdk`): razoável e já assumido.** O custo/risco real não é código (há ~540 linhas), é iOS Safari e acessibilidade. Mitigação: ADR retroativa com medição WebKit, `inert` no fundo, scroll lock robusto, testes de teclado (T173) e o plano B do CDK restrito a T155 (a API dos componentes não muda). Não há motivo para trocar agora.

## 6. Pendências por dono

**Produto**: (1) "Total comprometido no cartão" = 1.283,00 ou 2.283,00 (E3-06); (2) `impact.commitment` da compra parcelada (E3-11); (3) confirmar S-119, S-121, S-122, S-124, S-136 (alto impacto); (4) PR 00 §17 pede imagem em meta: S-149 deixa fora; (5) política de redação de favorecido em PIX/TED (E8-01).
**Arquitetura**: ADR-006 (ordem de travas, id de fatura, refresco de datas); regra de contratos pendentes mutáveis (R-03); Flyway (R-02); mecanismo de espelho de transferência na importação (E7-03); onde persistir `AiPreview`.
**Backend (orquestrador)**: reservar V3.02–V3.05; T128 repetição de "atrasada"; V4.02 com FK de recorrência.
**UX/Frontend**: ADR-007 retroativa, UI Kit, z-index de toast, ordem T163/T164/T166 para o gate, atualizar nomes/caminhos no plano da UI (T154 CA2, T156, T160–T162, T169).
**Tester**: incluir nos ITs da Etapa 3 a concorrência compra × pagamento (card-level), o refresco de colunas de data da fatura e a resolução do id de fatura sem linha.

## 7. Tasks liberadas para começar

- **Backend, agora** (documentos; T44 está concluído, 46/46 no QA E2E da Etapa 2): **T49 ∥ T50**, já com os ajustes acima. Em seguida **T51 → T52 → T53**.
- **Frontend, agora**: continuar a UI própria na ordem do gate: concluir **T155** (focus-trap/inert/scroll-lock iOS/UI Kit), **T153 retroativa**, **T154**, depois **T163 (NumberStepper)**, **T164 (Dialog/Sheet/Menu)**, **T166 (Tabs, ProgressBar)**, e **T157 RadioGroup**, **T162**, **T165**, **T167**, **T168**, **T169**. **T62/T63** (tipos e módulo `cards`) podem iniciar assim que T49 for mesclada, sem depender da UI.
- **Preenchimento sem conflito** (só depois de T49 mesclada, para não disputar `openapi.yaml`): **T92** (domínio de metas, puro), **T91**, **T73** (contrato E4, sequencial a T49).
- **Não iniciar ainda**: T64–T71 (esperam G-UI-E3), T53 (espera T52), T75/T76/T79 (esperam T52/T53/T60), T126/T128 (esperam E3–E5).

## 8. Parecer geral

**🟡 Aprovado com ajustes.** Os ajustes de texto, nome, pacote e número já estão nos planos; restam as decisões abertas da §6, nenhuma bloqueando T49/T50/T51. Nenhum achado 🔴. Os dois riscos mais sérios de integridade financeira (compra em fatura que um pagamento concorrente acabou de quitar; transferência importada contada em dobro) têm correção descrita e viram critérios de teste da Etapa 3 e 7.

**Não avaliado**: código das Etapas 3 a 8 (inexistente), iPhone/VoiceOver reais, AWS, provedor de IA e push reais.
