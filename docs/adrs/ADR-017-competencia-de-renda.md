# ADR-017: competência de renda x caixa

Status: aceita (2026-10-08). Decisão do dono do produto. Planos: `docs/planos/2026-10-05-etapa-5-metas-resumo-projecoes.md` (seção "Competência de renda") e `docs/planos/2026-10-04-etapa-2-contas-movimentacoes.md` (§11). Contrato 2.18.0.

## Contexto
O dono recebe o salário dividido: o adiantamento cai em 16/09 e a folha em 02/10, mas as duas parcelas são a renda de **outubro**. Até aqui a competência de um lançamento era sempre o mês da data efetiva, então setembro aparecia com 1.500 de renda e outubro com 2.500, e o resumo, o dashboard e a poupança do mês mentiam.

## Decisão
1. **Duas coisas diferentes.** O **caixa** (quando o dinheiro cai) fica na data real: `transaction_date` e `effective_date` do posting da conta. A **competência da renda** (a que mês a renda pertence) é um atributo próprio da receita. Só a segunda muda.
2. **Campo opcional `incomeCompetence` (`AAAA-MM`).** Em `INCOME`: `IncomeInput`, `IncomeUpdate`, `Transaction`. Ausente ou `null` = o mês da data (comportamento de sempre). No `PUT`, ausente limpa. Vale só em receita; despesa, transferência, investimento, ajuste, reembolso e as de cartão e dívida não aceitam (contrato `additionalProperties: false`, domínio e banco). Janela 2000-01..2100-12 (`422 INCOME_COMPETENCE_INVALID`; formato inválido `400`). Importação CSV/OFX não preenche.
3. **Uma única fonte da regra: o posting.** `Posting` passa a ter `competence`, que é o mês de `effectiveDate` salvo no livro `INCOME`, onde pode ser outro mês. Toda leitura que agrupa por competência já lia `Posting.competence()` (`Ledger.inCompetence`, `ConsumptionReport`, `EntryReport`, `MonthlySummary`, `DashboardSummary`, `IncomeExpenseSeries` em `MONTH`), então a mudança é num ponto só e o dashboard, a lista (`entries`) e o resumo do mesmo mês coincidem por construção (PR 01, regra 10). A coluna `ledger_postings.competence` (já existente) deixa de ser forçada a `to_char(effective_date)` para o livro `INCOME` (migração V8.15, que mantém a regra para os demais livros e acrescenta janela e formato). `transactions.income_competence` guarda a declaração, para a edição, o backup e a trilha de revisões; o agregado confere que o posting concorda com ela.
4. **Quem muda e quem não muda.** Mudam (lêem a competência): `MonthlySummary` (renda, resultado, taxa de poupança, comparação com o mês anterior), `month.*` do dashboard, `GET /v1/entries?competence=` e seus totais, `GET /v1/reports/income-expenses` com `period=M12` (ponto `MONTH`, `basis = COMPETENCE`), a renda mensal usada em `GET /v1/debts/overview`. Não mudam (caixa, por data): saldo e `currentBalance`, `CashPosition`, `totals.cashFlow`, patrimônio, compromissos e projeções (`CommitmentSchedule`), `income-expenses` com `D7`/`D30`/`M3` (`basis = DATE`: quando a renda **entrou**), relatório de consumo por categoria (só consumo), faturas e dívidas.
5. **Recorrência.** `RecurrenceInput`/`RecurrenceUpdate.incomeCompetenceOffsetMonths` (0 padrão, ou 1; só em receita, `RECURRENCE_INVALID` nos outros tipos). A ocorrência realizada herda `incomeCompetence` = mês da data da ocorrência + deslocamento (0 = sem competência declarada). Ocorrências já realizadas não mudam quando o modelo muda. No `PUT` da recorrência, o campo ausente mantém o atual.
6. **Estorno e edição.** Estornar desativa o posting da renda onde ele estiver (nada sobra no mês declarado). Editar troca o grupo de postings (desativa o antigo, grava o novo) e a trilha `transaction_revisions` guarda `incomeCompetence` do estado anterior quando existir.
7. **Exportação.** CSV ganha a 10ª coluna (`Competência da renda`/`Income month`, vazia quando não declarada). O backup JSON ganha `BackupTransaction.incomeCompetence`, `BackupRecurrence.incomeCompetenceOffsetMonths` e `BackupPosting.competence` (restaurável sem recalcular a regra).

## Invariantes (PR 01)
- Saldo, caixa e patrimônio idênticos com e sem o campo; consumo inalterado.
- Σ da renda de todos os meses = Σ de todas as entradas ativas: mover de mês só troca o balde, nenhum centavo some ou duplica. Em cada mês afetado a diferença é exatamente o valor movido.
- Dashboard, `entries` e resumo do mesmo mês coincidem; série `MONTH` = resumo; séries `DAY`/`WEEK` = caixa.
- Renda nunca é dupla contada: uma receita é um posting `INCOME`; transferência, investimento, empréstimo e ajuste não têm livro `INCOME`.

## Consequências e limites
- A soma dos dias de um mês civil na série `DAY`/`WEEK` deixa de ser igual ao ponto `MONTH` quando há renda de outro mês (isso é o esperado: caixa x competência); a renda total do período é a mesma.
- Uma renda atribuída a um mês futuro não aparece no resumo/dashboard do mês corrente nem na janela `M12` até esse mês chegar à janela, mas já está no caixa.
- Projeções e compromissos (`/upcoming`, `/projections`) seguem por data de caixa: uma ocorrência prevista de recorrência com deslocamento 1 entra na data em que o dinheiro cai.
- Contrato 2.18.0, só acréscimos; migração V8.15 aditiva (linhas existentes valem como estão). Os testes de propriedade (`RendaDeOutroMesTest`, 40 sementes) e `IncomeCompetenceIT` provam as invariantes.
