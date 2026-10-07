---
revisao: código do backend da Etapa 5 (T91 a T97)
data: 2026-10-08
revisor: revisor
escopo: backend/ (core.goal, core.finance, infra.goal/summary/projection/export, V5.00) e contracts/openapi.yaml 2.3.0
referencias: docs/planos/2026-10-05-etapa-5-metas-resumo-projecoes.md; docs/revisoes/2026-10-05-revisao-planos-etapas-3-9.md; D1 §2.8/§2.9/§8.5; D2 §4.7; PR 00..02 (PR 01 e regra 10)
---

# Revisão de código: Etapa 5 (backend)

## 1. Resumo

Metas como reserva lógica, `reserved` real, resumo mensal, projeção e exportação estão implementados como o plano pede, e o ponto mais importante da etapa está certo por construção: **a reserva não toca o razão nem `transactions`**. `GoalReserves` é o único cálculo de "reservado" (dashboard, `Account.reservedAmount/uncovered`, `Goal.uncovered` e `Projection.goals` o usam), o resumo mensal e o dashboard compartilham `ConsumptionReport`/`EntryReport` (regra 10 do PR 01 vale por construção), e o último ponto da projeção usa `CommitmentSchedule`, a mesma função de `projected` do dashboard. O backup é um DTO em lista de permissão (sem usuário, hash, tokens ou chaves de idempotência) e o CSV neutraliza fórmula (`= + - @ TAB CR`).

Não encontrei defeito crítico (🔴). Há uma regra de domínio não decidida (conta arquivada com reserva ativa), riscos de escala na exportação (tudo em memória, sem teto documentado) e lacunas de teste (concorrência reserva × arquivamento; propriedades com pouca variância).

Verificação: rodei, numa cópia isolada de `backend/` (o tester T98 mexe em `src/test`), `ArchitectureTest`, `GoalTest`, `GoalUseCasesTest`, `ProjectionTest`, `MonthlySummaryTest`, `CsvCellsTest`, `ExportUseCasesTest`, `ExportAndSummaryWebHelpersTest` e `DashboardSummaryTest`: verdes. Não rodei os ITs (Testcontainers) para não competir com o tester; li `GoalsIT`, `ProjectionIT`, `ExportsIT` e `MonthlySummaryIT`.

## 2. Itens conformes

**Integridade financeira (prioridade 1)**

- `Goal.reserve` só acrescenta `GoalReservation`; `GoalGatewayImpl.save` grava só `goals` e `goal_reservations`. Nenhum caminho cria `Transaction` nem posting (GoalsIT CA2 conta `transactions` e `ledger_postings` antes e depois e confere saldo, consumo, receita e patrimônio).
- Reserva acima do saldo é aceita e sinalizada (`GoalReserves.uncovered`, S-148); nunca bloqueia.
- Liberação: `Goal.ensureReleaseCovered` percorre as reservas da conta em ordem cronológica (reservas antes de liberações no mesmo dia, desempate por `createdAt`) e recusa se o acumulado ficar negativo **em qualquer data**, por meta e por conta. Cobre "liberação que deixaria o saldo negativo por data/meta/conta", inclusive com reservas futuras.
- Reserva com data futura: `current(asOf)`, `reservedAccounts(asOf)` e `reservedOn(account, asOf)` filtram `date <= asOf`; o dashboard com `asOf` futuro usa o mesmo corte.
- Meta arquivada sai do reservado em todas as consultas (`reservedOn`/`reservedAccounts` retornam zero) e desarquivar devolve; meta arquivada não aceita reserva nem edição. ACHIEVED é derivado e o filtro `?status` usa o domínio (não SQL).
- Reservado do dashboard = só `CASH` (S-147); conta `INVESTMENT` conta no `current` da meta e não mexe no disponível.
- `monthlyNeeded`: `ceilDiv` por meses-calendário inclusive, `null` sem prazo ou vencido, 0,00 se atingida (S-156).
- Projeção: itens de primeiro nível do `CommitmentSchedule` (parcelas ficam aninhadas na fatura e não somam), cada compromisso uma vez; o último ponto termina em `horizon.endFrom(today)` e o 1º ponto parte de `LocalDate.MIN`, então `balance` final = `projected` do dashboard (provado em ProjectionTest CA6 e CA8). A meta/reserva não entra na série (`goals` só informa).
- Tendência (S-152): desligada por padrão, série separada, `estimate: true`; `SpendingTrend` exclui `source == RECURRENCE`, tipos diferentes de `EXPENSE`/`CARD_PURCHASE` (reembolso, `DEBT_PAYMENT` etc.), parcelas 2..N, e postings sem `transactionId` (reconhecimento de dívida: `PostingSource.transactionId()` é `null` e o `HashMap.get(null)` do `Collectors.toMap` é seguro). Exige histórico desde o 1º dia do 3º mês anterior (`INSUFFICIENT_HISTORY`).

**Resumo mensal (prioridade 2)**

- `MonthlySummary.of` só compõe `ConsumptionReport`/`EntryReport` (mesmas calculadoras de dashboard e lista); `card.outstanding` usa o mesmo critério dos compromissos (`statusAt(today) != PAID` e `outstanding > 0`, vencimento no mês); `percent` = diferença / |anterior| com 4 casas e `null` com base 0; `savingsRate` `null` sem receita; `partial`/`isProjection` por `Competence` do `today` do fuso do usuário.
- `SUMMARY_MONTH_INVALID`: formato `\d{4}-\d{2}` (ASCII), janela 2000-01 a 2100-12, 400 via `InvalidPathValueException`.

**Exportação e backup (prioridade 3)**

- `BackupResponse` é lista de permissão por campo; sem `userId`, e-mail, hash, tokens, idempotência. Tudo vem de `records.load(userId)`, `categories.list(userId…)`, `people.list(userId…)` e `recurrences.findAll(userId)`: isolamento por usuário; tudo dentro de `snapshotReadOnly` (REPEATABLE READ), então o arquivo é um corte consistente.
- CSV: BOM real (`OutputStreamWriter` UTF-8), `;`, CRLF, escape de aspas/`;`/quebras, prefixo `'` em `= + - @ TAB CR` (CsvCellsTest cobre os seis); descrição, categoria e conta/cartão passam por `CsvCells.text`; os demais campos são enum/data/valor. `Cache-Control: no-store`, `Content-Disposition: attachment` com nome montado só de datas já validadas. As linhas são calculadas antes de qualquer byte (falha vira 4xx/5xx limpo).

**Concorrência (prioridade 4)**

- `ReserveOnGoalUseCaseImpl`: trava a meta (`SELECT … FOR UPDATE`) e depois a conta, a ordem global (meta antes de contas por id) é respeitada, nenhum caso de uso de outra feature trava meta, então não há ciclo. Reserva × arquivar conta: o arquivamento trava a conta; a reserva espera nela e relê a conta arquivada (→ `ACCOUNT_ARCHIVED`). `version` sobe a cada gravação (`GoalEntity.apply` avança `updatedAt`), `PUT` confere `version` (409 `VERSION_CONFLICT`); falha de trava vira 409 `CONFLICT` no `GlobalExceptionHandler`.

**Entrada, FKs e contrato (prioridades 5 e 6)**

- V5.00 contra o domínio: nome 100, descrição 500, nota 200, prioridade, BRL, `target > 0`, `amount <> 0`, FKs compostas `(id, user_id)` para meta e conta (o banco recusa conta/meta de outro usuário). Validação de bean: `@DateInWindow`, `@NoControlChars`, regex de valor com e sem sinal; campos desconhecidos e número JSON onde há string são 400 (config global do Jackson); `Idempotency-Key` opcional no `POST /v1/goals`, obrigatório nas reservas, com hash do comando (mesma chave com outro corpo → 409).
- OpenAPI 2.3.0: `Goal`/`GoalInput`/`GoalUpdate`/`GoalReservation*` com `additionalProperties: false`, `Account.reservedAmount`/`uncovered` são adições compatíveis (não obrigatórias), erros novos documentados, e as respostas são validadas nos ITs por `ContractValidation.conforms()`.

**Arquitetura (prioridade 7)**

- `ArchitectureTest` passa (core sem Spring/Jackson/JPA/infra, sem ponto flutuante, sem ciclo entre features). Casos de uso de meta ficam em `core.finance.app.goals` (e não em `core.goal.app` como o plano dizia) para evitar o ciclo `goal` ↔ `finance`; é uma decisão correta, só vale registrar.

## 3. Achados

### 🔴 Críticos

Nenhum.

### 🟠 Altos

**A1. Conta arquivada com reserva ativa: estado permitido, não decidido e não documentado**

- `backend/src/main/java/com/moneylog/core/account/domain/Account.java:178` (`ensureArchivable`) e `core/finance/app/accounts/usecase/ArchiveAccountUseCaseImpl.java:33` só olham os postings da conta; reservas de metas são ignoradas. `GoalsIT.java:201-210` até exercita isso (arquiva a conta com 100,00 reservados) sem afirmar o efeito.
- Efeito: depois de arquivada, a conta (oculta na UI) continua em `GoalReserves.byAccount`; se for `CASH`, `balances.reserved` segue incluindo o valor e `available` cai por dinheiro de uma conta encerrada, `Account.uncovered` fica `true` (saldo 0 < reservado) e `Goal.uncovered` também. O usuário só sai disso liberando a reserva pela meta, o que a UI precisa saber. PR 01 regra 10 e S-148 dizem que a realidade é registrada e avisada, mas ninguém decidiu esse caso.
- Correção sugerida (decisão de Produto, S-157): (a) recusar o arquivamento com reserva líquida positiva (`422 ACCOUNT_HAS_RESERVATIONS`, com a lista de metas), ou (b) excluir contas arquivadas de `GoalReserves.inCash` e sinalizar a meta ("reserva em conta arquivada"). Em qualquer caso, documentar no contrato e cobrir com IT (reserva × arquivar × liberar × desarquivar).

**A2. Concorrência reserva × arquivamento/estorno da conta sem teste, e a ordem de travas só vive em comentário**

- `ReserveOnGoalUseCaseImpl.java:62-67`. A lógica está correta (ver §2), mas `GoalsIT` só prova duas reservas simultâneas na mesma meta (`GoalsIT.java:171`). Não há teste de (i) reserva × arquivamento da mesma conta, (ii) reserva × liberação simultâneas na mesma meta/conta, (iii) reserva em metas diferentes na mesma conta, (iv) timeout/trava → 409 `CONFLICT`. Sem isso, uma alteração futura na ordem (por exemplo, travar a conta antes da meta, como outros casos de uso) reintroduz deadlock sem que nenhum teste quebre.
- Correção sugerida: ITs de concorrência com `CountDownLatch` para (i) a (iii), afirmando "um `200` e um `422 ACCOUNT_ARCHIVED`, ou os dois `200`, nunca 500", e um teste (ArchUnit ou unitário com gateway espião) que registre a ordem `goals.lockForUpdate` → `accounts.lockForUpdate`.

### 🟡 Médios

**M1. Backup e CSV carregam tudo em memória; o plano pedia stream e limite documentado**

- `ExportBackupUseCaseImpl.java:40-42`, `BackupResponse.of` (`BackupResponse.java:103`) e `ExportTransactionsCsvUseCaseImpl.java:52-56`. O CSV monta `List<String[]>` de todas as movimentações e só a escrita é em fluxo; o backup materializa `FinancialRecords` + DTOs + árvore JSON (razão = 2 a 5× o número de movimentações). Sem teto por usuário nem limite de taxa, um usuário grande ou um cliente em laço pressiona a JVM do free tier.
- `ExportsIT.java:317-343` é um teste fraco: o "limite documentado" é só uma mensagem de assert (não está no contrato) e o heap é medido **sem GC depois** (`usedAfter - usedBefore < 400 MB` mede ruído do coletor).
- Correção sugerida: documentar no contrato o volume suportado (por exemplo, "até N movimentações") e devolver 413/422 acima do teto, ou serializar o backup em fluxo (Jackson `JsonGenerator` por seção, lendo as seções em páginas); aplicar limite de taxa por usuário nas duas rotas; trocar a asserção de heap por `System.gc()` antes da leitura final ou removê-la.

**M2. CSV perde o sinal/sentido de `INVESTMENT` e `ADJUSTMENT`**

- `ExportTransactionsCsvUseCaseImpl.java:73-82`: `Valor` é `amount` sempre positivo; a direção (`investmentDirection`: aplicação/resgate, `adjustmentDirection`: crédito/débito) não sai. Quem somar a planilha trata um resgate como aplicação e um ajuste negativo como positivo, justamente o tipo de erro que o PR 01 proíbe.
- Correção: coluna `Direção` (ou `Valor` com sinal pelo efeito no caixa) para `INVESTMENT` e `ADJUSTMENT`; teste com resgate e ajuste de débito.

**M3. Testes de propriedade com pouca variância (o que as "100 e 300 operações aleatórias" realmente provam)**

- `GoalsIT.java:439-504`: todas as reservas usam a mesma data (`2026-10-10`), a liberação nunca excede o reservado e não há meta arquivada, conta arquivada, reserva futura nem conta `INVESTMENT`; portanto não exercita ordem por data, `asOf`, arquivamento nem `uncovered`. As asserções finais comparam com contadores locais que repetem a regra (aceitável como oráculo independente), mas o espaço explorado é estreito. Ainda assim, "o razão fecha em zero e `ledger_postings` só cresce com despesas/transferências" é um teste legítimo, não tautológico.
- `ProjectionTest.java:295-340` (CA8): gera compras no cartão, despesas, dívidas e recorrências, mas não gera ocorrência **realizada**, pagamento de fatura (parcial/total), nem estorno de compra; o oráculo "chaves únicas" sobre `schedule.items()` e "Σ série = `committed(h)`" são do mesmo `CommitmentSchedule` (provam que a série particiona os compromissos e que o último saldo é o do dashboard, não que `CommitmentSchedule` não dobra algo contra o razão). A dupla contagem recorrência realizada × pendente é coberta só pelo caso fixo CA5.
- `MonthlySummaryTest.java:232-275`: bom (compara resumo × dashboard × `EntryReport`), mas as três visões usam as mesmas calculadoras, então o que ele realmente garante é que ninguém reintroduziu uma conta própria no resumo. Falta ao menos uma comparação com a lista paginada por SQL (já existe no IT CA7; ok).
- Correção: variar datas (passadas, hoje, futuras) e incluir arquivamento de meta, reserva em `INVESTMENT`, reserva > saldo e liberação rejeitada (esperar 422 e estado inalterado); incluir no CA8 ocorrência realizada, pagamento parcial de fatura e estorno.

**M3b. Limites da tendência**

- `SpendingTrend.java:38-43`: "histórico completo" é o `min` das datas de qualquer movimentação ativa (inclusive transferência de saldo inicial); um único lançamento antigo basta para `available: true`, mesmo com meses vazios no meio, gerando média baixa. Documentar ou exigir ao menos um lançamento de consumo em cada um dos 3 meses.

### 🟢 Baixos

- **L1.** `Projection.java:93`: o horizonte `M6` gera 7 pontos (mês corrente parcial + 6) e `M12` gera 13; o plano falava em `nov/26…abr/27`. O contrato descreve o comportamento real ("do mês de hoje ao mês do fim do horizonte"); alinhar o plano/FE ou registrar S-157.
- **L2.** `ExportController.java:80`: o nome do backup usa a data **UTC** de `generatedAt`; à noite no Brasil o arquivo sai com o dia seguinte. Usar `time.today()` (fuso do usuário).
- **L3.** `ExportTransactionsCsvUseCaseImpl.java:50-51`: `status=ACTIVE&includeVoided=true` devolve ativas e estornadas (o parâmetro explícito é sobrescrito). Documentar ou responder 400 para a combinação contraditória.
- **L4.** `ExportTransactionsCsvUseCaseImpl.java:70-72`: se `where` fosse nulo a célula sairia `null > Conta`; improvável hoje (toda movimentação tem conta ou cartão), mas vale `Objects.toString(where, "")`.
- **L5.** Coluna `Tipo`/`Método`/`Status` do CSV sai com o nome do enum em inglês mesmo com cabeçalho `pt` (`EXPENSE`); traduzir pelo `Accept-Language` ou documentar como valor estável de máquina.
- **L6.** Contrato: `GET /v1/exports/backup` não declara `500` nem o header `Cache-Control: no-store`; `transactions.csv` não declara `Cache-Control`. Sem teste de `q` > 100 ou com caractere de controle no export (a anotação existe; o IT não cobre).
- **L7.** Backup sem `realizedDates` das recorrências e sem `createdAt`/`version`: derivável das movimentações (`occurrenceDate`), mas um futuro restaurador precisará disso; registrar no `schemaVersion` 1.

## 4. Riscos

- **Reserva em conta arquivada** (A1) deixa o disponível do Início menor sem uma conta visível que o explique.
- **Escala da exportação** (M1) em instância pequena; sem limite de taxa, é o único endpoint do app que vira DoS autenticado barato.
- **Deadlock futuro** se a ordem meta → conta for invertida (A2); hoje só há a ordem certa e nenhum teste que a proteja.
- `GoalViews.of`, a lista e o dashboard recarregam todo o `FinancialRecords` a cada chamada (inclusive `POST /reservations`): correto e consistente com S-79, mas O(n) por requisição.
- Reserva é derivada de `archived` da meta **hoje**: o `reserved` de um `asOf` no passado não é histórico (meta arquivada depois desaparece de datas antigas). Aceitável para "reservado agora"; evitar usar `asOf` passado como relatório.

## 5. Pendências por dono

- **Produto:** decidir A1 (arquivar conta com reserva: bloquear ou ignorar a conta no reservado); definir o teto de volume do backup/CSV (M1); confirmar se o CSV precisa de direção para `INVESTMENT`/`ADJUSTMENT` (M2).
- **Backend:** M1, M2, L2 a L7; ITs de concorrência (A2); ampliar as propriedades (M3).
- **Tester (T98):** A2 e M3 são lacunas de teste; incluir reserva em conta arquivada e `asOf` futuro nas propriedades.
- **Arquitetura:** registrar que os casos de uso de meta moram em `core.finance.app.goals` (decisão correta contra o ciclo) e a regra de ordem de travas "meta antes de contas" em D2 §3 / ADR, com teste.
- **UX/FE:** exibir "reserva descoberta" e "reserva em conta arquivada"; enviar `Idempotency-Key` em toda reserva (é obrigatório no contrato).

## 6. Parecer

**🟡 Aprovado com ajustes.** A garantia central (reserva lógica sem posting, `GoalReserves` único, projeção sem dupla contagem e coerente com `projected`, resumo coerente com lista e dashboard) está correta, a privacidade do backup e a neutralização de fórmula no CSV estão corretas, e a ordem de travas é respeitada. Os ajustes são: decidir e fechar o estado "conta arquivada com reserva" (A1), proteger a ordem de travas com testes de concorrência (A2) e tratar o volume da exportação (M1) antes de expor o produto a contas grandes. Nenhum desses bloqueia a Etapa 5 de seguir para o frontend, desde que A1 vire decisão de Produto antes do fechamento da etapa.
