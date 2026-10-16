# ADR-021: orçamentos mensais em BRL com vigências imutáveis

Status: **Aceito** (2026-10-13), aprovado pelo dono. Plano: `docs/planos/2026-10-13-dashboard-glass-premium.md` (entrega 4, DG-28 a DG-32). Revisão: `docs/revisoes/2026-10-13-plano-dashboard-glass-premium-r2.md` (F-3, F-5).

## Contexto
O orçamento mensal não existe no backend (a rota `/budgets` é uma página "em breve", D3 do ADR-011 só respondida em parte). O dono pediu orçamentos em BRL, sem multimoeda, com backend e frontend. Regras do produto que valem: o sistema não soma tudo e chama de gasto (PR 01); dupla contagem é proibida (regra 1); dashboard e lista vêm da mesma fonte (regra 10); histórico preservado, correção por ajuste, nada apagado em silêncio (regra 7); dinheiro exato (regra 8); estourar um limite nunca bloqueia lançamento.

## Decisão (proposta)

### 1. Modelo
- **`Budget`**: identidade = usuário + categoria de consumo, ou o **total do mês** (sem categoria). Só categorias de consumo; categoria de receita ou do sistema é recusada (`400 CATEGORY_KIND_MISMATCH`); categoria arquivada na criação também (`400 CATEGORY_ARCHIVED`).
- **Linhas de vigência imutáveis**: cada linha tem `effectiveFrom` (competência `AAAA-MM`) e `amount` em BRL (`Money` com 2 casas, > 0). O limite de uma competência é o da linha com maior `effectiveFrom` <= competência. Uma linha de competência **anterior à corrente nunca é alterada**.
- **Alterar limite** (`PATCH`) acrescenta uma vigência com `effectiveFrom` **>= competência corrente** (`America/Sao_Paulo`). **Retroativo é proibido** (`400 BUDGET_EFFECTIVE_FROM_PAST`); corrigir um mês passado exigiria um ajuste explícito e auditado, fora do escopo. Alterar mais de uma vez para a mesma competência substitui apenas a vigência daquela competência corrente ou futura ainda não consolidada, nunca uma anterior.
- **Arquivar/desarquivar**: `archivedFrom` (competência >= corrente); meses anteriores não mudam. Orçamento arquivado deixa de aparecer a partir de `archivedFrom`, mas continua visível nos meses anteriores em que existia e teve gasto. Nada é apagado (sem `DELETE`); `version` para controle otimista (`409`).
- Migração nova `V8.18__budgets.sql` (sem editar migrações já aplicadas): tabelas de orçamento e de vigência, restrições de unicidade (um orçamento ativo por usuário+categoria, uma vigência por orçamento+`effectiveFrom`), gatilho que recusa `UPDATE` de vigência anterior à corrente e `DELETE`, como em `insight_dismissals` (ADR-019).

### 2. O que conta como gasto
Exatamente o **consumo da competência**, a mesma fonte de `GET /v1/entries?lens=CONSUMPTION`, `GET /v1/reports/spending-by-category` e `DashboardSummary.month.consumption`, sem calculadora paralela: a parcela entra na competência dela (compra de R$ 1.200 em 6x = R$ 200,00 por mês); reembolso abate na categoria original; fatura paga, transferência, aplicação, resgate, empréstimo e quitação de dívida ficam **fora**; movimentação estornada não conta; recorrência realizada conta uma vez. O orçamento **total** compara com o consumo do mês inteiro (inclui lançamentos sem categoria) e pode ser maior que a soma dos gastos dos orçamentos por categoria.

### 3. Agendados
Lançamento agendado dentro do mês **conta** no gasto, como no dashboard (S-285), para manter consistência (PR 01 regra 10). Como isso mistura compromisso futuro com consumo realizado, a resposta traz `includesScheduled` e a UI mostra "inclui agendados". **Isto precisa de confirmação do dono** (alternativa: contar só o realizado até hoje, divergindo de `month.consumption`).

### 4. Cálculo e situação (todo no backend)
`spent`, `remaining` (`limit − spent`, pode ser negativo), `ratio` (`spent / limit`, 4 casas, `HALF_UP`, pode passar de 1 e ser negativo) e `status`: `OK` (`ratio` < 0,80, inclusive negativo), `NEAR` (>= 0,80 e <= 1,00) e `OVER` (> 1,00). Reembolso maior que o gasto da categoria dá `spent` negativo, `ratio` negativo e `OK`. Categoria sem orçamento no mês não aparece em `items`. Estourar nunca bloqueia lançamento. O front só formata e exibe.

### 5. API (contrato 2.23.0, aditivo)
`GET /v1/budgets?month=AAAA-MM`; `POST /v1/budgets` (devolve o recurso); `PATCH /v1/budgets/{id}` (`id` é a identidade do orçamento; acrescenta vigência; devolve o orçamento com as vigências); `POST /v1/budgets/{id}/archive` e `/unarchive` (devolvem o recurso). Erros: `VALIDATION_FAILED`, `BUDGET_MONTH_INVALID`, `CATEGORY_KIND_MISMATCH`, `CATEGORY_ARCHIVED`, `BUDGET_EFFECTIVE_FROM_PAST`, `404` (inclusive isolamento entre usuários), `409`, `401`. Mês fora de 2000-01..2100-12 é `400`. `Cache-Control: private, no-store`; leitura em instantâneo único.

### 6. Testes obrigatórios (PR 01)
Gasto = `entries` = `spending-by-category` = `month.consumption` do mesmo mês (propriedade com semente fixa, incluindo horário de verão e virada de ano); parcela, fatura paga, transferência, aplicação, empréstimo, reembolso, estorno e recorrência; alterar no mês N não muda N−1; duas alterações em N; retroativo recusado; arquivar e desarquivar preserva meses passados; gasto negativo; categoria sem orçamento; tipo de categoria inválido; categoria arquivada; isolamento A/B; p95 <= 1,5 s com 10.000 movimentações.

## Alternativas consideradas
1. **Editar o limite no lugar (`PATCH` sobrescreve)**: reescreve o passado e fere a regra 7. Rejeitada.
2. **Um orçamento por mês materializado**: duplica dados e exige rotina mensal. Rejeitada; a vigência resolve com menos linhas.
3. **Rollover do saldo não gasto, orçamento por conta ou cartão, recorrência própria**: fora do escopo.
4. **Contar só o realizado**: mais "caixa", mas diverge de `month.consumption` e quebra a regra 10. Mantida como alternativa a decidir pelo dono (seção 3).

## Consequências
- Histórico auditável e consistente com o dashboard; uma tabela nova e um gatilho a manter.
- O orçamento total e os por categoria podem não somar igual (documentado na UI).
- O orçamento pode ficar `NEAR`/`OVER` por compromisso agendado; mitigado pelo rótulo "inclui agendados".
- Sem multimoeda: BRL fixo; mudar isso exigiria nova ADR.

## Plano de quitação
Depois da entrega 4: revisar a escolha sobre agendados com o uso real; se o dono pedir retroativo ou ajuste de meses fechados, tratar com ajuste auditado e nova ADR.

## O que o dono precisa aprovar
1. Limite mensal por categoria de consumo mais total opcional, em BRL.
2. Vigências imutáveis, alteração só a partir do mês corrente (retroativo proibido) e arquivamento com `archivedFrom`.
3. Gasto = consumo da competência (mesma fonte do dashboard), **incluindo agendados dentro do mês**, rotulado "inclui agendados".
4. Limiar de 80% para "Perto do limite" e a regra de que estourar nunca bloqueia lançamento.
