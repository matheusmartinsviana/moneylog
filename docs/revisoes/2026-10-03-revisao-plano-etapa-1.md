---
tipo: revisão de plano
alvo:
  - docs/planos/2026-10-03-etapa-1-dominio-arquitetura.md
  - docs/arquitetura/dominio-financeiro.md (D1)
  - docs/arquitetura/arquitetura.md (D2)
data: 2026-10-03
autor: revisor
parecer: 🟡 Aprovado com ajustes
---

# Revisão do plano: Etapa 1 (domínio, arquitetura e fundação)

## 1. Resumo

O plano é sólido. O razão de partidas dobradas resolve a regra central do PR 01: despesa é só o que cai no livro `EXPENSE`, então transferência, investimento, empréstimo e pagamento de fatura não têm como virar gasto. Conferi os 9 casos da tabela um por um, com os postings de D1. **Todos batem numericamente** e nenhum deles gera dupla contagem. O calendário da fatura (fechamento, vencimento, referência, período) está internamente coerente e os exemplos dos critérios de aceite estão certos.

Os problemas estão nas bordas do modelo. Algumas regras de cartão bloqueiam o registro de situações reais (lançamento tardio, estorno maior que a fatura aberta, pagamento do valor real da fatura). O estorno de movimentações ligadas a faturas e dívidas não tem guarda. A fonte dos postings que não vêm de uma movimentação não está definida. Ninguém dispara as transições de estado da fatura, que dependem da data. A lista de movimentações não tem como bater com o dashboard por competência. Metas, que estão no MVP, não foram modeladas.

Nenhum desses pontos invalida o modelo, mas vários afetam tasks desta etapa (T4, T6, T8, T11). Por isso o parecer é **aprovado com ajustes**: dá para começar T1, T2, T3, T10 e toda a trilha de frontend (T13–T18) já. **T4, T6, T7, T8 e T11 só começam depois dos ajustes 🟠 e das decisões do usuário listadas na seção 5.**

Corrigi direto nos documentos três achados inequívocos (seção 3.1).

## 2. Itens conformes

- **Integridade financeira (PR 01).** Cada movimentação gera postings que somam zero (D1 §1.1). Os 11 tipos do PR 01 são distintos (`TransactionType`). Compra no crédito só existe como `CARD_PURCHASE`, porque `CREDIT` não é `PaymentMethod`. A devolução de empréstimo nunca gera `INCOME`. Os testes obrigatórios do PR 01 §36 estão todos mapeados (D1 §3, T8, T12).
- **Conferência numérica dos 9 casos** (cenário base de D1 §3):

  | #   | Postings                                                     | Caixa                             | Consumo                | Patrimônio (Σ ACCOUNT+RECEIVABLE+CARD+PAYABLE) | Compromisso                                              | OK  |
  | --- | ------------------------------------------------------------ | --------------------------------- | ---------------------- | ---------------------------------------------- | -------------------------------------------------------- | --- |
  | 1   | EXP +100 / ACC −100                                          | −100                              | +100                   | −100                                           | —                                                        | ✅  |
  | 2   | por parcela: EXP +200 / CARD −200 (só a 1ª efetiva em 10/10) | 0                                 | 200 em out (não 1.200) | −200                                           | 200 (fatura nov) + 1.000 (dez–abr) = 1.200; limite 8.800 | ✅  |
  | 3   | CARD +1.283 / ACC −1.283                                     | −1.283                            | 0                      | 0                                              | −1.283                                                   | ✅  |
  | 4   | ACC(XP) +1.000 / ACC(Nubank) −1.000                          | 0 líquido                         | 0                      | 0                                              | —                                                        | ✅  |
  | 5   | ACC(XP Invest) +10.000 / ACC(Nubank) −10.000                 | −10.000 líquido / +10.000 invest. | 0                      | 0                                              | —                                                        | ✅  |
  | 6   | RECV +300 / ACC −300                                         | −300                              | 0                      | 0                                              | +300 entrada                                             | ✅  |
  | 7   | ACC +300 / RECV −300                                         | +300                              | 0, receita 0           | 0                                              | entrada removida                                         | ✅  |
  | 8   | PAY −200 / EQUITY +200                                       | 0                                 | 0                      | −200                                           | 200 saída                                                | ✅  |
  | 9   | ACC +50 / EXP −50                                            | +50                               | −50                    | +50                                            | —                                                        | ✅  |

  Ciclo de 6 meses (§2.5.4 e T8 CA2): Σ consumo = 1.200, Σ caixa = −1.200, livro `CARD` = 0. Cada parcela k tem data efetiva anterior ao fechamento da sua fatura (compra antes do fechamento: mesmo mês; no dia ou depois: mês seguinte), então o livro `CARD` sempre contém a fatura inteira quando ela é paga. ✅

- **Calendário da fatura.** A regra "primeiro fechamento estritamente posterior" e o período "fechamento anterior inclusive até a véspera" são coerentes. Conferi T5 CA1–CA3: 24/10 → fecha 25/10, vence 05/11, ref. 2026-11; 25/10 e 26/10 → 25/11 e 05/12; fechamento 3 e vencimento 10 → mesmo mês; fechamento 31 em fevereiro → 28/02; virada de ano → 05/01/2027. ✅
- **Aritmética dos critérios.** `allocate`: 1.000/3 = 333,34 + 333,33 + 333,33; 0,05 em 6x rejeitado. Pagamento parcial: 1.283 − 500 = 783. Limite: 10.000 − 1.200 = 8.800 → 9.000 → +1.000 no cancelamento. Recorrência: 50 × 52 / 12 + 119 = 335,67 em HALF_EVEN. Datas: dia 31 mensal → 31/01, 28/02, 31/03, 30/04 (o teste obriga a calcular a partir da âncora e não da data anterior, o que é bom); 29/02/2028 bissexto. ✅
- **Dinheiro.** Centavos `long`, `addExact`, rejeição de mais de 2 casas, string decimal na API, `MoneyPipe` só formata e usa a moeda do dado (FE 04). ✅
- **Arquitetura.** `core`/`infra` com ArchUnit e dependency-cruiser, regras testadas com violação proposital. Exceções em hierarquia mapeadas por tipo, `ProblemDetail`, 500 sem mensagem interna (BE 04). `ddl-auto: validate`, constraints nomeadas, Testcontainers com a mesma imagem (BE 05, BE 07). Segredos só no `.env`, actuator só `health`, owner sem cadastro público (BE 06). ✅
- **Contrato (BE 04 / FE 05), no geral.** Criação devolve `201` + `Location` + recurso completo. Há `PUT` com `version` e `409`. Ações devolvem o recurso atualizado. `Slice`, `Idempotency-Key`, `bucket` calculado no backend, `impact` pronto, `422` com `code` estável. ✅
- **Tasks.** Usam Dado/Quando/Então mensurável, têm dono e citam as suposições que tocam. As fábricas ficam em arquivos separados para T5/T7/T9 poderem correr em paralelo. As trilhas de back e front são independentes. Os testes de domínio usam factories `umX()` e relógio fixo (BE 07). ✅
- **Escopo.** Segue a ordem do PR 02 (domínio + arquitetura primeiro) sem implementar casos de uso nem endpoints. Não há funcionalidade fictícia: as ações dos estados vazios ficam desabilitadas (S-33). Dream Board está fora (pós-MVP). ✅
- **Vault (PR 02 item 21).** D1 §5 modela `Note`/`NoteLink`, backlinks, wikilinks, frontmatter na exportação, links pendentes na importação e renderização sanitizada, além da invariante "o vault não afeta nenhuma lente". O schema não fecha a porta. ✅ Os ajustes estão nos achados 15 e 16.

## 3. Achados

### 3.1 Corrigidos diretamente (inequívocos)

| #   | Sev. | Arquivo:linha                              | Problema                                                                                                                                                                                                                                                                                     | Correção aplicada                                                                                                                                                     |
| --- | ---- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | 🟠   | plano:250 e mermaid:468                    | T8 dependia só de T6 e T7, mas o `CommitmentSchedule` de T8 inclui o compromisso `RECURRENCE` (D1 §2.8), que vem de T9. Na tabela de ondas T9 já vinha antes de T8, mas o "Depende de" e o grafo, que a sessão principal usa para despachar, estavam errados.                                | Agora é `Depende de: T6, T7, T9`, e o mermaid ficou `T6 & T7 & T9 --> T8`.                                                                                            |
| C2  | 🟠   | arquitetura.md:114                         | §3.5 dizia que a auth seria registrada na **ADR-002**. §7 da própria arquitetura e §8 do plano dizem ADR-003, e a ADR-002 é a do razão/dinheiro.                                                                                                                                             | Trocado para **ADR-003**.                                                                                                                                             |
| C3  | 🟠   | dominio-financeiro.md:282 e plano:48 (S-8) | A justificativa da S-8 dizia que ela "segue o '—' da tabela do PR 01", mas o próprio modelo dá **−200** de patrimônio na compra (D1 §3, caso 2). A S-8 é uma das suposições que o usuário precisa decidir, e a justificativa contradizia o documento, o que pode levar a uma decisão errada. | A justificativa agora descreve o efeito real (−200 por competência, parcelas futuras fora do patrimônio) e a alternativa (−1.200 na compra). A regra em si não mudou. |

### 3.2 Apontados (não corrigidos: exigem decisão ou redesenho)

**🟠 Altos**

1. **🟠 Estorno sem guarda para movimentações ligadas a fatura ou dívida.** D1:98 (regra transversal 1) × D1:99 (regra 2) × T4 CA9.
   - **Problema:** o `void` remove os postings em todas as lentes, inclusive em meses passados. A edição de uma `CARD_PURCHASE` com parcela em fatura `CLOSED`/`PAID` é proibida, mas o estorno não. Estornar uma compra já paga deixa a fatura `PAID` com total menor que o pago e o livro `CARD` positivo. O mesmo vale para um reembolso no cartão já abatido numa fatura fechada, para um `LOAN_GIVEN` cuja dívida já tem quitações (recebível negativo) e para um `MONEY_RECEIVED`/`DEBT_PAYMENT` (o status da dívida precisa voltar).
   - **Impacto:** razão inconsistente com a fatura e a dívida; o dashboard diverge da fatura.
   - **Correção sugerida:** estender a regra 2 ao estorno (compra com parcela em fatura fechada ou paga não é estornada: a correção é `cancelRemainingInstallments` + `REFUND`). Definir o efeito do estorno no status da dívida. Adicionar critérios de aceite em T6 e T7.
2. **🟠 S-14 + S-16: o valor real da fatura não pode ser pago.** D1:135-136.
   - **Problema:** uma compra feita em 20/10 e registrada em 27/10, depois do fechamento de 25/10, vai pela S-14 para a próxima fatura aberta. A fatura real do banco (ref. nov) inclui essa compra, mas a fatura do app não. Quando o usuário paga o valor do banco, a S-16 rejeita o pagamento por estar acima do saldo devedor. Esse atraso de registro perto do fechamento é muito comum. Além disso, o banco aloca pela data de processamento, não pela data da compra (posto, compra internacional), então o calendário determinístico às vezes vai errar.
   - **Impacto:** a fatura do app não bate com a do banco, e o pagamento é bloqueado.
   - **Correção sugerida:** permitir alocar o item em fatura `CLOSED` ainda não paga, com sinalização de "lançamento tardio", e/ou permitir que o usuário mova um item entre a fatura anterior e a seguinte enquanto nenhuma das duas está `PAID`. Decisão do Produto.
3. **🟠 S-18 contradiz o próprio D1.** D1:122 × D1:137.
   - **Problema:** §2.5.2 diz que, no cancelamento, "o valor já cobrado volta como `REFUND` no cartão". Esse estorno costuma ser maior que a fatura aberta (devolução de um item de R$ 1.083 já pago com fatura aberta de R$ 200) e a S-18 rejeita. É o mesmo princípio que a S-5 e a S-11 defendem ("o registro não pode ser bloqueado"), aplicado ao contrário.
   - **Impacto:** o usuário não consegue registrar um estorno real.
   - **Correção sugerida:** saldo credor transportado para a próxima fatura (o `total` aberto pode ficar negativo e vira crédito na seguinte), ou abatimento em cascata nas faturas futuras. Decisão do Produto.
4. **🟠 Postings sem movimentação: a origem não está definida.** D1:66 (saldo inicial), D1:157 (dívida sem movimentação), D1:159 (perdão) × arquitetura.md:99-101 × T11.
   - **Problema:** a leitura filtra "só movimentações ativas", mas o saldo inicial, o reconhecimento da dívida `WITHOUT_MOVEMENT` e o perdão geram postings sem `Transaction`. A parcela cancelada também desativa só parte dos postings da compra. T11 cria `ledger_postings` sem dizer de onde vem cada linha nem como ela é desativada.
   - **Impacto:** o schema de T11 nasce errado ou essas regras viram exceção no SQL das lentes.
   - **Correção sugerida:** `ledger_postings` com `source_type` (`TRANSACTION`, `INSTALLMENT`, `ACCOUNT_OPENING`, `DEBT_RECOGNITION`, `DEBT_CANCELLATION`) + `source_id` + `active` por posting. A alternativa é modelar essas três origens como `ADJUSTMENT`-like `Transaction`. Definir em D1 §1.1 antes de T11 (dono: Arquitetura).
5. **🟠 Ninguém dispara as transições da fatura que dependem do tempo.** D1:130-134; o contrato não tem endpoint para isso.
   - **Problema:** `close(hoje ≥ closingDate)` e `markOverdue(hoje > dueDate)` dependem do relógio, mas não há job agendado nem cálculo na leitura. Se o status for gravado, uma fatura vencida continua `CLOSED` até alguém chamar o método, e o `bucket`, o "atrasado" e a S-14 ficam errados.
   - **Correção sugerida:** decidir agora se o status `CLOSED`/`OVERDUE` é **derivado** de (`hoje`, datas, `outstanding`), que é mais simples e determinístico com o `Clock`, ou se é gravado por job idempotente. A decisão vai em D1 §2.5.3 e em ADR-002 (dono: Arquitetura). Afeta T6 e T11.
6. **🟠 A lista de movimentações não tem como bater com o dashboard por competência.** arquitetura.md:151; PR 01 regra 10.
   - **Problema:** em outubro o dashboard mostra crédito de 200, mas `GET /v1/transactions?from&to` lista a compra de 1.200 em 10/10. O contrato não tem visão por parcela/competência nem totais no `Slice`. O DS 01 pede "totais calculados e linhas de resumo fixas". Sem isso, o front teria de somar, o que é proibido.
   - **Correção sugerida:** `GET /v1/transactions?competence=YYYY-MM&view=entries` (uma linha por parcela/posting de consumo) e um bloco `totals` calculado pelo backend no mesmo filtro, ou `GET /v1/transactions/summary?<mesmos filtros>`. T8 CA8 deveria testar exatamente essa igualdade (dono: Backend + Arquitetura).
7. **🟠 Metas (MVP item 14) não foram modeladas.** D1 inteiro; S-22; `NoteLink.GOAL`.
   - **Problema:** o PR 02 coloca a modelagem do domínio como etapa 1, e Metas mexe com dinheiro ("valor atual", contribuições, "reservado"). Se uma contribuição virar despesa, há dupla contagem.
   - **Correção sugerida:** pelo menos uma seção em D1 que diga se a contribuição é transferência para uma conta/reserva, reserva lógica sobre o saldo, ou só acompanhamento, e qual livro ela toca. Não precisa de task de código nesta etapa (dono: Produto).
8. **🟠 A categoria inicial "Investimentos" abre caminho para contar investimento como despesa.** D1:72 × PR 00 §10 × PR 01.
   - **Problema:** as 14 categorias do PR 00 incluem "investimentos". Se ela for criada com `kind = EXPENSE`, um `EXPENSE` nessa categoria entra no consumo, que é o que o PR 01 proíbe. Isso contradiz a afirmação de D1:39 de que "não existe caminho para dupla contagem".
   - **Correção sugerida:** definir que "Investimentos" não é categoria de despesa (o registro é o tipo `INVESTMENT`, e a categoria serve só para classificar aplicações) ou que ela é rejeitada em `EXPENSE`. Decidir antes da seed da Etapa 2 (dono: Produto).
9. **🟠 S-28: Spring Boot 3.5.x pode já estar fora do suporte OSS.** arquitetura.md:50; plano S-28.
   - **Problema:** pelo que sei, o suporte OSS da linha 3.5 terminou em junho de 2026 (confirmar em spring.io). Começar uma base nova em out/2026 numa linha sem patches de segurança pública contradiz a justificativa de "menor risco".
   - **Correção sugerida:** T1 confere a política de suporte antes de fixar a versão. Se a 3.5 estiver fora do suporte, usar 4.x (springdoc 3.x) e registrar a escolha na ADR (dono: Arquitetura).

**🟡 Médios**

10. **🟡 T8 é grande demais.** plano:235-250. São 5 calculadoras, a suíte do PR 01, o ciclo de 6 meses, os horizontes, o disponível e a consistência entre dashboard e lista. Sugiro dividir em T8a (caixa, consumo e patrimônio + `IntegridadeFinanceiraPR01Test` + ciclo) e T8b (`CommitmentSchedule`, horizontes, disponível e `DashboardSummary`). T4 (10 critérios, 6 fábricas e estorno) e T6 (10 critérios) estão no limite: aceitável, mas vale vigiar.
11. **🟡 Fórmula do limite disponível × pagamento parcial.** D1:105. O limite usa "Σ parcelas não pagas", e a parcela só vira `PAID` quando a fatura inteira é paga. Um pagamento parcial de 500 não devolve limite nenhum, mas o banco devolve 500. Sugestão: `limite − (Σ outstanding das faturas fechadas + Σ total das faturas abertas e futuras)`. "Créditos ainda não abatidos" fica ambíguo com a S-18.
12. **🟡 Não há estado para "fatura futura".** D1:175 diz "fatura `OPEN` ou futura", mas a máquina de estados só tem `OPEN`. Com parcelas em 6 faturas, seis faturas ficam `OPEN` ao mesmo tempo, e a S-14 ("próxima aberta") e a S-18 ("fatura aberta") ficam ambíguas. Definir "fatura corrente" = a `OPEN` com o menor `closingDate`, ou criar o estado `FUTURE`.
13. **🟡 A mudança de `closingDay`/`dueDay` pode violar a unicidade `(cardId, referenceMonth)`.** D1:111-114. Exemplo: com fechamento 25 e vencimento trocado de 5 para 28, a fatura que fecha em 25/10 vence em 05/11 (ref. nov) e a seguinte vence em 28/11 (ref. nov também). Sugestão: unicidade por `(card_id, closing_date)` e `referenceMonth` derivado, só para exibição, ou uma regra explícita de transição.
14. **🟡 Forçar a importação de uma duplicata viola o índice único.** D1:253 × D1:254 × T11 CA5. "O usuário pode forçar" uma linha `DUPLICATE`, mas o índice parcial `(user_id, dedup_key) WHERE ACTIVE` vai recusar. É preciso definir se a linha forçada recebe `dedup_key` com sufixo ou nulo.
15. **🟡 Vault: `path` único × lixeira e wikilink por título.** D1:232-234.
    - (a) O `path` único por usuário com `deletedAt` precisa de índice parcial `WHERE deleted_at IS NULL`, senão a lixeira bloqueia recriar a nota.
    - (b) O Obsidian resolve `[[...]]` pelo **nome do arquivo**, não pelo título. `[[Título]]` quebra a ida e volta se o título for diferente do nome do arquivo.
    - (c) Falta definir o que acontece com os wikilinks de outras notas quando uma nota é renomeada (o Obsidian atualiza).
    - (d) Anexos (imagens) de um vault Obsidian não foram modelados. Pode ficar fora, mas precisa ser dito.
16. **🟡 O vault não tem etapa definida.** plano:32. "Na etapa dele" não diz qual etapa. Como ele entrou no MVP por decisão recente (ADR-001), um roadmap de etapas, mesmo de uma linha cada, evita que fique esquecido.
17. **🟡 Dívida sem movimentação e "rachar a conta".** D1:157. `PAYABLE −X / EQUITY +X` nunca gera consumo. Se um amigo pagou o meu jantar, o gasto real nunca aparece. No caso inverso (paguei 200 por Pix e o João me deve 100), o consumo fica 200 em vez de 100, e o modelo não tem como um recebível reduzir a despesa. Está coerente com o PR 01 (consumo 0 no caso 8), mas é um caso comum que merece pergunta ao Produto: categoria opcional na dívida e/ou "divisão de despesa".
18. **🟡 `INSTALLMENT` × `INVOICE_FORECAST` no `upcoming`.** arquitetura.md:244. O item `INSTALLMENT` já está contido em `INVOICE_FORECAST`, mas vem na mesma lista. Sugiro marcar `informational: true` ou aninhar o item dentro da fatura, e trazer os totais prontos, para nenhum consumidor somar duas vezes.
19. **🟡 S-8 sem campo no contrato.** arquitetura.md:241. `netWorth` não traz as parcelas futuras do cartão. Se a S-8 for mantida, adicionar `cardFutureInstallments` (informativo) para a UI explicar "patrimônio não inclui R$ X de parcelas futuras".
20. **🟡 Contrato incompleto para pessoas e dívidas.** arquitetura.md:168-170. `TransactionInput` usa `debtId`/`personId`, e o caso 8 (dívida sem movimentação) precisa de `POST /v1/debts`, mas não há endpoints de pessoas e dívidas. Pode ficar para a etapa delas, desde que conste do plano.
21. **🟡 BCrypt no `.env` do Compose.** plano T1 CA6. O hash `$2a$10$...` é interpolado pelo Docker Compose (`$`). Documentar o escape `$$` no `.env.example` e no README, ou ler de um arquivo.
22. **🟡 Migrações editáveis até o primeiro deploy.** T11. As suposições ainda podem mudar o schema (achados 4, 5, 13 e 14). Vale registrar no plano que as `V1.*` podem ser editadas até existir um banco fora do dev, para não acumular migrações de correção antes do primeiro deploy.

**🟢 Baixos**

23. **🟢 Itens vencidos nos horizontes.** D1:184 diz "entram no primeiro horizonte" e T8 CA6 diz "entram em todos". Os horizontes são cumulativos, então dá no mesmo, mas convém unificar o texto.
24. **🟢 `INCOME.method`.** D1 não lista `method` como campo de `INCOME`, mas o contrato (arquitetura.md:163) exige.
25. **🟢 `impact.consumption` no exemplo.** arquitetura.md:187. A compra de 6x deveria listar as 6 competências (o exemplo mostra uma). Deixar explícito que é truncado.
26. **🟢 Reembolso no "Mês atual".** O `byMethod` e o `credit` não dizem em qual balde entra o reembolso (negativo).
27. **🟢 S-26.** O rendimento como `ADJUSTMENT` se mistura com correções nos relatórios. Um `reason`/subtipo `YIELD` ajuda a evolução patrimonial.
28. **🟢 T11 CA1.** "`ddl-auto: validate` não reclama" é vazio sem `@Entity` (não existem na Etapa 1).
29. **🟢 S-35.** Está no plano, mas não em arquitetura.md §8.

## 4. Riscos

| Risco                                                                      | Impacto                            | Mitigação                                                                                                                   |
| -------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Achados 2, 3, 5 e 12 mudarem o modelo da fatura depois de T6 implementada  | retrabalho em T6/T8/T11            | resolver antes de T6 e de T11                                                                                               |
| Calendário determinístico × alocação real do banco (data de processamento) | fatura do app diverge da do banco  | ajuste manual de alocação (achado 2) e conciliação com o extrato na etapa de importação                                     |
| Usuário ausente: as suposições viram fato por inércia                      | regra errada consolidada em testes | marcar no plano que os testes de S-8/12/13/14/18/21 são parametrizáveis e listar as decisões abaixo para a volta do usuário |
| Linha do Spring Boot sem suporte                                           | patches de segurança               | achado 9                                                                                                                    |

## 5. Pendências por dono

**Produto (decisão do usuário)**

- [ ] **S-8** (destaque): o patrimônio reconhece o cartão por parcela (−200/mês) ou o total na compra (−1.200)? A opção atual é coerente com o consumo, mas otimista: o banco cobra os 1.200. Ela é aceitável **se** a UI mostrar as parcelas futuras ao lado do patrimônio (achado 19).
- [ ] **S-12** (destaque): a compra no dia do fechamento vai para a fatura seguinte. É o padrão mais comum (Nubank e outros), mas varia por emissor. Recomendo aceitar e prever um ajuste manual de alocação (achado 2) em vez de configuração por cartão agora.
- [ ] **S-13** (destaque): referência = mês do vencimento. É razoável e só afeta o rótulo, mas hoje também é chave de unicidade (achado 13). Recomendo aceitar e trocar a unicidade para `closing_date`.
- [ ] **S-14 / S-15 / S-16 / S-18** (arriscadas): juntas, impedem registrar situações reais (lançamento tardio, pagar o valor real da fatura, antecipar pagamento, estorno maior que a fatura aberta). Isso contradiz o princípio da S-5/S-11. Decidir entre saldo credor transportado e alocação ajustável (achados 2 e 3).
- [ ] **S-21** (destaque, arriscada): "disponível = em contas − comprometido até o fim do mês". No dia 30/10, a fatura que vence em 05/11 não é descontada e o disponível dá um salto na virada do mês. Alternativas: usar o horizonte de 30 dias (`d30`, que já é calculado) ou "até o próximo vencimento de fatura". Recomendo `d30`, que é mais conservador e estável.
- [ ] Metas: como a contribuição toca o dinheiro (achado 7).
- [ ] Categoria "Investimentos" (achado 8).
- [ ] Divisão de despesa / dívida que nasce de consumo (achado 17).
- [ ] Regras de estorno de movimentações vinculadas (achado 1).

**Arquitetura**

- [ ] **S-30** (destaque): o login próprio com JWT curto em memória + refresh rotativo em cookie `HttpOnly; SameSite=Strict` e checagem de `Origin` é adequado para um usuário só, num domínio único (CloudFront). Ele é desvio de FE 06 e precisa da ADR-003 antes da Etapa 2 (referência corrigida em C2). Para um app financeiro exposto na internet, avaliar TOTP como segundo fator e bloqueio progressivo no login, além do rate limit. Cuidado com o hash BCrypt no `.env` (achado 21).
- [ ] Origem e desativação dos postings (achado 4).
- [ ] Status da fatura derivado × gravado por job (achado 5).
- [ ] Versão do Spring Boot (achado 9).

**Backend**

- [ ] Visão por competência + totais na listagem (achado 6).
- [ ] Fórmula do limite disponível (achado 11), "fatura corrente" (achado 12), duplicata forçada (achado 14).
- [ ] Dividir T8 (achado 10).

**UX**

- [ ] Como explicar o patrimônio sem as parcelas futuras (S-8, achado 19).

Demais suposições: S-1 a S-7, S-9 a S-11, S-17, S-19, S-20, S-22 a S-27, S-29 e S-31 a S-35 são conservadoras e razoáveis. Não vejo problema nelas além dos ajustes de texto já citados.

## 6. Parecer

**🟡 Aprovado com ajustes.**

O núcleo do modelo está correto e provado no papel: os 9 casos do PR 01 e o ciclo cartão → parcela → fatura → pagamento não geram dupla contagem. O calendário da fatura e todos os números dos critérios conferem. Os achados 🟠 1 a 8, porém, afetam regras que T4, T6, T8 e T11 vão cravar em teste e schema nesta etapa, e vários dependem de decisão do usuário.

Liberado agora: T1, T2, T3, T10 e T13–T18 (e T19/T20 na sequência). **Bloqueado até ajuste do orquestrador e/ou decisão do usuário:** T4 e T7 (achado 1), T6 (achados 1, 2, 3, 5, 11 e 12), T8 (achados 6 e 10 e S-21) e T11 (achados 4, 5, 13 e 14). O 🟠 9 (versão do Spring Boot) se resolve dentro de T1.
