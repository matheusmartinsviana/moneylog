# ADR-030: Simulador de compra e regra de classificação

Status: **PROPOSTA** (2026-10-15). P-7 e P-8 são decisões provisórias delegadas pelo dono, com o achado A-2 da revisão incorporado. Contrato: 2.28.0 (`info.version` segue 2.32.0 depois de I1). Usa o motor da ADR-023 (`owner-statement`).

## Contexto
O dono quer saber, antes de comprar, o que uma compra parcelada faz com a sobra de cada mês. O simulador não pode gravar nada, não pode divergir da compra real (mesma parcela do `purchase-preview`) e não pode dar sinal verde quando só calculou parte do período: uma compra em 6x com o aperto no quinto mês, avaliada só em novembro, viraria um falso "sustentável" (regra 1 do produto: não chutar estado).

## Decisão

### 1. Cálculo
- `POST /v1/simulations/purchase` com `amount`, `installments` (1 a 36), `interestRatePerMonthBps` (opcional), `firstInstallmentMonth` e `cancelSubscriptionIds` (opcional).
- A parcela vem do **mesmo cálculo** da criação da compra (centavos, resto na primeira parcela; juros em inteiros, sem ponto flutuante).
- Por mês: `surplusBefore` (sobra do `owner-statement`, visão `MINE`), `surplusAfter = surplusBefore - parcela`, `delta`, `negativeAfter`. A compra simulada é somada **uma vez por mês**, na competência da parcela, sem tocar na composição anti dupla contagem da ADR-023.
- Cortes: só assinaturas **ativas** escolhidas pelo usuário (P-8). `cutsMonthly` é a soma do equivalente mensal (ADR-025 e D2), a partir da data atual. `surplusAfterWithCuts = surplusAfter + cutsMonthly`. Sem cortes, os campos de corte vêm `null`.
- **Nada é gravado**: nenhuma transação, parcela, fatura, dívida ou notificação. O teste confere a contagem antes e depois.

### 2. Horizonte (achado A-2)
- A resposta traz `horizon { from, to, calculatedMonths, requiredMonths, limited }`. `requiredMonths` é o prazo que a compra pede (da primeira à última parcela); `calculatedMonths` é o que o motor cobre na janela vigente (na janela de novembro/2026 do plano, novembro). `limited = requiredMonths > calculatedMonths`.
- Com `limited`, `reasons[]` ganha `HORIZON_LIMITED` e a classificação **nunca é `SUSTAINABLE`**: o melhor resultado é `RISKY`. A tela mostra o aviso; o front não extrapola o que está fora da janela.

### 3. Classificação (P-7, estrutural, sem limiar numérico)
Avaliada **apenas nos meses calculados**, em um único lugar do código (`PurchaseClassifier`, `core`), na ordem abaixo (o primeiro ramo que vale decide):

| Ordem | Classificação | Condição |
|---|---|---|
| 1 | `INCOMPATIBLE` | algum mês com `surplusAfter < 0` **mesmo aplicando os cortes informados** (sem cortes informados, qualquer mês com `surplusAfter < 0`) |
| 2 | `VIABLE_WITH_PLANNING` | algum mês com `surplusAfter < 0` sem os cortes e nenhum com `surplusAfterWithCuts < 0` (exige `cancelSubscriptionIds`) |
| 3 | `RISKY` | nenhum mês negativo, mas: `financingWarning`, ou a sobra só é `>= 0` contando renda `ESTIMATED`, ou `horizon.limited` |
| 4 | `SUSTAINABLE` | os demais casos |

- **Cenário da classificação (decisão desta ADR):** a base é o cenário **sem cortes**; os cortes entram como segunda leitura na mesma resposta (`...WithCuts`). Por isso `VIABLE_WITH_PLANNING` só existe quando o usuário informa cortes. Para sugerir cortes, o front chama o simulador de novo com os `cancelSubscriptionIds` escolhidos; o backend não escolhe assinatura pelo usuário.
- `financingWarning` = existe item `FINANCING` de `LONG_TERM_PROJECT` não pago (P-20).
- O ramo `RISKY` por renda estimada depende da proveniência (I2): até lá `confidence` é `CONFIRMED` e o ramo não dispara. Por isso E2 depende de I2 para o teste desse ramo (renda `ESTIMATED`).

### 4. `reasons[]`
Lista de `{ code, competence, params }`, códigos estáveis (i18n no front): `NEGATIVE_EVEN_WITH_CUTS`, `NEGATIVE_WITHOUT_CUTS`, `NEGATIVE_FIXED_WITH_CUTS`, `FINANCING_PENDING`, `ESTIMATED_INCOME_NEEDED`, `HORIZON_LIMITED`, `NO_NEGATIVE_MONTH`. Toda resposta traz ao menos um motivo do ramo escolhido; o aviso de horizonte e o de financiamento aparecem **além** do ramo.

### 5. Integridade financeira (PR 01)
- A compra simulada é parcelada: só a **parcela do mês** pesa em cada mês (nunca a compra inteira no mês).
- Transferência, investimento e empréstimo não são despesa; o simulador só lê o que o `owner-statement` já trata assim.
- `receivablesPending` nunca entra na sobra; rateio só afeta a parte "minha" quando a compra tiver rateio (fora do escopo da simulação: a simulação é 100% minha).

## Consequências
- Um único classificador testável por ramo, com um caso sintético cada.
- A resposta é maior (campos `...WithCuts`, `horizon`), mas o front não calcula nada.
- Ampliar a janela além de novembro muda só `calculatedMonths`; a regra de `limited` já cobre o caso.

## Pendências (dono)
- Confirmar a regra provisória de P-7 e o rótulo "cenário sem cortes" como base.
- Definir se, com horizonte limitado, o dono prefere ocultar a classificação em vez de `RISKY`.
