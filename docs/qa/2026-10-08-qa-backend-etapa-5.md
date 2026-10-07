# QA backend, Etapa 5 (T98)

Agente: tester. Escopo: `backend/` (metas e reservas, `reserved` no dashboard e nas contas, resumo mensal, projeções, exportação CSV e backup JSON, migração V5.00). Nenhum código de produção alterado; nada em `frontend/` nem em `contracts/`; sem commits. Fontes: plano da Etapa 5 (T92 a T98), D1 §2.9 e §8.5 (S-245 a S-257), PR 01 (integridade) e PR 00 (metas, projeção "sempre projeção, não certeza", resumo mensal, exportação).

## 1. Resumo

- Baseline (`./mvnw clean verify`, JDK 21, antes dos meus testes): **BUILD SUCCESS, exit 0, 54:34 min** (a máquina estava com carga média de 30 a 39 por causa de outros processos, por isso o tempo é bem maior que o das etapas anteriores). Unitários **1.107 / 0 falhas**; ITs **563 executados, 0 falhas, 1 ignorado** (BUG-QA-09 da Etapa 2, ainda aberto).
- Execução completa com os meus testes (`./mvnw clean verify`, 47:39 min): unitários 1.107 verdes; ITs **600 executados** (563 + 37 meus), **1 falha e 6 ignorados** (1 antigo + 5 meus com `@Disabled("BUG-QA-xx")`). A única falha foi **de um teste meu** (`GoalBordersQaIT.entradasInvalidas`: o validador de contrato acusou três respostas sem corpo e um 404 de rota fora do OpenAPI, o que é o BUG-QA-32, não um defeito do teste de negócio). Ajustei o teste e **reexecutei só essa classe: 12 executados, 0 falhas, 2 ignorados, BUILD SUCCESS**. Não repeti o `clean verify` inteiro depois do ajuste (custa quase 50 min); todas as outras classes novas passaram na execução completa.
- **Integridade financeira: nenhuma violação.** A propriedade (5 sementes x 220 operações = 1.100 operações, 28% de operações de meta misturadas com todas as anteriores) fechou com **0 violações**: razão em zero, reserva nunca cria `transactions` nem `ledger_postings`, saldo, consumo, receita, patrimônio, comprometido e projeção não mudam com reserva/liberação/arquivamento/edição de meta, `reserved` = Σ `reservedAmount` das contas de caixa, `available` = em contas − comprometido 30d − reservado, saldo final de cada horizonte = `projected` do dashboard (e = em contas + Σ /upcoming), resumo = dashboard = lista = entries para 6 meses por rodada.
- Bugs: **1 🟠, 0 🔴, 4 🟢 mais observações** (ver §3). O 🟠 (BUG-QA-28) não corrompe dado: é uma lacuna de domínio na projeção/comprometido/disponível para movimentação com data futura (inclusive ocorrência de recorrência realizada adiantada), que **faz o número projetado e o disponível subirem** quando o usuário realiza uma ocorrência adiantada.
- Parecer: **🟡 Aprovado com ressalvas** (§6).

## 2. Casos executados

### 2.1 Baseline e execução final

Ver §1. Os tempos incluem a carga da máquina. A suíte inteira tem 1.107 unitários + 600 ITs.

### 2.2 Propriedade com semente fixa (`GoalPropertyQaIT`) — aprovada

Sementes 20261008, 5, 777, 31415, 2718; 220 operações cada (1.100 no total). A cada 5 operações (220 verificações) o teste confere tudo abaixo. A mistura inclui empréstimo, recebimento (total, metade, 1 centavo a mais), captação, pagamento, dívida sem movimentação, perdão/estorno de registro, despesa dividida (1 a 20 partes), reembolso, estorno de qualquer movimentação, compra no cartão, pagamento de fatura, mudança de dias, recorrência realizada/pulada/encerrada/desativada, passagem do tempo e entradas inválidas, **mais** criar meta (com e sem prazo, com e sem `Idempotency-Key`), reservar e liberar (em conta de caixa, em conta de investimento e numa segunda conta que é arquivada e desarquivada ao longo da execução, com datas passadas e futuras, valor igual ao saldo, liberação acima e abaixo do reservado), replay idempotente, arquivar/desarquivar meta, editar meta (inclusive `version` velha e meta arquivada) e arquivar/desarquivar conta.
Verificado:

1. Antes e depois de **cada** operação de meta, um instantâneo de: nº de `transactions`, nº de `ledger_postings`, Σ do razão, `month`, `netWorth`, `balances.inAccounts`, `balances.investments`, `committed`, `projected`, saldo de cada conta, série e saldo inicial da projeção M12, resumo do mês corrente e totais de `entries` **é idêntico**. 0 diferenças.
2. Oráculo da regra de liberação (S-247) calculado em Java a partir de SQL: a previsão de aceitar ou recusar (`GOAL_RELEASE_EXCEEDS_RESERVED`, `ACCOUNT_ARCHIVED` só em reserva positiva, `GOAL_ARCHIVED`) bateu em todas as chamadas; saldo corrente por data, meta e conta nunca negativo; replay com a mesma chave não cria linha.
3. Cada meta (detalhe = item da lista; listas por status particionam o conjunto): `current` = Σ reservas até hoje, `progress` com 4 casas HALF_UP sem teto, `remaining` ≥ 0, `status` derivado, `monthlyNeeded` (S-156: meses-calendário inclusive, arredondado para cima; `0.00` se atingida; `null` sem prazo ou vencido), `uncovered` (S-249) e nº de `reservations[]` batem com o banco.
4. Cada conta (3 contas): `currentBalance` = razão, `reservedAmount` = Σ reservas das metas **não arquivadas** até hoje (inclusive em conta de investimento e **em conta arquivada**), `uncovered` = reservado > saldo (igual ao saldo não é descoberta); item da lista = detalhe.
5. Dashboard: `balances.reserved` = Σ `reservedAmount` das contas `CASH`; `available` = `inAccounts` − `committed.d30` − `reserved`.
6. Projeção (D30, D90, M6, M12, com e sem `includeTrend`): `isProjection`, `asOf`, `startingBalance` = `inAccounts`, competências consecutivas a partir do mês de hoje, `balance` de cada ponto = acumulado de entradas − saídas, `periodEnd` do último ponto = fim do horizonte, **saldo final = `projected` do dashboard** em todos os horizontes, **saldo final = em contas + Σ entradas − Σ saídas de `/v1/dashboard/upcoming`** (prova de que nenhum compromisso entra duas vezes nem some), `includeTrend=true` não muda a série base nem `goals`, `trend.estimate` é verdadeiro, a série da tendência é média x meses à frente, `INSUFFICIENT_HISTORY` com motivo, `goals.reserved` = `balances.reserved`.
7. Resumo mensal (3 meses para trás e 2 para frente de cada "hoje"): `income` = razão `INCOME`, `expenses` = razão `EXPENSE` = `entries.totals.total` (lista), `net` = receita − consumo, `savingsRate` = `net/income` (4 casas; `null` sem receita), `partial`/`isProjection`, no mês corrente = `dashboard.month` (receita, consumo, net, `investedNet`, crédito), `largestCategory` e `largestExpense` = maior consumo positivo por categoria e por linha (itens e `debtItems`), `futureInstallments` = Σ lançamentos de parcela com competência depois do mês, `comparison.previousMonth` = o resumo do mês anterior (campo a campo), `delta.amount` = atual − anterior e `percent` = diferença/|anterior| com `null` na base zero.
8. Toda requisição e resposta validada contra o OpenAPI; nenhum 5xx e nenhum 400 em corpo válido; todo `code` de erro visto está na tabela do contrato (`ACCOUNT_ARCHIVED`, `GOAL_ARCHIVED`, `GOAL_RELEASE_EXCEEDS_RESERVED`, `VERSION_CONFLICT` etc.).
   Observação do ciclo de QA: a primeira execução acusou 1 violação, que era **erro do meu oráculo** (PUT de meta arquivada com `version` velha responde 409, não 422, porque a `version` é conferida antes do estado arquivado); corrigido e a execução final deu 0.

### 2.3 Concorrência (`GoalConcurrencyQaIT`, 10 testes) — aprovados

Contrato validado e razão conferida em cada estado final:

- **12 reservas simultâneas** na mesma meta e conta (3 rodadas): 12 x 200, `current` 1.200,00, `version` +12.
- **8 liberações simultâneas de 100,00 sobre 500,00** (4 rodadas): exatamente 5 x 200 e 3 x 422 `GOAL_RELEASE_EXCEEDS_RESERVED`; saldo 0; nunca negativo por data.
- Reservas e liberações cruzadas em **duas contas** da mesma meta (12 threads x 3 rodadas): só 200/422, saldo por conta nunca negativo.
- **Mesma `Idempotency-Key` em 8 reservas paralelas** (3 rodadas): 8 x 200 e **uma** linha. **Criação de meta com a mesma chave em 8 threads**: 8 x 201, mesma meta, uma linha; com **corpos diferentes** na mesma chave: só 201 e `409 IDEMPOTENCY_KEY_REUSED`, uma meta.
- **6 PUT simultâneos com a mesma `version`**: 1 x 200 e 5 x `409 VERSION_CONFLICT`; **reserva x PUT** (6 rodadas): a reserva sempre 200, o PUT 200 ou 409.
- **Reserva x arquivar meta** (8 rodadas): 200 ou `422 GOAL_ARCHIVED`; reservas gravadas = respostas 200; reservar depois é sempre `GOAL_ARCHIVED`.
- **Reserva x arquivar conta** (8 rodadas): 200/422/409, nunca 500; depois de arquivada a reserva é `ACCOUNT_ARCHIVED` e a liberação passa.
- **Reserva x estorno de movimentação** (4 rodadas, com leituras do dashboard e da meta no meio): só 200/409/422; razão fecha; nenhuma `transactions` criada.
- **Tempestade** de 6 threads x 40 operações (reservar, liberar, arquivar, editar, criar despesa, estornar compra, mudar dias do cartão, pagar fatura, e ler dashboard/projeção/resumo/metas/contas/CSV/backup): `{200=134, 201=12, 409 VERSION_CONFLICT=17, 422 GOAL_ARCHIVED=43, 422 GOAL_NOT_ARCHIVED=9, 422 GOAL_RELEASE_EXCEEDS_RESERVED=12, 422 INVOICE_NOT_PAYABLE=8, 422 TRANSACTION_ALREADY_VOIDED=5}`. **Zero 5xx**, razão em zero, invariantes do cartão ok, saldo da reserva nunca negativo em nenhuma data. (O BUG-QA-26 da Etapa 4 foi corrigido: a leitura do razão em escrita é refeita e vira 409.)

### 2.4 Bordas (`GoalBordersQaIT`) — aprovadas, exceto o BUG-QA-28 (teste desativado)

- `monthlyNeeded`: prazo no mês corrente = 1 mês (1.000,00); prazo hoje = 1 mês; prazo ontem = `null`; sem prazo = `null`; 1.000,00 em 3 meses = 333,34 (para cima); 4 meses = 250,00; exemplo do plano 766,67; meta de 0,01 com prazo em 2100 = 0,01; **atingida com prazo vencido = 0,00** (vale antes do prazo); atingida com sobra: `progress` `2.5000`, `remaining` 0,00; liberar desfaz o atingimento (`ACHIEVED` -> `ACTIVE`, `0.5000`); arredondamentos `0.3333`, `0.6667`, `0.0000` (1 centavo em 2.000,00).
- Teto S-78: alvo e reserva de 999.999.999,99 passam; 1.000.000.000,00 = 422 `AMOUNT_ABOVE_LIMIT`; 9.999.999.999.999,99 = 4xx; duas reservas no teto somam 1.999.999.999,98 sem estouro; meta de 0,01 com reserva no teto = `progress` `99999999999.0000` (no formato do contrato); listas e dashboard seguem no contrato.
- Reserva igual ao saldo não é descoberta; +0,01 é; despesa depois da reserva torna descoberta; `available` pode ficar negativo; reserva futura aparece em `reservations[]` e só conta na data (`asOf` do dashboard e relógio); liberar com data anterior à da reserva = `GOAL_RELEASE_EXCEEDS_RESERVED`.
- **Conta arquivada**: aceita liberação e recusa reserva nova (`ACCOUNT_ARCHIVED`); a reserva que ficou nela continua em `reservedAmount`, em `balances.reserved` e em `uncovered` (100,00 contra saldo 0,00) até ser liberada; **meta arquivada** sai do reservado e desarquivar o devolve; reservar/liberar em meta arquivada = `GOAL_ARCHIVED`.
- **Idempotency-Key de requisição que falhou (404, 422) não fica queimada**: a mesma chave com corpo válido funciona.
- **Fuso America/Sao_Paulo**: às 23:30 de 31/12 em SP ainda é 2026 (`asOf` 2026-12-31, prazo 31/12 vale 1 mês, reserva de 1/1 ainda futura); às 00:30 de 1/1 já é 2027 (prazo vencido, a reserva passa a contar, resumo de 2027-01 `partial`, o de 2026-12 não).
- **Resumo**: virada de ano (31/12 em 2026-12 e 1/1 em 2027-01, `previousMonth` atravessa o ano), fevereiro comum (28/02/2027) e bissexto (29/02/2028), março separado, base zero (`percent` `null`, delta `0.00`), `2000-01` (`previousMonth` 1999-12 sem 5xx) e `2100-12` (`isProjection`).
- **Mês inexistente** (`2026-13`, `2026-00`, `1999-12`, `2101-01`, `2026-1`, `2026-10-01`, `abc`, `202610`, `2026-1a`, `0000-01`, `9999-99`, `-001-01`, `+2026-10`, `2026-010`, `20261-0`): todos `400 SUMMARY_MONTH_INVALID`. Três variantes com `%00`, `%2F` e dígitos árabes percent-encoded dão 400 **sem corpo** (BUG-QA-32).
- **Horizonte inválido** (`D7`, `d30`, `M18`, `D30;D90`, `%00`, `30`, `M6%20`, `NULL`, `M6,M12`): 400 `VALIDATION_FAILED`; `horizon=` vazio usa o padrão M6 (200).
- **Projeção em datas difíceis** (relógio em 10/10/2026, 30/11, 31/12, 31/08/2027, 31/01/2028, 29/02/2028, 31/12/2028 e 31/01/2100, com recorrência mensal no dia 31, salário no dia 29 e compra 6x): série consecutiva, `periodEnd` do último ponto = `hoje + horizonte` (`plusMonths` com recuo para fim de mês), saldo final = `projected` = em contas + `/upcoming`; a Σ de saídas do M12 é exatamente 12 ocorrências de 100,00 + 6 parcelas de 200,00 (cada ocorrência do dia 31 aparece uma vez por mês, 28/02 incluído).
- **Tendência**: sem movimentação e com 1ª movimentação em 02/07 (julho parcial) = `available: false`, `INSUFFICIENT_HISTORY`, sem inventar média; com 1ª movimentação em 01/07 e 3 meses completos = média do consumo novo (conferida contra uma consulta SQL independente: despesas de conta + 1ª parcela/à vista, **sem** parcelas 2..N, **sem** ocorrências de recorrência realizadas e **sem** reembolso; mês corrente fora): Σ 2.050,00, média 683,33; `basedOn` 2026-07 a 2026-09; o mês corrente conta 0,00; **série base idêntica** com e sem tendência.

### 2.5 Segurança (`GoalSecurityQaIT`) — aprovada, exceto o BUG-QA-30 (teste desativado)

- **Isolamento**: usuário B contra a meta de A (GET, PUT, archive, unarchive, reserva, liberação): sempre `404 GOAL_NOT_FOUND`; meta de B com conta de A: `404 ACCOUNT_NOT_FOUND`, também na liberação; a mesma `Idempotency-Key` em A e B é independente (reserva e criação de meta); lista, contas, dashboard, resumo, projeção com tendência, CSV (com `includeVoided`) e backup de B **não contêm** nenhum id, nome ou texto de A; `reserved` de B só tem as reservas de B.
- **Sem token, token vazio, `Bearer`, lixo, `a.b.c`, Basic, token adulterado, com `Origin` hostil**: 401 nas 14 rotas novas x 7 variantes, sem vazar conteúdo no 401.
- **Corpos hostis (mais de 120 casos)** sempre 4xx e nada gravado: campos desconhecidos (`id`, `current`, `status`, `userId`, `uncovered`, `progress`, `version` na criação, `reservations`, `archived`, `goalId`, `createdAt` na reserva), `target`/`amount` como número JSON, `1e3`, `1,000.00`, espaços, `+`, `-`, zero, dígitos árabes, `10.`, `.5`, 3 casas, `NaN`, `Infinity`, nulo, array, objeto, 14 dígitos; `version` em texto, fracionário, científico, nulo, negativo, array e acima de `long`; prioridade em minúscula, nula, desconhecida; nome vazio, só espaços, nulo, 101 caracteres, NUL, `\n`, `\t`; descrição de 501; nota de 201 e com NUL; datas 1999-12-31, 2101-01-01, `2026-02-30`, mês 13, `+999999999-12-31`, `20261231`, número, `10/10/2026`, vazio; `accountId` não UUID, nulo, array; corpo `[]`, `null`, `"x"`, `{`, vazio; `Idempotency-Key` ausente (400) e inválida (`nao-uuid`, `123`, espaço, UUID com caractere inválido, UUID + `x`: 400); ids de caminho inválidos (`nao-uuid`, `123`, UUID zero, `%00`, `..%2F..`); filtros e paginação (`status=FOO`, `pageSize=0/51/abc/1.5`, `page=0/-1/abc/99999999999`: 400; `status=` vazio devolve tudo).
- **Limites aceitos**: datas 2000-01-01 e 2100-12-31 (reserva e prazo), nome de 100 caracteres Unicode, descrição com quebra de linha e emoji, nota de 200 com quebra de linha: 200/201.

### 2.6 Exportação (`GoalExportQaIT`) — aprovada, exceto os BUG-QA-29 e 31 (testes desativados)

- **Injeção de fórmula**: descrições `=1+1`, `+SUM(A1:A2)`, `-2+3`, `@SUM(1)`, `=cmd|' /C calc'!A0`, ` =1+1` (espaço inicial é cortado antes), `=`, `+`, `-`, `@` saem com `'` na frente; também **nome de categoria** (`+cat;com ponto e vírgula`, `@categoria`), **nome de conta** (`=HYPERLINK("http://x")`, inclusive em `origem > destino` de transferência) e **nome de cartão** (`-cartão`). `\t=…`, `\r=…`, quebra de linha e NUL na descrição são recusados na entrada (400), então não chegam ao arquivo. Um parser RFC 4180 próprio (`;`, aspas dobradas, CRLF) leu o arquivo: cabeçalho + **uma linha por movimentação** (a compra parcelada uma vez), 8 colunas em toda linha, nenhuma célula de descrição/categoria/conta começando por `= + - @ \t \r`, ida e volta de aspas, `;`, vírgula, Unicode (`Café ñ 日本語 😀`) e `<script>`; valor `^\d+,\d{2}$`, data ISO.
- Cabeçalhos: `text/csv;charset=UTF-8`, BOM único (`EF BB BF`), `Cache-Control: no-store`, `Content-Disposition: attachment; filename="moneylog-transactions-2026-10-01_2026-10-31.csv"` (só datas, sem injeção), `X-Content-Type-Options: nosniff`. `Accept-Language` `en-US`/`en;q=0.9` = cabeçalho em inglês; `xx`, `*`, `!!!`, `en-`, `EN`, `pt;q=abc`, 2.000 caracteres: 200.
- `includeVoided=true` traz ativas e estornadas; `status=VOIDED` só as estornadas; `includeVoided` vale mais que `status`; conta/categoria de outro usuário = só o cabeçalho; filtros inválidos (`includeVoided=abc`, mês 13, 1999, 2101, `from` > `to`, tipo, método e status desconhecidos, ids não UUID, `q` de 300 caracteres, `+999999999-12-31`) = 400 `problem+json` sem BOM; `q` com `%`, `_`, aspas, `'`, `\`, `;`, emoji = 200 (sem injeção de SQL).
- **Backup**: `schemaVersion` 1; **contagens iguais às do banco** para contas (inclui arquivada), categorias, cartões, movimentações (inclui estornada), dívidas, pessoas, recorrências, metas, reservas e **lançamentos do razão (ativos e inativos)**; conforme o contrato; `Cache-Control: no-store`; **não contém** o hash de refresh token plantado, a chave de idempotência usada, o id do usuário, o e-mail, `jwt`, `secret`, `password`, `senha`, `token`, `idempot`, `refresh`, `time_zone`, nem nenhuma chave de JSON com `pass|hash|token|secret|idempot|email|jwt|userid`; **nada de outro usuário** (ids, metas, pessoas, despesas); a soma das reservas do backup = `current` da meta; o saldo por conta recalculado a partir dos `ledgerPostings` = `currentBalance` da API; o backup de B não contém nada de A.
- **Volume** (`GoalVolumeQaIT`, Postgres real, heap máximo de 2 GB, 12 reservas):

| Movimentações | CSV            | Backup          | Dashboard | Resumo | Projeção M12 + tendência | Lista de metas | Reservar (criar meta + reservar) | Heap após backup |
| ------------- | -------------- | --------------- | --------- | ------ | ------------------------ | -------------- | -------------------------------- | ---------------- |
| 10.000        | 0,5 s (954 kB) | 1,1 s (11,5 MB) | 0,4 s     | 0,6 s  | 0,5 s                    | 0,4 s          | 1,0 s                            | +25 MB           |
| 50.000        | 4,1 s (4,8 MB) | 5,2 s (57 MB)   | 3,5 s     | 2,8 s  | 2,9 s                    | 2,8 s          | 6,2 s                            | +121 MB          |

(Em execução isolada e sem carga: 50.000 = CSV 1,8 s, backup 3,6 s, dashboard 1,8 s, reserva 5,0 s.) Sem `OutOfMemoryError`; o CSV de 50.000 tem 50.001 linhas. Os limites documentados (S-257: 15 s e 30 s para 10.000) foram atendidos com folga; ver a observação de desempenho em §3.

### 2.7 Migração V5.00 (`GoalMigrationQaIT`) — aprovada

Base na V4.02 com 60 despesas e razão, mais uma segunda conta e um segundo usuário: V5.00 = **1 migração**, `success`, checksums válidos, reexecução é no-op; contagens de `transactions`, `accounts` e Σ do razão intactas; `goals` e `goal_reservations` nascem vazias e **não existiam antes**. Índices `ix_goals_user`, `ix_goal_reservations_user`, `ix_goal_reservations_goal`, `ix_goal_reservations_account` existem, são válidos e o planejador os usa. Restrições: nome em branco, alvo zero/negativo, moeda, prioridade, usuário inexistente, chave primária duplicada, reserva de valor zero, moeda, **FK composta** com meta de outro usuário, com conta de outro usuário e com meta inexistente; não dá para apagar a meta nem a conta com reservas; a reserva não altera o razão. A cadeia completa também migra de uma base vazia.

### 2.8 Contrato

- Toda requisição e resposta dos ITs novos (milhares de chamadas só na propriedade) valida contra o OpenAPI, **com uma exceção**: as respostas 400 **sem corpo** para caminhos com `%00`, `%2F` ou dígitos não ASCII (BUG-QA-32) e o 404 de `/v1/summaries/{mês}/` (rota que não existe no OpenAPI; não é defeito).
- Propriedades opcionais novas de `Account` (`reservedAmount`, `uncovered`): presentes em toda resposta de conta lida (detalhe e lista, 3 contas, a cada verificação da propriedade), com o valor certo e coerentes entre lista e detalhe.
- `code` de erro: todos os alcançados estão na tabela do contrato (inclusive os 11 `GOAL_*` e `SUMMARY_MONTH_INVALID`); nenhum fora da tabela.
- Lacuna conhecida e já reportada: o `409` das rotas de escrita continua fora do OpenAPI para algumas rotas (BUG-QA-25 da Etapa 4); nas rotas de meta, o `409 VERSION_CONFLICT` e `IDEMPOTENCY_KEY_REUSED` validam.

## 3. Bugs

Nenhum 🔴. Camada provável entre parênteses. A numeração continua a da Etapa 4 (último BUG-QA-27).

### 🟠 BUG-QA-28 — movimentação com data futura, inclusive ocorrência realizada adiantada, some de `committed`, `projected` e `available` até o dia dela (back/domínio, S-20 e S-254)

- Repro A (ocorrência): relógio 10/10/2026; Nubank 20.000,00; `POST /v1/recurrences` MONTHLY 119,00 início 2026-10-15. `GET /v1/dashboard/summary`: `committed.d30` 119,00, `projected.d30` 19.881,00, `available` 19.879,00. `POST /v1/recurrences/{id}/occurrences/2026-10-15/realize` (201). De novo: **`committed.d30` 0,00, `projected.d30` 20.000,00, `available` 19.998,00** (`projected.m12` 18.572,00 -> 18.691,00). Em 16/10 o saldo em contas é 19.881,00 e o projetado volta a cair.
- Repro B (lançamento): `POST /v1/transactions` EXPENSE 1.000,00 com `date` 2026-10-15 (hoje 10/10): `projected.d30` fica **20.000,00** (esperado 19.000,00), igual a antes; `GET /v1/projections?horizon=D30` igual.
- Esperado: o dinheiro que o usuário já sabe que vai sair (ou entrar) dentro do horizonte aparece no projetado; realizar uma ocorrência **não** pode aumentar o projetado nem o disponível. Obtido: a saída sai dos compromissos (a ocorrência está "realizada") e **ainda não está no caixa** (o saldo só considera `data <= hoje`), então fica fora das duas pontas, e a regra "saldo final = `projected`" continua verdadeira com os dois números errados.
- Causa provável: `CashPosition.at(..., today)` só soma lançamentos até hoje e `CommitmentSchedule` só tem faturas, dívidas e ocorrências pendentes; falta o "movimentado e com data futura" (S-254 e S-20 documentam a omissão como decisão: "só entra no caixa na data dela"). Pede decisão de Produto; a correção natural é somar ao projetado os lançamentos de conta com data futura dentro do horizonte (e ao `available`, se o usuário os considerar comprometidos).
- Severidade: não corrompe razão nem saldo; mas é número financeiro errado em destaque (Início e Projeções) e piora quanto mais o usuário usa a ação "realizar" adiantada. Bloqueia a exibição confiável da projeção; não bloqueia a Etapa 6 do backend.
- Evidência: `GoalBordersQaIT.movimentacaoFuturaNaProjecao` e `realizarOcorrenciaFuturaNaoAumentaOProjetado` (`@Disabled("BUG-QA-28...")`), com os números acima na saída da sonda.

### 🟢 BUG-QA-29 — o nome do arquivo de backup usa a data em UTC (back)

- Repro: relógio 2026-10-11T02:30Z (23:30 de 10/10 em São Paulo); `GET /v1/exports/backup`. Obtido: `Content-Disposition: attachment; filename="moneylog-backup-2026-10-11.json"`. Esperado: `2026-10-10` (o dia do usuário, America/Sao_Paulo). Causa: `generatedAt.toString().substring(0, 10)` no `ExportController`.
- Evidência: `GoalExportQaIT.nomeDoBackupNoFuso` (`@Disabled("BUG-QA-29...")`).

### 🟢 BUG-QA-30 — enum aceito por posição e `LocalDate` aceita data-hora (back/contrato)

- Repro: `POST /v1/goals` com `"priority": 1` responde 201 com `MEDIUM` (0 = HIGH, 1 = MEDIUM, 2 = LOW; 3 = 400); `"deadline": "2026-10-10T23:30:00Z"` e `"2026-10-10T10:00:00"` respondem 201/200 e gravam `2026-10-10`, enquanto `"...-03:00"` dá 400 (comportamento inconsistente). Idem em `date` da reserva. O contrato diz string do enum e `format: date`. Provável efeito do Jackson padrão (vale para outros campos de data e enums; `type` numérico em `/v1/transactions` já é 400).
- Impacto: baixo (nenhum 5xx, nenhuma gravação errada de dia visível), mas um cliente que mande data-hora com fuso pode gravar o dia errado em silêncio.
- Evidência: `GoalSecurityQaIT.tiposFrouxos` (`@Disabled("BUG-QA-30...")`).

### 🟢 BUG-QA-31 — `@NoControlChars` e `@Size` em `@RequestParam` não são avaliados (back)

- Repro: `GET /v1/exports/transactions.csv?q=a%00b`, `?q=a%0Ab`, `GET /v1/transactions?q=a%00b` e `GET /v1/entries?...&q=a%00b` respondem 200 (os validadores só valem com `@Validated` na classe; o `ExportController` não tem; só `InvoiceController` tem). O limite de tamanho de `q` (300 caracteres) é recusado pelo `TransactionFilter`, então o único que escapa é o caractere de controle. Nenhum 5xx e nenhum efeito no arquivo.
- Evidência: `GoalExportQaIT.qComControle` (`@Disabled("BUG-QA-31...")`).

### 🟢 BUG-QA-32 — caminhos com `%00`, `%2F` ou dígitos não ASCII devolvem 400 sem corpo (fora do `problem+json` do contrato) (back/contrato)

- Repro: `GET /v1/summaries/2026-10%00`, `/v1/summaries/2026%2F10` e `/v1/summaries/%D9%A2%D9%A0%D9%A2%D9%A6-%D9%A1%D9%A0` respondem 400 com corpo vazio e sem `Content-Type` (rejeitados antes do controlador, provavelmente pelo firewall HTTP). O contrato manda `400 SUMMARY_MONTH_INVALID` em `problem+json`. O cliente que só lê o `code` ficará sem ele. Mês inválido "normal" (ex.: `2026-13`) responde certo.
- Evidência: `GoalBordersQaIT.entradasInvalidas` (imprime `QA-E5-PATH ... corpo vazio=true`; o teste usa o MockMvc direto para essas três e documenta).

### Observações (🟢, sem ação obrigatória)

- **Meta arquivada x `version`**: `PUT` de meta arquivada com `version` velha responde 409 (e não 422 `GOAL_ARCHIVED`), porque a versão é conferida primeiro. Aceitável; o front trata os dois.
- **Reserva em conta arquivada**: arquivar a conta (saldo zero) não exige liberar as reservas; elas continuam em `Account.reservedAmount`, em `balances.reserved` e em `uncovered` (ex.: reservado 100,00 e saldo 0,00) até o usuário liberar (a liberação é permitida). Coerente com S-249, mas o disponível fica abatido por uma conta que o usuário já arquivou; sugiro um aviso na UI ou exigir a liberação ao arquivar.
- **`includeTrend`** aceita `yes`, `1`, `on`, `no`, `0`, `off` (conversão booleana padrão do Spring); `sim` é 400; `horizon=` vazio usa M6. Sem risco.
- **Tendência**: a média é arredondada HALF_UP (683,33 de 2.050,00/3) e conta o consumo da 1ª parcela na competência dela; o consumo mensal negativo por reembolso em mês posterior (observação de domínio da Etapa 4) não afetou a tendência, que ignora reembolsos.
- **Desempenho (🟡, não bloqueia)**: toda escrita de meta (e toda leitura de dashboard, resumo, projeção, lista de metas e contas) carrega o `FinancialRecords` inteiro do usuário (S-79). Com 10.000 movimentações: reservar = 1,0 s e leituras 0,3 a 0,6 s; com 50.000: reservar = 5 a 6 s e leituras 1,8 a 3,5 s. O CSV (4 a 5 MB) e o backup (57 MB, heap +121 MB) cabem no heap padrão de 2 GB. O custo é linear, sem teto de movimentações por usuário; passando de ~100 mil movimentações a leitura única vira o gargalo (S-257 já avisa). Vale um índice de uso real antes de otimizar.

## 4. Testes adicionados

Todos em `backend/src/test/java/com/moneylog/qa/` (37 testes de IT novos):

- `GoalQa.java` (apoio), `GoalPropertyQaIT.java` (propriedade, 1 teste), `GoalConcurrencyQaIT.java` (10), `GoalBordersQaIT.java` (12; 2 desativados), `GoalSecurityQaIT.java` (5; 1 desativado), `GoalExportQaIT.java` (5; 2 desativados), `GoalMigrationQaIT.java` (2), `GoalVolumeQaIT.java` (2).
- `@Disabled` (5 meus, mais o BUG-QA-09 antigo = 6 ignorados na suíte): `GoalBordersQaIT.movimentacaoFuturaNaProjecao` e `realizarOcorrenciaFuturaNaoAumentaOProjetado` (BUG-QA-28), `GoalSecurityQaIT.tiposFrouxos` (BUG-QA-30), `GoalExportQaIT.nomeDoBackupNoFuso` (BUG-QA-29) e `qComControle` (BUG-QA-31).
- Para executar um deles isoladamente: `./mvnw verify -Dtest=NoSuchTest -Dsurefire.failIfNoSpecifiedTests=false -Dit.test=GoalPropertyQaIT -Dfailsafe.failIfNoSpecifiedTests=false -Djacoco.skip=true`.
- A propriedade levou de 9 a 11 min (656 s na execução completa, com a máquina carregada); os testes de volume, 2 min; o resto, segundos.

## 5. Riscos e pendências

- **BUG-QA-28** precisa de decisão de Produto antes de a UI de Projeções (T103) e o bloco "Disponível" (T101) mostrarem o número como certo.
- O `clean verify` completo foi repetido com os meus testes (1 falha minha, corrigida e reexecutada só nessa classe), mas **não** foi repetido inteiro depois da correção; as demais classes novas passaram na execução completa e a propriedade, a concorrência, o volume e a migração não mudaram desde então.
- Não coberto: vários nós (concorrência só em um nó, MockMvc), CORS com pré-voo, restauração de backup (não existe na API), E2E e navegador (T105, front), PDF (fora do escopo), carga acima de 50.000 movimentações e o comportamento com milhares de metas (a lista pagina em memória).
- A escala de relógio da propriedade vai até ~15 dias à frente; as bordas de calendário (31/01, 29/02, 31/12, 2100) foram cobertas por testes dirigidos.
- Testes de segurança de CSV validam o arquivo; a abertura real no Excel/Sheets não foi exercitada (só o conteúdo das células).

## 6. Parecer

**🟡 Aprovado com ressalvas.** Não encontrei nenhuma violação de integridade (PR 01): a reserva nunca cria movimentação nem lançamento, o razão fecha em zero depois de 1.100 operações aleatórias e de concorrência pesada (reservas, liberações, arquivamento da meta e da conta, estorno, fatura, mudança de dias), `reserved`, `available`, projeção, resumo, lista e dashboard concordam por construção, a exportação neutraliza fórmulas e o backup não vaza segredos nem dados de outro usuário, e a migração V5.00 é segura. A ressalva é o **BUG-QA-28 🟠** (projeção e disponível ignoram lançamento com data futura e **sobem** ao realizar uma ocorrência adiantada), que pede decisão de Produto e correção antes de a projeção ser apresentada como confiável; os demais (🟢) são de borda de validação e contrato.
