# ADR-022: rateio de compra por pessoa e "minha parte" como visão padrão

Status: **ACEITA** (2026-10-15, aprovada pelo dono; P-28: recusar edição abaixo do recebido; recebimento permite o modo "já no saldo"; recorrência rateada vale em "minha parte" e só para ocorrências futuras). Contrato: 2.24.0 (emenda A1b, 2026-10-15: recebimento "já no saldo", P-28 e P-31b decididas).

**Revoga a ADR-014 §2** (consumo bruto até o reembolso), **revisa a ADR-021** (definição de "gasto" do orçamento) e **revisa a parte de consumo da ADR-002** (a compra no cartão deixa de gerar `EXPENSE` pelo valor cheio da parcela). A ADR-016 e a ADR-019 passam a ler a visão `MINE` onde usam consumo.

## Contexto
O dono paga no próprio cartão compras e assinaturas que são de outras pessoas (por exemplo, uma mensalidade usada por outra pessoa) e quer responder "quanto do MEU salário sobra depois de tudo que é MEU". Hoje a compra de cartão só tem a marca `ThirdPartyExpense` (ADR-014 §2): o consumo fica **bruto** até um `REFUND` ligado à compra abatê-lo, e o a receber é lido do estado. Isso não separa, por parcela e por pessoa, o que é meu do que é de terceiro, não vale para recorrência e deixa o consumo "inflado" até o reembolso chegar. `ExpenseShare` (despesa de **conta**) já cria `RECEIVABLE` na hora; a compra de cartão não tem equivalente.

Regras do produto que valem (PR 01): a regra 1 (sem dupla contagem), a 3 (pagar fatura e transferência não são despesa), a 4 (o caixa e a dívida do cartão seguem **cheios**), a 8 (dinheiro exato), a 10 (dashboard e lista da mesma fonte) e a 11 (o que me devem não é renda).

## Decisão

### Decididas pelo dono em 2026-10-15
| # | Decisão |
|---|---|
| P-25 | A parte de terceiros no cartão é gravada como `RECEIVABLE` no razão no momento da compra (opção B). |
| P-27 | `MINE` ("minha parte") é o padrão em todas as telas; o bruto vem por `view=GROSS`. Reverte a ADR-014 §2. |
| P-4 | Migrar **todas** as marcas antigas (`ThirdPartyExpense`) para o rateio. O `REFUND` já existente é neutralizado por ajuste auditado, para não abater duas vezes. Dry-run e relatório obrigatórios antes de aplicar. |
| P-5 | Resto de centavo fica com o dono; as partes de terceiros são exatas (arredondadas para baixo por parcela). |
| P-6 | Pode editar o rateio em fatura fechada: é só interno (minha parte x a receber); o valor da fatura e o saldo do cartão não mudam. |

### 1. Postings (opção B)
Cada parcela de compra rateada gera, na data efetiva da parcela:

- `EXPENSE(categoria) +minha parte`;
- `RECEIVABLE(pessoa) +parte da pessoa`, uma linha por terceiro;
- `CARD -parcela cheia`.

A soma é zero por parcela. A fatura, o limite usado, a dívida do cartão e o caixa seguem **cheios**. O consumo passa a ser, por construção, a minha parte. `view=GROSS` soma o consumo e o `RECEIVABLE` originado de rateio (consumo bruto). Sem rateio, a compra gera exatamente os postings de hoje (regressão).

### 2. Visão padrão e reversão da ADR-014 §2
`MINE` é o padrão em `GET /v1/summaries/{month}`, `/v1/dashboard/summary`, `/v1/entries`, `/v1/reports/*`, nos insights (ADR-019), nas metas de medida que usem consumo (ADR-016) e nos orçamentos (ADR-021: "gasto" = `month.consumption` **na mesma visão**, em `MINE` e em `GROSS`). Toda resposta de leitura de consumo devolve `view` e toda tela rotula a visão ("minha parte" ou "bruto"). Isto **revoga** a regra "a despesa continua consumo bruto do usuário até o reembolso" da ADR-014 §2: o terceiro sai do consumo no momento da compra, e o `REFUND` deixa de ser o mecanismo de neutralização para compras rateadas. Sem rateio nem marca, nenhum número muda.

Não mudam com a visão: caixa, saldo, patrimônio, fatura, limite e dívida do cartão (PR 01, regra 4).

### 3. Divisão
Modos de `splitMode`:

- `BPS`: `bps` por pessoa (10000 = 100%, o dono entra como `personId: null`); a soma tem de ser 10000.
- `EQUAL`: só `personId`s; o backend divide por parcela.
- `AMOUNT`: `amount` por parcela, exato; a soma tem de ser a parcela (usado pela migração das marcas).

A parte de cada terceiro por parcela é `piso(parcela x bps / 10000)` (ou a fatia igual em `EQUAL`; o valor informado em `AMOUNT`); o dono fica com `parcela - Σ terceiros`. O resto é calculado **por parcela**, não no total. Exemplos sintéticos, parcela de 100,00:

| Entrada | Terceiros | Dono |
|---|---|---|
| `EQUAL` entre o dono, Ana e Beto | Ana 33,33; Beto 33,33 | 33,34 |
| `BPS` 3333 Ana, 3333 Beto, 3334 dono | Ana 33,33; Beto 33,33 | 33,34 |
| `BPS` 5000 dono, 5000 Ana | Ana 50,00 | 50,00 |

Compra de 300,00 em 3x, `BPS` 5000/5000 com Ana: cada parcela gera `EXPENSE +50,00`, `RECEIVABLE(Ana) +50,00`, `CARD -100,00`. Soma incorreta, `personId` repetido ou `AMOUNT` que não soma a parcela: `422 SHARES_INVALID`, nada é gravado.

### 4. Receber da pessoa (dois modos, decisão do dono em 2026-10-15)
`accountId` é **opcional** em `POST /v1/third-party-receipts`:

| Modo | `settlement` | Lançamento (soma zero) |
|---|---|---|
| Com `accountId` (move a conta) | `ACCOUNT` | `ACCOUNT +X / RECEIVABLE(pessoa) -X` |
| Sem `accountId` ("já está no saldo") | `ALREADY_IN_BALANCE` | `RECEIVABLE(pessoa) -X / EQUITY +X` |

O livro `EQUITY` é o mesmo do saldo inicial da conta (`Account`: `ACCOUNT +saldo`, `EQUITY -saldo`) e da fatura histórica (`CARD -X / EQUITY +X`, ADR-014); `BookType.EQUITY` não tem id. O modo "já no saldo" **não** cria `ACCOUNT`, `INCOME` nem `REFUND` e não reduz consumo (`MINE` e `GROSS` inalterados). Efeito no patrimônio: cai exatamente X, porque o recebível deixa de existir e o caixa real já o continha (eliminação de contagem dupla, não perda). Risco: se o dinheiro não estiver de fato no saldo real, o patrimônio fica subestimado em X; por isso o front exige escolha explícita entre os dois modos (sem padrão silencioso), avisa o efeito e a resposta devolve `settlement`. `RECEIPT_ACCOUNT_REQUIRED` deixa de existir. O recebimento legado (marca `ThirdPartyExpense` ou sem vínculo) não lança nada no razão e devolve `ALREADY_IN_BALANCE` com `ledgerEffect = NONE` (o modo "já no saldo" de compra rateada devolve `ledgerEffect = EQUITY_OFFSET`; `ACCOUNT_MOVEMENT` com conta).

**Fonte, data e idempotência (parecer C-1, decisão provisória delegada pelo dono):** o posting do modo "já no saldo" usa a fonte própria `PostingSourceType.THIRD_PARTY_RECEIPT_IN_BALANCE` (id = id do recebimento), com data = `receivedOn`, para não se confundir com saldo inicial nem cancelamento de dívida e permitir o relatório de conciliação. Sem `accountId`, `Idempotency-Key` é obrigatório; testes: conciliação lista só esses postings e o replay não baixa o recebível duas vezes.

Nos dois modos: não é renda, não reduz consumo, não é `REFUND`. Pagar a fatura continua sem despesa e a transferência também. Recebimento acima do pendente da pessoa: `422 DEBT_SETTLEMENT_EXCEEDS_OUTSTANDING`.

### 5. Editar o rateio (P-6)
`PUT /v1/transactions/{id}/shares` vale em fatura aberta **ou fechada**, gera revisão em `transaction_revisions` e reclassifica só `EXPENSE` x `RECEIVABLE`; o `CARD`, a fatura, o limite e o caixa não mudam; o patrimônio muda exatamente pela variação da minha parte (aumentar a minha parte em X reduz o patrimônio em X, porque X deixa de ser a receber e passa a consumo; reduzir aumenta em X). **P-28 (decidida pelo dono):** se o novo devido de uma pessoa ficar abaixo do que ela já pagou, a edição é recusada: `422 SHARES_BELOW_RECEIVED`, nada gravado.

### 6. Estorno, cancelamento e valor da compra (F-3)
- Estorno total ou de uma parcela reverte `EXPENSE` e `RECEIVABLE` proporcionais à parte da parcela e o `CARD` cheio.
- Cancelar as parcelas restantes faz o mesmo nas parcelas futuras; as já lançadas permanecem.
- O valor da compra não é editável (`422 TRANSACTION_NOT_EDITABLE` se `amount` mudar): para corrigir o valor, estornar e lançar de novo. Só o rateio é editável (`PUT shares`).
- Recebido acima do novo devido: no estorno e no cancelamento, o excedente recebido vira `PAYABLE` à pessoa, auditado (P-28b, provisória, delegada pelo dono); na edição de rateio, P-28 (recusar).

### 7. Trava (ADR-008)
`PUT shares`, estorno, edição de valor e recebimento ligado à compra adquirem as travas na ordem da ADR-008: compra/transação, depois `RECEIVABLE` por pessoa, depois conta. Teste de concorrência obrigatório: dois recebimentos simultâneos nunca excedem o devido, sem deadlock.

### 8. Recorrência
A recorrência de cartão (`type = CARD_PURCHASE`) aceita `shares`; cada ocorrência lançada gera as partes pela regra da seção 3 e aparece em "a receber". Mudar o rateio vale só para as ocorrências futuras (P-31b, decidida pelo dono: vale em "minha parte"). Rateio em recorrência que não é de cartão é `422 SHARES_INVALID` (despesa de conta continua pelo `ExpenseShare`).

### 9. `ExpenseShare` x rateio de cartão (F-10)
Os dois passam a falar o mesmo vocabulário (`splitMode`, `shares`). O `ExpenseShare` mantém seu fluxo (despesa de conta, dívida `RECEIVABLE` com `expectedDate`, `Transaction.shares`) e o rateio de cartão tem ponto de entrada próprio (`CardPurchaseInput`, `RecurrenceInput`, `PUT /shares`) porque o rateio de cartão é por parcela e vive na fatura, enquanto o de conta é por valor único e gera dívida. Dois pontos de entrada, uma só linguagem. No contrato, o rateio gravado sai em `Transaction.personShares` para não colidir com o `Transaction.shares` já existente (dívidas da despesa dividida em conta; alterar o tipo dele quebraria o contrato).

### 10. Migração das marcas antigas (P-4, F-2)
Alternativa descartada: derivar na leitura (opção A). Regras (detalhe em A2c):

- Marca sem valor: 100% da pessoa (`BPS` 10000 para ela). Marca com valor: `AMOUNT`, valor distribuído pelas parcelas em centavos exatos (resto nas primeiras parcelas, S-3), terceiros exatos.
- Para cada `REFUND` ligado à compra: ajuste auditado (`EXPENSE +r`, `RECEIVABLE -r`), preservando `ACCOUNT +r`; o `REFUND` passa a valer como recebimento do rateio. Nada é apagado; tudo por revisão.
- Prova de que o consumo não é contado duas vezes: por compra migrada, `consumo(MINE) = P - t`, `RECEIVABLE pendente = t - r` e `consumo(MINE) + pendente + já recebido = P`; nunca `P - t - r`. O caixa antes e depois da migração é igual; o patrimônio **sobe** em `receivableRecognized` (soma de `t - r - recebido legado` das compras migradas), porque a parte do terceiro, que antes não era ativo, passa a ser `RECEIVABLE`. O relatório do dry-run traz `receivableRecognized` em destaque e o dono aprova o hash ciente desse aumento (decisão provisória delegada pelo dono).
- Reembolso maior que a parte de terceiro (`r > t`): a compra não é migrada, entra como exceção do relatório e fica legada, sem bloquear as demais.
- Dry-run sem gravar, com relatório por compra e por mês e hash; `apply` só com o hash aprovado pelo dono, após backup, idempotente.

### 11. Invariantes testadas por propriedade (200 cenários, incluindo estorno, edição e recebimento parcial)
1. Σ postings = 0.
2. `consumo(MINE) + a receber pendente + já recebido (os dois modos) = consumo(GROSS)`.
3. Receber não altera consumo nem renda, em qualquer dos dois modos.
4. Editar o rateio não altera caixa, `CARD`, fatura nem `GROSS`, e muda o patrimônio exatamente pela variação da minha parte; receber no modo `ACCOUNT` não altera o patrimônio e no modo `ALREADY_IN_BALANCE` o reduz exatamente em X.
5. Fatura cheia = minha parte + terceiros; o valor devido não muda.

## Alternativas consideradas
1. **Derivar na leitura (opção A)**: manter o razão cheio e subtrair o terceiro nas leituras. Rejeitada: cada leitura precisaria da regra (risco de divergência, PR 01 regra 10) e o a receber não existiria no razão.
2. **`MINE` apenas por parâmetro, padrão bruto**: preservaria os números atuais, mas não responde a pergunta do dono. Rejeitada por P-27.
3. **Manter o `REFUND` como mecanismo**: continuaria abatendo o consumo e duplicaria o abatimento com o rateio (F-2). Rejeitada.

## Consequências
- Os números exibidos mudam para quem tem marcas de terceiro, inclusive orçamentos do Dashboard Glass (ADR-021) e insights; sem rateio nada muda. Mitigação: rótulo da visão em toda tela, regressão sem rateio, relatório de migração por mês e aviso ao dono antes de mesclar A3.
- O `RECEIVABLE` ganha uma origem nova (`CARD_SHARE`) e o "a receber" passa a ter competência por pessoa.
- Migração `V9.00` (rateio de compra) e `V9.01` (recorrência) só depois da última migração do Dashboard Glass efetivamente existente no repositório; confirmar o estado real antes de numerar as `V9.xx` (a `V8.18` não é premissa).
- A ADR-014 §2 deve ser marcada como revogada e a ADR-021 §2 como emendada quando esta ADR for aceita.
- O `POST /v1/third-party-receipts` ganha `accountId` **opcional** e `settlement`: com conta o recebimento move a conta; sem conta ("já no saldo") baixa o `RECEIVABLE` contra `EQUITY`, e o patrimônio cai X.
- `FIXED_COSTS_MONTHLY` (ADR-016) e `GET /v1/recurrences/summary` passam a "minha parte" (`MINE`, com `view=GROSS`).

## Plano de quitação
Aceita a ADR: A2a, A4, A2d e A3a em seguida; A2b (P-28 decidida); A2c após A2a, A3a e A4. Depois da migração em produção, revisar com o dono se a marca `ThirdPartyExpense` ainda é necessária para compras novas e, se não, tratá-la como legado em nova ADR.

## Pendências
Resolvidas em 2026-10-15 (emenda A1b): P-28 (recusar na edição; excedente do estorno vira `PAYABLE`), P-31b (só ocorrências futuras), "receber sem conta" (modo "já no saldo", contrapartida `EQUITY`) e metas/resumos (`FIXED_COSTS_MONTHLY` e `recurrences/summary` em `MINE`). Seguem para o dev:
- **Marca em compra já rateada:** o que fazer com `POST /v1/third-party-expenses` numa compra que tem `shares` (recusar?). Decidir em A2a.
- **`ThirdPartyMonth`** (bruto/reembolsos/líquido pessoal): fixar em A4 como o bloco lê o `RECEIVABLE` de rateio em `MINE` e `GROSS`.
- **Limite/cheque especial/meta com aporte/vínculo recorrência-cartão** (verificação do plano, A1): registrar no PR de A2a.

## O que o dono precisa aprovar
1. A opção B: a parte de terceiros vira `RECEIVABLE` na compra e o consumo é só a minha parte.
2. `MINE` como padrão em todas as telas, com `view=GROSS` para o bruto, revogando a ADR-014 §2 e emendando a ADR-021.
3. A regra de divisão (terceiros exatos por parcela, resto do centavo com o dono).
4. Editar o rateio em fatura fechada (só interno).
5. A migração de todas as marcas antigas com o ajuste do `REFUND`, em dry-run, com hash e backup.
6. As respostas de P-28 e P-31b.
