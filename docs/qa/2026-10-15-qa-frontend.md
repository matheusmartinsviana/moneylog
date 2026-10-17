# QA do frontend: adequação ao resumão (plano rev 3, 2026-10-15)

Plano: `docs/planos/2026-10-15-adequacao-ao-resumao.md` (rev 3). Escopo: telas novas e alteradas do frontend (`frontend/`), nunca testadas antes: resumo do mês, simulador, assinaturas, imóvel, compras agrupadas, renda, patrimônio, rateio (compra, edição, fatura, recebimento, recorrência), seletor Minha parte / Bruto, alertas e configurações, campos do cartão. Nenhum código de produção foi corrigido. Sem commit. Só dados sintéticos.

## 1. Resumo

- Suíte existente no início: 306 arquivos, 3543 testes, **47 falharam**, 3496 passaram.
- Suíte no fim: 318 arquivos, 3774 testes, **3751 passaram, 8 falharam, 15 "falhas esperadas"** (`it.fails`, cada uma documenta um bug abaixo e passa enquanto o bug existir).
- Das 47 falhas iniciais: 39 eram specs desatualizados por mudança legítima (corrigidos; 25 delas no `recurrence-form` por provider de pessoas ausente), 4 expõem bug real (ficam vermelhas de propósito) e 4 são da tela Início do plano Dashboard Glass (fora deste plano, não tocadas).
- 6 bugs de severidade 🔴/🟠 e 5 de 🟡/🟢. Há **dois bugs que perdem ou impedem dados**: "Salvar divisão" não salva (recarrega a página) e editar uma recorrência rateada apaga o rateio.
- `lint`, `lint:deps`, `typecheck` e `build` passam (build com 3 avisos de orçamento, ver 3.5).
- e2e (Playwright, projetos `mock` e `demo`, sem backend): 303 passaram, 75 falharam, 56 ignorados. Nenhuma das 75 falhas é das telas novas; duas eram do plano (navegação) e foram corrigidas. O resto é de shell/redesenho (Dashboard Glass) e de áreas não tocadas.
- **Parecer: 🔴 Reprovado** até corrigir QA-FE-01, QA-FE-03 e QA-FE-04.

## 2. Casos executados

### 2.1 Suíte existente: o que quebrou e o que foi feito

| Spec | Causa | Ação |
|---|---|---|
| `recurrence-form.page.spec.ts` (25 testes) | A página passou a injetar `PeopleListFacade` (rateio); faltava `providePeopleStub` | Corrigido (fixture) |
| `app-shell.component.spec.ts` (4) | Sidebar, "Mais", `/more` e rotas ganharam Resumo do mês e Posso comprar? | Corrigido (16→18 itens, listas, 20→22 rotas) |
| `translations.spec.ts` (4) | Seções novas `provenance` e `simulator`; fragmentos minúsculos `statement.incomeEstimated` e `statement.warnings.thisPeriod` (usados no meio da frase) | Corrigido (lista de contextos e exceção para os dois fragmentos) |
| `summary.page.spec.ts` (1) | `navigate` agora leva `queryParams: { view }` | Corrigido |
| `third-parties.page.spec.ts` (1) | O modal de recebimento passou a carregar contas; o spec não passava conta ao stub | Corrigido (fixture) |
| `quick-add.page.spec.ts` (1), `purchase-preview.facade.spec.ts` (1) | O pedido de prévia passou a levar `split: null` | Corrigido (default novo) |
| `dashboard-requests.facade.spec.ts` (2) | A resposta ganhou `view`; o mapeamento de domínio não o copia | Corrigido (spec ignora `view`) |
| `notification-settings.page.spec.ts` (4) | **Bug real QA-FE-04** | Mantido vermelho |
| `home.page.spec.ts` (2), `chart-panel`, `wallet-header` | Início do Dashboard Glass (ordem de leituras, fundo decorativo, marcadores do gráfico, texto "Saldo negativo") | Fora do plano, não tocados |

### 2.2 Specs novos (231 testes a mais que no início), por critério

| Área | Arquivo | Cobertura |
|---|---|---|
| Resumo do mês | `src/app/features/statement/pages/statement.page.spec.ts` (15) | carregando, janela pedida, `from` inválido, mês negativo (marca, sinal, anúncio), nenhum negativo, avisos traduzidos por código (e link "registrar renda" só em `INCOME_MISSING`), toggle fatura cheia (só a linha dos cartões muda, sobra e saldo seguem do servidor), renda estimada, consignado em folha, "a receber" fora da tabela, vazio, erro com retry, axe |
| Simulador | `simulator.page.spec.ts` (+5 sobre 11) | `INCOMPATIBLE`, `RISKY` com renda estimada, motivo desconhecido, horizonte completo sem aviso, 401 |
| Assinaturas | `planning/pages/subscriptions.page.spec.ts` (17) | totais, USD (original, câmbio, IOF), empresa fora de "minha parte", sobreposição, vazio, erro, filtros, cancelada com "ativa até", cancelar com data (envio, toast, recarga), duplo clique, 409, confirmar cobrança com câmbio (campos, payload, câmbio zero), cobrança em real |
| Imóvel | `planning/pages/property.page.spec.ts` (18) | loading, 404, não-projeto, erro, cota não definida (aviso e "estimado"), cotas definidas, totais por pessoa, definir cotas (payload com version), soma que não fecha, >2 pessoas, cláusulas (leitura, vazio, edição em bps, percentual inválido), CSV (sucesso e falha), conflito de versão, axe |
| Compras agrupadas | `planning/pages/purchases.page.spec.ts` (20) | comprometido (12 meses, horizonte, erro isolado), grupo (totais sem dupla contagem, juros, divergência, membros), desvincular (sucesso e falha), vazio, filtro Quitadas, erro, edição só nome/juros, criar (validação, sem cartão, payload com idempotência), vincular compra |
| Renda | `planning/pages/income.page.spec.ts` (23) | prévia (INSS, IRRF, líquido, datas, 13º), consignado (principal, juros, estimado, juros não separados), `TAX_TABLE_UNAVAILABLE` (sem números, sem retry), erro com retry, perfis, arquivar (sucesso e erro), arquivados, gerar ocorrências (novas e existentes, duplo clique, erro), tabelas fiscais (lista e "indisponível"), criar e editar (idempotência, version) |
| Patrimônio | `planning/pages/net-worth.page.spec.ts` (22) | disponível x não disponível, reserva e cobertura, base zero, meta (pedido com meta, limpar), erro, FGTS, ativo como reserva, vazio, histórico, atualizar saldo, arquivar, criar FGTS (`RESERVED`, não reserva), editar |
| Compra no cartão com divisão e prévia | `quick-add/pages/quick-add-card-split.page.spec.ts` (11) | sem divisão não envia `split`, ligar divisão (pessoas, bloqueio), 50/50 em bps, soma ≠ 100, prévia com minha parte e da pessoa, desligar, falha ao carregar pessoas, pessoa repetida, modo igual, duplo clique, axe |
| Modal de edição do rateio | `transactions/pages/transaction-detail-split.page.spec.ts` (15) | seção, minha/terceiros, linhas, igual, despesa comum e anulada sem seção, abrir com valores, voltar a ser toda minha, duplo clique, recebimento, axe. **4 testes (`it.fails`) provam o QA-FE-01** (salvar, `SHARES_BELOW_RECEIVED`, 409, duplo clique) |
| Modal de recebimento | `third-parties.page.spec.ts` (+7) | `ACCOUNT_MOVEMENT`, `EQUITY_OFFSET`, `NONE` e efeito desconhecido (toast), trocar de modo limpa `accountId`, erro no campo do valor, duplo clique, falha ao carregar contas |
| Fatura rateada | `cards/pages/invoice.page.spec.ts` (+2) | pessoa fora das ativas ("Cota de outra pessoa"), valor a pagar continua o da fatura cheia |
| Recorrência com rateio | `planning/pages/recurrence-form.page.spec.ts` (+9) | só cartão oferece dividir, aviso "só para o futuro", bloqueio, POST em bps, trocar de tipo descarta, 422. **2 testes `it.fails` provam o QA-FE-03** |
| Seletor Minha parte / Bruto | `summary.page.spec.ts` (+6), `transactions.page.spec.ts` (+5) | padrão MINE, `?view=GROSS`, valor inválido, URL, manter ao trocar o mês, só aparece na visão por competência |
| Notificações novas | `notification-text.spec.ts` (+22) | os 10 alertas com os parâmetros reais do backend (conferidos em `AlertGenerators.java`) nos 3 idiomas, sem placeholder, valores ocultos sem montante |
| Configurações de alertas | `notification-settings.page.spec.ts` (+8) | 10 interruptores, dias sem uso inválidos, antecedência e tolerância enviadas, `NOTIFICATION_THRESHOLD_INVALID`. **1 `it.fails` prova o QA-FE-04** |
| Campos do cartão | `card-form.page.spec.ts` (+11) | débito automático (null/true/false), bandeira, melhor dia, finais, finais inválidos, edição. **2 `it.fails` provam o QA-FE-07** |
| Contrato dos pedidos | `recurrences-split.mapper.spec.ts`, `cards-split.mapper.spec.ts`, `transactions-split.mapper.spec.ts` (12) | `splitMode` + `shares` (BPS, EQUAL, AMOUNT) em recorrência (criar e editar), prévia e compra; sem divisão não envia nada |
| Mensagens de erro do contrato | `src/app/common/i18n/problem-codes.spec.ts` (4) | 25 códigos 2.24 a 2.32 com mensagem em pt/en/es. **3 `it.fails` provam o QA-FE-06** |

Todos os testes novos seguem Dado/Quando/Então, Testing Library, sem comentários. Stubs novos em `src/testing/`: `owner-statement-testing.ts`, `purchase-groups-testing.ts`, `income-testing.ts`, `net-worth-testing.ts`. `etapa5-testing.ts` e `reports-testing.ts` passaram a registrar a `view` pedida.

### 2.3 Integridade financeira (PR 01)

O front não calcula dinheiro: busca por `parseFloat`, `reduce`, `toFixed`, `* 100` nas telas e módulos novos só achou `Number(amount) !== 0` (esconde linha zerada). Cobertos por teste: compra agrupada não soma o valor duas vezes (total = soma dos membros, comprometido separado); fatura cheia x minha parte (pagar continua o valor cheio); "a receber" e assinatura da empresa fora da sobra; consignado como desconto em folha sem segunda saída; FGTS nunca reserva (ver QA-FE-02); recebimento com efeito no razão dito por `ledgerEffect`.

### 2.4 Verificações automáticas

| Comando | Resultado |
|---|---|
| `npm run lint` (eslint + scripts de estilo/marca/controles/contraste/cache) | passa |
| `npm run lint:deps` | passa (1138 módulos; uma violação `modules-isolated` minha foi corrigida ao dividir o spec de contrato por módulo) |
| `npm run typecheck` | passa |
| `npm run build` | passa; 3 avisos de orçamento (ver QA-FE-10) |
| `ng test` | 3751 passaram, 8 falharam, 15 esperadas (ver 1) |
| e2e `mock` + `demo` | 303 passaram, 75 falharam, 56 ignorados (ver 3.6) |
| Fumaça no navegador (demo, dados sintéticos, 13 rotas) | 0 erros de console, 0 requisições falhas, 0 estouro horizontal. Obs.: o demo roda em memória, então não há tráfego HTTP para checar requisições duplicadas |

## 3. Bugs

### QA-FE-01 · 🔴 · "Salvar divisão" no modal de edição do rateio não salva e recarrega a página
- **Camada:** front.
- **Arquivo:** `frontend/src/app/features/transactions/components/split-edit-modal/split-edit-modal.component.ts`, `<form class="form" (ngSubmit)="onSubmit()" novalidate>` sem `[formGroup]`. Só `ReactiveFormsModule` está importado, então `ngSubmit` nunca dispara e o envio nativo do formulário acontece.
- **Passos:** em `/transactions/<compra no cartão>`, "Editar divisão", escolher pessoa e 50% / 50%, clicar "Salvar divisão".
- **Esperado:** `PUT` das cotas com a version, toast "Divisão atualizada", modal fechado.
- **Obtido:** nada é enviado; no Chromium a URL passa por `...?` (envio nativo) e a página recarrega, perdendo o modal. Só "Voltar a ser toda minha" funciona (botão `type=button`). Como consequência, `SHARES_BELOW_RECEIVED`, 409 e duplo clique também não são alcançáveis pela tela.
- **Evidência:** 4 testes `it.fails` em `transaction-detail-split.page.spec.ts` (esperado: 1 envio, obtido: `[]`); reprodução no navegador (demo): eventos `framenavigated` para `...130?` e depois `...130`, formulário fechado, nenhum envio. Varredura nos templates: é o único `<form (ngSubmit)>` sem `formGroup`.

### QA-FE-03 · 🔴 · Editar recorrência de cartão rateada apaga o rateio em silêncio
- **Camada:** front.
- **Arquivo:** `frontend/src/app/features/planning/pages/recurrence-form.page.ts` (`restoreSplit` faz `splitOn.setValue(true, { emitEvent: false })`; o sinal `splitOnValue` não acompanha, então `splitting()` fica falso).
- **Passos:** abrir `/planning/recurrences/<id>/edit` de uma recorrência de cartão com `splitMode`/`shares`; salvar sem mexer na divisão.
- **Esperado:** campo de divisão visível e preenchido (60/40), `PUT` reenviando a divisão (ou omitindo o campo).
- **Obtido:** o interruptor aparece ligado mas o campo de divisão não aparece, e o `PUT` leva `split: null`, que o mapper transforma em `shares: []`, apagando o rateio das ocorrências futuras (P-31b). Perda silenciosa de "a receber de terceiros" nas próximas faturas.
- **Evidência:** saída de depuração durante a QA: `PUT {"split":null,"version":7}` com `aria-checked="true"`; 2 testes `it.fails` em `recurrence-form.page.spec.ts`.

### QA-FE-04 · 🔴 · Não é possível salvar as configurações de notificações com a tolerância padrão (0,00)
- **Camada:** front (o contrato 2.32.0 define o padrão `0.00`).
- **Arquivo:** `frontend/src/app/features/settings/pages/notification-settings.page.html`, `<app-money-input formControlName="tolerance">` sem `[allowZero]="true"`; o validador do campo devolve `moneyZero` para `0.00`, o formulário fica inválido e `save()` retorna sem enviar.
- **Passos:** abrir `/settings/notifications` com a configuração padrão (`documentDivergenceTolerance: "0.00"`) e clicar "Salvar" (mesmo sem mexer em nada, mesmo só para trocar o horário do resumo diário).
- **Esperado:** salvar.
- **Obtido:** nada acontece, sem mensagem; 1 campo inválido. Nenhuma configuração (resumo diário, silêncio, alertas) pode ser salva enquanto o usuário não digitar uma tolerância maior que zero, e o valor 0 (padrão) nunca pode ser escolhido.
- **Evidência:** 4 testes do dev vermelhos (`Dado salvar...`, `um alerta desligado...`, `horários...`, `409...`) e 1 `it.fails` meu; reprodução no navegador (demo): "saved visible: 0", "invalid fields: 1".

### QA-FE-02 · 🟠 · Ativo marcado como "conta na reserva" e depois trocado para FGTS envia `countsAsReserve: true`
- **Camada:** front.
- **Arquivo:** `frontend/src/app/features/planning/components/asset-form-modal/asset-form-modal.component.ts`, `onSubmit` envia `countsAsReserve: value.countsAsReserve` sem zerar quando o ativo é `RESERVED`/FGTS (o interruptor fica oculto, mas o valor fica).
- **Passos:** novo ativo, ligar "Conta na reserva", trocar o tipo para FGTS, salvar.
- **Esperado:** `countsAsReserve: false` (FGTS nunca é reserva, regra P-18 / PR 01).
- **Obtido:** `{ kind: 'FGTS', availability: 'RESERVED', countsAsReserve: true }`. O backend recusa com `ASSET_INVALID` (422) e o usuário fica sem o campo para corrigir, ou, se o backend aceitar, o FGTS entraria na reserva.
- **Evidência:** `it.fails` em `net-worth.page.spec.ts` (recebido: `true`, esperado: `false`). Caso irmão (ativo disponível com reserva ligada) envia `true` corretamente.

### QA-FE-06 · 🟡 · Códigos de erro do contrato sem mensagem
- **Camada:** front.
- **Faltam em pt/en/es (`errors.codes`):** `PURCHASE_GROUP_MEMBER_INVALID`, `CARD_LAST_DIGITS_INVALID`, `PAYROLL_LOAN_INVALID` (alcançáveis hoje: vincular compra, formulário do cartão, renda com consignado), e `CARD_CASH_OUT_INVALID`, `PURCHASE_LAST_DIGITS_NOT_FROM_CARD`, `PROVENANCE_INVALID`, `TRANSACTION_NATURE_INVALID` (sem tela ainda).
- **Obtido:** cai no texto genérico "não deu para processar" sem dizer o motivo.
- **Evidência:** 3 `it.fails` em `src/app/common/i18n/problem-codes.spec.ts` listando os 7 códigos.

### QA-FE-07 · 🟡 · Finais do cartão: o formulário não valida repetição nem mais de 5
- **Camada:** front (contrato: `CARD_LAST_DIGITS_INVALID` para final repetido ou mais de 5 por cartão).
- **Arquivo:** `frontend/src/app/features/cards/pages/card-form.page.ts` (`lastDigitsValidator` só confere 4 dígitos; `maxlength` 60).
- **Obtido:** `1234, 1234` e seis finais saem do formulário; o servidor recusa e a mensagem é a genérica (QA-FE-06), sem apontar o campo (`CODE_TO_FIELD` não mapeia o código).
- **Evidência:** 2 `it.fails` em `card-form.page.spec.ts`.

### QA-FE-05 · 🟡 · `/planning/income`: salto de nível de título (h1 → h3) reprovado no axe
- **Camada:** front. Os cartões de perfil usam `h3` sem `h2` antes (o `h2` do painel de prévia vem depois no DOM). Regra `heading-order`, impacto moderado.
- **Evidência:** `it.fails` em `income.page.spec.ts` (axe: `<h3 class="name" data-cy="income-profile-source-inc-1">`).

### QA-FE-08 · 🟡 · Vincular compra: falha na busca aparece como "Nenhuma compra encontrada"
- **Camada:** front. `PurchaseLinkSearchFacade` usa `catchError(() => of({ status: 'done', items: [] }))`: erro de rede ou 500 é igual a resultado vazio, sem aviso nem "tentar de novo".
- **Evidência:** `it.fails` em `purchases.page.spec.ts`.

### QA-FE-09 · 🟢 · Casas decimais e vírgula inconsistentes
- IOF na confirmação de cobrança aparece como `3.5` no campo e `3,5%` na linha; valor original em USD no campo aparece `5.00` (formato en-US) numa tela em pt-BR. Aceitam o dado, mas confundem. Cobertos por assertivas que registram o comportamento atual (`subscriptions.page.spec.ts`).

### QA-FE-10 · 🟢 · Orçamento de tamanho do build estourado
- Pacote inicial 502,53 kB (limite 500 kB, +2,53 kB); `kpi-cards.component.css` +393 B; `line-chart.component.css` +1,95 kB. O chunk `planning-routes` tem 391,88 kB (53 kB gzip a mais que a média). Só aviso hoje.

### QA-FE-11 · 🟢 · Contrato e plano: itens sem tela ou sem uso
- Task F7 do plano (taxa efetiva a.m./a.a. na dívida e formulário de Pix no crédito, `POST /v1/card-cash-outs`) **não está no front**: não há `effectiveRate`, `card-cash-outs` nem formulário; o alerta `CARD_CASH_OUT_COST` já chega, mas não há como registrar o Pix no crédito. Final do cartão por compra (`lastDigits` na compra, P-24) e natureza da despesa (`nature`) também sem campo. `commitments.byMonth` ("Por mês") tem texto traduzido e dado da API, mas a tela de compras agrupadas não o mostra.
- O contrato não documenta os parâmetros de cada notificação nova; o front depende dos nomes reais do backend (conferidos em `AlertGenerators.java`, hoje consistentes).
- `PUT /v1/recurrences/{id}` com `shares: []` é a forma de "voltar a ser 100% minha"; o contrato só diz "ausente mantém o atual", sem definir `[]`. Pedir confirmação ao backend.

### 3.6 e2e (Playwright, `mock` e `demo`, sem backend)

Rodados: `npx playwright test --project=mock --project=demo`: 303 passaram, 75 falharam, 56 ignorados (10,0 min). Reexecução dirigida depois das correções abaixo.

- **Do plano e corrigidas (testes, não produção):** `shell.e2e.ts` (`/more` lista) e `workspace-shell.e2e.ts` (popover "Mais" com 7 itens agora tem 9) falhavam por Resumo do mês e Posso comprar?; ajustados `e2e/support.ts` (rótulos, rotas, ordem da sidebar), `e2e/workspace-shell.e2e.ts` (7→9) e `e2e/shell.e2e.ts` (`/statement` mostra a tabela, não estado vazio). Reexecutados: os dois testes passam.
- **Não relacionadas às telas novas (não tocadas):** `ui-propria`/`native-controls` (`/people` com controle nativo), `qa-redesign-fatia-a` e `shell` (sidebar recolhida, cabeçalho, foco), `ui-kit`/`charts` (axe `scrollable-region-focusable` em `/dev/ui-kit`), `quick-add`/`cards` (seletor `empty-state-title` resolve para 2 elementos, "Nada registrado ainda." vem da atividade recente do redesenho), `fit-screen` demo (`/cards` com 931 px de altura em 1280x720, `/transactions` com `span.select__value` cortado), `etapa5`/`etapa6` (exportações com timeout de 1 min, `input[type=file]` em `/goals/new`, texto de armazenamento das notas). `shell.e2e.ts:281` ("todas as rotas em mobile") continua falhando por um estado vazio oculto numa rota do redesenho, igual antes da minha alteração.
- Não há e2e das telas novas (`/statement`, `/simulator`, assinaturas, imóvel, compras, renda, patrimônio) nem projeto `integration` rodado (exige backend, Postgres e Docker). A cobertura delas ficou nos specs de componente acima e na fumaça de console descrita em 2.4.

## 4. Testes adicionados e arquivos alterados

Novos: `src/app/common/i18n/problem-codes.spec.ts`, `src/app/features/statement/pages/statement.page.spec.ts`, `src/app/features/planning/pages/{subscriptions,property,purchases,income,net-worth}.page.spec.ts`, `src/app/features/quick-add/pages/quick-add-card-split.page.spec.ts`, `src/app/features/transactions/pages/transaction-detail-split.page.spec.ts`, `src/modules/{recurrences,cards,transactions}/infra/facades/*-split.mapper.spec.ts`, `src/testing/{owner-statement,purchase-groups,income,net-worth}-testing.ts`.

Ampliados: `simulator.page.spec.ts`, `third-parties.page.spec.ts`, `invoice.page.spec.ts`, `recurrence-form.page.spec.ts`, `summary.page.spec.ts`, `transactions.page.spec.ts`, `notification-text.spec.ts`, `notification-settings.page.spec.ts`, `card-form.page.spec.ts`, `src/testing/etapa5-testing.ts`, `src/testing/reports-testing.ts`.

Corrigidos por mudança legítima: `app-shell.component.spec.ts`, `translations.spec.ts`, `quick-add.page.spec.ts`, `purchase-preview.facade.spec.ts`, `dashboard-requests.facade.spec.ts`, e os specs acima de recorrência, resumo e terceiros. e2e: `e2e/support.ts`, `e2e/shell.e2e.ts`, `e2e/workspace-shell.e2e.ts`.

**Aviso de formatação:** rodei `prettier --write` em `src/app`, `src/modules` e `src/testing`. Arquivos de produção do dev que não estavam no formato do repositório foram reformatados (só espaço em branco; ex.: `tax-tables-panel.component.ts`). Não há mudança de lógica, mas o diff dos arquivos de produção ficou maior que o dos devs. `src/styles/tokens.css` continua fora do formato (não toquei).

## 5. Riscos e pendências

- **Reprovação por regressão funcional:** QA-FE-01, QA-FE-03 e QA-FE-04 têm teste vermelho ou `it.fails`. Ao corrigir cada um, trocar `it.fails` por `it` (o spec falha avisando que o bug sumiu).
- **Fora deste plano e vermelho:** 4 testes da tela Início (Dashboard Glass); precisam do dono dessas tasks.
- **Sem backend real:** nenhum teste de integração com a API (projeto `integration` do Playwright, `./moneylog up`) foi executado; contrato conferido por mappers, por stubs e por leitura do OpenAPI e do backend (`AlertGenerators.java`). Requisições duplicadas e loops de rede não puderam ser observados (o demo é em memória).
- **Janela de novembro/2026:** a tela do resumo pede `months: 3` fixo e deixa `from` por URL; o plano só exige novembro. Sem teste de dado real (nenhum usado).
- **Cobertura que falta:** e2e das telas novas; modal de renda com consignado e rubricas (só o caminho de criar/editar simples foi testado); formulário de ativo no modo edição de FGTS com saldo; telas em 360 px (axe e estouro horizontal só em 1280 px no navegador).
- **Pendências do plano:** F7 (Pix no crédito e taxa efetiva), `lastDigits` por compra, `byMonth` no comprometido (QA-FE-11).

## 6. Parecer

🔴 **Reprovado.** Três regressões funcionais bloqueiam: o modal de edição do rateio não salva e recarrega a página (QA-FE-01), editar uma recorrência rateada apaga o rateio (QA-FE-03) e as configurações de notificações não podem ser salvas com o padrão do contrato (QA-FE-04). Corrigidos esses três e o QA-FE-02, o parecer passa a 🟡 (restam mensagens de erro faltando, validação dos finais, título de seção e as pendências F7).
