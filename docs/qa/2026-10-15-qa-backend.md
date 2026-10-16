# QA do backend: adequação ao resumão (plano rev 3, blocos A a I)

Data: 2026-10-15 · Tester · Plano `docs/planos/2026-10-15-adequacao-ao-resumao.md` (rev 3) · Parecer anterior `docs/revisoes/2026-10-15-codigo-backend-lotes-2-4.md` (item H6) · PR 01 · Contrato `backend/contracts/openapi.yaml` 2.32.x.

Nenhum código de produção foi alterado. Só arquivos de teste e fixtures foram criados ou editados. Nada foi commitado.

## 1. Resumo

O código dos blocos A a I roda contra um Postgres real e, na maior parte, **está correto no que importa para o PR 01**: razão sempre soma zero, rateio e recebimento nos dois modos, estorno e cancelamento proporcionais (o 🔴 C1 da revisão está corrigido), guardas do Pix no crédito (C2 corrigido), migração das marcas antigas sem dupla contagem, INSS e IRRF batendo com a conta feita à mão, composição de novembro batendo ao centavo, simulador, ativos, imóvel, alertas e as migrações V9.00 a V9.21 aplicadas (inclusive sobre dados legados).

Mesmo assim o **parecer é 🔴 Reprovado**, por um defeito que derruba o fluxo principal e dois que corrompem leitura financeira:

- 🔴 **BUG-01**: toda leitura que precisa de tabela fiscal responde `500` (SQL com `tax_tableswhere`). Isso inclui prévia do perfil de renda, geração de ocorrências, `owner-statement` com perfil, simulador e a geração de alertas. 47 dos 150 testes novos de integração falham no repositório por causa disso.
- 🟠 **BUG-02**: o consignado nunca vira `PAYROLL` no banco (`@Column(updatable = false)`), então as exclusões de "parcela a vencer" nunca valem.
- 🟠 **BUG-03**: o "a receber" da pessoa fica **maior que o razão** depois de estornar parcialmente uma compra rateada (125,00 na tela contra 115,00 no razão no caso mínimo).

Totais desta rodada (instantâneo do repositório às 18:25, estável até o fim; `main/` não mudou depois):

| Bateria | Executados | Passou | Falhou |
|---|---|---|---|
| Unitários (surefire), inclui 6 novos | 2226 | 2222 | 4 |
| Integração (failsafe), inclui 150 novos | 1072 | 1007 | 65 |
| Testes novos de integração (150, no repositório como está) | 150 | 103 | 47 |
| Testes novos de integração + `NewTablesConstraintsIT` (155), com BUG-01 e BUG-02 contornados numa cópia isolada | 155 | 144 | 11 |
| Testes novos unitários (6) | 6 | 6 | 0 |
| ArchitectureTest | 10 | 10 | 0 |
| FlywayMigrationIT / SchemaDomainAlignmentIT (`ddl-auto: validate`) / CompositeUserForeignKeysIT | 39 / 15 / 12 | todos | 0 |

Os 11 que ainda falham na cópia isolada são todos bugs de código ou de contrato (seção 4), nenhum é teste quebrado.

## 2. Ambiente, método e ressalvas

- JDK 21 (`JAVA_HOME` do CLAUDE.md), `./mvnw verify`, Testcontainers com a imagem de `it-images.properties`. Docker disponível.
- **A árvore de produção mudou durante a sessão**: o dev-backend continuou editando `main/` em paralelo (backup/restore, `Provenance`, gateways). Por isso a bateria final foi rodada sobre um **instantâneo isolado** do repositório (cópia fora do repo, sem tocar no `target/` do dev), às 18:25. Conferi depois que nenhum arquivo de `main/` ficou mais novo que o instantâneo.
- Para enxergar o que existe **por baixo** do BUG-01 (que bloqueia 40 testes), repeti os testes novos numa segunda cópia isolada com dois contornos locais, **fora do repositório e nunca commitados**: (P1) espaço no SQL de `TaxTableGatewayImpl`; (P3) remover `updatable = false` de `DebtEntity.kind`. Os resultados "com contorno" abaixo vêm dessa cópia. Os resultados "no repositório" vêm do instantâneo sem contorno.
- Um terceiro contorno (P2, `Provenance.isEstimated()` serializado como `estimated`) foi necessário no começo e **deixou de ser necessário**: o dev corrigiu no meio da sessão.
- Dados: tudo sintético (Ana, Beto, "Financeira Exemplo", Cartão A/B, valores redondos). Nada de `~/.moneylog`, nada do resumão. Os logs da aplicação do instantâneo foram varridos por valores e nomes das fixtures: nenhuma ocorrência (varredura por texto, não é um teste automatizado).
- A concorrência é probabilística (5 a 8 rodadas por cenário, travas com latch). Passou em todas as rodadas, o que não prova a ausência de deadlock raro (ver risco R-3).

## 3. Bateria existente: o que quebrou, por quê e o que fiz

Linha de base **antes de qualquer alteração minha** (`./mvnw verify`, 21 min): unitários 2213 executados, 13 falhas; integração 918 executados, 28 falhas e 55 erros. ArchitectureTest 10/10 e SchemaDomainAlignmentIT 15/15 passaram.

### 3.1 Bugs de código ou de contrato que derrubavam testes antigos

| Causa | Testes derrubados | Situação hoje |
|---|---|---|
| `Provenance.isEstimated()` vazava `estimated` no JSON (resposta fora do contrato) | ~50 (RecurrencesIT, OccurrencesIT, CommitmentSourcesProofIT, QA T82/T98/T190, ExportsIT, ProjectionIT, ...) | **Corrigido pelo dev durante a sessão** |
| `purchase-preview` e `ongoing-installments/preview` com `splitMode: null` | 6 (CardPurchaseIT x4, DebtOverviewIT, CardBordersQaIT) | Aberto: BUG-04 |
| Insights sem `view` e com `items`/`insufficient` fora do schema | 11 de 13 em InsightsIT | Aberto: BUG-05 |
| Exemplos do contrato sem `view` | Etapa5ContractTest, Redesign260ContractTest | Aberto: BUG-08 |
| Tabela de códigos de erro do contrato x constantes | ContractErrorCodesTest x2 | Aberto: BUG-10 |

### 3.2 Testes quebrados (desatualizados): corrigidos por mim

| Teste | Por que estava quebrado | Correção |
|---|---|---|
| `Redesign260ContractTest.deveDeclararAVersaoEAsRotas` | exigia a versão exata 2.20.0 | aceita 2.20.0 ou posterior |
| `RecorrenciaDeRendaCompetenciaTest.deveValidarODeslocamento` | ADR-017 foi emendada: deslocamento `-1` é válido | `-1` aceito, `-2` recusado |
| `LentesFinanceirasTest.deveFecharORazao` (7 casos) | exigia que a fixture cobrisse as 8 fontes de posting; cobre as 4 antigas | exige exatamente as 4 antigas (as novas são cobertas nos ITs novos) |
| `DebtMigrationQaIT`, `CardMigrationQaIT`, `GoalMigrationQaIT`, `NoteMigrationQaIT`, `MigrationUpgradeQaIT` | contagem fixa de migrações (29, 31, 26, 25, 38) e versão final fixa `8.17` | contagem e versão final calculadas a partir de `db/migration` (`MigrationFiles`); a lista até a V8.17 continua fixa |
| `FlywayMigrationIT` (2 testes) | colunas `fx_rate` NUMERIC contavam como dinheiro; tabelas novas sem `id`/`user_id`/timestamps | só as duas colunas de câmbio são decimais; convenções relaxadas só para as 17 tabelas V9, onde a coluna existe |
| `CompositeUserForeignKeysIT` | tabelas fiscais globais têm FK simples | lista explícita das duas FKs |
| `CardsIT.naoDeveGuardarDadosSensiveis`, `CardSecurityQaIT` (2 testes) | proibiam `brand` e `last_digits`, que o bloco I1 introduziu | passam a permitir só os campos do I1 e seguem proibindo número, CVV, PAN, titular e validade |
| `ContractErrorCodesTest.deveExistirNoCodigoTodoCodeDaTabela` | a leitura da tabela pegava palavras de enum (`AMOUNT`, `FGTS`, `FIXED`, `LOAN`, `RESERVED`, `VARIABLE`) | essas seis são ignoradas; sobram só os dois achados reais (BUG-10) |

### 3.3 Em andamento no dev (não toquei)

- `GoalExportQaIT.backup` espera `schemaVersion = 1` e o backup agora declara `2` (trabalho de backup/restore do dev). Teste desatualizado, dono: dev.
- O ArchitectureTest chegou a acusar um ciclo `finance -> income -> recurrence -> finance` às 18:14 numa árvore intermediária do dev; no instantâneo das 18:25 passou 10/10. Reconferir no fechamento do dev.

## 4. Bugs

Severidade: 🔴 bloqueia o fluxo ou o PR 01 · 🟠 alto · 🟡 médio · 🟢 baixo.

### BUG-01 🔴 Tabelas fiscais: `500` em toda leitura de renda líquida
- **Camada:** back · `backend/src/main/java/com/moneylog/infra/income/gateways/TaxTableGatewayImpl.java` (constante `SELECT` linhas 26 a 31 e concatenações nas linhas 40 e 50).
- **Passos:** criar um perfil de renda; `GET /v1/income-profiles/{id}/preview?month=2026-10`. Equivalente: `POST .../generate-occurrences`, `GET /v1/owner-statement` com perfil, `POST /v1/simulations/purchase` e `GenerateNotifications` (que lê o `owner-statement`).
- **Esperado:** `200` com INSS e IRRF calculados.
- **Obtido:** `500 INTERNAL_ERROR`.
- **Evidência:** `PSQLException: ERROR: syntax error at or near "="`; SQL gerado `... from tax_tableswhere kind = ? and effective_from <= ? ...`. Os text blocks removem a quebra final e a concatenação `SELECT + """ where ..."""` cola `tax_tables` e `where`. 40 testes novos falham por isso no repositório (PayrollTaxIT 9, PurchaseSimulationIT 10, OwnerStatementNovemberIT 8, PayrollLoanIT 6, RealEstateIT 3, ContractShapeBugsIT 2, NovembroFixtureIT 1, DebtLockConcurrencyIT 1).
- **Impacto:** o aceite F2, B2c, E2 e I3 ficam inutilizáveis; para qualquer usuário com perfil de renda o resumo do mês, o simulador e os alertas quebram.
- **Correção sugerida:** um espaço antes de `where` (por exemplo `SELECT + " " + """..."""` ou terminar o `SELECT` com `\s`).

### BUG-02 🟠 O consignado nunca é marcado como `PAYROLL`
- **Camada:** back · `backend/src/main/java/com/moneylog/infra/debt/persistence/DebtEntity.java` (campo `kind`: `@Column(..., updatable = false)`; o mesmo vale para `channel`).
- **Passos:** criar dívida `PAYABLE` (`MONEY_RECEIVED` com `newDebt`), criar perfil com rubrica `LOAN` apontando para ela; `GET /v1/debts/{id}`.
- **Esperado:** `kind = PAYROLL`; fora de "a vencer", de `/v1/debts/overview`, de `/v1/dashboard/upcoming` (`undated`) e do filtro `overdue`; ao tirar a rubrica volta a `PERSONAL`.
- **Obtido:** `kind = PERSONAL` sempre. `Debt.markPayroll()` e `unmarkPayroll()` mudam o objeto, o gateway chama `defineKindAndChannel`, mas o JPA ignora a coluna no `UPDATE`. A parcela do consignado aparece como obrigação a pagar enquanto a folha já a desconta (risco de pagar duas vezes), e o achado M1/M2 da revisão não tem efeito.
- **Evidência:** `PayrollLoanIT.consignadoNaoFicaVencido` ("expected PAYROLL but was PERSONAL"); `parcelaVinculadaNaoDuplica`; `rubricaRemovidaLiberaADivida`. Passam todos com `updatable` removido (cópia isolada). A realização da folha em si (N + p, soma zero, principal baixado uma vez) funciona.
- **Correção sugerida:** remover `updatable = false` de `kind` (e decidir para `channel`); manter o teste de persistência.

### BUG-03 🟠 "A receber" da pessoa maior que o razão depois de estorno parcial de compra rateada
- **Camada:** back · leitura de a receber (`core/finance/domain/ThirdPartyReceivables`, `CardShareReceivables.PurchaseLine.pending()` com piso em zero) e, por consequência, `receivablesPending` do `owner-statement`.
- **Passos:** compra de 100,00 rateada 50/50 com Ana no Cartão B; estorno de 20,00 (`REFUND` com `refundOfTransactionId`); `GET /v1/debts/third-party-receivables`.
- **Esperado:** razão `RECEIVABLE(Ana)` = 115,00 (75,00 de outra compra + 40,00); `pending` da Ana = 115,00; em cada mês `owed = received + pending`.
- **Obtido:** `pending` = 125,00 (o razão está certo, a tela está errada). O mês do estorno vem com `owed` negativo e `pending` truncado em 0,00, e a soma dos meses não bate com o total da pessoa.
- **Evidência:** `ThirdPartyReceiptModesIT.estornoParcialReduzOAReceber` ("tela de a receber precisa bater com o razão: expected 115.00 but was 125.00"); `SharedPurchasePropertyIT` (200 cenários) lista as categorias `LINHA_DO_MES_NAO_FECHA` e `SOMA_DOS_MESES_DIFERE_DO_TOTAL_DA_PESSOA`. As outras invariantes da ADR-022 passaram em todos os 200 cenários (Σ postings = 0, `MINE + pendente + recebido = GROSS`, receber não muda consumo nem renda, ACCOUNT mantém e "já no saldo" reduz o patrimônio em X, `PUT shares` só reclassifica).
- **Impacto:** o dono cobraria da Ana mais do que ela deve.

### BUG-04 🟡 `splitMode: null` nas prévias viola o contrato
- **Camada:** back/contrato · `POST /v1/cards/{id}/purchase-preview` e `POST /v1/cards/{id}/ongoing-installments/preview` (`/purchase/splitMode`).
- **Esperado:** campo ausente ou enum válido (`PurchasePreview.splitMode` não é nulável). **Obtido:** `null`.
- **Evidência:** CardPurchaseIT (4), DebtOverviewIT (1), CardBordersQaIT.calendarioContraOraculo, ContractShapeBugsIT.previaSemRateio.

### BUG-05 🟠 Insights: contrato e código divergem (`view` ausente)
- **Camada:** contrato + back · `GET /v1/insights/daily|monthly|history`.
- **Esperado (A3c):** resposta com `view` (`MINE` padrão, `GROSS` aceito). **Obtido:** sem `view`; o schema publicado ainda rejeita `items` e `insufficient` como propriedades não avaliadas.
- **Evidência:** InsightsIT 11 de 13 em erro; ContractShapeBugsIT.insightsComView.

### BUG-06 🟡 Recorrência com deslocamento `-1` viola o contrato
- **Camada:** contrato · `GET /v1/recurrences` devolve `incomeCompetenceOffsetMonths: -1` (saldo pago no mês seguinte, ADR-017 emendada) e o schema ainda tem `minimum: 0`.
- **Evidência:** ContractShapeBugsIT.deslocamentoMenosUmNoContrato.

### BUG-07 🟡 `PUT /v1/income-profiles/{id}`: o schema de entrada é impossível de satisfazer
- **Camada:** contrato · `IncomeProfileUpdate` é `allOf` do `IncomeProfileInput` (`additionalProperties: false`) com `version`. Qualquer corpo com `version` é recusado pelo validador. A API em si aceita o corpo.
- **Evidência:** ContractShapeBugsIT.putDoPerfil, PayrollLoanIT.putDoPerfilRespeitaOContrato.

### BUG-08 🟡 Prévia do perfil omite `debtId` e exemplos do contrato sem `view`
- **Camada:** back/contrato.
  - `GET /v1/income-profiles/{id}/preview`: `fixedDeductions[].debtId` é obrigatório no schema e vem omitido quando nulo (ContractShapeBugsIT.previaDoPerfilComRubrica, PayrollLoanIT.previaRespeitaOContrato).
  - Os exemplos de `MonthlySummary`, `IncomeExpenseSeries` e `SpendingByCategory` no contrato não têm o `view` obrigatório (Etapa5ContractTest.deveValidarOsExemplos, Redesign260ContractTest.deveValidarOsExemplosEFecharAAritmetica).

### BUG-09 🟡 `receivablesPending` do resumo do mês usa outra data que as saídas
- **Camada:** decisão de produto + back (`OwnerStatement.pendingReceivables`).
- **Passos:** fixture de novembro: faturas de outubro vencendo em novembro carregam 116,66 de partes de terceiros (Ana 50,00 + 33,33, Beto 33,33).
- **Esperado (leitura do P-3):** a coluna de novembro mostra o que me devem das saídas de novembro: 116,66. **Obtido:** 50,00 (só o que tem competência de consumo em novembro).
- **Evidência:** OwnerStatementNovemberIT.receivablesPendingDeNovembro. Precisa de decisão: se o certo é por competência, a ADR-023 deve dizer e o teste muda; se for pelo vencimento da fatura, é bug.

### BUG-10 🟢 Tabela de códigos de erro do contrato
- `COMMITMENT_CLAUSES_INVALID` está na tabela do contrato e não existe no código; `CARD_BRAND_TOO_LONG` existe no código e não está na tabela. Evidência: ContractErrorCodesTest (2).

### BUG-11 🟡 O alerta `DOCUMENT_DIVERGENCE` nunca é gerado
- **Camada:** back · `AlertInputsLoader.load` passa `List.of()` como documentos, sem fonte do valor documentado. O gerador está correto (AlertGeneratorsTest cobre a tolerância: igual não avisa, 1 centavo acima avisa), mas o aceite de I3 não pode disparar de ponta a ponta.

### BUG-12 🟢 CHECK do banco permite adiantamento pela metade
- **Camada:** back/migração · `ck_income_profiles_advance` (V9.05) aceita `advance_day = 16` com `advance_bps NULL` (NULL em CHECK vale verdadeiro). O domínio protege; o banco não. Evidência: NewTablesConstraintsIT.adiantamentoMeioPreenchido.

### BUG-13 🟢 Validação de entrada devolve `422` onde o schema sugere `400`
- Simulador (`installments` 0 e 37, `interestRatePerMonthBps` 10001 → `422 SIMULATION_INVALID`) e `lastDigits` com 5 dígitos ou letras → `422`. O contrato declara `minimum`/`maximum`/`pattern`. Não é erro grave; só inconsistência com o restante da API.

### Divergências de especificação (não são bugs de código)

- **D-1 (ADR-022 §7 e plano A2b):** "o patrimônio antes e depois de editar o rateio é o mesmo" é aritmeticamente falso. `PUT shares` de 50/50 para 70/30 reclassifica `RECEIVABLE` em `EXPENSE` e o patrimônio cai exatamente o aumento da minha parte (20,00 na 1ª parcela do caso). O código está certo; a ADR e o plano devem ser corrigidos. `CARD` e caixa de fato não mudam (testado).
- **D-2 (plano A2b):** "editar o valor da compra recalcula as partes" não é possível: o contrato recusa mudar `amount` (`422 TRANSACTION_NOT_EDITABLE`, testado). Editar rateio de compra com estorno também é recusado.
- **D-3 (rev 3, janela de novembro):** o simulador calcula só novembro, então toda compra com 2 ou mais parcelas sai `RISKY` com `HORIZON_LIMITED`. Consistente com a rev 3, mas esvazia a classificação para o uso principal.
- **D-4:** `PurchaseGroupMember.remainingInstallments` descreve "não vencidas" e o código conta "não pagas" (`status != PAID`).
- **D-5:** o critério "outro usuário recebe 404" não se aplica a `owner-statement` e a listas: o endpoint devolve o resumo vazio do próprio usuário (testado, sem vazamento).
- **D-6:** lacunas de numeração `V9.14` e `V9.17` (achado L1 da revisão), conferidas no `flyway_schema_history`; o Flyway valida. Decidir se são números reservados.
- **D-7:** conta aberta no mesmo mês de um `from` no passado não entra no saldo final (o saldo inicial da conta não é entrada). Caso de borda; `from` posterior à abertura fecha certo (testado, M6 da revisão está corrigido).

## 5. Casos executados

"Repo" = instantâneo sem contorno. "Cópia" = com BUG-01 e BUG-02 contornados.

### T0: fixtures sintéticas de novembro/2026
`backend/src/test/resources/db/it/novembro-2026/cenario.json` carregado por `ResumaoItBase.loadFixture` (passos via API real, com substituição de ids). Cobre: Conta A, Ana, Beto, Financeira Exemplo; Cartão A (fecha 25, vence 5) e Cartão B (fecha 20, vence 10); mercado dividido em três (EQUAL 100,00); jantar 300,00 em 3x 50/50 (BPS); Notebook agrupado A 8x110 na 4ª parcela e B 4x45; assinaturas USD 5,00@5,000000 com IOF 350 bps, semanal 5,30, empresa 30,00 e streaming (mesmo `overlapGroup`); consignado de 3.000,00 em folha; perfil de renda (bruto 8.000,00, 1 dependente, adiantamento 40% no dia 16, saldo dia 1, sindicato 50,00, consignado 300,00 com juros 40,00, 13º); imóvel com 3 parcelas (2.400, 6.500, 3.500), cotas e cláusulas; Pix no crédito 1.000,00 em 4x de 280,00; condomínio boleto fixo 800,00; gasto Pix variável 120,00. **Passou (cópia); no repo falha por BUG-01.**

### Blocos A e B (rateio, a receber, migração, resumo do mês)
| Caso | Repo | Cópia |
|---|---|---|
| Criação 300,00 em 3x 50/50: por parcela EXPENSE +50, RECEIVABLE(Ana) +50, CARD -100, soma zero, fatura cheia 100,00, `shareByPerson` | passou | passou |
| EQUAL 3 pessoas (33,33 / 33,33 / 33,34 em todas as parcelas); BPS 3333/3333 | passou | passou |
| SHARES_INVALID (soma, pessoa repetida, AMOUNT) sem gravar; prévia idêntica à criação; fatura paga não cria despesa | passou | passou |
| MINE x GROSS: resumo, dashboard, entries e relatório por categoria coincidem (90,00 / 140,00) | passou | passou |
| Sem rateio = números de sempre (regressão); pessoa de outro usuário recusada; sem token 401 | passou | passou |
| PUT shares em fatura aberta e fechada (P-6), revisão gravada, CARD e caixa intactos | passou | passou |
| SHARES_BELOW_RECEIVED, 409 de versão, SHARES_INVALID, 404 de outro usuário, valor imutável | passou | passou |
| Estorno total e parcial proporcionais (C1), estorno acima do original recusado, excedente recebido vira PAYABLE (P-28b), cancelar 2 de 3, estorno da compra com recebido | passou | passou |
| Recebimento nos dois modos (ACCOUNT mantém patrimônio; já no saldo: `RECEIVABLE -X / EQUITY +X`, fonte `THIRD_PARTY_RECEIPT_IN_BALANCE`, patrimônio -X, consumo e renda intactos) | passou | passou |
| Replay com mesma `Idempotency-Key`; chave obrigatória sem conta (400); excesso 422; DELETE (desfaz o razão por inteiro) | passou | passou |
| Concorrência (ADR-008): 2 e 6 recebimentos, recebimento x PUT shares, recebimento x estorno, recebimento x arquivar conta; dívida x conta (folha x pagamento, estorno do Pix x pagamento) | passou | passou |
| A2c: dry-run não grava, hash estável, `apply` com hash, idempotência, sem backup 422, hash errado 409, dado mudou 409, nada elegível 422, `r > t` vira exceção sem bloquear as outras, REFUND neutralizado, `MINE + pendente + reembolsado = P`, caixa igual, patrimônio sobe em `receivableRecognized`, GROSS igual sem reembolso | passou | passou |
| Propriedade, 200 cenários (semente fixa): Σ postings = 0 e invariantes da ADR-022 | **falhou (BUG-03)** | **falhou (BUG-03)** |
| Estorno parcial reduz o a receber da pessoa | **falhou (BUG-03)** | **falhou (BUG-03)** |
| Composição de novembro: cartões 569,52 (bruto 716,18), assinaturas 51,18, fixo 800,00, variável 120,00, imóvel 1.500,00, saídas 2.989,52, empresa 30,00, sobra 2.753,25, saldo final 11.753,25 (conta feita à parte) | falhou (BUG-01) | passou |
| Dedup das assinaturas antes e depois de lançadas (4 ocorrências) e câmbio 5,2 substituindo a previsão (+1,03) | falhou (BUG-01) | passou |
| Fatura no vencimento (novembro, não outubro); transferência não é saída; imóvel sem cota (valor cheio + aviso) e com cota; mês negativo e encadeamento do saldo; `INCOME_MISSING`; parâmetros inválidos 400; isolamento; `from` no passado | falhou (BUG-01) | passou |
| `receivablesPending` de novembro | falhou (BUG-01) | **falhou (BUG-09)** |

### Bloco F (renda, INSS/IRRF, consignado, Pix no crédito, TIR)
| Caso | Repo | Cópia |
|---|---|---|
| INSS/IRRF com valores calculados à mão em 6 pontos: 3.000, 5.000 (1 dep.), 5.500 (desconto simplificado + redutor), 6.000, 8.000 (0 e 2 dep.), 12.000 (teto): ex. 3.000 → INSS 248,60; 8.000 → INSS 921,51 e IRRF 1.037,85; 12.000 → INSS 988,09 e IRRF 2.119,55 | falhou (BUG-01) | passou |
| Vigências distintas (tabelas fictícias rotuladas): INSS pela competência e IRRF pela data de pagamento no mês de transição (1.000,00 / 1.800,00 / líquido 7.200,00); correção por versão nova; `GET /v1/tax-tables` só leitura | falhou (BUG-01) | passou |
| Consignado N + p: ACCOUNT +5.742,77, EXPENSE +40,00 só de juros, renda do razão 6.042,77, principal 260,00 baixa a dívida uma vez, soma zero | falhou (BUG-01) | passou |
| Geração de ocorrências idempotente; 13º em novembro; rubrica fora do período; adiantamento + saldo = líquido; isolamento do perfil | falhou (BUG-01) | passou |
| Parcela vinculada fora de "a vencer", fora do vencido, rubrica removida libera a dívida | falhou | passou só com BUG-02 contornado |
| Pix no crédito (PR 01): ACCOUNT +1.000,00, EXPENSE só 120,00, CARD -1.120,00, sem renda; fatura 1.120,00 em 4; TIR 469 bps a.m. / 7.337 a.a. (referência independente); para terceiro vira RECEIVABLE; validações; replay; guardas C2 (editar, PUT shares, estorno parcial, cancelar restantes); estorno total | passou | passou |

### Blocos C, D, E, G, H, I
| Bloco | Casos | Repo | Cópia |
|---|---|---|---|
| C (compra agrupada) | aceite do Notebook (total 1.060,00, restante 730,00, última 05/03/2027), sem consumo retroativo, `commitments` até 2026-11 (535,00 / 485,00), rateio em membro (ongoing recusa rateio), cancelar restantes recalcula, vincular/desvincular, divergência P-26, DONE x ACTIVE, entradas inválidas, isolamento | 8/8 passou | 8/8 |
| D (assinaturas) | USD 25,88, semanal 22,97, total 98,85 / minha parte 68,85, sobreposição, `activeUntil`, câmbio por cobrança 25,88 e 26,91, compra em USD, validações, isolamento | 7/7 | 7/7 |
| E (simulador) | 6x sem juros (só novembro, `RISKY`), SUSTAINABLE, não grava, igual à prévia, com juros, cortes (47,11), INCOMPATIBLE (dois ramos), VIABLE_WITH_PLANNING, RISKY por financiamento, HORIZON_LIMITED, entradas inválidas | 0/10 (BUG-01) | 10/10 |
| G (ativos e reserva) | FGTS nunca disponível nem reserva, cobertura 3,0, meta de 6 meses, histórico de saldo, arquivar, sem ativos, isolamento | 7/7 | 7/7 |
| H (imóvel) | totais por pessoa, cotas inválidas, definir cota, marcar pago, FINANCING fora do pendente direto, cláusulas (retenção 770,00), CSV, regressão e isolamento | 5/8 (3 por BUG-01) | 8/8 |
| I1 (cartão) | padrões nulos, salvar e editar, final de compra e `PURCHASE_LAST_DIGITS_NOT_FROM_CARD`, sem quebra de fatura por final | 4/4 | 4/4 |
| I3 (alertas) | 9 alertas ponta a ponta com relógio controlado e sem duplicar no mesmo dia (autoDebit false/true/null, antecedência configurável, mês negativo, dívida antes do financiamento, custo do Pix, sobreposição, semanal, sem uso só com N, reembolso atrasado, saldo abaixo do imóvel, alerta desligado) + 5 unitários de bordas | 14/14 | 14/14 |

### Migrações
`MigrationV9UpgradeIT`: V8.17 com dados legados → V9.19 → V9.21: todas rodam; defaults do P-29 aplicados (despesa `VARIABLE`, recorrência de despesa `FIXED`); a V9.20 reescreve as fontes de recebimento sem mudar a soma do razão; `validate` ok; repetir não executa nada. `NewTablesConstraintsIT`: FKs compostas isolam usuário em rateios, cotas de imóvel (V9.21) e histórico de ativo; checks de FGTS, reserva, saldo, tabelas fiscais, fontes do razão. **Passou**, exceto BUG-12.

## 6. Testes adicionados (arquivos)

Pasta `backend/src/test/java/com/moneylog/infra/resumao/` (22 classes, 155 testes): `ResumaoItBase`, `NovembroFixtureIT`, `SharedPurchaseCreationIT`, `SharedPurchaseLifecycleIT`, `SharedPurchasePropertyIT`, `ShareLockConcurrencyIT`, `DebtLockConcurrencyIT`, `ThirdPartyReceiptModesIT`, `ShareMigrationIT`, `OwnerStatementNovemberIT`, `PayrollTaxIT`, `PayrollLoanIT`, `CardCashOutIT`, `SubscriptionsIT`, `PurchaseGroupIT`, `PurchaseSimulationIT`, `AssetsReserveIT`, `RealEstateIT`, `AlertsIT`, `CardProfileIT`, `ContractShapeBugsIT`, `MigrationV9UpgradeIT`, `NewTablesConstraintsIT`.

Unitários: `backend/src/test/java/com/moneylog/core/notification/domain/AlertGeneratorsTest.java` (5), `backend/src/test/java/com/moneylog/core/transaction/domain/PurchaseSharesPropertyTest.java` (200 cenários).

Apoio: `backend/src/test/java/com/moneylog/util/MigrationFiles.java`; fixture `backend/src/test/resources/db/it/novembro-2026/cenario.json`.

Editados por estarem desatualizados: `Redesign260ContractTest`, `RecorrenciaDeRendaCompetenciaTest`, `LentesFinanceirasTest`, `DebtMigrationQaIT`, `CardMigrationQaIT`, `GoalMigrationQaIT`, `NoteMigrationQaIT`, `MigrationUpgradeQaIT`, `FlywayMigrationIT`, `CompositeUserForeignKeysIT`, `CardsIT`, `CardSecurityQaIT`, `ContractErrorCodesTest` (todos em `backend/src/test/java/com/moneylog/...`).

Como rodar um grupo: `./mvnw verify -Dtest=NoSuchTest -Dsurefire.failIfNoSpecifiedTests=false -Dit.test='com.moneylog.infra.resumao.*IT' -Dfailsafe.failIfNoSpecifiedTests=false`.

## 7. Riscos e pendências

- **R-1:** enquanto o BUG-01 existir, nada que dependa de renda líquida (resumo do mês com perfil, simulador, alertas de mês negativo) pode ser validado no repositório. Depois da correção, rodar `com.moneylog.infra.resumao.*IT` de novo: espero 144 de 155 (os 11 restantes são BUG-03 a BUG-09, BUG-12).
- **R-2:** o dev segue alterando `main/` em paralelo. Os números valem para o instantâneo das 18:25; reexecutar a bateria completa ao fim de cada correção.
- **R-3:** o teste de concorrência de dívida e conta (achado H4) passou, mas a janela de corrida é estreita. A ordem de travas continua dependente de leitura de código; considerar um teste determinístico com `pg_advisory` ou `Thread` sincronizado em ponto de espera.
- **R-4:** o front ainda não foi testado contra a API: BUG-04, BUG-05, BUG-07 e BUG-08 afetam clientes gerados do contrato.
- **R-5:** não há teste automatizado de "valores fora dos logs" (só a varredura manual do log da rodada, limpa). Recomendo uma asserção de log nos fluxos de renda e ativos.
- **R-6:** `GoalExportQaIT.backup` e a lista de tabelas do backup precisam acompanhar o `schemaVersion = 2` (dono: dev).
- **Perguntas para o dono (regra de negócio):** BUG-09 (o "a receber" do mês segue a competência do consumo ou o vencimento da fatura?) e D-3 (aceitar que o simulador só classifica bem compras à vista até a janela crescer?).

## 8. Parecer

🔴 **Reprovado.**

O razão e as regras do PR 01 resistem: nenhum teste achou dupla contagem, transferência ou investimento virando despesa, empréstimo virando despesa, ou compra parcelada inteira no mês. Mas o BUG-01 quebra o fluxo principal de novembro (renda líquida, resumo, simulador, alertas), o BUG-02 mantém o consignado como obrigação a pagar e o BUG-03 faz a tela de "a receber" divergir do razão. Voltar ao dev-backend para BUG-01 a BUG-03 (nessa ordem), BUG-05 e as correções de contrato (BUG-04, 06 a 08, 10); depois repetir a bateria. Após BUG-01 e BUG-02 corrigidos, o parecer pode subir para 🟡 se BUG-03 e o contrato forem tratados.
