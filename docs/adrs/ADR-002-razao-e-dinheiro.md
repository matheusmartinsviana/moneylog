---
tags: [moneylog, adr, dominio, backend]
status: aceito (S-8 ainda depende de validação do usuário)
data: 2026-10-03
task: T2 (plano da Etapa 1)
relacionado: docs/arquitetura/dominio-financeiro.md (D1 §1, §2.1, §2.5), PR 01
---

# ADR-002: razão de partidas dobradas, dinheiro em centavos e competência

## Contexto

O PR 01 é a regra mais importante do produto: o moneylog **nunca** soma todas as transações e chama o resultado de "gasto". A mesma movimentação precisa responder a quatro perguntas diferentes (caixa, consumo/receita por competência, patrimônio e compromissos) sem dupla contagem: compra → parcela → fatura → pagamento é **uma** despesa; transferência, investimento, empréstimo e pagamento de fatura não são despesa; a compra parcelada não conta inteira no mês.

Também precisamos de aritmética exata (R$ 0,10 + R$ 0,20 = R$ 0,30, divisão de parcelas que fecha no centavo) e de datas que não dependam do relógio da máquina.

## Decisão

### 1. Dinheiro em centavos `long` (`Money`)

- `Money` = centavos `long` + `CurrencyCode` (ISO 4217, só moedas de 2 casas; o MVP usa só BRL, S-2). Imutável.
- Entrada textual com **no máximo 2 casas** (`"1200.00"`); `"10.005"` é rejeitado, sem arredondamento silencioso. Saída textual com 2 casas, que é o formato da API (`{ "amount": "1200.00", "currency": "BRL" }`).
- `add`/`subtract`/`negate`/`times` usam `Math.*Exact`: overflow vira `MoneyOverflowException`, nunca um número errado.
- Operação entre moedas diferentes lança `CurrencyMismatchException` (subclasse de `BusinessRuleException`).
- `allocate(n)` divide em `n` partes cuja soma é exatamente o total; o resto vai para a **primeira** parte (S-3): 1.000,00 em 3 = 333,34 + 333,33 + 333,33. Parte menor que 1 centavo é rejeitada (0,05 em 6).
- **Nenhum `double`/`float` no core.** Verificado pelo `ArchitectureTest` (campos, assinaturas e chamadas que devolvem ponto flutuante). `BigDecimal` só aparece na conversão de/para texto.

### 2. Razão de partidas dobradas (`Posting`, `BookRef`, `BookType`)

- Toda movimentação gera `Posting(book, amount, effectiveDate)` e os postings dela **somam zero** (`Postings.assertBalanced`). Débito `+`, crédito `−`.
- Livros: `ACCOUNT`, `CARD`, `RECEIVABLE`, `PAYABLE` (patrimônio), `EXPENSE`, `INCOME` (resultado, por competência) e `EQUITY` (abertura e ajustes, sem id).
- As lentes leem livros diferentes: **caixa** = `ACCOUNT`; **consumo/receita** = `EXPENSE`/`INCOME` por competência; **patrimônio** = Σ `ACCOUNT` + `RECEIVABLE` + `CARD` + `PAYABLE`; **compromissos** são calculados à parte (faturas, parcelas futuras, dívidas, recorrências).
- Consequência estrutural: **despesa é só o que cai em `EXPENSE`**. Transferência, investimento, empréstimo e pagamento de fatura não têm posting em `EXPENSE`, então não existe caminho de código para contá-los como gasto.
- Soma diferente de zero é **bug**, não erro do usuário: `UnbalancedPostingsException` estende `DomainException` direto (vira 500), e não `BusinessRuleException`.
- Valor zero não é lançamento (`Posting` rejeita). Uma conta aberta com saldo zero simplesmente não gera postings.

### 3. Competência e tempo

- Datas financeiras são `LocalDate` no fuso do usuário (`America/Sao_Paulo`, S-1). Timestamps técnicos são `Instant` em UTC.
- **Competência** (`Competence`, um `YearMonth`) é sempre o mês da **data efetiva do posting**. Por isso o `BookRef` de `EXPENSE`/`INCOME` guarda só a categoria: a competência vem da data. Na compra parcelada, a parcela `k` tem data efetiva = data da compra + (k−1) meses, com clamp no fim do mês (`DayOfMonthRule`: dia 31 em fevereiro de 2027 = 28/02).
- "Hoje" e "agora" sempre vêm da porta `TimeProvider` (`ClockTimeProvider` sobre `java.time.Clock`). Os testes usam relógio fixo.

### 4. Passivo do cartão por competência da parcela (S-8)

- A compra no cartão gera, **para cada parcela**, `EXPENSE(cat) +p_k` / `CARD −p_k` na data efetiva da parcela. Assim, a compra de 1.200,00 em 6x reduz consumo **e** patrimônio em 200,00 por mês, e não em 1.200,00 na data da compra.
- As parcelas futuras não entram no patrimônio: aparecem em compromissos e no limite disponível (que consome o valor total na compra).
- O pagamento da fatura é `CARD +X` / `ACCOUNT −X`: só caixa e passivo, `EXPENSE` intocado.
- **Esta é uma suposição a validar com o usuário (S-8).** A alternativa (reconhecer o passivo total de −1.200,00 na data da compra) mudaria os postings da compra e exigiria um livro transitório para manter o consumo por competência; o desenho fica para quando (e se) o usuário escolher essa opção. O resto do razão não muda.

### 5. Hierarquia de exceções

`DomainException` (base, `code` estável em UPPER_SNAKE_CASE) → `NotFoundException` (404), `BusinessRuleException` (422) e `ConflictException` (409). Subclasse direta de `DomainException` = invariante interna quebrada (500, sem vazar mensagem). Nenhuma depende de Spring; o `GlobalExceptionHandler` da Etapa 2 mapeia pela classe base.

## Consequências

- **Positivas**
  - A regra central do PR 01 vira propriedade estrutural (o razão fecha em zero, e despesa é um livro), testável por tipo de movimentação.
  - Dashboard e lista de transações leem a mesma fonte (os postings), como exige a regra 10 do PR 01.
  - Aritmética exata e determinística; testes reproduzíveis com relógio fixo.
- **Negativas / custos**
  - Mais linhas por movimentação (uma compra em 12x gera 24 postings). Índices `(user_id, book_type, book_id, effective_date)` e `(user_id, book_type, competence)` mitigam (D2 §3.4).
  - `long` em centavos limita a ±92 quatrilhões de reais, o que é suficiente; a aritmética precisa passar sempre por `Money` (nada de `long` solto).
  - Multi-moeda exigirá conversão explícita e livros por moeda; hoje só BRL.
- As pendências da revisão (origem e desativação dos postings, achado 4; status da fatura derivado ou gravado, achado 5) foram decididas no adendo abaixo.

## Alternativas consideradas

| Alternativa                                                 | Por que não                                                                                                                                                       |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BigDecimal` como representação interna                     | exige disciplina de escala e arredondamento em toda operação; `equals` depende da escala (`1.0` ≠ `1.00`). Centavos `long` são exatos e mais simples para 2 casas |
| `double`                                                    | erro de representação (0,1 + 0,2 ≠ 0,3); proibido pelo PR 01                                                                                                      |
| Somar transações por tipo, sem razão                        | cada lente vira uma regra de exclusão ("tudo menos transferência, pagamento de fatura..."), que é exatamente o caminho da dupla contagem                          |
| Saldo gravado na conta e atualizado a cada movimentação     | pode divergir do histórico; o PR 01 pede saldo calculado da mesma fonte                                                                                           |
| Competência explícita no `BookRef`                          | redundante com a data efetiva e permitiria divergência entre data e competência                                                                                   |
| Passivo total do cartão na data da compra (S-8 alternativa) | descasa patrimônio e consumo no mês da compra; pode ser adotado se o usuário preferir, com impacto só nos postings da compra                                      |

## Adendo (2026-10-04, T11): origem dos postings, status derivado e crédito transportado

Decisões tomadas depois da revisão do plano (D1 §1.1, §2.5.3, §2.6) e cravadas no schema inicial (`V1.00`–`V1.08`).

1. **Origem dos postings (S-45).** No `core`, `Posting` continua `(book, amount, effectiveDate)`. A origem é o value object `PostingSource(type, sourceId, installmentId?)` e o que o gateway grava é `LedgerEntry(source, posting, active)`. Origens: `TRANSACTION` (id da movimentação; `installmentId` nas parcelas de `CARD_PURCHASE`), `ACCOUNT_OPENING` (id da conta), `DEBT_RECOGNITION` e `DEBT_CANCELLATION` (id da dívida). Em `ledger_postings`, `ck_ledger_postings_transaction_source` garante `transaction_id` preenchido se e somente se a origem é `TRANSACTION` (e igual a `source_id`), e `installment_id` só com `TRANSACTION`.
2. **Vigência.** Posting nunca é editado nem reativado. Estorno, cancelamento de parcelas, correção do saldo inicial e estorno do registro de dívida desativam o grupo (`active = false`, com `deactivated_at` e motivo) e, quando for o caso, gravam um grupo novo. Os postings ativos de cada origem (e de cada parcela) somam zero, então desativar um grupo nunca desequilibra o razão. As lentes leem só `active` (índices parciais `ix_ledger_postings_book` e `ix_ledger_postings_competence`).
3. **Status derivado na leitura (S-37).** A fatura não tem coluna de status: `FUTURE`/`OPEN`/`CLOSED`/`OVERDUE`/`PAID` saem de datas, `outstanding` e `Clock`. A dívida também não: `OPEN`/`PARTIALLY_SETTLED`/`SETTLED` saem das quitações ativas, e só o encerramento (`closure` = `CANCELED`/`VOIDED`) é gravado. A parcela grava só `canceled_at`. Não existe job.
4. **Identidade da fatura (S-13, S-42).** Única por `(card_id, closing_date)` (`uq_credit_card_invoices_card_closing`); `reference_month` é rótulo e pode repetir. As regras de fechamento/vencimento ficam por mês de início em `credit_card_billing_rules`, porque uma mudança de dia vale a partir da fatura seguinte à corrente.
5. **Crédito transportado (S-16, S-18).** `total`, `paid`, `carryIn`, `outstanding` e `creditCarry` são calculados pela cadeia de faturas do cartão; nada disso é gravado. No razão há um posting por pagamento e um por crédito: o transporte é só apresentação, e vale a invariante Σ `outstanding` − `creditCarry` final = −(saldo do livro `CARD`).
6. **Deduplicação (S-75, que substitui a S-43).** `transactions.dedup_key` é a chave efetiva e participa do índice único parcial (`uq_transactions_user_dedup_active`, só ativas e não nulas). Na duplicata forçada ela é a **chave derivada do lote** (`DedupKey.forcedIn`), nunca nula. `original_dedup_key` guarda a chave original da linha, sem unicidade (`ix_transactions_user_original_dedup`), e o `DuplicateClassifier` compara a chave da linha com as duas colunas das movimentações ativas: a reimportação continua `DUPLICATE` mesmo depois de a original ser estornada.
7. **Fonte única dos dias do cartão (M4).** `credit_cards` não tem `closing_day`/`due_day`: a única fonte é `credit_card_billing_rules`, com `user_id` amarrado ao dono do cartão por FK composta `(card_id, user_id)`.
8. **Teto de valor (S-78).** R$ 999.999.999,99 por movimentação, limite, saldo inicial, principal e recorrência (`AmountLimit`); o `long` em centavos continua exato com folga para as somas.
9. **FKs compostas (S-76, T46, `V2.00`).** Cada tabela pai ganha `UNIQUE (id, user_id)` e as referências entre tabelas de negócio passam a `FOREIGN KEY (coluna, user_id)`, de modo que o banco recusa uma linha que aponte para um registro de outro usuário. `ledger_postings.book_id` (polimórfico) fica fora. Não altera os postings nem o razão.

**Conferência da T48 (2026-10-04):** o histórico de regras de fechamento (`credit_card_billing_rules`) **não muda a identidade da fatura** (item 4: `(card_id, closing_date)`), então este adendo não precisou de revisão além do item 9. As suposições citadas (S-43 → S-75, S-77, S-78) estão em D1 §8.
