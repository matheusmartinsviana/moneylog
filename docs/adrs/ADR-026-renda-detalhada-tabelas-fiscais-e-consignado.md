# ADR-026: renda detalhada, tabelas fiscais versionadas e consignado em folha

Status: **PROPOSTA** (2026-10-15). P-14, P-15, P-16 e P-17 são decisões provisórias delegadas pelo dono; P-13 exige fonte oficial citada, que está abaixo (seção 1). Plano: `docs/planos/2026-10-15-adequacao-ao-resumao.md` (bloco F, task F1). Contrato: 2.29.0. Complementa a ADR-017 (competência de renda) e a ADR-013 (total de dívidas).

## Contexto
O dono recebe salário com adiantamento (percentual no meio do mês) e saldo no mês seguinte, com INSS, IRRF, benefícios e um empréstimo consignado descontado em folha, mais o 13º. Hoje a renda é lançada à mão. Para responder "quanto do meu salário sobra" (ADR-023) o sistema precisa do **líquido** calculado, sem número inventado, e do consignado sem virar saída duplicada.

Regras do PR 01: 1 (sem dupla contagem: a parcela do consignado já foi descontada do líquido), 2 (investimento/empréstimo não é despesa; principal não é consumo), 8 (dinheiro exato, sem ponto flutuante), 11 (o que me devem não é renda).

## Decisão

### Provisórias (delegadas pelo dono em 2026-10-15)
| # | Decisão |
|---|---|
| P-14 | Rubricas livres com tipo: `TAX`, `BENEFIT`, `UNION`, `LOAN`, `OTHER`. |
| P-15 | O consignado segue como passivo (ADR-013). A rubrica `LOAN` aponta para a dívida (`debtId`); é vinculado e **não** gera "conta a pagar". Lançamentos na seção 3. |
| P-16 | 13º: duas ocorrências separadas; a 1ª sem descontos, na competência do mês em que é paga (novembro no aceite). A 2ª parcela (dezembro) fica fora desta rodada. |
| P-17 | TIR sobre parcelas mensais regulares; mensal e anual `(1+i)^12-1` (ADR-031 usa a mesma). |

### 1. Fonte oficial das tabelas (P-13)
Consulta feita em **2026-10-15** pelo dev-backend, nas páginas oficiais abaixo (nada foi tirado de memória). Qualquer divergência futura se corrige por **migração nova** com nova vigência/versão.

| Tabela | Órgão | Norma | URL | Atualização da página | Vigência |
|---|---|---|---|---|---|
| INSS, empregado | Instituto Nacional do Seguro Social / Ministério da Previdência Social | Portaria Interministerial MPS/MF nº 13, de 09/01/2026 | https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal | 13/01/2026 | competências a partir de **janeiro/2026** |
| IRRF, tabela progressiva mensal, dedução por dependente e desconto simplificado | Receita Federal | Lei nº 15.191, de 11/08/2025 (tabela com a 1ª faixa ampliada a partir de maio/2025, valores iguais em 2026); página "Tributação de 2026" | https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026 | 27/04/2026 | a partir de **janeiro/2026** (data de pagamento) |
| IRRF, redutor mensal | Presidência da República (Planalto) | Lei nº 15.270, de 26/11/2025 (art. 3º-A da Lei nº 9.250/1995), DOU 27/11/2025; art. 8º: em vigor na publicação, **efeitos a partir de 01/01/2026** | https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15270.htm (e Receita Federal, tabela de redução mensal, mesma URL do IRRF acima) | texto original | a partir de **janeiro/2026** |
| Exemplos oficiais de aplicação | Receita Federal | Lei nº 15.270/2025 | https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/exemplos-de-aplicacao-da-lei-15-270-2025 | consultado em 2026-10-15 | referência de teste (ver seção 4) |

Vigências distintas (essencial): o **INSS** é pela **competência** (contribuições a partir da competência janeiro/2026); o **IRRF** é pela **data do pagamento**. Em mês de transição o INSS usa a tabela da competência e o IRRF a da data do pagamento.

#### INSS, empregado, competência a partir de 01/2026 (progressivo, soma por faixa, em centavos)
| Salário de contribuição | Alíquota (bps) |
|---|---|
| até 1.621,00 | 750 |
| de 1.621,01 a 2.902,84 | 900 |
| de 2.902,85 a 4.354,27 | 1200 |
| de 4.354,28 a 8.475,55 | 1400 |

Teto do salário de contribuição: 8.475,55. Para o 13º (2ª parcela, fora desta rodada) a alíquota incide em separado, sem somar ao salário mensal (nota 3 da página).

#### IRRF mensal, pagamento a partir de 01/2026 (alíquota x base - parcela a deduzir)
| Base de cálculo | Alíquota (bps) | Parcela a deduzir |
|---|---|---|
| até 2.428,80 | isento | - |
| de 2.428,81 a 2.826,65 | 750 | 182,16 |
| de 2.826,66 a 3.751,05 | 1500 | 394,16 |
| de 3.751,06 a 4.664,68 | 2250 | 675,49 |
| acima de 4.664,68 | 2750 | 908,73 |

Dedução mensal por dependente: 189,59. Limite mensal do desconto simplificado: 607,20 (25% de 2.428,80). O desconto simplificado substitui as deduções legais quando é mais vantajoso (exemplos oficiais).

#### Redutor mensal (Lei nº 15.270/2025, art. 3º-A da Lei nº 9.250/1995)
- Rendimentos tributáveis até 5.000,00: redução de até 312,89, de modo que o imposto devido seja zero.
- De 5.000,01 a 7.350,00: redução = `978,62 - (0,133145 x rendimentos tributáveis sujeitos à incidência mensal)`, decrescente linearmente até zerar em 7.350,00.
- Acima de 7.350,00: sem redução. A redução fica limitada ao imposto apurado pela tabela progressiva (art. 3º-A, §1º), vale também para o 13º (§3º).
- O "rendimento tributável" da fórmula é o **salário**, não a base de cálculo (observação do exemplo 5 da Receita Federal).

O que **não** foi confirmado nesta rodada: a tabela de IRRF anterior a 2026 e a tabela de INSS anterior a 2026 (não são necessárias para novembro de 2026); a regra do 13º 2ª parcela (fora do escopo). Nada disso entra como número no código. Se uma tabela vigente faltar para a competência ou data pedida, o cálculo responde `422 TAX_TABLE_UNAVAILABLE`.

### 2. Modelo
- **Tabelas** versionadas por vigência em dado de configuração (migração `V9.06__seed_tax_tables_2026.sql`, nome a renumerar no merge): `tax_tables` (tipo, versão, `effective_from`/`effective_to`, base `COMPETENCE|PAYMENT_DATE`, faixas, parâmetros) e `tax_table_sources` (órgão, norma, URL, data de consulta). **Nenhum número fiscal no código Java.** Cálculo em inteiros (centavos `long`/`BigDecimal` com escala fixa), arredondamento definido e testado.
- **Perfil de renda (`IncomeProfile`)**: bruto, dependentes, adiantamento (`dayOfMonth`, `percentBps` do líquido), `balanceDayOfMonth` (mês seguinte à competência), rubricas, 13º. Escopo por usuário (outro usuário: `404`); valores fora dos logs.
- **Líquido**: `net = gross - INSS - IRRF - Σ rubricas fixas - Σ rubricas LOAN no período`. `adiantamento = piso(net x percentBps / 10000)` e `saldo = net - adiantamento` (a soma dos dois é o líquido). Rubrica fora do período não reduz.
- **IRRF**: base = bruto - INSS - dependentes (ou desconto simplificado, o que for mais vantajoso); `imposto = base x alíquota - parcela`; redutor conforme o rendimento tributável (salário); `IRRF = max(0, imposto - redução)`.
- **Ocorrências**: `generate-occurrences` cria uma receita prevista por pagamento (adiantamento, saldo, 1ª parcela do 13º) com `incomeCompetence` da competência paga (ADR-017), identificada por perfil + competência + tipo, idempotente.

### 3. Consignado em folha (P-15), lançamentos propostos
A rubrica `LOAN` com `debtId` e no período, ao realizar o pagamento da folha, produz (soma zero, sem `EXPENSE` de principal):

| Lançamento | Valor |
|---|---|
| `ACCOUNT` | `+ líquido recebido (N)` |
| `PAYABLE(dívida)` | `+ parcela p` (baixa o passivo) |
| `INCOME` | `- (N + p)` (renda; o consignado é pagamento de dívida feito pela folha, não consumo) |
| `EXPENSE` (só se a parcela tiver juros) | `+ juros`, com `PAYABLE` baixando só `p - juros` |

Efeitos: a parcela **não** aparece como saída em `owner-statement`, `DebtOverview` (como a vencer) nem `CommitmentSchedule` (ADR-023 regra 4); a dívida continua no total de dívidas (ADR-013) até ser baixada. Não é despesa (regra 2); o patrimônio sobe só pelo líquido mais a baixa do passivo.

Pontos a decidir pelo dono na aprovação:
1. **Renda no razão = N + p** (renda economicamente recebida) enquanto o `owner-statement` usa **N** (o que cai na conta). A diferença p é explicada pela baixa da dívida; o dashboard (`month.income`) e o `owner-statement` mostrariam rendas diferentes. Alternativa: lançar só `N` como renda e baixar o passivo contra `EQUITY` (renda menor, sem divergência de tela, mas o passivo cai sem contrapartida de resultado).
2. **Parte de juros da parcela**: o `Debt` não guarda cronograma; sem a divisão principal/juros informada, toda a parcela baixa principal (sem `EXPENSE`). Decisão provisória delegada pelo dono (contrato 2.32.1): `interestAmount` opcional na rubrica `LOAN`; sem ele, `confidence = ESTIMATED` e aviso `PAYROLL_INTEREST_NOT_SPLIT`; nunca se inventa a divisão.

Decisão provisória sobre o ponto 1: mantém-se `N + p` no razão; a tela expõe `receivedInAccount = N` e `appliedToDebt = p`, a sobra do `owner-statement` usa `N`, e um teste prova que `receivedInAccount + appliedToDebt` do Início é igual à renda do razão.

### 4. Testes (resumo para F2/F3; só dado sintético em CI)
- INSS progressivo e IRRF com valores esperados escritos na fixture com a conta passo a passo, independentes do código e **não** copiados de holerite real.
- Os exemplos oficiais da Receita Federal (URL da seção 1) servem de referência para o **IRRF**, tomando a contribuição previdenciária como dado do exemplo. Atenção: os valores de INSS citados nesses exemplos (por exemplo 373,41 para 4.000,00) correspondem à tabela de INSS **anterior** (2025), não à de 2026 (para 4.000,00 a tabela 2026 dá 368,60); portanto o teste de INSS usa as faixas de 2026 desta ADR, não os números dos exemplos.
- Vigências distintas com tabelas de teste fictícias e rotuladas (INSS pela competência, IRRF pela data de pagamento).
- O caso real do holerite do dono fica em script manual fora do repo (`~/.moneylog`), nunca em CI.

## Alternativas consideradas
1. **Tabelas no código**: rejeitada (envelhecem; exigiria deploy para corrigir).
2. **Um único `effectiveFrom` para INSS e IRRF**: rejeitada, as vigências têm base distinta (competência x pagamento).
3. **Consignado como despesa**: rejeitada, duplicaria a saída e trataria empréstimo como despesa (regras 1 e 2).
4. **Preencher o líquido à mão**: não responde "quanto sobra" com previsão.

## Consequências
- Tabelas fiscais envelhecem: corrigir por migração nova, sem editar a aplicada.
- O líquido previsto pode diferir do holerite (rubricas não modeladas); `confidence` e a prévia mostram a origem.
- Backup passa a incluir `income_profiles` (pendência de contrato do backup em F3).

## Plano de quitação
F2 (tabelas e cálculo; fonte desta ADR), F3 (perfil, rubricas, ocorrências e consignado), F4 (TIR), F6 (tela), F8 (QA). Revisar P-14 a P-17 e os dois pontos da seção 3 depois do primeiro uso real.

## O que o dono precisa aprovar
1. As tabelas e a fonte da seção 1.
2. Os lançamentos do consignado (seção 3) e a escolha entre renda `N + p` ou `N`.
3. Rubricas livres com tipo e o 13º só na 1ª parcela nesta rodada.
