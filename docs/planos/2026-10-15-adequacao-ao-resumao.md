# Plano: adequar o moneylog ao jeito real do dono gerenciar o dinheiro

Data: 2026-10-15 (revisão 3; a revisão 2 resolveu F-1 a F-14 de `docs/revisoes/2026-10-15-plano-adequacao-ao-resumao.md`). Fonte das regras: `resumão.md` (documento do dono, fora do repo, em `~/Downloads`).

**Aviso de dados:** nenhum valor, nome ou dado da seção 7 do resumão está neste plano. Exemplos e critérios usam dados sintéticos (pessoas "Ana" e "Beto", cartões "Cartão A/B", valores redondos). A carga inicial real fica em `~/.moneylog/import`, fora do repo, e **não** é uma task deste plano. Os testes usam fixtures sintéticas em `db/it/`. Nenhum teste em CI depende de dado real.

**Sobre a origem das regras (F-1):** o resumão é input do dono. As regras que **revertem** decisão anterior (padrão "minha parte" revoga ADR-014 §2) só valem porque o dono as confirmou diretamente, registradas na seção 3.1. Nenhuma mensagem de agente conta como consentimento.

## Revisão 3 (2026-10-15): o que mudou

1. **A1 concluída:** contrato 2.24.0 e ADR-022 **aceita** pelo dono. Próximo: A1b e o Lote 1 (seção 8).
2. **Janela obrigatória: novembro/2026.** Mensagem do dono: "considera só novembro, não precisa considerar as outras paradas, só a previsão para novembro ali e daí faz o que precisa no software." O resumo do mês (`owner-statement`), a carga e todos os aceites e dados de exemplo cobrem **só 2026-11**. `months` (1 a 12, padrão 3) e a projeção de 12 meses continuam como **parâmetro** da API, mas nenhum aceite os exige.
3. **Tudo que ele nomeou entra:** simulador (E), assinaturas (D), renda (F), imóvel (H) e alerta de Pix no crédito (F5/I3, P-33), mais os demais blocos já planejados.
4. **"Faça tudo" = delegação:** as perguntas restantes viram decisões provisórias (3.3). Nenhuma task espera resposta; exceção: tabelas fiscais de fonte oficial citada.
5. **Respostas do dono nesta sessão** (3.1): P-28 (recusar edição abaixo do recebido), recebimento de terceiro "já no saldo", recorrência rateada em "minha parte" com mudança só para o futuro (P-31b), metas `FIXED_COSTS_MONTHLY` e `recurrences/summary` em "minha parte".
6. **Sem testes até o fim:** testers e testes só no Lote 9 (seção 8).

### Cortes pela janela de novembro

| Cortado ou reduzido | Onde | Observação |
|---|---|---|
| Propriedade `endBalance(m) = endBalance(m-1) + surplus(m)` em 12 pontos | B2c | Fica o cálculo de um mês; encadeamento por `months` sem aceite |
| Coerência com `/v1/projections` em 12 meses | B4 | Só novembro |
| `commitments?until` e `byMonth` além de novembro | C2 | Aceite com `until=2026-11` |
| Simulador multi-mês além de novembro | E2 | `months[]` cobre novembro; a parcela continua calculada em N meses |
| 13º: cálculo da 2ª parcela (dezembro) | F3 | Backlog pós-novembro |
| Reserva com base em 3 meses | G2 | Base = novembro (P-18) |
| Exemplo de dois meses outubro/novembro da seção 3.1 | B2c | Fica só a coluna de novembro; a leitura A x B segue documentada |

## 1. Objetivo

Fazer o moneylog responder "quanto do MEU salário sobra depois de tudo que é MEU", por mês e por 12 meses, com rateio de cartão por pessoa, compras parceladas agrupadas, assinaturas com câmbio, renda detalhada, patrimônio, imóvel com cota e alertas, sem quebrar o PR 01.

## 2. Escopo

Entra (9 blocos, na ordem de prioridade do dono):

| Bloco | Lacuna | Resumo |
|---|---|---|
| A | 1 | Rateio de compra e de recorrência no cartão por pessoa; "minha parte" como visão padrão; "a receber" separado; migração das marcas antigas |
| B | 2 | Resumo do mês em 3 colunas, projeção de 12 meses, salário de M-1 paga a coluna de M |
| C | 3 | Compra parcelada agrupada entre cartões |
| D | 4 | Assinaturas: USD + câmbio por cobrança + IOF, custo mensal equivalente, pessoal x empresa, ativo até, sobreposição |
| E | 5 | Simulador "posso comprar?" |
| F | 6 | Renda detalhada (INSS/IRRF, descontos, consignado em folha, 13º), TIR do empréstimo, Pix no crédito como empréstimo |
| G | 7 | Patrimônio: FGTS como ativo não disponível, reserva de emergência |
| H | 8 | Imóvel: cota por parcela, totais por pessoa, cláusulas |
| I | 9 | Alertas que faltam; origem/confiança; campos de cartão (débito automático, finais) |

Não entra (MVP desta rodada):
- Qualquer mês além de novembro/2026 nos aceites; a 2ª parcela do 13º.
- Carga dos dados reais; anexar arquivo de origem (print, holerite); PDF para formalização do imóvel (só tela e CSV).
- Finanças separadas da empresa do dono como segundo usuário/workspace (só o marcador pessoal x empresa).
- Cotação de câmbio automática (o câmbio é informado a cada cobrança).
- Aprovação ou simulação de financiamento imobiliário (SAC/Price).
- Qualquer cálculo no frontend. O front exibe o que a API devolve.

## 3. Decisões e perguntas

### 3.1 Decididas (origem: dono, 2026-10-15)

| # | Decisão | Efeito |
|---|---|---|
| P-25 | A parte de terceiros no cartão é gravada como `RECEIVABLE` no razão no momento da compra (opção B, ADR-022). | Fecha a arquitetura de A2. |
| P-1 | Salário de competência M-1 paga a coluna do mês M (`incomeLagMonths = 1`, parâmetro). | Coluna M = saídas que vencem em M contra renda de competência M-1 (ADR-017). |
| P-2 | Âncora do saldo acumulado = saldo atual das contas. | `openingBalance` visível na API. Detalhe a confirmar na aprovação da ADR-023: só contas `CASH`, sem cheque especial (recomendação do plano, não decisão). |
| P-3 | A fatura conta no mês do **vencimento**. | Regra de B2b. |
| P-27 | "Minha parte" (`MINE`) é o padrão em **todas** as telas; bruto via `view=GROSS`. **Isto reverte ADR-014 §2** ("consumo bruto até o reembolso"). | ADR-022 declara a reversão explicitamente e também revisa ADR-021 (orçamento) e o uso de consumo em ADR-016/ADR-019. Muda números já exibidos (ver riscos). |
| P-4 | Migrar **todas** as marcas antigas (`ThirdPartyExpense`) para o rateio. O `REFUND` já existente é neutralizado por ajuste auditado, para não abater duas vezes. Dry-run e relatório obrigatórios antes de aplicar. | Task A2c. |
| P-5 | Resto de centavo fica com o dono; partes de terceiros são exatas (arredondadas para baixo por parcela). | Regra de divisão em A2a. |
| P-6 | Pode editar o rateio em fatura fechada. É só interno (minha parte x a receber): o valor da fatura e o saldo do cartão não mudam. | Remove `SHARES_LOCKED`; ver F-3 em A2b. |

**P-1, leitura alternativa (registrada para F-7).** A leitura literal do resumão ("salário líquido recebido no mês", entradas por data) dá totais diferentes em meses de transição. Exemplo sintético: perfil com adiantamento de 40% no dia 16 da competência e saldo no dia 1 do mês seguinte. Competência setembro: líquido 5.000 (adiantamento 2.000 em 16/set, saldo 3.000 em 01/out). Competência outubro: líquido 6.000 (2.400 em 16/out, 3.600 em 01/nov).

| Coluna | Leitura A (decidida: competência M-1) | Leitura B (alternativa: por data de recebimento) |
|---|---|---|
| Outubro | 5.000 (competência setembro) | 3.000 (saldo de set) + 2.400 (adiantamento de out) = 5.400 |
| Novembro | 6.000 (competência outubro) | 3.600 (saldo de out) + 2.400 (adiantamento de nov, supondo 6.000) = 6.000 |

Se o dono quiser a leitura B depois, vira parâmetro `incomeBasis = COMPETENCE|RECEIPT_DATE` na ADR-023. Na leitura A, `income.total` e `income.items` usam a mesma base (as parcelas do pagamento da competência M-1, com a data real de cada uma).

### 3.2 Em aberto

**Nenhuma.** O dono delegou ("Faça tudo", 2026-10-15) as perguntas restantes; a seção 3.3 registra cada uma como decisão **provisória**. P-28, P-31b e a regra de recebimento "já no saldo" foram respondidas pelo dono (3.1). Onde uma task cita "P-n" em "Depende de", o P-n está resolvido por 3.1 ou 3.3. Única dependência externa real: tabelas INSS/IRRF 2026 e redutor da Lei 15.270/2025 vêm de **fonte oficial citada pelo dev** (F1/F2); se o dev não conseguir confirmar a fonte, não inventa números (ver F2).

### 3.3 Decisões provisórias "delegadas pelo dono em 2026-10-15" (para revisão posterior)

Origem de todas: dono, por delegação. "Provisória" = o dono pode revisar depois; mudar a resposta exige emenda de ADR e das tasks citadas. Quando o plano não tinha recomendação (P-7, P-12), a regra abaixo é a mais mínima possível, sem número inventado.

| # | Decisão provisória | Tasks que ela destrava |
|---|---|---|
| P-7 | **Simulador, classificação sem limiares numéricos** (o plano não tinha recomendação). Na janela de novembro: `INCOMPATIBLE` = alguma competência com `surplusAfter < 0` mesmo aplicando todos os `cancelSubscriptionIds` informados (ou nenhum); `VIABLE_WITH_PLANNING` = negativa sem cortes e não negativa com os cortes; `RISKY` = nenhuma negativa, mas há `financingWarning` ou o `surplusAfter` só é `>= 0` contando itens de renda `ESTIMATED`; `SUSTAINABLE` = demais casos. `reasons[]` explica o ramo. | E1, E2 |
| P-8 | Compensar com cortes: só assinaturas ativas, escolhidas pelo usuário. | E1, E2 |
| P-9 | Câmbio informado a cada cobrança; IOF padrão 350 bps editável; arredonda uma vez no total. | D1, D2 |
| P-10 | Assinatura `COMPANY` no meu cartão fica fora de "minha parte" (`totalMonthlyMine`) e entra em "a ressarcir pela empresa". | D1, D2, B2b |
| P-11 | `overlapGroup` manual; a API só avisa grupos com 2+ ativas. | D1, D2, I3 |
| P-12 | `lastUsedOn` manual; "sem uso" = mais de N dias com N em configuração do usuário (`subscriptionUnusedDays`) **sem valor padrão**: o alerta `SUBSCRIPTION_UNUSED` fica inativo até o dono definir N. | D1, I3 |
| P-13 | Tabelas e redutor: dado versionado por vigência, **fonte oficial citada pelo dev** (não é decisão delegada de valor). Sem fonte confirmada, o cálculo responde `TAX_TABLE_UNAVAILABLE` em vez de inventar. | F1, F2 |
| P-14 | Rubricas livres com tipo (`TAX`, `BENEFIT`, `UNION`, `LOAN`, `OTHER`). | F1, F3 |
| P-15 | Consignado segue como passivo (ADR-013); rubrica `LOAN` aponta para a dívida; vinculado, não gera "conta a pagar"; lançamentos da proposta de F1 (ADR-026). | F1, F3 |
| P-16 | 13º: duas ocorrências separadas; a 1ª sem descontos, com competência do mês em que é paga. A 2ª parcela (dezembro) **fica fora da janela de novembro**: modelada, mas cálculo e aceite vão para o backlog pós-novembro. | F1, F3 |
| P-17 | TIR sobre parcelas mensais regulares; mensal e anual `(1+i)^12-1`. | F1, F4 |
| P-18 | FGTS nunca conta como reserva; base da reserva = saídas fixas "minha parte" **de novembro** (no lugar dos 3 meses seguintes); `targetMonths` opcional. | G1, G2 |
| P-19 | Imóvel: (a) sem cota padrão: "cota não definida", conta 100% minha com `ESTIMATED`; (b) cota guardada como valor; (c) formalização em tela e CSV. | H1, H2, B2b |
| P-20 | "Financiamento ainda não saiu" = item `FINANCING` de `LONG_TERM_PROJECT` não pago. | I3, E2 |
| P-21 | Alerta de reembolso: corresponde a fatura que contém o lançamento; antecedência da fatura 3 dias, configurável. | I3 |
| P-22 | Divergência de documento em saldo de ativo e item de cronograma; tolerância absoluta configurável, padrão 0. | I3 |
| P-23 | Proveniência opcional; padrão `INFORMED`/`CONFIRMED`; só origem e confiança. | I1, I2 |
| P-24 | Final do cartão opcional por compra; fatura única por cartão. | I1 |
| P-26 | Total da compra agrupada derivado; se informado e diferente, vira divergência (P-22). | C1 |
| P-28b | Estorno/cancelamento com recebido acima do novo devido: o excedente vira `PAYABLE` à pessoa, auditado (a edição de rateio já foi decidida: recusar, 3.1). | A2b, C2 |
| P-29 | Despesa antiga: forma `OTHER`, natureza `VARIABLE`; recorrência ativa conta como `FIXED`. | B1, B2a, B2b |
| P-30 | Pix no crédito = empréstimo (ADR-031): principal entra em conta sem consumo, juros são o custo, parcelas na fatura; para terceiro o principal vira `RECEIVABLE`; `kind` (`PERSONAL|PAYROLL|CARD_CASH_OUT`) e `channel` no empréstimo. | F1, F5, I3 |
| P-31a | `autoDebit = null` (desconhecido) nos cartões existentes: sem alerta até o dono marcar. | I1, I3 |
| P-32 | **Saldo inicial da janela:** para `from = 2026-11`, `openingBalance` = saldo atual das contas `CASH`, sem projetar o resto de outubro, com aviso `OPENING_BALANCE_NOT_PROJECTED` quando `from` é posterior ao mês corrente (P-2 em sua leitura literal). Cheque especial fora. | B1, B2c |
| P-33 | **Alerta de Pix no crédito** (interpretação do pedido "alerta de Pix"): além de `NEW_DEBT_BEFORE_FINANCING`, novo `NotificationKind` `CARD_CASH_OUT_COST` avisa ao registrar um Pix no crédito, com a taxa efetiva mensal (F4) e o valor das parcelas. | F1, F5, I1, I3 |

Verificações (não são perguntas; o dev-backend responde em A1b/G1 e o plano ajusta se faltar): se já existem limite total/disponível e cheque especial na conta, meta com aporte sugerido (ADR-016) e o campo que liga a recorrência ao cartão. Vencimentos de cartão são lacuna de dado do dono (carga fora do repo).

## 4. Verificação no código (resumo do que existe)

- Contrato `backend/contracts/openapi.yaml` na versão 2.20.0.
- **Colisão com o plano Dashboard Glass (F-8):** `docs/planos/2026-10-13-dashboard-glass-premium.md` reserva contratos **2.21.0** (períodos, seção 4.1), **2.22.0** (DG-23, `sort` em transações) e **2.23.0** (DG-29, `/v1/budgets`, ADR-021 §5) e a migração **V8.18__budgets.sql** (DG-28). Este plano passa a usar **2.24.0 a 2.32.0** (um bump por bloco, ver seção 6) e migrações **V9.00 em diante**. Regras: (1) a versão e o número de migração valem na ordem do merge; ao mesclar, renumerar para a próxima livre em `main`; (2) nenhuma migração V9.xx é mesclada antes de DG-28 (V8.18) para evitar Flyway fora de ordem; (3) A3c depende de DG-29.
- `Money` é BRL em centavos `long`; core sem ponto flutuante (ArchUnit). Dinheiro estrangeiro é metadado (ADR-025), nunca outra moeda no razão.
- Razão com livros `ACCOUNT`, `CARD`, `RECEIVABLE`, `PAYABLE`, `EXPENSE`, `INCOME`, `EQUITY`. `ExpenseShare` já faz o rateio de despesa de **conta** criando `RECEIVABLE` na hora; compra de **cartão** hoje só tem a marca `ThirdPartyExpense` (consumo bruto até reembolso `REFUND`, ADR-014). O recebimento de despesa marcada hoje é um `REFUND` ligado à compra que abate o consumo (origem de F-2).
- `MonthlySummary`, `DashboardSummary`, `ConsumptionReport`, `EntryReport`, `Projection`, `CommitmentSchedule`, `NetWorth`, `DebtOverview` leem do mesmo razão; a visão "minha parte" entra nessas leituras (PR 01 regra 10).
- `RecurringTransaction`: `DAILY/WEEKLY/MONTHLY/YEARLY/CUSTOM`, `endDate`, `incomeCompetenceOffsetMonths`; sem moeda, IOF, escopo, canal, sobreposição nem rateio. Existe `POST /v1/recurrences/{id}/end`.
- `TrackedCommitment` `LONG_TERM_PROJECT` guarda cronograma e financiamento, sem cota por co-comprador. `Card` sem débito automático, finais, bandeira nem melhor dia.
- Notificações (`NotificationKind`): faltam os alertas do bloco I.
- Não existe: agrupador de compra, perfil de renda/folha, tabelas fiscais, TIR, ativo FGTS, reserva, simulador, forma de pagamento/natureza em despesa.
- Dados de renda e ativos são sensíveis (F-14): toda task que os toca exige escopo por usuário (outro usuário recebe `404`) e ausência de valores nos logs, com teste.

## 5. ADRs necessárias (todas **Proposta**, aprovadas pelo dono antes da implementação do bloco)

| ADR | Tema | Revisa/complementa |
|---|---|---|
| ADR-022 | Rateio por pessoa (cartão e recorrência) e "minha parte" como visão padrão | **Revoga ADR-014 §2**; revisa parte de consumo de ADR-002 e a definição de gasto de ADR-021; ADR-016/019 passam a ler `MINE` |
| ADR-023 | Resultado do mês do dono: defasagem, saldo acumulado, mês da fatura, **composição anti dupla contagem** | Complementa ADR-017 |
| ADR-024 | Compra agrupada (`PurchaseGroup`) | Complementa ADR-006 |
| ADR-025 | Moeda estrangeira como metadado (USD, câmbio por cobrança, IOF) | Delimita S-2 de ADR-002 |
| ADR-026 | Renda detalhada, tabelas fiscais versionadas e **consignado em folha** (lançamentos) | Complementa ADR-017, ADR-013 |
| ADR-027 | Ativos não disponíveis (FGTS) e reserva de emergência | Complementa NetWorth |
| ADR-028 | Proveniência (origem/confiança) e alertas novos | Complementa ADR-012 |
| ADR-029 | **Imóvel com cota por co-comprador e cláusulas** (F-12) | Complementa ADR-014 (financiamento fora do pendente) |
| ADR-030 | **Simulador e regra de classificação** (F-12) | Usa o motor de ADR-023 |
| ADR-031 | **Empréstimo no cartão (Pix no crédito)** e campos `kind`/`channel` (F-5) | Complementa ADR-013 |

ADR-020 e 021 já existem (não commitadas); 022 a 031 estão livres. Confirmar a numeração antes de criar os arquivos.

### Conteúdo mínimo da ADR-022

- **Opção B (decidida, P-25):** cada parcela de compra rateada gera `EXPENSE(cat) +minha parte`, `RECEIVABLE(pessoa) +parte da pessoa` e `CARD -parcela cheia`; soma zero por parcela. Caixa e dívida do cartão seguem **cheios** (regra 4). Consumo passa a ser, por construção, "minha parte"; `view=GROSS` soma o consumo mais o `RECEIVABLE` originado de rateio.
- **Reversão explícita (P-27):** `MINE` é o padrão em summary, dashboard, entries, relatórios, orçamentos (ADR-021, "gasto" = `month.consumption` na mesma visão), insights (ADR-019) e metas de medida (ADR-016). Revoga ADR-014 §2. Todas as respostas devolvem `view`, e toda tela rotula a visão.
- **Divisão (P-5):** modos `BPS`, `EQUAL`, `AMOUNT` no rateio. A parte de cada terceiro por parcela = piso(parcela x bps / 10000) (ou fatia igual em `EQUAL`; valor informado em `AMOUNT`); o dono fica com `parcela - Σ terceiros`. Em `EQUAL` com 3 pessoas e parcela de 100,00: terceiros 33,33 e 33,33, dono 33,34. O resto é calculado **por parcela**, não no total.
- **Receber da pessoa, dois modos (decisão do dono, 2026-10-15):** `accountId` é **opcional** no recebimento.
  - Com `accountId` (move conta): `ACCOUNT +X / RECEIVABLE -X`.
  - Sem `accountId` ("já no saldo": o dinheiro já está no saldo real da conta, sem movimento novo): `RECEIVABLE(pessoa) -X / EQUITY +X` (conciliação "recebido já no saldo", mesmo livro `EQUITY` do saldo inicial; o dev confirma o livro em A1b). Soma zero. **Não** cria `ACCOUNT`, `INCOME` nem `REFUND`, e não reduz consumo. Efeito esperado: o patrimônio cai X, porque o recebível deixa de existir e o caixa já o continha (eliminação de contagem dupla, não perda).
  - O recebimento devolve `settlement: ACCOUNT|ALREADY_IN_BALANCE`; o front exige escolha explícita do modo (sem padrão silencioso). `RECEIPT_ACCOUNT_REQUIRED` deixa de existir.
  - Nos dois modos: não é renda, nem redução de consumo, nem `REFUND`. Pagar a fatura segue sem despesa; transferência sem despesa.
- **P-28 (decidida):** editar o rateio deixando o devido de uma pessoa abaixo do já recebido: `422 SHARES_BELOW_RECEIVED`, nada gravado. Estorno/cancelamento: excedente recebido vira `PAYABLE` à pessoa (P-28b, provisória).
- **Recorrência rateada (P-31b, decidida):** vale em "minha parte"; mudar o rateio vale só para ocorrências futuras.
- **Metas e resumos (decidida):** `FIXED_COSTS_MONTHLY` (ADR-016) e `GET /v1/recurrences/summary` passam a "minha parte" (`MINE`, com `view=GROSS`).
- **Editar rateio (P-6):** vale em fatura aberta ou fechada; gera revisão em `transaction_revisions` e reclassifica só `EXPENSE` x `RECEIVABLE` (o `CARD` e o caixa não mudam). Parte já recebida: regra de P-28.
- **Estorno, cancelamento e valor (F-3):** estorno total ou de parcela reverte `EXPENSE` e `RECEIVABLE` proporcionais à parte da parcela e o `CARD` cheio; cancelar parcelas restantes faz o mesmo nas parcelas futuras; o valor da compra não é editável (estornar e lançar de novo). Recebido acima do novo devido: P-28.
- **Trava (ADR-008):** `PUT shares`, estorno, edição de valor e recebimento ligado à compra adquirem as travas na ordem da ADR-008 (compra/transação, depois `RECEIVABLE` por pessoa, depois conta), com teste de concorrência (dois recebimentos simultâneos nunca excedem o devido).
- **`ExpenseShare` (despesa de conta) x rateio de cartão (F-10):** os dois passam a falar o mesmo vocabulário (`shares`, `splitMode`); `ExpenseShare` mantém seu fluxo e o contrato de conta é alinhado ao novo. A ADR registra a justificativa de manter dois pontos de entrada.
- **Migração das marcas antigas (P-4, F-2):** ver A2c. Alternativa descartada: derivar na leitura (opção A).
- **Invariantes testadas por propriedade (200 cenários, incluindo estorno, edição e recebimento parcial):** Σ postings = 0; `consumo(MINE) + a receber pendente + já recebido = consumo(GROSS)` (já recebido soma os dois modos); receber não altera consumo nem renda; receber no modo `ACCOUNT` não altera o patrimônio e no modo `ALREADY_IN_BALANCE` reduz o patrimônio exatamente em X; editar o rateio muda o patrimônio exatamente pela variação da minha parte.

### Conteúdo mínimo da ADR-023

- **Composição de `outflow` do mês M (F-4)**, por fonte e com chave de deduplicação:

| Fonte | Entra em | Chave de dedup |
|---|---|---|
| Faturas (lançadas e abertas) com vencimento em M | `cardsMine`/`cardsGross` | `invoiceId` |
| Parcelas futuras de compras existentes, na fatura-alvo (ADR-006) | `cardsMine` | `(transactionId, número da parcela)` |
| Ocorrências **previstas** de recorrência no cartão, ainda sem lançamento, na fatura da data | `cardsMine` (recorte `subscriptionsMine` se for assinatura) | `(recurrenceId, occurrenceDate)` |
| Despesas fora do cartão lançadas, por `paymentMethod` e `nature` | `offCard` (fixas e variáveis) | `transactionId` |
| Ocorrências previstas de recorrência fora do cartão | `offCard` fixas | `(recurrenceId, occurrenceDate)` |
| Itens de compromisso/imóvel não pagos (minha cota, H2) | `realEstateMine` ou `offCard` | `commitmentItemId` |

  Regra: quando uma ocorrência prevista é lançada, o lançamento carrega `(recurrenceId, occurrenceDate)` e a prevista deixa de existir na composição; um item só entra por uma fonte. Pagamento de fatura e transferência nunca entram (regra 3). Parcela de consignado vinculada não entra (ADR-026).
- Defasagem (P-1, `incomeLagMonths`, alternativa `incomeBasis` documentada), âncora (P-2), mês da fatura (P-3).
- O que acontece no mês corrente: só o que ainda falta acontecer; `openingBalance` já reflete o que passou.

## 6. Contrato de API (resumo por bloco)

Segue `BE 04` e `FE 05`: escrita devolve o recurso, edição real, ações devolvem o recurso atualizado, `401` sem token, erro com código estável. Dinheiro como `Money`/`AmountInput`. Percentuais em **pontos-base inteiros** (`bps`, 10000 = 100%). Todo contrato tem exemplos sintéticos. Versões indicativas, atribuídas na ordem do merge (seção 4): A 2.24.0, B 2.25.0, C 2.26.0, D 2.27.0, E 2.28.0, F 2.29.0, G 2.30.0, H 2.31.0, I 2.32.0.

### Bloco A (2.24.0)
- **Rateio** (compra de cartão e **recorrência**): `CardPurchaseInput.shares?` e `RecurrenceInput/Update.shares?` com `splitMode: BPS|EQUAL|AMOUNT` e `shares: [{ personId: uuid|null, bps?: int, amount?: Money }]`; `null` = eu. `BPS`: soma 10000. `EQUAL`: só `personId`s, o backend divide (ADR-022). `AMOUNT`: valores por parcela exatos que somam a parcela (usado pela migração). `personId` não repete. Ausente = 100% eu. Erros: `422 SHARES_INVALID`, `422 SHARES_BELOW_RECEIVED` (P-28).
- **`PurchasePreview` (F-10)** ganha `shares[]` e, por parcela, `myAmount`, `thirdPartyAmount` e `byPerson[{personId, amount}]` (as partes vêm do backend; o front não calcula).
- `Transaction` ganha `splitMode`, `shares[]`, `myAmount`, `thirdPartyAmount`.
- `PUT /v1/transactions/{id}/shares` body `{ splitMode, shares }` -> `Transaction`. Vale em fatura fechada (P-6).
- `Invoice` ganha `myShare`, `thirdPartyShare`, `shareByPerson[{personId, amount}]` (cheia = minha + terceiros; o valor devido não muda).
- Query `view=MINE|GROSS` (padrão `MINE`) em `GET /v1/summaries/{month}`, `/v1/dashboard/summary`, `/v1/entries`, `/v1/reports/spending-by-category`, `/v1/reports/income-expenses`, **orçamentos (`/v1/budgets`, ADR-021), insights (ADR-019) e metas de medida (ADR-016)**; respostas devolvem `view`.
- `GET /v1/debts/third-party-receivables`: `ThirdPartyItem.source = CARD_SHARE`, `expectedDate`, `ThirdPartyPerson.months[{competence, owed, received, pending}]`. `POST /v1/third-party-receipts` aceita `transactionId` de compra rateada e devolve o recebimento, com `accountId` **opcional** (sem ele = modo "já no saldo", `settlement: ALREADY_IN_BALANCE`; sem `RECEIPT_ACCOUNT_REQUIRED`). A1b ajusta o contrato 2.24.0 (se já mesclado, vira 2.24.1).
- `view` também em `GET /v1/recurrences/summary` e na meta `FIXED_COSTS_MONTHLY` (padrão `MINE`).
- Migração de marcas: comando administrativo com `dryRun` (relatório) e `apply` (ver A2c); sem endpoint público de escrita em massa. Se Arquitetura preferir endpoint, vai para o contrato.

### Bloco B (2.25.0)
- `Transaction` e `Recurrence` ganham `paymentMethod: PIX|DEBIT|BOLETO|CASH|OTHER` e `nature: FIXED|VARIABLE` (despesa fora do cartão; defaults de P-29).
- `GET /v1/owner-statement?from=AAAA-MM&months=1..12&asOf=AAAA-MM-DD` (padrão `months=3`; o aceite usa `from=2026-11`, `months=1`) -> `OwnerStatement`:
  `{ asOf, view: "MINE", incomeLagMonths, openingBalance: Money, months: [ { competence, income: { total, items[{ source, date, amount, status, confidence }] }, outflow: { cardsMine, cardsGross, subscriptionsMine, offCard: { fixed, variable, byMethod[{ method, amount }] }, realEstateMine, total }, surplus: Money, endBalance: Money, negative: bool, receivablesPending: Money } ], negativeMonths: [competence], warnings[] }`.
  `status` é derivado na leitura; `confidence` é `CONFIRMED` até a proveniência (I2) existir. `subscriptionsMine` é recorte informativo (`includedInCards`), nunca somado duas vezes; `outflow.total` = `cardsMine + offCard.fixed + offCard.variable + realEstateMine`.
- `months` alimenta o resumo (3) e a projeção (12) com o mesmo cálculo; fora da janela de novembro não há aceite (rev 3). `openingBalance` segue P-32 (aviso `OPENING_BALANCE_NOT_PROJECTED`). Sem renda de competência no mês: `income.total = 0` e aviso `INCOME_MISSING`.

### Bloco C (2.26.0)
- `POST /v1/purchase-groups` `{ name, interest: bool, members: [{ cardId, totalInstallments, installmentAmount, remainingInstallments?, firstInvoiceDate, categoryId?, splitMode?, shares? }] }` -> `PurchaseGroup`.
- `GET /v1/purchase-groups?status=ACTIVE|DONE`, `GET /v1/purchase-groups/{id}`, `PUT /v1/purchase-groups/{id}` (nome/juros), `POST /v1/purchase-groups/{id}/members` `{ transactionId }` e `DELETE .../members/{transactionId}` -> `PurchaseGroup`.
- `GET /v1/purchase-groups/commitments?until=AAAA-MM` -> `{ until, committed, committedMine, byMonth[{competence, amount, mine}] }` (plural, não conflita com `/{id}`).

### Bloco D (2.27.0)
- `RecurrenceInput/Update/Recurrence` ganham: `originalAmount?` (`{ amount, currency }`, `USD|BRL|EUR`), `iofBps?` (padrão 350 com moeda estrangeira, P-9), `scope` (`PERSONAL|COMPANY`), `channel?`, `overlapGroup?`, `lastUsedOn?`, `activeUntil?`; derivados: `monthlyEquivalent: Money` (semanal x 52/12 sem arredondar antes de somar, um arredondamento final), `lastChargedAmount`.
- **Câmbio por cobrança (F-10):** o `fxRate` (string decimal, 6 casas) é informado **na confirmação de cada ocorrência/lançamento** (o endpoint existente de confirmar ocorrência aceita `originalAmount`, `fxRate`, `iofBps`; D1 fixa o caminho exato) e fica gravado no lançamento; `Recurrence.referenceFxRate?` é só a base da previsão. O `amount` BRL do lançamento é o cobrado (`original x fxRate` + IOF, um arredondamento).
- **Compra de cartão em moeda estrangeira** (spec §3): `CardPurchaseInput` aceita os mesmos `originalAmount`, `fxRate`, `iofBps?`.
- `GET /v1/subscriptions?status=ACTIVE|ENDED|ALL&scope=` -> `{ items[Subscription], totalMonthly, totalMonthlyMine, byScope, overlaps[{ group, items[], monthly }] }`.
- `POST /v1/recurrences/{id}/end` aceita `activeUntil` e devolve a `Recurrence` atualizada.

### Bloco E (2.28.0)
- `POST /v1/simulations/purchase` `{ amount, installments, interestRatePerMonthBps?, firstInstallmentMonth, cancelSubscriptionIds?[] }` -> `{ installmentAmount, months[{ competence, surplusBefore, surplusAfter, delta, negativeAfter }], classification, reasons[], endBalanceMin, financingWarning }`. Não grava. `classification`: `SUSTAINABLE|VIABLE_WITH_PLANNING|RISKY|INCOMPATIBLE` (regra de P-7, ADR-030).

### Bloco F (2.29.0)
- `GET/POST /v1/income-profiles`, `GET/PUT /v1/income-profiles/{id}`, `POST .../{id}/archive`: `{ source, gross, dependents, advance: { dayOfMonth, percentBps }, balanceDayOfMonth, deductions[{ kind, label, amount|percentBps, startsOn?, endsOn?, debtId? }], thirteenth: {...} }`.
- `GET /v1/income-profiles/{id}/preview?month=AAAA-MM` -> `{ gross, inss, irrf, fixedDeductions[], loanDeductions[], net, advance, balance, thirteenth }`, tudo calculado pelo backend.
- `POST /v1/income-profiles/{id}/generate-occurrences?from=&to=` -> recorrências de receita previstas com `incomeCompetence`, idempotente.
- `Debt` (empréstimo) ganha `kind: PERSONAL|PAYROLL|CARD_CASH_OUT` e `channel`; `GET /v1/debts/{id}` ganha `effectiveRate { monthlyBps, annualBps, method: "IRR" }` quando há valor recebido e cronograma.
- Pix no crédito: `POST /v1/card-cash-outs` `{ cardId, principal, installments, totalWithInterest | rateBps, firstInvoiceDate, beneficiaryPersonId?|null }` -> `Debt` (ADR-031, P-30).
- `GET /v1/tax-tables?year=2026` somente leitura; carga por migração versionada; correções por migração nova (nunca editar a aplicada).

### Bloco G (2.30.0)
- `POST/GET /v1/assets`, `GET/PUT/DELETE(arquivar) /v1/assets/{id}`: `{ kind: FGTS|OTHER, name, employer?, balance, balanceDate, monthlyDeposit?, availability: RESERVED|AVAILABLE }` (`FGTS` é sempre `RESERVED`). `POST /v1/assets/{id}/balance` `{ balance, date }` -> `Asset` (histórico preservado).
- `GET /v1/net-worth/overview` -> `{ availableCash, reservedAssets, receivablesPending, debts, emergencyReserve { amount, monthlyBase, coverageMonths, targetMonths? } }`.

### Bloco H (2.31.0)
- `CommitmentItemInput/CommitmentItem` (`LONG_TERM_PROJECT`) ganham `shares[{ personId|null, amount }]` (soma = valor do item) e `coBuyerPersonId?`; `Commitment` ganha `clauses { lateFeeBps, monthlyInterestBps, terminationRetentionBps, notes? }`, `totalsByPerson[{ personId|null, paid, pending, total }]`.
- `GET /v1/commitments/{id}/by-person` (opcional `format=csv`).

### Bloco I (2.32.0)
- `Card` ganha `autoDebit: bool|null` (P-31), `brand?`, `bestPurchaseDay?`, `lastDigits: string[]`; compra ganha `lastDigits?`.
- `provenance { origin, confidence }` opcional (sem `status`; o status é derivado) em `CommitmentItem`, `Recurrence`, `IncomeProfile`, `Asset`, rateio. Origem `PRINT|PAYSLIP|CONTRACT|INFORMED`; confiança `CONFIRMED|ESTIMATED`.
- `NotificationKind` ganha: `INVOICE_DUE_AUTODEBIT_OFF`, `NEGATIVE_MONTH_PROJECTED`, `NEW_DEBT_BEFORE_FINANCING`, `CARD_CASH_OUT_COST` (P-33), `SUBSCRIPTION_OVERLAP`, `SUBSCRIPTION_UNUSED`, `WEEKLY_CHARGE`, `THIRD_PARTY_OVERDUE`, `BALANCE_BELOW_REAL_ESTATE`, `DOCUMENT_DIVERGENCE`. Ajusta `/v1/settings/notifications` e `PurchasePreview.warnings` (`FINANCING_PENDING`).

## 7. Tasks

Convenções: cada task cabe num PR por repositório; nada mistura back e front. Back segue `BE 09`, front `FE 10`. Sem comentários no código. Todo aceite Dado/Quando/Então é **verificado no Lote 9** (rev 3: o dev só garante que compila, passa lint e ArchUnit de compilação; testes e QA só no final, seção 8) e a definição de pronto de `PR 02` (estado vazio, loading, erro, sem dupla contagem, funciona sem IA, dashboard x lista consistentes). Task de contrato (`x1`) altera só `contracts/openapi.yaml` e a ADR, que termina **Proposta** para o dono aprovar. Task de front depende de `./moneylog contract sync` do contrato correspondente. Migrações aplicam a regra da seção 4 (V9.xx só depois de DG-28). **Rev 3:** os critérios valem para a janela de novembro/2026; P-n em "Depende de" estão resolvidos (3.1/3.3); as tasks de `tester` (A6, B4, C4, D4, E4, F8, G4, H4, I5) só executam no Lote 9b.

### Bloco A: rateio e "minha parte" (prioridade 1)

**A1b | dev-backend | Emenda do contrato 2.24.x e da ADR-022 (recebimento "já no saldo")**
- Objetivo: tornar `accountId` opcional em `POST /v1/third-party-receipts` (removendo `RECEIPT_ACCOUNT_REQUIRED`), adicionar `settlement` na resposta, `view` em `/v1/recurrences/summary` e `FIXED_COSTS_MONTHLY`, e registrar na ADR-022 a contrapartida contábil do modo "já no saldo" (seção 5), P-28 e P-31b como decididas.
- Arquivos: `backend/contracts/openapi.yaml`, `docs/adrs/ADR-022-rateio-e-minha-parte.md`. Depois `./moneylog contract sync`.
- Aceite:
  - Dado o contrato, quando o linter roda, então passa, `accountId` é opcional e exemplos dos dois modos são sintéticos.
  - Dado a ADR-022, quando lida, então descreve `RECEIVABLE -X / EQUITY +X` (soma zero, sem `ACCOUNT`, `INCOME` ou `REFUND`), o efeito no patrimônio e as invariantes revisadas; o dev confirma no código qual livro guarda o saldo inicial e usa o mesmo.
  - Dado a emenda, então o `revisor` a confere antes de A4 começar (Lote 0).
- Depende de: A1.

**A1 | dev-backend | Contrato 2.24.0 e ADR-022 (CONCLUÍDA, ADR aceita pelo dono)**
- Objetivo: contrato do bloco A (incluindo `shares` em recorrência, `splitMode`, `PurchasePreview`, `view` em orçamentos/insights/metas) e ADR-022 com a reversão de ADR-014 §2.
- Arquivos: `backend/contracts/openapi.yaml`, `docs/adrs/ADR-022-rateio-e-minha-parte.md`.
- Aceite:
  - Dado o contrato, quando o linter do spec roda, então passa e os exemplos são sintéticos.
  - Dado a ADR-022, quando lida, então tem Contexto/Decisão/Consequências/Plano de quitação, o conteúdo mínimo da seção 5, diz "revoga ADR-014 §2" e "revisa ADR-021", e registra P-25/P-27/P-4/P-5/P-6 como decididas pelo dono em 2026-10-15.
  - Dado o dev-backend, quando verifica o código, então registra no PR se limite/cheque especial/meta com aporte/vínculo recorrência-cartão existem.
- Depende de: DG-29 mesclada (ordem de versão, seção 4). Concluída em 2026-10-15.

**A2a | dev-backend | Rateio no razão: criar compra rateada**
- Objetivo: gravar o rateio na criação (`BPS|EQUAL|AMOUNT`), gerar `RECEIVABLE` por parcela, expor as partes no `PurchasePreview`.
- Arquivos: `core/transaction/domain` (`CardTransactions`, novo `PurchaseShares`), `core/transaction/app`, `infra/transaction` (controller/DTO/mapper), `infra/ledger/persistence`, migração `V9.00__create_table_card_purchase_shares.sql`. Fixtures `db/it/shares/`.
- Aceite:
  - Dado compra de 300,00 em 3x no Cartão A com `BPS` eu 5000/Ana 5000, quando criada, então cada parcela gera `EXPENSE +50,00`, `RECEIVABLE(Ana) +50,00`, `CARD -100,00`, soma zero, fatura cheia 100,00.
  - Dado `EQUAL` entre eu, Ana e Beto numa parcela de 100,00, então Ana 33,33, Beto 33,33, dono 33,34 (P-5); em todas as parcelas o resto é do dono.
  - Dado `BPS` 3333/3333 (terceiros) em parcela de 100,00, então terceiros 33,33 cada e dono 33,34; Σ das partes = 100,00.
  - Dado shares com soma inválida, `personId` repetido ou `AMOUNT` que não soma a parcela, então `422 SHARES_INVALID` e nada é gravado.
  - Dado `purchase-preview` com shares, então devolve `myAmount`, `thirdPartyAmount` e `byPerson` por parcela, idênticos ao que a criação grava.
  - Dado compra rateada com a fatura paga integralmente, então o caixa cai 100,00, o consumo não muda e não há nova despesa.
  - Dado teste de propriedade (200 cenários), então Σ postings = 0 e `consumo(MINE) + a receber + recebido = consumo(GROSS)`.
  - Dado compra sem rateio, então números idênticos aos de hoje (regressão).
- Depende de: A1 (concluída).

**A2b | dev-backend | Rateio no razão: alterar, estornar, cancelar**
- Objetivo: `PUT shares`, edição de valor, estorno total/parcial e cancelamento de parcelas restantes de compra rateada, com travas.
- Arquivos: `core/transaction/domain|app` (`PurchaseShares`, revisões), `infra/transaction`, `infra/ledger`.
- Aceite:
  - Dado `PUT /shares` numa compra de 300,00 3x (eu 5000/Ana 5000 -> eu 7000/Ana 3000), quando executado em fatura **aberta ou fechada** (P-6), então as parcelas são reclassificadas por revisão (`EXPENSE` 70,00, `RECEIVABLE` 30,00 por parcela), `CARD` e caixa não mudam, e o patrimônio muda exatamente pela variação da minha parte (aqui, 30,00 por parcela x 3 = 60,00 a menos, porque deixam de ser a receber).
  - Dado o novo devido de Ana menor que o já recebido, então o comportamento de P-28 (decisão do dono: `422 SHARES_BELOW_RECEIVED`, nada gravado).
  - Dado estorno de uma parcela de 100,00 rateada 50/50, então `EXPENSE -50,00`, `RECEIVABLE(Ana) -50,00`, `CARD +100,00`, soma zero; com parte já recebida, o excedente recebido vira `PAYABLE` à pessoa, auditado (P-28b).
  - Dado cancelar as parcelas restantes (ex.: 2 de 3), então as duas saem proporcionalmente, as já lançadas permanecem e o recebível pendente de Ana cai 100,00.
  - Dado editar o valor da compra (`amount` diferente do atual), então `422 TRANSACTION_NOT_EDITABLE`: o valor não é editável (estornar e lançar de novo); só o rateio muda.
  - Dado `PUT shares` e recebimento ligado à compra concorrentes (teste de concorrência), então as travas seguem a ordem da ADR-008, sem deadlock e sem recebido acima do devido.
  - Dado outro usuário, então `404`.
  - Dado teste de propriedade com estorno, edição e recebimento parcial (200 cenários), então Σ postings = 0 e as invariantes da ADR-022 valem.
- Depende de: A2a, A4, A1b. P-28 decidida (recusar na edição) e P-28b provisória (estorno gera `PAYABLE`).

**A2c | dev-backend | Migração das marcas antigas para o rateio (P-4)**
- Objetivo: migrar **todas** as `ThirdPartyExpense` para o rateio, neutralizando o `REFUND` existente, com dry-run, relatório e aplicação controlada.
- Regras: marca sem valor = 100% da pessoa (modo `BPS` 10000 para a pessoa); marca com valor = modo `AMOUNT`, valor distribuído pelas parcelas em centavos exatos (resto nas primeiras parcelas, S-3), terceiros exatos. Para cada `REFUND` ligado à compra: ajuste auditado (`EXPENSE +r`, `RECEIVABLE -r`), preservando `ACCOUNT +r`, e o `REFUND` vira recebimento do rateio. Nada é apagado; tudo por revisão em `transaction_revisions`.
- Arquivos: migração de dados `V9.02__migrate_third_party_marks_to_shares.sql` (ou job de aplicação invocado por comando, conforme ADR-022), `core/transaction/app` (serviço de migração com `dryRun`), relatório em arquivo fora do repo (`~/.moneylog/import/relatorios`, nunca commitado).
- Aceite (banco sintético com casos: reembolso total, parcial, sem reembolso, marca com e sem valor, reembolso maior que a parte):
  - Dado `dryRun`, quando executado, então não grava nada e emite relatório por compra e por mês com: consumo antes, consumo `MINE` depois, `RECEIVABLE` pendente, já reembolsado, excecões; o relatório traz um hash.
  - Dado `apply`, então só roda com o hash do relatório aprovado pelo dono e após backup (`/v1/exports/backup`); repetir `apply` não duplica (idempotente).
  - **Prova de que o consumo não é contado duas vezes:** dado cada compra migrada, então `consumo(MINE) = P - t` (P parcela cheia, t parte de terceiro), `RECEIVABLE pendente = t - r`, e `consumo(MINE) + pendente + já reembolsado = P`; nunca `P - t - r`.
  - Dado cada mês, então o **caixa** antes = depois e nenhum `Transaction` some; o **patrimônio sobe** exatamente em `receivableRecognized` (= soma de `t - r - recebido legado`), porque a parte do terceiro passa a existir como recebível (antes ela não era ativo). O dry-run mostra `receivableRecognized` em destaque, e o dono aprova o hash sabendo desse aumento (decisão provisória delegada pelo dono, H5 do parecer de 2026-10-15).
  - Dado reembolso maior que a parte de terceiro (r > t), então a compra não é migrada, entra como exceção no relatório e permanece legado marcado, sem bloquear as demais.
  - Dado compra sem marca, então nada muda.
  - Dado reaplicar a leitura `GROSS`, então o consumo bruto por mês é igual ao de antes da migração para compras sem reembolso, e para compras com reembolso a diferença é exatamente `-r` explicada no relatório (o `REFUND` deixou de abater).
- Depende de: A2a, A3a, A4.

**A2d | dev-backend | Rateio em recorrência**
- Objetivo: `shares` em `RecurrenceInput/Update`; cada ocorrência lançada gera as partes pela mesma regra; mudar o rateio vale só para ocorrências futuras (P-31b).
- Arquivos: `core/recurrence/domain|app`, `infra/recurrence`, migração `V9.01__alter_recurrences_add_shares.sql`.
- Aceite:
  - Dado mensalidade de 100,00 no Cartão A rateada 50/50 com Ana, quando a ocorrência é lançada, então gera `EXPENSE +50`, `RECEIVABLE(Ana) +50`, `CARD -100`, e aparece em "a receber" de Ana.
  - Dado alteração do rateio, então ocorrências já lançadas não mudam e as futuras usam o novo.
  - Dado recorrência sem rateio, então comportamento atual (regressão).
- Depende de: A2a. Decidido (P-31b): vale em "minha parte" e mudança só para ocorrências futuras.

**A3a | dev-backend | `view` em resumo, dashboard e entries**
- Arquivos: `core/finance/domain` (`MonthlySummary`, `DashboardSummary`, `EntryReport`), `infra/summary`, `infra/dashboard`, `infra/transaction` (entries).
- Aceite:
  - Dado a compra de A2a, quando `GET /v1/summaries/2026-10` sem `view`, então `expenses` conta só a minha parte e `view = MINE`; com `GROSS`, a parcela cheia.
  - Dado o mesmo mês, quando comparo summary, `dashboard.month.consumption` e totais de `/v1/entries`, então os três coincidem em `MINE` e em `GROSS` (PR 01 regra 10).
  - Dado dados sem rateio, então todos os números ficam idênticos (regressão).
- Depende de: A2a.

**A3b | dev-backend | `view` em relatórios e fatura cheia x minha parte**
- Arquivos: `core/finance/domain` (`ConsumptionReport`, `IncomeExpenseSeries`, `SpendingByCategory`), `infra/reports`, `infra/card` (invoice).
- Aceite:
  - Dado a mesma compra, quando `spending-by-category` e `income-expenses`, então `MINE` x `GROSS` coincidem com o summary do mês (somas por categoria = consumo).
  - Dado uma fatura de 100,00 com 40,00 de terceiros, quando `GET /v1/invoices/{id}`, então `myShare = 60,00`, `thirdPartyShare = 40,00`, `shareByPerson` soma 40,00 e o total devido segue 100,00.
  - Dado dados sem rateio, então regressão idêntica.
- Depende de: A2a, A3a.

**A3c | dev-backend | `view` em orçamentos, insights e metas**
- Objetivo: orçamento (ADR-021), insights (ADR-019) e metas de medida (ADR-016) leem `MINE` por padrão e aceitam `view=GROSS`.
- Arquivos: `core/budget` (de DG-28), `core/insight`, `core/goal`, `core/recurrence` (summary), `infra/web`, ADR-021 emendada por ADR-022.
- Aceite:
  - Dado orçamento de categoria e a compra rateada, quando consulto o gasto, então é igual a `month.consumption` por categoria na mesma visão (invariante de ADR-021), em `MINE` e `GROSS`.
  - Dado insight de gasto e meta de medida, então usam a mesma visão do consumo e devolvem `view`.
  - Dado a meta `FIXED_COSTS_MONTHLY` e `GET /v1/recurrences/summary` com recorrência rateada, então ambos usam a minha parte e aceitam `view=GROSS`.
  - Dado dados sem rateio, então regressão idêntica.
- Depende de: A3a, DG-29 mesclada.

**A4 | dev-backend | "A receber" separado e recebimento**
- Arquivos: `core/finance/domain/ThirdPartyReceivables`, `core/thirdparty`, `infra/thirdparty`, `infra/debt`.
- Aceite:
  - Dado Ana com 50,00/mês em 3 parcelas, quando `GET /v1/debts/third-party-receivables`, então `people[Ana].months` lista 3 competências com `owed 50,00`, `received 0`, `pending 50,00` e total devido 150,00.
  - Dado recebimento de 50,00 ligado à compra **com `accountId`**, então `RECEIVABLE -50,00`, `ACCOUNT +50,00`, `settlement = ACCOUNT`, pendente de Ana 100,00, patrimônio inalterado e o resultado `MINE` do mês não muda.
  - Dado recebimento de 50,00 **sem `accountId`** ("já no saldo"), então `RECEIVABLE(Ana) -50,00` e `EQUITY +50,00` (soma zero), nenhum `ACCOUNT`, `INCOME` ou `REFUND`, `settlement = ALREADY_IN_BALANCE`, pendente de Ana 100,00, consumo `MINE` e `GROSS` inalterados e patrimônio reduzido em exatamente 50,00.
  - Dado recebimento maior que o pendente, então `422` e nada é gravado; dois recebimentos concorrentes nunca excedem o devido (ADR-008).
  - Dado o resultado do mês, então "a receber" nunca aparece em entradas (regras 1 e 11).
- Depende de: A2a, A1b.

**A5a | dev-frontend | Rateio no formulário, fatura e recorrência**
- Arquivos: `features/cards` (forms, `invoice.page`), formulário de recorrência, `common/api`, i18n pt-BR/en, DS (`DS 00/01`).
- Aceite:
  - Dado o formulário (compra e recorrência) com eu/pessoas e modo `BPS` ou "dividir igualmente", quando a soma não fecha 100%, então o botão fica desabilitado com mensagem (só validação de formato); as partes em reais vêm do `purchase-preview`.
  - Dado a fatura, então exibe "Fatura cheia" e "Minha parte" com os valores da API, sem calcular.
  - Estados vazio/loading/erro; 360px e 1280px; `data-testid`.
- Depende de: A2a, A2d, A3b (contrato sincronizado).

**A5b | dev-frontend | Visão padrão, "a receber" e edição do rateio**
- Arquivos: `features/home`, `features/transactions` (coluna minha parte), `features/people`/`debts`, `features/budgets` (após DG-31), edição de rateio.
- Aceite:
  - Dado Home, resumo, relatórios e orçamentos, quando abertos, então mostram "minha parte" por padrão com rótulo visível da visão e alternam para bruto.
  - Dado "a receber" vazio, em carga e em erro, então mostra os três estados.
  - Dado editar o rateio (inclusive em fatura fechada), então exibe o recurso atualizado e o erro `SHARES_BELOW_RECEIVED` em texto claro.
  - Dado registrar recebimento de terceiro, então o usuário escolhe explicitamente "mover para uma conta" ou "já está no saldo" (sem padrão silencioso), e o aviso do segundo explica o efeito no patrimônio; mostra `settlement` devolvido.
  - 360px e 1280px.
- Depende de: A3a, A3c, A4, A2b.

**A6 | tester | Validação do bloco A**
- Aceite (Lote 9b): roteiro com os casos do PR 01 (compra 6x, pagar fatura, "João devolve"), os dois modos de recebimento (invariantes da seção 5), rateio sintético, estorno/cancelamento/edição, recebimento concorrente, migração A2c (dry-run, apply, prova de não dupla contagem), consistência dashboard x entries x summary x orçamento em `MINE` e `GROSS`; relatório em `docs/qa/`; varredura de dado real.
- Depende de: A2b, A2c, A5a, A5b.

### Bloco B: resumo do mês e projeção (prioridade 2)

**B1 | dev-backend | Contrato 2.25.0 e ADR-023**
- Aceite: dado o contrato de `/v1/owner-statement` e dos campos `paymentMethod`/`nature`, quando validado, então passa; a ADR-023 traz a composição e a dedup da seção 5, registra P-1/P-2/P-3 como decididas (com a leitura B documentada) e P-29 conforme a resposta.
- Depende de: A1b, P-29 (3.3). O contrato fixa `months` 1 a 12 (padrão 3), `openingBalance` por P-32 e o aviso `OPENING_BALANCE_NOT_PROJECTED`.

**B2a | dev-backend | Forma de pagamento e natureza nas despesas**
- Arquivos: `core/transaction/domain`, `core/recurrence/domain`, `infra/*`, migração `V9.03__add_payment_method_and_nature.sql`.
- Aceite:
  - Dado registro antigo, quando migrado, então recebe os defaults de P-29 e nada muda de formato.
  - Dado despesa nova com `paymentMethod` e `nature`, então são gravados e devolvidos; valor inválido -> `422`.
- Depende de: B1.

**B2b | dev-backend | Composição das saídas do `OwnerStatement`**
- Objetivo: serviço de leitura que compõe `outflow` pelas fontes e chaves da ADR-023.
- Arquivos: `core/finance/domain` (novo `OwnerOutflow`, reusa `CommitmentSchedule`, `Ledger`), `core/finance/app`, `infra/statement`.
- Aceite (sintético):
  - Dado assinatura de 20,00 no Cartão A, **antes de lançada** (ocorrência prevista) e **depois de lançada**, quando consulto o mês, então ela aparece uma única vez em `cardsMine` nas duas situações (dedup por `(recurrenceId, occurrenceDate)`).
  - Dado parcela futura de compra existente e a fatura-alvo, então entra uma vez por `(transactionId, parcela)`.
  - Dado fatura com vencimento em M e fechamento em M-1, então cai em M (P-3).
  - Dado despesas Pix variável e boleto fixo, então `offCard` separa `fixed` e `variable` e `byMethod`.
  - Dado imóvel com minha cota, então `realEstateMine` usa a cota; sem cota, valor total com aviso `ESTIMATED` (P-19).
  - Dado pagamento de fatura e transferência, então não aparecem (regra 3).
  - Dado assinatura `COMPANY`, então segue P-10.
  - Dado parcela de consignado vinculada, então não entra (ADR-026).
- Depende de: B2a, A3a, A2d, D2, H2, P-10, P-19.

**B2c | dev-backend | Renda, sobra, saldo acumulado e endpoint**
- Objetivo: `income` por competência (lag), `surplus`, `endBalance`, `openingBalance`, `negativeMonths`, `receivablesPending`, endpoint `GET /v1/owner-statement`.
- Arquivos: `core/finance/domain` (`OwnerStatement`), `core/finance/app`, `infra/statement`, `infra/config`.
- Aceite (salário 5.000 competência setembro, saldo inicial 1.000):
  - Dado salário de competência M-1, faturas de M com minha parte 3.000, fixas 500 e imóvel minha cota 1.000, lag 1, quando `?from=M&months=3`, então `income.total = 5.000`, `outflow.total = 4.500`, `surplus = 500`, `endBalance = openingBalance + 500`.
  - Dado o exemplo da seção 3.1 (promoção) com `from=2026-11`, então novembro mostra 6.000 (competência outubro, leitura A) e os itens de `income.items` somam o `total` da coluna.
  - Dado reembolso de terceiro previsto e não recebido, então não entra em `income` nem em `endBalance`; aparece em `receivablesPending`.
  - Dado mês de sobra negativa, então `negative = true` e entra em `negativeMonths`.
  - Dado `from=2026-11` (posterior ao mês corrente), então `openingBalance` = saldo atual das contas `CASH` (P-32) com aviso `OPENING_BALANCE_NOT_PROJECTED` e `endBalance = openingBalance + surplus`. `months>1` é aceito pela API (mesmo cálculo), sem aceite nesta rodada.
  - Dado `confidence`, então `CONFIRMED` até I2.
  - Dado `cardsGross` ao lado de `cardsMine`, então não altera o `surplus`.
  - Dado mês sem renda, então `INCOME_MISSING`.
  - Dado outro usuário, então `404`; valores não aparecem em logs.
- Depende de: B2b.

**B3 | dev-frontend | Resumo do mês (novembro/2026) e colunas por `months`**
- Aceite (janela novembro/2026 como visão padrão; seletor de `months` opcional, sem aceite): Entradas, Saídas (minha parte), Sobra e Saldo fim lado a lado, sem cálculo local; mês negativo em cor + ícone + texto, anunciado a leitor de tela; estado vazio explica como cadastrar renda; erro e loading; alternar "ver fatura cheia" exibe `cardsGross`; 360px/1280px; DS.
- Arquivos: `features/statement`, rota, i18n.
- Depende de: B2c.

**B4 | tester | Validação do bloco B** — fórmula `sobra`/`saldo_fim`, ausência de dupla contagem (assinatura no cartão antes e depois de lançada), consistência de novembro com `/v1/projections`; `docs/qa/`. Lote 9b. Depende de: B2c, B3.

### Bloco C: compra agrupada (prioridade 3)

**C1 | dev-backend | Contrato 2.26.0 e ADR-024** — aceite como A1. Depende de: A1 (P-26 provisória, 3.3).

**C2 | dev-backend | `PurchaseGroup`**
- Arquivos: `core/purchasegroup` (domain/app/gateways), `infra/purchasegroup`, migração `V9.04__create_table_purchase_groups.sql`, `infra/config`.
- Aceite (sintético: "Notebook" em Cartão A 10x de 100 na 5ª parcela e Cartão B 3x de 50 na 1ª):
  - Dado o grupo, quando `GET /v1/purchase-groups/{id}`, então `total = 1.150`, `remaining` = Σ parcelas restantes, `lastDueDate` = a maior última parcela, `installmentAmountPerMonth` = soma do mês corrente.
  - Dado criação com membros, então cada membro é uma compra pelos caminhos existentes e criar não gera consumo retroativo (`ONGOING`).
  - Dado `GET /commitments?until=2026-11`, então `committed` soma as parcelas até novembro e `committedMine` considera o rateio, sem duplicar compras fora de grupo.
  - Dado estorno ou cancelamento de parcelas de uma compra membro (A2b), então o grupo recalcula; dado vincular compra de outro usuário, `404`.
  - Dado compra com rateio no grupo, então `myRemaining` usa a minha parte.
- Depende de: C1, A2a, A2b (P-28b: estorno gera `PAYABLE`).

**C3 | dev-frontend | Compras parceladas consolidadas** — agrupada por item com total, restante, mês final e "comprometido até X"; criar grupo e vincular compras. Valores só da API; estados; 360px/1280px; DS. Depende de: C2.

**C4 | tester | Validação do bloco C** — soma e mês final entre cartões, estorno, cancelar restantes. Depende de: C2, C3.

### Bloco D: assinaturas (prioridade 4)

**D1 | dev-backend | Contrato 2.27.0 e ADR-025** — fixa o caminho do `fxRate` por ocorrência. Depende de: A1 (P-9 a P-12 provisórias, 3.3).

**D2 | dev-backend | Recorrência como assinatura**
- Arquivos: `core/recurrence/domain` (`RecurringTransaction`, novo `SubscriptionCost`), `core/recurrence/app`, `infra/recurrence`, `core/transaction` (compra em moeda estrangeira), migração `V9.05__alter_recurrences_subscription_fields.sql`, `GET /v1/subscriptions`.
- Aceite (os números abaixo dependem de P-9; mudam se a resposta mudar):
  - Dado USD 5,00 com câmbio 5,000000 e IOF 350 bps, quando a cobrança é confirmada, então `amount` BRL = 25,88 (25,00 + 0,875 arredondado uma vez) e o razão fica só em BRL.
  - Dado a cobrança do mês seguinte com câmbio 5,200000 informado na confirmação, então o lançamento usa 5,2 e o anterior permanece intacto (câmbio por cobrança).
  - Dado compra de cartão comum em USD, então os mesmos campos valem.
  - Dado semanal de 5,30, então `monthlyEquivalent = 22,97` (5,30 x 52 / 12, um arredondamento final) e o total não acumula erro.
  - Dado `POST /recurrences/{id}/end` com `activeUntil`, então ocorrências até a data seguem previstas, depois dela não, a última lançada permanece e a recorrência volta atualizada.
  - Dado duas ativas no mesmo `overlapGroup`, então `overlaps` as lista; uma só, não.
  - Dado `COMPANY`, então fora de `totalMonthlyMine` e dentro de `totalMonthly` (P-10).
  - Dado recorrência sem os campos novos, então regressão idêntica.
- Depende de: D1, A2d.

**D3 | dev-frontend | Tela de assinaturas** — custo mensal equivalente, USD+IOF, câmbio por cobrança na confirmação, pessoal/empresa, "marcar cancelada (ativo até)", sobreposição (ícone + texto). Valores só da API; cancelamento exibe o recurso atualizado; estados; DS. Depende de: D2.

**D4 | tester | Validação do bloco D.** Depende de: D2, D3.

### Bloco E: simulador (prioridade 5)

**E1 | dev-backend | Contrato 2.28.0 e ADR-030** — ADR traz a regra de classificação e `reasons[]`. Depende de: B1 (P-7 e P-8 provisórias, 3.3).

**E2 | dev-backend | `POST /v1/simulations/purchase`**
- Objetivo: reusa o motor de B2b/B2c e `purchase-preview`; não grava.
- Arquivos: `core/finance/domain` (`PurchaseSimulation`), `core/finance/app`, `infra/simulation`.
- Aceite:
  - Dado compra de 1.200 em 6x sem juros e sobra de 500 no mês, então cada mês traz `surplusBefore`, `surplusAfter = before - 200` e `negativeAfter`.
  - Dado juros informado, então a parcela vem do mesmo cálculo da criação.
  - Dado `cancelSubscriptionIds`, então o impacto subtrai o equivalente mensal a partir da data atual.
  - Dado financiamento pendente (P-20), então `financingWarning = true`.
  - Dado a classificação, então segue a regra provisória de P-7 (3.3) em um único lugar do código (ADR-030): `INCOMPATIBLE`, `VIABLE_WITH_PLANNING`, `RISKY` e `SUSTAINABLE` cada um com um caso sintético e `reasons[]` do ramo.
  - Dado nada gravado, então a contagem de transações antes e depois é igual.
- Depende de: E1, B2c, D2, H2. Janela: `months[]` cobre novembro/2026 (`firstInstallmentMonth = 2026-11` no aceite); classificação pela regra estrutural de P-7 (3.3), sem limiares numéricos.

**E3 | dev-frontend | Simulador** — formulário, tabela mês a mês, selo da classificação com texto. Valores e classificação só da API; estados; DS. Depende de: E2.

**E4 | tester | Validação do bloco E** — inclui igualdade simular x comprar. Depende de: E2, E3.

### Bloco F: renda, consignado, TIR e Pix no crédito (prioridade 6)

**F1 | dev-backend | Contrato 2.29.0 e ADRs 026 e 031**
- Aceite: contrato válido; ADR-026 traz tabelas versionadas e os **lançamentos do consignado** (proposta: ao realizar o pagamento da folha, `ACCOUNT +líquido` e a parcela `LOAN` baixa o passivo (`PAYABLE`) com contrapartida em `INCOME` pela parcela, sem `EXPENSE` de principal, juros se houver como `EXPENSE`; soma zero); ADR-031 traz o Pix no crédito (`ACCOUNT +principal`, `EXPENSE +juros`, `CARD -total`, sem consumo do principal; para terceiro, `RECEIVABLE`). Ambas "Proposta" (P-15/P-30 provisórias, 3.3). ADR-031 registra também o alerta `CARD_CASH_OUT_COST` (P-33). **F1 registra a fonte oficial** das tabelas INSS/IRRF 2026 e do redutor da Lei 15.270/2025 (órgão, norma, URL, data de consulta, vigências) na ADR-026 e no cabeçalho do PR; sem fonte confirmada, não escreve número.
- Depende de: A1 (demais P-n resolvidos em 3.3; P-13 por fonte oficial citada).

**F2 | dev-backend | Tabelas fiscais e cálculo do líquido**
- Arquivos: `core/income` (domain: `TaxTable`, `InssCalculator`, `IrrfCalculator`; app; gateways), `infra/income`, migração `V9.06__seed_tax_tables_2026.sql` (dados e fonte oficial citada no cabeçalho do PR e na tabela `tax_table_sources`), `infra/config`.
- Aceite (todos com dados sintéticos, em CI):
  - Dado INSS progressivo, quando o bruto cruza duas faixas, então o INSS é a soma por faixa em centavos, sem ponto flutuante, igual a casos calculados de forma independente a partir da tabela oficial citada (valores esperados escritos na fixture com a conta passo a passo, não gerados pelo próprio código nem copiados do holerite do dono).
  - Dado IRRF com dedução por dependente, redutor e desconto simplificado, então bate com casos independentes (um por regime de dedução).
  - **Vigências distintas:** dado tabelas de teste (fictícias, rotuladas) em que a vigência do INSS muda a partir de uma competência e a do IRRF a partir de uma data de pagamento diferente, então para um pagamento no mês de transição o INSS usa a tabela da competência e o IRRF a da data do pagamento, com os dois resultados esperados distintos.
  - Dado corrigir uma tabela, então se faz por migração nova com nova vigência/versão; a migração aplicada não é editada (checksum).
  - Dado o caso real do holerite do dono, então só existe como script manual fora do repo (`~/.moneylog`), nunca em CI.
  - Dado `GET /v1/tax-tables?year=2026`, então lista vigências, só leitura.
- Depende de: F1. Valores só de fonte oficial citada pelo dev (dado de configuração versionado em `tax_table_sources`, sem número no código); se a fonte não puder ser confirmada, entrega o calculador com tabela ausente e `TAX_TABLE_UNAVAILABLE`, e reporta o bloqueio em vez de inventar.

**F3 | dev-backend | Perfil de renda, rubricas, ocorrências e consignado em folha**
- Arquivos: `core/income` (`IncomeProfile`, `PayrollDeduction`), `core/debt` (vínculo `payrollDeducted`), `infra/income`, migração `V9.07__create_tables_income_profiles.sql`.
- Aceite:
  - Dado rubrica `LOAN` vinculada a uma dívida e no período, quando a folha é realizada, então o razão segue os lançamentos da ADR-026 (Σ = 0, sem `EXPENSE` de principal) e a parcela da dívida é baixada.
  - Dado a mesma parcela, então **não** aparece em `DebtOverview` como a vencer, nem em `CommitmentSchedule`, nem como saída em relatórios (sem saída duplicada); a dívida continua no total de dívidas (ADR-013).
  - Dado rubrica fora do período, então não reduz o líquido.
  - Dado adiantamento de 40% no dia 16 e saldo no início do mês seguinte, então a soma dos dois líquidos = líquido mensal da prévia (propriedade).
  - Dado `generate-occurrences`, então cria receitas previstas com `incomeCompetence` correta, uma por pagamento, sem duplicar ao rodar duas vezes.
  - Dado 13º, então a 1ª parcela sem descontos entra como ocorrência separada, na competência do mês em que é paga (novembro no aceite); o cálculo da 2ª parcela (dezembro) fica fora desta rodada (P-16).
  - Dado outro usuário, então `404`; valores fora dos logs.
- Depende de: F2.

**F4 | dev-backend | TIR do empréstimo**
- Arquivos: `core/debt/domain` (`EffectiveRate`), `infra/debt`.
- Aceite:
  - Dado recebido 5.000 e 10 parcelas de 600, então `effectiveRate.monthlyBps` coincide com a TIR de referência (tolerância 1 bps) e `annualBps = (1+i)^12-1`.
  - Dado parcelas somando o principal, então taxa 0; sem cronograma ou valor recebido, `effectiveRate` ausente.
  - Dado ArchUnit, então passa (sem `double`).
- Depende de: F1.

**F5 | dev-backend | Pix no crédito como empréstimo**
- Arquivos: `core/debt`, `core/transaction/domain` (compra `CARD_CASH_OUT`), `infra/card`, migração `V9.08__alter_debts_kind_channel.sql`.
- Aceite (casos do PR 01 "dinheiro emprestado"):
  - Dado Pix no crédito de principal 1.000, 4 parcelas de 280 no Cartão A, quando criado, então `ACCOUNT +1.000`, **sem** `EXPENSE` do principal, `EXPENSE` só de juros (120), `CARD -1.120`, soma zero; o recebimento em conta **não** é renda; consumo do mês não sobe 1.000.
  - Dado a fatura, então a parcela de 280 compõe o valor devido (fatura cheia), e `cardsMine` do resumo inclui a parcela (é saída de caixa).
  - Dado o mesmo Pix feito para Ana, então o principal vira `RECEIVABLE(Ana)` em "a receber" e não é consumo meu; só o juro que eu absorvo (se houver) é meu.
  - Dado `kind = CARD_CASH_OUT`, então entra em dívidas e na TIR (F4); `channel` devolvido.
- Depende de: F1, A2a, A4. Emite o alerta `CARD_CASH_OUT_COST` (P-33) via I3.

**F6 | dev-frontend | Tela de renda** — perfil, rubricas, prévia, geração de ocorrências; consignado visível como desconto em folha. Só valores da API; estados; DS. Depende de: F3.

**F7 | dev-frontend | Taxa efetiva e Pix no crédito** — a.m./a.a. na dívida ("sem dados para calcular" quando ausente) e formulário de Pix no crédito. Depende de: F4, F5.

**F8 | tester | Validação do bloco F** — tabelas com vigências distintas, rubricas, soma adiantamento + saldo, TIR, ausência de saída duplicada do consignado em `owner-statement`, `DebtOverview` e `CommitmentSchedule`, Pix no crédito (caso PR 01), escopo por usuário. Depende de: B2c, F3, F4, F5, F6, F7.

### Bloco G: patrimônio (prioridade 7)

**G1 | dev-backend | Contrato 2.30.0 e ADR-027** — Depende de: A1.

**G2 | dev-backend | Ativos e reserva de emergência**
- Arquivos: `core/asset` (domain/app/gateways), `core/finance/domain/NetWorth`, `infra/asset`, migração `V9.09__create_tables_assets.sql`.
- Aceite:
  - Dado FGTS de 10.000, então aparece em `reservedAssets` e **não** em `availableCash` nem na base da reserva (regra 10); limite de cartão e cheque especial ficam fora do disponível.
  - Dado reserva 3.000 e base 1.000 (saídas fixas "minha parte" de novembro, B2b, P-18), então `coverageMonths = 3,0`.
  - Dado atualizar o saldo, então o histórico é preservado e a resposta devolve o ativo.
  - Dado FGTS, então não entra em renda nem em `owner-statement`.
  - Dado sem ativos, então o patrimônio é igual ao anterior (regressão); outro usuário `404`; saldos fora dos logs.
- Depende de: G1, A4, B2b.

**G3 | dev-frontend | Tela de patrimônio** — conta, FGTS ("não disponível"), dívidas, a receber, reserva e cobertura. Depende de: G2.

**G4 | tester | Validação do bloco G.** Depende de: G2, G3.

### Bloco H: imóvel (prioridade 8)

**H1 | dev-backend | Contrato 2.31.0 e ADR-029** — Depende de: A1.

**H2 | dev-backend | Cota por parcela e cláusulas em `LONG_TERM_PROJECT`**
- Arquivos: `core/commitment/domain` (`ScheduleItem`, `TrackedCommitment`), `infra/commitment`, migração `V9.10__alter_commitment_items_shares_and_clauses.sql`.
- Aceite (sintético: 3 parcelas de 2.000, 6.000 e 3.000):
  - Dado cotas informadas (eu 1.000 em 2.000; eu 2.000 e Ana 4.000 em 6.000), então `totalsByPerson` mostra pago e pendente por pessoa e a soma por pessoa = valor do item.
  - Dado soma de cotas diferente do valor, então `422 SHARES_INVALID`.
  - Dado item sem cota, então "não definida", `ESTIMATED` (P-19).
  - Dado marcar pago, então a cota paga é a registrada e o `FINANCING` segue fora do pendente direto.
  - Dado `clauses` (multa 200 bps, juros 100 bps a.m., retenção 700 bps), então guardadas; a retenção sobre o preço é calculada pelo backend.
  - Dado compromisso antigo, então regressão idêntica.
- Depende de: H1.

**H3 | dev-frontend | Tela do imóvel** — cronograma, cotas, totais por pessoa, marcos, cláusulas, CSV. Depende de: H2.

**H4 | tester | Validação do bloco H.** Depende de: H2, H3.

### Bloco I: alertas, proveniência e cartão (prioridade 9)

**I1 | dev-backend | Contrato 2.32.0, ADR-028 e campos de cartão**
- Arquivos: `openapi.yaml`, ADR-028, `core/card/domain`, `infra/card`, migração `V9.11__alter_credit_cards_autodebit_digits.sql`.
- Aceite:
  - Dado cartão existente, quando migrado, então `autoDebit` fica conforme P-31a (recomendado `null`, sem alerta até o dono marcar) e demais campos vazios; nada muda de formato.
  - Dado compra com `lastDigits` que não pertence ao cartão, então `422`.
  - Dado fatura, então sem quebra por final (P-24, se confirmado).
- Depende de: A1. Adiciona `CARD_CASH_OUT_COST` ao `NotificationKind` (P-33).

**I2 | dev-backend | Proveniência (origem e confiança)**
- Arquivos: `core/sk` (`Provenance`), migração `V9.12__add_provenance_columns.sql` em itens de compromisso, recorrências, perfil de renda, ativos e rateios.
- Aceite:
  - Dado registro novo sem proveniência, então `INFORMED`/`CONFIRMED`; antigo migrado igual; **não** há campo `status` persistido (derivado na leitura).
  - Dado item `ESTIMATED`, então a resposta o devolve e o `OwnerStatement` marca o ponto com o pior `confidence` de seus itens.
- Depende de: I1, B2c, F3, G2, H2 (as entidades precisam existir).

**I3 | dev-backend | Geradores de alerta novos**
- Arquivos: `core/notification/domain` (`NotificationKind`, `NotificationGenerators`, `NotificationPlanner`, `GenerationContext`), `infra/notification`, settings, `PurchasePreview.warnings`.
- Aceite (um teste por alerta, relógio fixo):
  - Fatura vence em ≤3 dias com `autoDebit = false` (P-21), então `INVOICE_DUE_AUTODEBIT_OFF`; com `true` ou `null`, só `INVOICE_DUE`.
  - Mês projetado negativo, então `NEGATIVE_MONTH_PROJECTED` com o mês.
  - Nova compra parcelada ou `CARD_CASH_OUT` com financiamento pendente (P-20, P-30), então `FINANCING_PENDING` no preview e `NEW_DEBT_BEFORE_FINANCING` após gravar.
  - Duas assinaturas no mesmo grupo, `SUBSCRIPTION_OVERLAP`; `lastUsedOn` antigo, `SUBSCRIPTION_UNUSED`; semanal, `WEEKLY_CHARGE` uma vez.
  - Recebível pendente com fatura vencida, `THIRD_PARTY_OVERDUE`.
  - Saldo `CASH` menor que a próxima obrigação "minha cota", `BALANCE_BELOW_REAL_ESTATE`.
  - Divergência além da tolerância (P-22), `DOCUMENT_DIVERGENCE`.
  - Pix no crédito registrado, então `CARD_CASH_OUT_COST` uma vez, com taxa efetiva mensal (F4) e valor da parcela (P-33).
  - `SUBSCRIPTION_UNUSED` só dispara com `subscriptionUnusedDays` definido; sem ele, inativo (P-12).
  - Execução repetida no mesmo dia não duplica (idempotência V7.02); funciona sem IA.
- Depende de: I1, I2, B2c, D2, H2, A4, G2, F5.

**I4 | dev-frontend | Alertas, selos e campos de cartão** — título/texto/rota por alerta e liga/desliga; selo "estimado" com texto; cartão salva `autoDebit` e finais; estados; 360px/1280px; DS. Depende de: I2, I3.

**I5 | tester | Validação do bloco I** — roteiro dos 7 alertas da seção 6 do resumão com relógio controlado. Depende de: I3, I4.

Ao final (Lote 9d): uma rodada de regressão total do PR 01 (tester) após I5.

## 8. Ordem de execução (rev 3)

Premissas: o contrato é um único arquivo; contratos de blocos distintos **serializam o merge** (A1b, B1, C1, D1, E1, F1, G1, H1, I1) e as versões são atribuídas nessa ordem (seção 4). Lotes obedecem às dependências; dentro do lote tudo é paralelo (exceto o merge serializado dos contratos). **A1 está concluída** (contrato 2.24.0 + ADR-022 aceita). Todas as perguntas em aberto foram resolvidas (seção 3), então nenhuma task fica fora de lote por pergunta. **Nenhum teste, QA ou tester roda antes do Lote 9**: os devs só compilam e rodam o build/lint (`./moneylog` build, ArchUnit de compilação incluído) por lote; os critérios Dado/Quando/Então de cada task são verificados no lote final.

0. **Lote 0 (sessão principal):** `revisor` confere o diff desta rev 3 e a emenda da ADR-022 (A1b). DG-28/DG-29 já mescladas (A1 as exigia); confirmar DG-31 antes de A5b.
1. **Lote 1:** A1b (emenda do contrato 2.24.x e da ADR-022), A2a, B1, C1, D1, F1, G1, H1 (contratos em série, código em paralelo).
2. **Lote 2:** A3a, A4, A2d, B2a, E1, F2, F4, H2, I1.
3. **Lote 3:** A2b, A3b, A3c, D2, F3, F5, H3.
4. **Lote 4:** A2c, B2b, C2, A5a, D3, F6, F7.
5. **Lote 5:** B2c, A5b, C3, G2.
6. **Lote 6:** B3, E2, I2, G3.
7. **Lote 7:** E3, I3.
8. **Lote 8:** I4. Revisão de código do `revisor` em A2a, A2b, A2c (ADR-008, dupla contagem, casos do PR 01), A4 (modo "já no saldo"), B2b (dedup) e F2/F3 (fonte fiscal e consignado) acontece ao fim do lote em que a task entra, sem testes.
9. **Lote 9 (final: testes, QA e correções):**
   - 9a. **T0 (tester):** fixtures sintéticas de **novembro/2026** em `db/it/novembro-2026/` (cartões A/B, Ana e Beto, assinaturas, perfil de renda, imóvel, Pix no crédito) e os dados de exemplo da demonstração.
   - 9b. Em paralelo, os testers por bloco, que escrevem e rodam os testes (unitários, de propriedade, de concorrência, de integração) e reportam em `docs/qa/`: A6, B4, C4, D4, E4, F8, G4, H4, I5.
   - 9c. **Correções:** cada bug volta ao dev da task, com revisão do `revisor` nos 🔴/🟠; repetir 9b só para o que mudou.
   - 9d. **Regressão total do PR 01** (tester) e varredura de dado real antes de qualquer commit.

Trilha crítica: A1 -> A2a -> A4 -> A2b -> A2c e A1 -> B1 -> B2a -> B2b (precisa de D2, H2) -> B2c -> B3; depois o Lote 9. As tasks `A6, B4, C4, D4, E4, F8, G4, H4, I5` da seção 7 só executam no 9b; as dependências delas continuam valendo.

Commits por repositório: back, depois front, depois o principal avança os ponteiros (`git add backend frontend`); push dos submódulos antes do principal.

## 9. Riscos

- **Troca do padrão para `MINE` (P-27):** muda números já exibidos, inclusive orçamentos do DG. Mitigação: regressão (sem rateio nada muda), rótulo da visão em toda tela, avisar o dono antes de mesclar A3.
- **Migração de marcas (A2c):** pode alterar consumo histórico (o `REFUND` deixa de abater e a parte vai para `RECEIVABLE`). Mitigação: dry-run com relatório por mês, prova `MINE + pendente + reembolsado = bruto`, backup, aplicação com hash aprovado, idempotência.
- **Razão (A2a/A2b):** estorno, edição e recebimento concorrente mal definidos geram dupla contagem silenciosa. Propriedade de 200 cenários, teste de concorrência e revisão do `revisor`.
- **OwnerStatement (B2b):** dedup recorrência x fatura é o risco central do PR 01 regra 1; chave por fonte e teste antes/depois de lançada.
- **Colisão com o DG:** contratos 2.21 a 2.23 e V8.18 reservados; A3c e A5b dependem de DG-29/DG-31; migrações V9.xx só após V8.18; renumerar no merge.
- **Defasagem e âncora do saldo:** se mal entendidas, a projeção "mente"; validar contra a planilha do dono, fora do repo. A leitura B (por data) fica documentada como alternativa.
- **Tabelas fiscais** envelhecem e têm vigências distintas (INSS pela competência, IRRF pela data de pagamento); corrigir por migração nova; teste só com dado sintético.
- **Pix no crédito e consignado** dependem de decisões de modelagem (P-15, P-30); ADR antes do código.
- **Contrato único** com 9 bumps: conflito em `openapi.yaml`; serializar merges.
- **Dados reais e sensíveis:** proibidos em testes/fixtures; renda e ativos com escopo por usuário e fora de logs; varredura antes de cada commit.
- **Recebimento "já no saldo":** se o dinheiro não estiver de fato no saldo real, o patrimônio fica subestimado em X; mitigação: escolha explícita no front, aviso do efeito, relatório de conciliação e revisão do `revisor` na ADR-022 (A1b).
- **Decisões provisórias (3.3):** podem ser revertidas pelo dono; P-7 e P-12 não tinham recomendação e usam regra mínima sem número; revisar antes de confiar na classificação do simulador.
- **Janela só de novembro:** `openingBalance` sem projetar o resto de outubro (P-32) pode divergir do saldo real no 1º de novembro; o aviso é exibido; meses fora da janela não têm aceite.
- **Tabelas fiscais sem fonte confirmada:** F2 não inventa; sem fonte, a renda líquida de novembro responde `TAX_TABLE_UNAVAILABLE`.
- **Sem testes até o Lote 9:** defeitos se acumulam; mitigação: revisão de código do `revisor` por lote nas tasks críticas e correção no 9c.
- **Escopo grande** (~60 tasks após as quebras): entregar bloco a bloco, validando cada um (PR 02).
