# ADR-027: ativos não disponíveis (FGTS) e reserva de emergência

Status: **PROPOSTA** (2026-10-15). P-18 é decisão provisória delegada pelo dono; a origem do valor da reserva (seção 3) é uma escolha do dev a confirmar. Contrato: 2.30.0. Complementa o patrimônio (`NetWorth`, `DashboardNetWorth`).

## Contexto
O dono tem FGTS, que é patrimônio mas **não está disponível**, e quer saber a cobertura da reserva de emergência. Hoje o patrimônio só conhece contas, recebíveis, cartões e dívidas. Misturar o FGTS no disponível ou na reserva infla o que ele pode usar (PR 01, regra 10: o dashboard e a lista da mesma fonte).

## Decisão

### Provisória (delegada pelo dono em 2026-10-15)
| # | Decisão |
|---|---|
| P-18 | O FGTS **nunca** conta como reserva. A base da reserva são as saídas fixas "minha parte" **de novembro** (no lugar dos 3 meses seguintes), com `targetMonths` opcional. |

### 1. Ativo
- `Asset` (`kind = FGTS|OTHER`, nome, empregador, saldo informado com data, depósito mensal informativo, `availability = RESERVED|AVAILABLE`, `countsAsReserve`). `FGTS` é sempre `RESERVED` (`AVAILABLE` em FGTS: `422 ASSET_INVALID`).
- O saldo é **informado** e não faz parte do razão de contas: não gera movimentação, renda nem lançamento; **não** entra em `owner-statement` nem em renda (regra 11 e ADR-023). Cada atualização (`POST /v1/assets/{id}/balance`) vira uma linha de histórico; nada é sobrescrito (regra 7). Arquivar não apaga.
- Tabela nova `assets` e `asset_balances`; migração `V9.09__create_tables_assets.sql` (nome a renumerar no merge). Escopo por usuário (outro: `404`); saldos fora dos logs.

### 2. Visão de patrimônio (`GET /v1/net-worth/overview`)
| Campo | Fonte |
|---|---|
| `availableCash` | Σ contas `CASH`, a mesma fonte de `balances.inAccounts` do Início. **Limite de cartão e cheque especial ficam fora.** |
| `availableAssets` | Σ ativos `AVAILABLE` informados |
| `reservedAssets` | Σ ativos `RESERVED` (FGTS) |
| `receivablesPending` | o que me devem (regra 11: não é renda) |
| `debts` | total de dívidas (ADR-013) |
| `emergencyReserve` | seção 3 |

Sem ativos, o patrimônio é igual ao de hoje (regressão).

### 3. Reserva de emergência
- `amount` = Σ ativos `AVAILABLE` com `countsAsReserve = true`. O plano não dizia de onde vem o valor da reserva; esta é a escolha mínima que não inventa saldo (o dono marca quais ativos contam). **Ponto a confirmar:** se contas de investimento do razão também devem poder contar como reserva (hoje ficam de fora; decisão provisória: se passarem a contar, será por marca `countsAsReserve` na conta, nunca por ativo espelho, e o contrato avisa para não informar como ativo um saldo que já está numa conta).
- `monthlyBase` = saídas **fixas** da minha parte do mês `month` (padrão o mês corrente; no aceite, novembro de 2026): `offCard.fixed + subscriptionsMine` fixas + minha cota do imóvel, as mesmas fontes de `outflow` do `owner-statement` (ADR-023), sem repetir item.
- `coverageMonths = amount / monthlyBase`, uma casa decimal (`3.0` para reserva 3.000 e base 1.000); `null` se a base é zero.
- `targetMonths` opcional (query, só cálculo): devolve `targetAmount = targetMonths x monthlyBase` e `missingToTarget`.
- O FGTS nunca entra em `amount`, nem se for marcado (`countsAsReserve` com ativo `RESERVED`: `422 ASSET_INVALID`).

### 4. Contrato
`POST/GET /v1/assets`, `GET/PUT/DELETE /v1/assets/{id}` (`DELETE` arquiva e devolve o ativo, `200`), `POST /v1/assets/{id}/balance`, `GET /v1/net-worth/overview`. Erros: `404 ASSET_NOT_FOUND`, `422 ASSET_INVALID`, `422 ASSET_ARCHIVED`.

## Alternativas consideradas
1. **FGTS como conta no razão**: rejeitada (não é caixa; apareceria no disponível).
2. **Reserva = saldo das contas**: rejeitada (o dono nem sempre guarda a reserva na conta corrente; inflaria a reserva).
3. **Base de 3 meses seguintes**: substituída pela de novembro (janela da rodada, P-18).

## Consequências
- O backup precisará incluir ativos e histórico (pendência de contrato do backup em G2).
- A cobertura depende de `owner-statement` (B2b) para a base; G2 depende de B2b.

## Plano de quitação
G2 (backend), G3 (tela), G4 (QA). Revisar P-18 e a origem da reserva depois do primeiro uso real.

## O que o dono precisa aprovar
1. Ativos informados fora do razão, com histórico de saldo.
2. FGTS sempre reservado e fora da reserva de emergência.
3. A reserva como ativos marcados (e se contas de investimento podem contar).
4. A base da cobertura nas saídas fixas "minha parte" do mês.
