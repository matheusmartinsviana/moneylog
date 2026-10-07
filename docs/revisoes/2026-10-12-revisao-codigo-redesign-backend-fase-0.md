---
tipo: revisao-codigo
tasks: T181 a T188 (T189 não feita), insumo de T190
plano: docs/planos/2026-10-10-redesign-workspace.md (§5, T181 a T190; achados R1 a R4, R11, R13)
relacionado: docs/revisoes/2026-10-10-revisao-plano-redesign.md, docs/adrs/ADR-011-redesign-workspace.md (§8), docs/adrs/ADR-008-leitura-do-razao-inteiro-e-ordem-de-travas.md, PR 01 (regra 10), D1 §8.6 (S-282 a S-302)
revisor: revisor
data: 2026-10-12
parecer: aprovado com ajustes (nenhum crítico)
---

# Revisão de código: backend da fase 0 do redesign (contrato 2.6.0, relatórios, busca, variações)

## 1. Resumo

Revisei por leitura integral: `IncomeExpenseSeries`, `ReportPeriod`, `SpendingByCategory`, `DashboardSummary` (`inAccountsChange`), `MonthlySummary` (`savingsRate`/`savingsRateDelta`), os dois casos de uso de relatório, `ReportController`/`ReportConfig`, toda a busca (`SearchController`, `SearchGatewayImpl`, `SearchTerm`, `SearchResults`, `SearchConfig`, `SearchRateLimiter`, `UserRateLimiter`), `ProblemRequestRejectedHandler`, `application.yml`, as seções novas de `contracts/openapi.yaml` e os testes que as cobrem. Rodei, numa **cópia** do backend (scratchpad, sem tocar `backend/` nem o `target/` do tester), os testes unitários e de contrato: `SerieEntradasESaidasTest`, `RedesignPropriedadesTest` (30 sementes), `ConsumoPorCategoriaTest`, `VariacoesDoInicioTest`, `Redesign260ContractTest`, `RelatoriosUseCasesTest`, `SearchGatewayImplTest`, `ArchitectureTest`, `NoteTagsTest`: **verdes**. Os ITs (Testcontainers) não rodei: o tester está com eles.

Conclusão curta: a parte que mais pode quebrar produção, a **integridade financeira dos relatórios, está correta por construção**: a série não classifica nada, só agrupa por `effectiveDate` os postings ativos dos livros `INCOME`/`EXPENSE` que o `ConsumptionReport`, o `EntryReport` e o `MonthlySummary` já leem; e o teste de propriedade compara cada ponto mensal com as quatro calculadoras. A busca está bem defendida (isolamento por `user_id` em toda consulta e todo `JOIN`, escape de curingas, controle → 400, `q` fora de log, savepoint por grupo). Os achados são de **desempenho/operação e de promessa do contrato**, não de dinheiro errado.

Não há 🔴. Há dois 🟠 (desempenho do Início com 50.000 movimentações, e a promessa "`q` não vai para log" que a aplicação sozinha não cumpre) e alguns 🟡/🟢.

## 2. Cenários de integridade refeitos por conta (série e categorias)

Regra de leitura: `Ledger` só mantém postings **ativos**; `Posting.competence()` é sempre o mês de `effectiveDate`; `IncomeExpenseSeries.of` só soma `INCOME` (sinal invertido) e `EXPENSE`, no intervalo `[from, to]`.

| Cenário | Resultado refeito | Prova no código/teste |
| --- | --- | --- |
| Compra de 1.200 em 6x | 200 em cada mês, cada parcela no dia dela (data da compra + k−1 meses); nunca 1.200 num dia. Parcelas futuras ficam fora de `D7/D30/M3` e fora de `M12` além do mês corrente | `SerieEntradasESaidasTest` "1.200 em 6x"; `IncomeExpenseSeries.java:57-74` |
| Reembolso (conta) | posting negativo no `EXPENSE` na data dele: o dia tem `expenses` negativo e `net` positivo; na categoria original | idem "dia só com reembolso"; `EntryReport.java:91` |
| Consumo de dívida (S-137) | entra no dia da dívida (`DEBT_RECOGNITION` está no `EXPENSE`) | teste "consumo de dívida PAYABLE" |
| Despesa dividida | entra só o que o razão grava como consumo (a parte do amigo é recebível, outro livro) | **por construção**; sem teste próprio (ver 🟡-2) |
| Recorrência realizada | é uma movimentação comum, posting comum | por construção; sem teste próprio (ver 🟡-2) |
| Fatura paga, transferência, aplicação/resgate, empréstimo, quitação, ajuste | não tocam `INCOME`/`EXPENSE`: fora | `RedesignPropriedadesTest.checkOutOfBooks` + `SerieEntradasESaidasTest` |
| Estornada (`VOIDED`) | postings inativos, filtrados em `Ledger` | teste CA4 |
| Futuro (S-258) | `DAY`/`WEEK`: `last = to = hoje` (`IncomeExpenseSeries.java:56,63`): fora. `MONTH` corrente: competência inteira, **inclui o agendado** | teste S-285; propriedade `checkSeries` |
| Ponto `MONTH` corrente × `month.consumption` do dashboard | **igual por construção** (mesmos postings, mesma competência); a divergência é só com `D30`/`D7`, que cortam em hoje, e está documentada | `checkMonthlyAgainstCalculators` (dashboard em `month.lastDay()`) |
| `share`/`base`/"Outras" com reembolso entre meses | categoria líquida ≤ 0 sai de itens e de `other`; `base` = Σ positivas; `total` líquido fica só de cabeçalho; Σ share ≤ 1 + tolerância | `SpendingByCategory.java:49-63`; propriedade em `checkSpending` |
| Arredondamento | `MonthlySummary.ratio`: 4 casas `HALF_UP` sobre centavos inteiros | `MonthlySummary.java:133` |
| `share` com `base` = 0 | `null`, `items` vazio, `other` nulo | `SpendingByCategory.java:66-68` |
| Empate na ordenação | valor desc, nome (minúsculas, `ROOT`), id | `SpendingByCategory.java:46-48`; teste de empate |
| Fronteiras dia/semana/mês/ano e DST | toda a aritmética é `LocalDate` (sem `Instant`/`ZonedDateTime`): o horário de verão histórico não entra; o único relógio é `time.today()` (injetado, `America/Sao_Paulo`). Teste de 23:59:59/00:00:00 e de virada de ano | `ReportsIT` fronteiras; `SerieEntradasESaidasTest` |
| Janelas | `D7` 7 pontos, `D30` 30, `M12` 12; `M3` de **13 a 15**: o 15 existe (ex.: hoje = 31/05/2027, `from` = domingo 28/02/2027: 1 + 13 semanas + 1 dia). O contrato e o ADR dizem "13 a 15"; o plano (5.1 item 2 e T184 CA3) ainda diz "13 ou 14" | ver 🟢-1 |

`partial` = o balde contém hoje (`IncomeExpenseSeries.java:84`). Não existe `asOf` na resposta da série (nem o plano pede): em `M12`, `to` é o fim do mês e o cliente não recupera "hoje" a não ser pelo `partial`; suficiente para o gráfico.

## 3. Itens conformes

- **S-79 / PR 01 regra 10:** a série e as categorias não têm classificação própria; propriedade com 30 sementes, 4 datas de avaliação, cada ponto `M12` contra `ConsumptionReport`, `EntryReport`, `MonthlySummary` e `DashboardSummary.month`; Σ dos 30 dias de novembro = ponto `MONTH` = `month.consumption`. O oráculo dos pontos `D7/D30/M3` (`oracle()`, soma de postings por intervalo) é independente do agrupamento do código sob teste (compartilha só a classificação por livro, que é o domínio existente).
- **`inAccountsChange`:** `previous` = `CashPosition.at(records, ledger, since).inAccounts()`, a mesma função de `inAccounts` (`DashboardSummary.java:87`); exato por data; `percent` = `amount / |previous|` (4 casas, `null` com base 0, sinal de `amount` manda com base negativa); omitido em projeção e sem contas (`@JsonInclude(NON_NULL)` só nesse campo, então ausente e não `null`, como o contrato diz). A aplicação em investimento reduz o valor, e isso está dito no `description` do schema, no ADR e no Javadoc.
- **`savingsRate`/`savingsRateDelta`:** `null` sem receita, delta sobre taxas já arredondadas (4 casas, mesma escala, passa o padrão `Ratio`), sinal preservado; campos fora de `required` (e `Redesign260ContractTest` trava o `required` de `DashboardBalances`).
- **Busca, isolamento:** as cinco consultas têm `user_id = ?`; os dois `LEFT JOIN` de `transactions` (categoria e conta) repetem `AND x.user_id = t.user_id` (`SearchGatewayImpl.java:132-133`); `notes` filtra `deleted_at IS NULL`; sem concatenação de SQL com entrada do usuário (só `BODY_HEAD`, constante, via `formatted`); tudo é parâmetro de `PreparedStatement`.
- **Curingas:** `escapeLike` escapa `\`, `%`, `_`. Não há `ESCAPE` declarado, mas o Postgres usa `\` como escape **padrão** de `LIKE`/`ILIKE`, então funciona; é um acoplamento implícito ao default (🟢-3).
- **`q` inválido:** NUL e todo controle ISO (inclusive C1) → 400 `SEARCH_QUERY_INVALID`; o caminho do firewall (`%00`) cai no mesmo código em `ProblemRequestRejectedHandler.java:37-43`; tamanho em pontos de código (emojis); o corpo do erro não ecoa `q`.
- **`snippet` é texto puro:** sem `ts_headline`, sem `<b>`; controles viram espaço; 160 caracteres.
- **`Cache-Control: no-store, private`** nas três rotas e declarado no contrato (`components/headers/NoStore`); contrato declara 400/401/429/500 conforme a rota.
- **Rate limit:** `UserRateLimiter` extraído (janela deslizante, `ArrayDeque` limitado a `maxRequests` por usuário, poda de chaves acima de 1.000); **cada subclasse tem o próprio mapa** (campo de instância), então busca (120) e exportação (6) não compartilham contador; o `acquire` vem antes da validação de `q` (o 400 também consome cota: intencional).
- **`statement_timeout` por grupo com savepoint:** `set_config(..., true)` é local à transação, então a conexão volta limpa ao pool no commit/rollback (o `REPEATABLE_READ` é restaurado pelo gerenciador de transação); o rollback ao savepoint não derruba o instantâneo do `REPEATABLE_READ` (o snapshot é da transação); só `57014` vira `truncated`, qualquer outro erro vira `SearchFailedException` sem `q` nem SQL na mensagem. `SearchTimeoutIT` cobre o estouro seguido de grupo normal.
- **Log:** `toString` de `SearchQuery`, `SearchResults` e `SearchResponse` sem `q`; loggers `FilterChainProxy` e `DispatcherServlet` fixados em INFO; `SearchLogIT`.
- **Concorrência (ADR-008):** os três casos de uso estão em `snapshotReadOnly` (`REPEATABLE_READ`, somente leitura), uma carga do razão, nenhuma escrita, nenhuma trava; falha de leitura não tem trava para virar 409 (uma falha de SQL na busca é 500 sem vazar texto).
- **Camadas:** `core/search` e `core/finance/app/reports` sem framework (regra ArchUnit `coreNaoDependeDeFrameworkNemDeInfra` cobre `core..`); `infra/search/gateways` só em infra; `slices` do core sem ciclo (nada depende de `core.search`).
- **Contrato 2.6.0:** versão certa, rotas, schemas e `Cache-Control` presentes; campos novos de schemas existentes fora de `required`; exemplos de `IncomeExpenseSeries` (net e totals fecham: 3000 − 250 = 2750) e `SpendingByCategory` (share 0.8000 + 0.2000) validam; teste de que um exemplo quebrado é reprovado (o validador confere de verdade); `Ratio` de 4 casas bate com `BigDecimal.toPlainString()` das respostas.
- **Fora do escopo, registrado:** `Account.appearance` não foi implementado (D6 = derivar do tipo); o ADR-011 §8 diz isso e o contrato não o declara.

## 4. Achados

### 🟠 A-1 · Desempenho do Início com 50.000 movimentações: o gatilho do ADR-008 está acionado e o relatório lê o que não precisa
- **Onde:** `GetIncomeExpenseSeriesUseCaseImpl.java:19-22`, `GetSpendingByCategoryUseCaseImpl.java:32-37` (ambos chamam `records.load(userId)`, o `FinancialRecords` inteiro); medição em ADR-011 §8 (tabela de desempenho).
- **Problema:** `D7`, que precisa de 7 dias de postings `INCOME`/`EXPENSE`, carrega o razão, as movimentações, faturas, dívidas etc. de todo o histórico: 1,8 a 2,2 s e ~+122 MB de heap por chamada com 50.000 movimentações, igual a um dashboard. A abertura do Início faz 4 cargas em série (~10 s com 50.000; 0,9 s com 10.000) e, na AWS free tier (ADR-001), cada requisição em voo pesa ~120 MB. O próprio plano (R13) fixou "passou de ~2 s por chamada, abrir o cache do ADR-008 **antes** da fatia C"; está no limite (1,7 a 2,4 s) e o ADR-011 só repassa a decisão à Arquitetura.
- **Impacto:** lentidão e pressão de heap justamente no usuário-limite; com duas leituras em voo (T201) a instância pequena corre risco de `OutOfMemoryError` ou de GC longo, que derruba também o login.
- **Correção sugerida:** decidir **antes de T201** (não depois da fatia C): (a) para a série e as categorias, uma leitura de **só postings** `INCOME`/`EXPENSE` ativos no intervalo (`ledger_postings` por `book_type` e `effective_date`, com `user_id`), que alimenta o mesmo `IncomeExpenseSeries`/`SpendingByCategory` (a categoria vem do `book.id` do posting; só o `EntryReport` com `lines` precisa das movimentações, e `SpendingByCategory` só usa `byCategory`); ou (b) o cache por usuário invalidado na escrita (item 3 do ADR-008). A opção (a) mantém "uma calculadora só" e reduz o custo de `D7`/`D30` a milissegundos; o teste de propriedade existente já prova a igualdade.
- **Dono:** Arquitetura (decisão) e dev-backend.

### 🟠 A-2 · "`q` não é gravado em log" não é verdade na borda: o termo viaja na URL
- **Onde:** `contracts/openapi.yaml` (descrição de `GET /v1/search`: "o termo `q` **não** é gravado em log"), `application.yml` (loggers), ADR-001 (CloudFront/ALB).
- **Problema:** a aplicação controla seus logs (e o faz bem), mas `q` está na **query string de um GET**. Os logs padrão de CloudFront (`cs-uri-query`) e do ALB (campo `request`) gravam a URL completa, o navegador guarda no histórico/`Referer` de navegação interna e proxies reversos guardam. O que o usuário digita na busca global é dado financeiro e pessoal (nome de pessoa, descrição, instituição). A promessa do contrato passa a ser maior do que o que a arquitetura entrega.
- **Impacto:** vazamento de termos de busca para logs de infraestrutura com retenção longa; contradiz S-287/R11 se o contrato for lido ao pé da letra.
- **Correção sugerida:** uma destas, registrada antes do deploy: (a) **desligar o log de query string** no CloudFront/ALB (ou não ligar o log de acesso) e escrever no contrato "a aplicação não loga `q`; a infraestrutura não deve registrar a query string" com item no checklist de deploy; ou (b) trocar para `POST /v1/search` com `q` no corpo (mantendo `Cache-Control: no-store`, sem efeito colateral, como `search` de GraphQL/Elastic); ou (c) reduzir a promessa do contrato a "a API não grava `q`". Também fixar `org.springframework.jdbc.core.StatementCreatorUtils` fora de TRACE (hoje não está, e em TRACE ele imprime o parâmetro `%termo%`).
- **Dono:** Arquitetura/Produto.

### 🟡 B-1 · Busca: sem teto de concorrência nem de tempo total; um pedido pode segurar uma conexão por 15 s
- **Onde:** `SearchGatewayImpl.java:78-89` (cinco consultas em série, cada uma com teto de 3 s), `application.yml` (Hikari com pool padrão de 10), `SearchController.java:46`.
- **Problema:** o rate limit (120/min) limita **pedidos**, não **pedidos em voo**. O navegador aborta a requisição anterior ao digitar, mas o servidor continua a consulta até o fim. Com `unaccent` sem índice (186 a 599 ms a 50.000, e o teto de exportação é 200.000, então 0,7 a 2,4 s), o pior caso é 5 × 3 s = 15 s por conexão e dez buscas simultâneas esgotam o pool, bloqueando login e dashboard. Perto de 200.000 movimentações o grupo de movimentações começa a estourar 3 s e volta **vazio com `truncated`** (o usuário acha que não existe).
- **Correção sugerida:** orçamento total por pedido (ex.: 3 s somando os grupos: `statement_timeout` = restante), no máximo 1 a 2 buscas em voo por usuário (semáforo, 429 ao exceder) e, quando o volume pedir, `pg_trgm` + índice GIN sobre uma coluna `unaccent(lower(description))` imutável (a função `unaccent` é `STABLE`; precisa de um wrapper `IMMUTABLE` para indexar). Registrar o limite em que a varredura deixa de servir.

### 🟡 B-2 · Busca de nota devolve o início do corpo (`snippet`) mesmo casando só por título
- **Onde:** `SearchGatewayImpl.java:187-199`, contrato (`SearchNote.snippet`).
- **Problema:** o pedido de revisão e a regra R11 dizem "notas só por título/caminho"; a busca em si não varre o corpo (correto), mas o resultado mostra os primeiros 160 caracteres do corpo. R11 admite isso ("ou o começo do corpo"), então não é desvio do plano, mas num dropdown de busca global (tela aberta, ombro alheio) é conteúdo de nota que o usuário não pediu para ver; o vault pode guardar texto sensível.
- **Correção sugerida:** decisão de Produto: `snippet` = caminho/título (sem corpo) por padrão, ou manter e dizer no contrato que o início do corpo aparece. Hoje também lê 400 caracteres do corpo por linha (barato: no máximo 8 linhas).

### 🟡 B-3 · `inAccountsChange` pode mostrar uma "variação" enganosa quando a conta nasce no mês
- **Onde:** `DashboardSummary.java:81-90`.
- **Problema:** conta aberta neste mês com saldo inicial datado neste mês dá `previous` = 0 e `amount` = saldo todo (`percent` nulo: correto), e uma segunda conta aberta com saldo grande soma "+300%" ao chip. Tecnicamente exato, semanticamente "dinheiro novo", não "variação". Também: com **só** contas de investimento, `accounts()` não está vazio e o campo vem com 0,00/0,00/nulo.
- **Correção sugerida:** sem mudar a conta, o front só mostra o chip quando `percent` != null e o rótulo diz "vs fim do mês passado"; opcionalmente o backend omite o campo quando não há conta `CASH`. Pergunta de Produto, não bug.

### 🟡 B-4 · Testes não reproduzem "despesa dividida" nem "recorrência realizada" na série
- **Onde:** `SerieEntradasESaidasTest.java`, `RedesignPropriedadesTest.java` (gerador `extras`).
- **Problema:** os dois casos estão na lista obrigatória da revisão e passam por construção, mas nenhum teste da série os exercita; se o razão mudar a forma de gravar a parte do amigo, a série herda a mudança sem alarme. A propriedade também não gera cartão parcelado com reembolso entre meses nem despesa dividida.
- **Correção sugerida:** acrescentar ao gerador da propriedade a despesa dividida (`s.caso…` já existe no `FinanceScenarioFactory`?) e uma movimentação gerada por recorrência; assertar que a série soma só a parte do usuário.

### 🟡 B-5 · A base do contrato não está versionada: a aditividade não é provada por diff
- **Onde:** repositório (`git status`: "No commits yet"; tudo `??`).
- **Problema:** T181 CA1 pede "nenhum schema existente perdeu campo ou ganhou campo obrigatório (diff aditivo conferido por script)". Sem commit, não há contra o que diferenciar, e nenhum teste guarda a versão 2.5.1. O que existe: `Redesign260ContractTest` (opcionalidade dos três campos novos e o `required` de `DashboardBalances`) e o relato do front de "zero linha removida" nos tipos gerados. Para os demais schemas, confiei na leitura, não numa prova.
- **Correção sugerida:** fazer o commit inicial (o dono decide) e, depois, um teste/script de compatibilidade (ex.: `oasdiff breaking` contra a versão anterior) no CI. Antes de T182 fechar, congelar `contracts/openapi-2.5.1.yaml` fora da árvore para comparar.

### 🟡 B-6 · `NoteTagsTest`: o teto passou de 100 para 500 ms medindo relógio de parede
- **Onde:** `NoteTagsTest.java:17` (`MAX_ANALYZE_MILLIS = 500`), `:77` (o `@DisplayName` ainda diz "menos de 100 ms").
- **Problema:** 500 ms ainda separa **quadrático em `#`** (50.000² = 2,5×10⁹ passos, segundos), mas **não** separa com folga um quadrático nos 20.000 wikilinks (4×10⁸, da ordem de 0,3 a 1 s). Um teste de relógio de parede continua frágil sob carga (a razão pela qual o teto subiu).
- **Correção sugerida:** medir **escala** em vez de milissegundos absolutos: tempo(2n)/tempo(n) < ~3 (ou contar operações), e corrigir o texto do `@DisplayName`. Fora do escopo da fase 0, anotado porque a task mexeu nele.

### 🟢 C-1 · O plano está defasado em `M3` (13 ou 14 pontos; o código e o contrato dizem 13 a 15)
`docs/planos/2026-10-10-redesign-workspace.md` §5.1 item 2 e T184 CA3. O 15 é real (hoje = 31/05/2027). Atualizar o plano; o front (T204) precisa aceitar 15 pontos.

### 🟢 C-2 · `ProblemRequestRejectedHandler.java:38` rotula como `SEARCH_QUERY_INVALID` toda recusa do firewall em `/v1/search`
Também as que não vêm do termo (cabeçalho, host). Hoje a única causa realista é o termo; se aparecer outra, o código fica enganoso. Aceitável.

### 🟢 C-3 · LIKE sem `ESCAPE` explícito
`SearchGatewayImpl.java:79,249`. Depende do default `\` do Postgres. Declarar `ESCAPE '\'` nas cinco consultas torna o contrato do SQL explícito e imune a `standard_conforming_strings`/mudança de default; o custo é zero.

### 🟢 C-4 · `SpendingByCategoryResponse.java:33-36` pode devolver `category.name = null`
Se uma categoria referenciada por posting não existir em `byId` (não deveria acontecer: a consulta inclui arquivadas), o contrato exige `name` string. Trocar `null` por texto fixo ou falhar alto.

### 🟢 C-5 · Falta exemplo de `SearchResults` e de `DashboardInAccountsChange` no contrato
T181 CA3 pede exemplos; só os de `IncomeExpenseSeries`, `SpendingByCategory` e `MonthlySummary` (atualizado) existem. `q` também não declara `minLength`/`maxLength` no schema (a regra está só no texto).

### 🟢 C-6 · `UserRateLimiter.java:53-61`: corrida rara na poda
Com mais de 1.000 chaves, `pruneKeys` pode remover um deque vazio no instante em que outra thread já o obteve em `computeIfAbsent`; esse pedido deixa de ser contado uma vez. Irrelevante para o MVP (um usuário).

## 5. Riscos

- **Dinheiro:** nenhum risco novo identificado; a série e as categorias herdam a classificação do razão. O ponto `MONTH` do mês corrente inclui lançamento agendado (S-285); o impacto é pequeno porque só movimentações manualmente datadas no futuro dentro do mês entram (parcela k cai no mesmo dia do mês da compra).
- **Operação:** A-1 (heap/latência), B-1 (pool), A-2 (logs de infraestrutura).
- **Processo:** B-5 (sem baseline versionado).
- **Frontend:** o `M3` pode ter 15 pontos; `expenses` negativo; `inAccountsChange` ausente (não `null`); `truncated` é lista de nomes em minúsculas.

## 6. Não feito e decisões que dependem de outro dono

- **T189 / S-291 `Account.appearance`:** **não feito**, por decisão do dono (D6 = derivar o tom de `type`/`liquidity`); o ADR-011 §8 e o contrato estão coerentes (campo ausente). Reabrir só com "sim".
- **S-285 (Produto):** o ponto `MONTH` do mês corrente inclui o agendado (como o dashboard) ou corta em hoje? Padrão adotado: igual ao dashboard. Se Produto cortar em hoje, o ponto deixa de bater com `month.*` (e o teste de propriedade mensal muda de forma: precisa do rótulo "até hoje").
- **S-288 (opcional):** `GET /v1/transactions?q` continua diferenciando acento: "Ver todas as movimentações" a partir da busca global pode achar menos. Não foi feito (depende de aceite).
- **B-2 (Produto):** `snippet` de nota com início do corpo.
- **R6 (Produto):** contagem de notas (`total`) não foi feita.
- **T190 (tester):** em andamento em paralelo; esta revisão não o substitui.
- **A-1 (Arquitetura):** decidir o cache/leitura enxuta antes de T201.

## 7. Parecer

**🟡 Aprovado com ajustes.** O backend da fase 0 entrega o que o plano pede, sem dupla contagem e com a regra 10 do PR 01 provada por propriedade; isolamento e proteção da busca estão corretos; o contrato 2.6.0 é aditivo no que pude verificar. Nenhum achado 🔴. Os dois 🟠 (A-1 e A-2) **não bloqueiam o merge do backend**, mas precisam de decisão **antes de T201** (A-1) e **antes do deploy** (A-2). Os 🟡 voltam ao dev-backend/tester como ajustes pequenos (B-1, B-4, B-6) e a Produto/Arquitetura como decisões (B-2, B-3, B-5).
