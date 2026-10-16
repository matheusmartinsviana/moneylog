---
etapa: transversal (épico de UI)
titulo: Início como "premium finance dashboard" com glassmorphism sóbrio (marca Monelog)
data: 2026-10-13
autor: orquestrador
status: revisão 4 (ajustes da revisão r2 F-1 a F-12 aplicados; ADR-020 e ADR-021 redigidos como Propostos; revisão 3: achados A-1 a A-12 da revisão corrigidos; decisões do dono de 2026-10-13 incorporadas: visual dark verde, SideRays, orçamentos em BRL, cartões reais por emissor; padrões adotados por delegação do dono); a Entrega 1 não tem pergunta bloqueante; a Entrega 2 tem uma (Q-37, seção 3.4)
tasks: DG-00 a DG-32 (entrega 0: DG-00; entrega 1, o MVP: DG-01 a DG-16 mais DG-02B; entrega 2: DG-17 a DG-22; entrega 3: DG-23 a DG-27; entrega 4, orçamentos: DG-28 a DG-32; multimoeda descartada)
documentos-base:
  - vault: PR 00 a PR 03, DS 00, DS 01, DS 02, FE 00 a FE 10, BE 04, ADR-001
  - docs/adrs/ADR-011-redesign-workspace.md (incluindo as emendas "Nova linguagem visual (DS 03)" e "Fatia 2 do visual"), ADR-007, ADR-002, ADR-017, ADR-019
  - docs/planos/2026-10-10-redesign-workspace.md, docs/planos/2026-10-16-insights-por-matematica.md
  - frontend/src/styles/{tokens.css,utilities.css,README.md}, frontend/src/app/common/services/glass-support.ts, scripts/check-{styles,contrast,native-controls}.mjs
  - backend/contracts/openapi.yaml (versão 2.20.0)
---

# Plano: Início "premium finance dashboard" com glassmorphism

## 1. Objetivo

Redesenhar o Início do app (marca Monelog) como um dashboard financeiro premium em vidro fosco sobre um fundo verde escuro minimalista, com composição própria para desktop, tablet e mobile, exibindo apenas o que a API calcula e preservando toda a funcionalidade existente.

## 2. Escopo

### O que já existe e é reaproveitado (levantamento do código em 2026-10-13)

Estado visual vigente (a premissa original do plano estava defasada; o ADR-011 foi emendado):
- `tokens.css` já tem gradientes **como token** (`--gradient-*`; `check-styles` só proíbe gradiente ou cor literal fora de `tokens.css`), paleta própria (tema claro derivado: canvas `#f6f5fb`, acento `#094360` nos tokens atuais; a emenda do ADR-011 fala em acento lilás `#6948d2`: DG-00 reconcilia o ADR com o `tokens.css`), tokens `--glass-*`, `--radius-window: 28px`, `--radius-card: 20px`, hover frio, `--text-kpi` e `--text-display`.
- Vidro: `.glass`, `.glass--strong`, `.glass-lens`, `LiquidGlassDirective` e `html[data-glass]` (`common/services/glass-support.ts`). **Política atual do ADR-011:** refração SVG só em Chromium desktop e em lentes pequenas; desfoque CSS barato em celular/toque (`max-width: 767px` ou `pointer: coarse`); **superfície sólida no Safari/WebKit** (`detectGlassMode` devolve `solid`) e com `prefers-reduced-transparency`. Esta é a política que a demanda de glassmorphism confronta de verdade (Q-7).
- Casca: sidebar sempre recolhida em trilho, com "Mais" em popover; cabeçalho em uma linha (busca, tema, sino, chip de IA, avatar); barra inferior no mobile (Início, Transações, +, Metas, Mais); janela flutuante a partir de 1024 px. Início atual: gráfico de área como herói, saldo, medidor de poupança, recentes, KPIs e meta em destaque (`features/home`).
- Gráficos em SVG próprio (`common/components/charts`: `line-chart`, `bar-list`, `segmented-bar`, `gauge`, mapper e geometria), com tooltip, tabela equivalente e resumo; chunk limitado a 8 kB gzip por `scripts/check-chart-budget.mjs`.
- Sino e `notifications-popover`; quick-add (rota e modal); `MoneyComponent`/`MoneyPipe` e `util/money.ts` (Intl, `-R$ 120,50`); `displayName` opcional em `settings/notifications`.
- Guardas de lint: `check-styles`, `check-contrast` (pares de token sólidos, AA nos dois temas), `check-native-controls` (ADR-007), `check-brand`, `lint:deps`; i18n pt/en/es com spec de paridade; `data-cy` em todo interativo.
- Testes: Vitest + Testing Library; Playwright (mock, produção, WebKit). Tocados por este épico: `home.page.spec`, `home-dashboard`, `shell`, `fit-screen`, `page-spacing`, `workspace-shell`, `charts`, `theme-a11y`.
- Demo: `npm run start:demo` (porta 4210, faixa "Modo demonstração", fora do build de produção).
- Linha de base do bundle inicial: o ADR-011 cita 463 kB e o ST 00 cita 528 kB; DG-01 mede com `ng build` e registra o número vigente.

Backend (contrato 2.20.0), disponível sem mudança:
- `GET /v1/dashboard/summary`: `balances.available`, `balances.inAccounts` e `month.cashFlow` são números distintos; `month.income`, `consumption`, `net`.
- `GET /v1/reports/income-expenses?period=D7|D30|M3|M12` (janelas móveis; `basis` `DATE` nos baldes `DAY`/`WEEK` e `COMPETENCE` no balde `MONTH`, ADR-017) e `GET /v1/reports/spending-by-category?month=`.
- `GET /v1/summaries/{month}` com `comparison` (mês anterior completo) e `savingsRate`.
- `GET /v1/entries?competence=&lens=` (totais por competência, mesma fonte do dashboard), `GET /v1/transactions` (filtros `from`, `to`, `type`, `accountId`, `categoryId`, `method`, `status`, `q`, paginação; `totals` traz **apenas** `count` e `cashFlow`; ordem fixa `date desc, createdAt desc, id desc`), detalhe, edição e `void`.
- `GET /v1/goals` (`current`, `target`, `remaining`, `progress`, `featured`), `GET /v1/notifications*`, `GET /v1/insights*`, `GET /v1/cards`, `GET /v1/accounts`, `GET /v1/search`.
- Regras de PR 01 já cumpridas pelos relatórios: transferência, aplicação, pagamento de fatura e empréstimo ficam fora de receita e consumo; reembolso abate na categoria; parcela conta na competência; recorrência realizada conta uma vez; movimentação com data futura é compromisso (`SCHEDULED_TRANSACTION`), não caixa; dinheiro em string decimal com 2 casas.
- Não existe: orçamentos, multimoeda (só BRL), ordenação de transações, períodos "mês anterior", "90 dias" e "ano", número/validade/bandeira de cartão, status "pendente" (o domínio tem `ACTIVE` e `VOIDED`; "pendente" é movimentação com data futura ou ocorrência de recorrência não realizada).

### O que o épico entrega

Entra: fundo verde escuro por token, detalhe de luz WebGL opcional (SideRays), tokens e componentes de vidro, composição desktop (>= 1200 px), tablet (768 a 1199 px) e mobile (< 768 px), ocultar valores, seletor de período e gráficos que o respeitam, atividade recente, cartões reais por emissor, metas, insight, painel de notificações, navegação inferior com rotas reais, filtros e ordenação em Transações (entrega 3, cortável), orçamentos em BRL (entrega 4), acessibilidade, testes e docs.

Não entra: conexão bancária (não existe e não será simulada), IA nova, multimoeda (descartada pelo dono), logos de bancos, troca de nome do produto, varredura visual das demais telas (Q-2), biblioteca de gráfico ou de ícone, e qualquer dependência de runtime além do `ogl` (DG-02B, ADR-020).

## 3. Decisões do dono, decisões assumidas e perguntas em aberto

O dono respondeu diretamente (2026-10-13) e delegou: "se tiver alguma dúvida pode fazer tudo aí". Por isso, toda pergunta que tinha padrão razoável foi **adotada** e está registrada abaixo como decisão assumida (revisável pelo dono antes da task citada). Só seria bloqueante regra de negócio sem padrão razoável: não sobrou nenhuma (3.4).

### 3.1 Decisões diretas do dono

| # | Decisão | Efeito no plano |
|---|---|---|
| Q-1 | **Respondida.** Visual mais **dark**: fundo em verde escuro profundo, glass e poucos detalhes brancos, minimalista. **Sem foto**: o fundo é token (cor e, se preciso, gradiente em token). | Some o asset de paisagem, a licença de imagem e o `ngsw` de imagem. DG-02 vira "fundo verde escuro por token". |
| Q-6 | **Respondida em consequência.** Tema escuro é o principal do glass. | Tema claro derivado (padrão assumido: variante clara sóbria por token, sem SideRays, contraste verificado). |
| Q-35 | **SideRays (React Bits, WebGL, `ogl`)**: o dono colou o componente; usar como detalhe de luz branca/verde sutil no fundo, opacidade baixa. Angular: portar para componente standalone. | Nova task DG-02B; dependência nova `ogl` (seção 7). |
| Q-17 | **Respondida.** Tudo em BRL, sem multimoeda; o "seletor de moeda" é só o rótulo estático "BRL". | Multimoeda descartada. |
| Q-36 | **Respondida.** Orçamentos entram, em BRL, com backend e frontend. | Entrega 4 vira DG-28 a DG-32; regras assumidas abaixo. |
| Q-8 | **Respondida.** Cartões **reais** já existentes; bancos do dono: Itaú, Nubank, Banco do Brasil e Mercado Pago. Emissor pelo **nome** (sem logos de terceiros), com variações sutis do cartão escuro por emissor; sem número nem validade inventados. | DG-07 reescrita. |
| Q-9 | **Padrão assumido** ("cartão principal"): carrossel/seleção entre os cartões reais; abre no de maior fatura corrente e lembra a escolha por aparelho. | DG-07. |

### 3.2 Decisões assumidas por padrão (delegação do dono; as de design vão para o ADR-020)

| # | Decisão assumida | Dono original | Task |
|---|---|---|---|
| Q-2 | Glass **só no Início** neste épico; as demais telas ficam como estão (ganham o visual depois, em plano próprio). | Produto | DG-00 |
| Q-3 | Cores da demanda (ink `#10172B`, cyan `#A9EAF5`/`#65CFE3`, emerald `#69D4A1`, success `#21885E`, danger `#D85B68`) entram como **tokens novos do Início**, convivendo com os atuais; o verde escuro de fundo é token novo. Valor que falhar em AA para texto é escurecido ou restrito a preenchimento/gráfico, com o ajuste e a razão no ADR-020 (contrastes aproximados sobre branco, a confirmar: emerald ~1,8:1, success ~4,4:1, danger ~3,7:1; sobre o fundo escuro novo devem passar). | UX | DG-00, DG-01 |
| Q-4 | Receita em verde e **despesa de consumo** em vermelho (pedido do dono), **sempre com ícone, sinal e texto** (nunca só cor) e, nos gráficos, também por forma de marcador e traço. **Vermelho é exclusivo de despesa de consumo**: fatura paga, aplicação, resgate, empréstimo, quitação de dívida, ajuste, transferência e reembolso usam tom neutro com o rótulo do tipo (tabela na DG-08, PR 01). Exceção consciente ao DS 00 (vermelho só risco) e ao ADR-011, registrada no ADR-020. | Produto/UX | DG-00 |
| Q-5 | Raio 36 px só no painel central de carteira; 28, 20 e 12 nos demais; o DS 00 continua valendo fora do Início. | UX | DG-01 |
| Q-7 | `backdrop-filter` permitido nos painéis **não fixos** do Início também em Safari/WebKit e no mobile, no máximo 3 painéis com blur por vez e nenhum em lista rolável; a barra inferior e qualquer elemento fixo ficam **sem blur** (translúcido sólido), pelo custo no compositor documentado no ADR-011. Medido em iPhone real; se não passar em Q-25, volta ao sólido no Safari. Sem suporte, `prefers-reduced-transparency` e modo economia: sólido. | Produto/Arquitetura | DG-00, DG-01 |
| Q-10 | Rótulos: número grande = `balances.available` ("Disponível"); `balances.inAccounts` só como "Em contas"; `month.net` só como "Resultado do mês" (nunca "saldo"). | Produto | DG-06 |
| Q-11 | Ocultar valores afeta **só o Início e o painel de notificações** (opt-in por input `maskable`); as outras telas não mudam. | Produto/UX | DG-04 |
| Q-12 | Padrão visível; lembrado por aparelho (`safe-storage`); anunciado como "Valores ocultos". | UX | DG-04 |
| Q-13 | A atividade recente mostra só movimentações já realizadas (consulta com `to` = `asOf` do dashboard, sem aritmética de datas no front); as agendadas ficam no bloco de compromissos que já existe (`upcoming`). | Produto | DG-05, DG-08 |
| Q-14 | Selos "Estornada" (fica fora de qualquer total exibido) e "Agendada" (nos compromissos); rótulos dos 11 tipos conforme a tabela da DG-08. | Produto | DG-08 |
| Q-15 | As 3 métricas: taxa de poupança (`savingsRate`), maior categoria (`largestCategory`) e compromissos dos próximos 30 dias (`committed30d`). | Produto | DG-09 |
| Q-16 | Wordmark em texto com `BRAND_NAME`, sem logo (o espaço reservado fica vazio). | Produto | DG-06 |
| Q-18 | O item "Orçamentos" leva a `/budgets`: a página "em breve" atual até a entrega 4 e a tela funcional depois. | Produto | DG-11 |
| Q-19 | Barra inferior mobile com os 5 itens pedidos; a captura rápida fica no botão "Nova transação" do herói; `/more` fica acessível por um botão de menu no cabeçalho compacto do mobile. | Produto/UX | DG-11 |
| Q-20 | Saudação por faixa de hora do aparelho (`Intl`), com `displayName` quando existir. | UX | DG-06 |
| Q-21 | Tipografia mantida (SF no Apple, Geist/Inter nos demais), numerais tabulares. | UX | DG-01 |
| Q-22 | Cópia em pt, en e es com paridade, voz calma e factual; "premium" não aparece na interface. | UX | todas |
| Q-24 | Com `Save-Data` ou conexão lenta o SideRays não carrega (fica o fundo estático por token). | Arquitetura | DG-02B |
| Q-25 | Orçamentos de desempenho: no máximo 3 painéis com blur por vez no mobile; LCP do Início <= 2,5 s no perfil mobile/4G do Lighthouse (com mocks); rolagem >= 50 fps com CPU 4x mais lenta; p95 do endpoint de período e de orçamento <= 1,5 s com 10.000 movimentações. | Arquitetura | DG-01, DG-15, DG-16, DG-20, DG-30 |
| Q-26 | Mês atual = mês civil; Mês anterior = mês civil completo; 30 dias = hoje-29..hoje e 90 dias = hoje-89..hoje (móveis, inclusivos); Ano = 1º de janeiro até hoje. Fuso `America/Sao_Paulo`, no backend. | Produto | DG-17 |
| Q-27 | "Mês atual" segue `month.*` do dashboard (inclui agendados dentro do mês, S-285) e a resposta traz `includesScheduled = true` com o rótulo "inclui agendados"; 30 e 90 dias terminam em hoje e não incluem agendados. | Produto | DG-17 |
| Q-28 | A variação do mês em andamento compara com o mês anterior **completo** (como `SummaryComparison` hoje), com o rótulo dizendo isso. | Produto | DG-17 |
| Q-29 | Período anterior de 90 dias e do Ano: janela imediatamente anterior de mesmo tamanho; no ano, o mesmo intervalo (1/jan até o mesmo dia) do ano anterior. | Produto | DG-17 |
| Q-30 | Estender `ReportPeriod` e `income-expenses` (aditivo), sem endpoint paralelo (revisão A-3). | Backend/Arquitetura | DG-17 |
| Q-31 | Carga progressiva (herói primeiro); sem otimização do razão agora (decisão do ST 00 mantida); reavaliar antes do deploy. | Produto | DG-18 |
| Q-32 | Ordenações: data e valor, crescente e decrescente. | Produto | DG-23 |
| Q-33 | Da entrega 3 entra **só a parte funcional** (ordenação, filtros e busca, validação do formulário). O **restyle glass** de Transações, formulário e Metas fica **fora** deste épico (coerente com Q-2) até o dono aprovar (Q-34). | Produto | DG-23 |
| Q-34 | Pendente do dono, não bloqueia nada: aplicar o visual glass também em Transações, formulário e Metas (exige emendar Q-2). Sem resposta, essas telas ficam como estão. | Produto | (fora do épico) |
| Q-37 | **Base do `totals` dos períodos de mês civil** (recomendação do orquestrador, F-2): `totals` de `CURRENT_MONTH` e `PREVIOUS_MONTH` pela **competência** (igual a `month.*`, `summaries` e `entries`, ADR-017); os pontos diários continuam por **data** (`basis` informado por ponto); como a renda com `incomeCompetence` deslocada muda de mês na competência e não no dia, a soma dos pontos diários pode diferir do `totals` de receita (o consumo não difere). `D30` e `D90` usam data (soma dos pontos = totals); `YEAR_TO_DATE` usa competência. Precisa de confirmação porque define qual receita o "Mês atual" mostra. | Produto/Backend | Bloqueia a Entrega 2 | DG-17 |

**Regras de orçamento (Q-36): a versão completa e vinculante está no ADR-021 (Proposto).** Resumo: limite mensal em BRL por categoria de consumo mais total opcional; vigências **imutáveis** (`effectiveFrom`), alteração só a partir da competência corrente (retroativo proibido); gasto = consumo da competência, mesma fonte de `entries`, `spending-by-category` e `month.consumption` (agendado dentro do mês conta e é rotulado com `includesScheduled`); gasto, restante, razão e situação calculados no backend; arquivar, nunca apagar.

### 3.3 Itens operacionais (não são perguntas de negócio)

- **Código do SideRays:** o dono colou o componente; a sessão principal repassa o código ao dev-frontend na DG-02B.
- **Licença do componente (React Bits) e do `ogl`:** o `ogl` é MIT; a **sessão principal confirma a licença do componente colado antes de passar o código ao dev** (não esperar o PR) e a registra no ADR-020.
- **Nomes de emissor:** o visual por emissor usa o texto de `Card.institution`; cartão cadastrado com outro texto cai no visual neutro (a conferência dos 4 cartões do dono é um passo da DG-07).

### 3.4 Perguntas ainda bloqueantes

**Entrega 1: nenhuma.** Resta a aprovação do dono ao ADR-020 (Proposto, `docs/adrs/ADR-020-dashboard-glass.md`).

**Entrega 2: uma, Q-37** (base do `totals` por competência ou por data no mês civil), que bloqueia só a DG-17 em diante e não afeta a Entrega 1.

**Entrega 4:** aprovação do dono ao ADR-021 (Proposto, `docs/adrs/ADR-021-orcamentos.md`), incluindo a confirmação de que agendado dentro do mês conta no orçamento (F-5), antes da DG-28.

## 4. Contrato de API

Fonte da verdade: `backend/contracts/openapi.yaml`; o frontend usa a cópia sincronizada (`./moneylog contract sync`). Tudo abaixo é aditivo e compatível (2.21.0). A entrega 1 usa **só o contrato 2.20.0**. Os itens 4.1 a 4.3 dependem de Q-26 a Q-30 e Q-32.

### 4.1 Períodos novos: estender `GET /v1/reports/income-expenses` (recomendado, Q-30)

Em vez de um endpoint paralelo, acrescenta-se ao enum `ReportPeriod` (hoje `D7`, `D30`, `M3`, `M12`): `CURRENT_MONTH`, `PREVIOUS_MONTH`, `D90`, `YEAR_TO_DATE`. `D30` continua sendo o "30 dias" (um só). A descrição de `REPORT_PERIOD_INVALID` (hoje lista só os quatro) é atualizada. Nomes e janelas são **proposta** até Q-26.

Campos novos na resposta, todos fora de `required` (clientes antigos não quebram):
- `calendar` (boolean): `true` para mês civil e ano, `false` para janela móvel; só rótulo da UI.
- `includesScheduled` (boolean): `true` se o período inclui lançamentos agendados dentro da janela (decidido em Q-27); a UI mostra "inclui agendados" quando `true`.
- `previous`: `{ from, to, totals }` do período comparável (Q-28, Q-29).
- `change`: `{ income, expenses, net }`, cada um `{ difference: Money, percent: Ratio | null }`; `percent` é `null` quando a base é 0 (a UI mostra "sem base de comparação").
- `totals.savingsRate`: `Ratio | null` (`net / income`, 4 casas; `null` sem receita), arredondado no backend.

Regras (reaproveitam as calculadoras existentes, sem regra paralela):
- `basis` segue a granularidade, igual ao contrato vigente: `DAY` e `WEEK` com `basis: DATE`; `MONTH` com `basis: COMPETENCE` (competência da renda, ADR-017). `YEAR_TO_DATE` é por mês e usa `COMPETENCE`. `CURRENT_MONTH` e `PREVIOUS_MONTH` têm pontos `DAY` (por data, `basis: DATE` informado por ponto) e `totals` **pela competência** (Q-37: igual a `month.*`, `summaries` e `entries`, `totals.basis = COMPETENCE`). Para **consumo**, a soma dos pontos diários do mês civil inteiro é igual ao `totals`. Para **receita**, a soma dos pontos pode diferir do `totals` quando houver receita com `incomeCompetence` deslocada (ADR-017: ela muda de mês na competência e não no dia); isso é documentado no contrato e a UI não soma pontos. `D30` e `D90` usam data (`totals.basis = DATE`, soma dos pontos igual ao `totals`).
- Granularidade proposta: `DAY` para mês e `D30`, `WEEK` para `D90` (13 a 14 baldes), `MONTH` para o ano.
- Fora da série: o mesmo que hoje (transferência, aplicação, resgate, pagamento de fatura, empréstimo, quitação de dívida, estornada, saldo inicial). `expenses` pode ser negativo (reembolso).
- `partial` por ponto continua significando "contém hoje".
- Agendados: só entram onde Q-27 disser, e então `includesScheduled = true`; `D7`, `D30`, `D90` e `M3` continuam terminando em hoje.
- Erros: `400 REPORT_PERIOD_INVALID`, `401`, `500`. `Cache-Control: private, no-store`. Leitura em instantâneo único.

Se o backend concluir que estender não é viável (Q-30), o endpoint separado `GET /v1/reports/period-overview` seria desenhado com os **mesmos** `from/to/basis` e testado contra `income-expenses` pelas mesmas regras.

### 4.2 `GET /v1/reports/spending-by-category` com `period` (aditivo)

Aceita `period` (mesmos valores) como alternativa a `month`; os dois juntos dão `400 VALIDATION_FAILED`. `total` do período bate com `totals.expenses` do `income-expenses` do mesmo `period`. Demais regras (base, other, share, limit) não mudam.

### 4.3 `GET /v1/transactions` com `sort` (aditivo, entrega 3)

`sort`: valores a definir em Q-32 (proposta: `DATE_DESC` padrão, `DATE_ASC`, `AMOUNT_DESC`, `AMOUNT_ASC`); desempate por `createdAt` e `id` na mesma direção do primário, para paginação estável. `totals` não muda. Valor desconhecido: `400 VALIDATION_FAILED`. Antes de existir no contrato, o front **não** ordena no cliente uma página parcial.

### 4.4 O que o front usa sem mudança (2.20.0)

`GET /v1/dashboard/summary`, `GET /v1/summaries/{month}`, `GET /v1/reports/income-expenses` (D7, D30, M3, M12), `GET /v1/reports/spending-by-category?month=`, `GET /v1/entries`, `GET /v1/transactions` (e `{id}`, `void`), `GET /v1/goals`, `GET /v1/notifications*`, `GET /v1/insights`, `GET /v1/cards`, `GET /v1/accounts`, `GET /v1/categories`, `POST /v1/transactions`. Escritas devolvem o recurso (BE 04, FE 05); o front usa a resposta e recarrega do backend, sem "chutar" o estado.

## 5. Tasks

Convenções: as dependências em perguntas (Q-nn) referem-se à seção 3; todas estão respondidas ou assumidas e não bloqueiam. Cada task cabe em um PR; "Aceite" em Dado/Quando/Então; todo texto novo em `pt`, `en`, `es`; `data-cy` em todo interativo; sem comentários no código; sem cor literal fora de `tokens.css`; em toda task de frontend `npm run lint && lint:deps && typecheck && test && build` ficam verdes; **os testes e2e e specs que dependem do layout são atualizados na mesma task que muda o layout**. Nenhuma task exibe dinheiro calculado no front: só formata a string da API. Nenhuma task mistura backend e frontend.

### Grafo de dependências e arquivos tocados

| Task | Agente | Depende de | Arquivos/pastas tocados (para paralelizar só o que for disjunto) |
|---|---|---|---|
| DG-00 | dono (aprova) + orquestrador (redigiu) | seção 3 | `docs/adrs/ADR-020-dashboard-glass.md` (Proposto) |
| DG-01 | dev-frontend | DG-00 (ADR-020 aprovado) | **dona única** de `src/styles/tokens.css` e `scripts/check-contrast.mjs` (todos os tokens e pares do épico: fundo, véu, `--gradient-rays-static`, tons de tipo, `--card-issuer-*`), `scripts/check-styles.mjs`, `glass-support.ts` |
| DG-02 | dev-frontend | DG-01 | `common/components/home-backdrop/*` (só consome tokens) |
| DG-02B | dev-frontend | DG-02 | `common/components/side-rays/*`, `package.json`, `package-lock.json` |
| DG-03 | dev-frontend | DG-01 | `common/components/{glass-panel,segmented-toggle,metric-tile,trend-badge,status-tag}/*`, **dona única de `icons.ts`** (todos os ícones do épico) |
| DG-04 | dev-frontend | DG-03, Q-11 | `common/services/values-visibility*`, `common/components/money/*`, `common/pipes/money.pipe.ts`, `values-toggle/*` |
| DG-05 | dev-frontend | (liberada já; independe do ADR-020) | `modules/{transactions,cards,goals,insights,notifications}/*` (facades, mock-data), `src/demo/*` |
| DG-06 | dev-frontend | DG-03, DG-04, DG-05 | `features/home/components/wallet-header/*` |
| DG-07 | dev-frontend | DG-03, DG-04, DG-05 | `features/home/components/{card-visual,card-carousel}/*`, `features/cards/pages/card-form.page.*`; em `src/demo/*` só **acrescenta** os cartões de emissor, sem reescrever os casos de PR 01 da DG-05 |
| DG-08 | dev-frontend | DG-03, DG-04, DG-05 | `features/home/components/recent-activity/*` (única dona) |
| DG-09 | dev-frontend | DG-03, DG-04, DG-05 | `features/home/components/analytics-panel/*` |
| DG-10 | dev-frontend | DG-03, DG-04, DG-05 | `features/home/components/chart-panel/*`, `common/components/charts/*` |
| DG-11 | dev-frontend | DG-03 | `common/components/app-shell/{bottom-nav,navigation*}`, i18n de navegação |
| DG-12 | dev-frontend | DG-03, DG-04, DG-05 | `features/home/components/{goal-card,insight-card}/*`, `notifications-popover` (estilo **e** aplicação de `maskable` nos valores do painel) |
| DG-13 | dev-frontend | DG-02, DG-02B, DG-06 a DG-12 | `features/home/pages/home.page.*` (composição desktop), e2e do desktop |
| DG-14 | dev-frontend | DG-13 | `home.page.css` (tablet), e2e do tablet |
| DG-15 | dev-frontend | DG-14 (em sequência: ambas editam `home.page.css`) | `home.page.*` (mobile), e2e do mobile |
| DG-16 | tester | DG-01 a DG-15 | `docs/qa/` |
| DG-17 | dev-backend | Q-37 | `backend/contracts/openapi.yaml` (versão **2.21.0**) |
| DG-18 | dev-backend | DG-17 | `core`, `infra/web`, `infra/persistence` de relatórios |
| DG-19 | dev-backend | DG-17 | spending-by-category (arquivos disjuntos de DG-18) |
| DG-20 | tester | DG-18, DG-19 | `docs/qa/` |
| DG-21 | dev-frontend | DG-20, `contract sync`, DG-13 a DG-15 | `modules/reports/*`, `period-selector/*`, `analytics-panel`, `chart-panel` (única editora desses dois nesta fase) |
| DG-22 | tester | DG-21 | `docs/qa/` |
| DG-23 | dev-backend | Q-32 | `contracts/openapi.yaml` (versão **2.22.0**) + transações (`sort`) |
| DG-24 | dev-frontend | DG-23, `contract sync` | `features/transactions/*`, `modules/transactions/*` (funcional, sem restyle) |
| DG-25 | dev-frontend | (independente) | formulário do quick-add (testes de validação; restyle fora) |
| DG-26 | removida | Q-34 | restyle glass de Metas fora do épico |
| DG-27 | tester | DG-24, DG-25 | `docs/qa/` |
| DG-28 | dev-backend | ADR-021 aprovado | `core` (domínio de orçamento), migração `V8.18__budgets.sql` |
| DG-29 | dev-backend | DG-28 | `contracts/openapi.yaml` (versão **2.23.0**), `infra/web`, `infra/persistence` de orçamentos |
| DG-30 | tester | DG-29 | `docs/qa/` |
| DG-31 | dev-frontend | DG-30, `contract sync`, DG-03, DG-15 | `features/budgets/*`, `modules/budgets/*`, `features/home/components/budget-card/*` e `home.page.*` (para incluir o card) |
| DG-32 | tester | DG-31 | `docs/qa/` |

Regras de arquivos compartilhados (revisão r2, F-6 a F-8):
- `tokens.css` e `check-contrast.mjs`: só a DG-01 edita; as demais consomem. Se uma task precisar de token novo, ele entra por emenda à DG-01 antes do despacho.
- `icons.ts`: só a DG-03 edita (lista todos os ícones do épico: seta de despesa, seta de receita, tipos neutros, calendário, cartão, sino, olho, etc.).
- i18n (`pt.ts`, `en.ts`, `es.ts`): cada task do lote paralelo escreve num sub-objeto próprio (ex.: `home.wallet`, `home.recent`, `home.analytics`) nos três arquivos; a sessão principal integra os merges em sequência (rebase) e roda o spec de paridade a cada integração.
- `openapi.yaml`: DG-17 = 2.21.0, DG-23 = 2.22.0, DG-29 = 2.23.0, mesmo que o merge ocorra em outra ordem (quem mergeia depois faz rebase e ajusta só o texto de versão). `contract sync` é feito pelo dev-frontend da task consumidora (DG-21, DG-24, DG-31), depois do merge do backend.
- `src/demo/*`: a DG-05 é a dona dos casos de PR 01; a DG-07 só acrescenta cartões.
- `home.page.*`: DG-13, DG-14, DG-15 em sequência; DG-31 por último.

### Entrega 0: decisão

**DG-00 · Aprovação do ADR-020 pelo dono** (o texto já foi redigido pelo orquestrador em `docs/adrs/ADR-020-dashboard-glass.md`, status **Proposto**; depende de: seção 3)
- Natureza: decisão de produto e arquitetura. As decisões já estão na seção 3 (diretas ou assumidas por delegação); o **dono aprova** o texto final; o **orquestrador redige** `docs/adrs/ADR-020-dashboard-glass.md`; o dev-frontend só aplica depois (DG-01). Nenhum agente decide cor, regra ou política de vidro.
- Objetivo: partir do estado **atual** de `tokens.css` e das emendas do ADR-011 ("Nova linguagem visual (DS 03)" e "Fatia 2 do visual"), listar o que de fato muda (paleta da demanda, cor de entrada/saída, raios, política de `backdrop-filter` em Safari/mobile, fundo de paisagem), reconciliar o ADR-011 com o `tokens.css` (acento) e registrar o resultado numérico do contraste.
- Aceite:
  - Dado o `tokens.css` e o ADR-011 emendado, Quando o ADR-020 é escrito, Então a seção "supera" cita item a item o que do ADR-011 muda e o que continua valendo (inclusive o Safari sólido, se mantido).
  - Dado cada token da decisão (valores nos dois temas), Quando listado, Então traz o contraste calculado de cada par texto/fundo (>= 4,5:1) e gráfico/UI/fundo (>= 3:1), e, quando um par falha, a decisão do dono (escurecer o token ou restringir o uso) vem escrita com o nome de quem decidiu.
  - Dado a política de vidro (Q-7), Quando fechada, Então o ADR diz para cada combinação (Chromium desktop, Safari, mobile/toque, reduced-transparency, sem suporte) qual superfície vale e o orçamento de camadas (Q-25).
  - Dado o ADR pronto, Quando enviado ao revisor, Então só é aceito com aprovação registrada do dono.

### Entrega 1 (MVP): composição do Início com o contrato 2.20.0

**DG-01 · dev-frontend · Tokens de vidro e guardas** (depende de: DG-00, Q-5, Q-6, Q-21)
- Objetivo: só tokens e guardas, sem componente novo: tokens do ADR-020 (claro/escuro), raio conforme Q-5, tokens do fundo verde escuro e do cartão por emissor, sombras, utilitário `.glass-panel`, política de `data-glass` conforme Q-7 em `glass-support.ts`, pares novos em `check-contrast`.
- Arquivos: `src/styles/tokens.css`, `src/styles/utilities.css`, `common/services/glass-support.ts` (+ spec), `scripts/check-contrast.mjs`, `scripts/check-styles.mjs`. Esta task é a única que edita `tokens.css` e `check-contrast.mjs` neste épico.
- Aceite:
  - Dado o navegador sem `backdrop-filter`, Quando o Início renderiza, Então os painéis usam o fundo sólido do token com contraste de texto >= 4,5:1.
  - Dado `prefers-reduced-transparency: reduce`, Quando o Início renderiza, Então não há `backdrop-filter` nem transparência nos painéis.
  - Dado `prefers-reduced-motion: reduce`, Quando um painel muda de estado, Então não há transição de transform nem animação de entrada.
  - Dado cada combinação da política de Q-7, Quando `detectGlassMode` roda em teste (UA de Safari, Chromium desktop, toque), Então devolve o modo decidido no ADR-020.
  - Dado `npm run lint`, Quando rodado, Então `check-styles` e `check-contrast` passam, sem cor literal nova fora de `tokens.css`.
  - Dado `ng build`, Quando medido, Então o tamanho do bundle inicial vigente é registrado e não piora.
  - Dado os tokens do épico (fundo, véu, `--gradient-rays-static`, tons de tipo de transação, `--card-issuer-*`), Quando o `check-contrast` roda, Então todos os pares de texto e de gráfico desses tokens estão registrados no script e passam (ADR-020, seção de contraste).

**DG-02 · dev-frontend · Fundo verde escuro por token** (depende de: DG-01)
- Objetivo: componente de fundo do Início, minimalista e sem imagem: verde escuro profundo por token (cor sólida e, se preciso, `--gradient-*` definido em `tokens.css`), com pouquíssimos detalhes brancos sutis. Reserva o ponto de encaixe do detalhe de luz da DG-02B.
- Arquivos: `common/components/home-backdrop/*`, specs (os tokens do fundo e da variante clara já vêm da DG-01).
- Aceite:
  - Dado o tema escuro, Quando o Início abre, Então o fundo é o verde escuro do token e nenhum arquivo de imagem é baixado.
  - Dado o tema claro, Quando o Início abre, Então o fundo usa a variante clara derivada por token e o contraste de texto sobre os painéis é >= 4,5:1.
  - Dado o fundo com gradiente de token, Quando o `check-contrast` roda, Então o par texto/painel é calculado nos pontos mais claros e mais escuros do gradiente e passa em AA; os números vão para o ADR-020.
  - Dado `ng build`, Quando medido, Então o bundle inicial não piora além de 1 kB gzip e o fundo não causa layout shift (CLS 0).
  - Dado `npm run lint`, Quando rodado, Então `check-styles` passa (nenhuma cor literal fora de `tokens.css`).

**DG-02B · dev-frontend · Porte do SideRays (WebGL) para Angular** (depende de: DG-02; decisão Q-35; padrão Q-24)
- Objetivo: portar o componente React Bits `SideRays` (WebGL, biblioteca `ogl`) para um componente Angular standalone, usado como detalhe de luz branca e verde sutil no fundo do Início, com opacidade baixa.
- Fonte: o código completo foi colado pelo dono e a sessão principal o repassa ao dev-frontend no despacho. Este plano fixa só o contrato: um triângulo de tela cheia com fragment shader animado por tempo e as props `speed`, `rayColor1`, `rayColor2`, `intensity`, `spread`, `origin`, `tilt`, `saturation`, `blend`, `falloff`, `opacity`. O shader é portado fielmente; não se inventa comportamento além disso.
- Arquivos: `common/components/side-rays/*` (componente, util de leitura de cor, spec), `package.json` e `package-lock.json` (nova dependência `ogl`, versão exata, FE 08), `.dependency-cruiser.cjs` se preciso. Decorativo: sem i18n, `aria-hidden`.
- Regras de implementação: inputs por signals; canvas criado depois do primeiro render (`afterNextRender`); `import('ogl')` **dinâmico**, só depois de o componente entrar na viewport (`IntersectionObserver`) e de passar nas condições abaixo, para que `ogl` fique fora do bundle inicial; cores recebidas como **nomes de token** e lidas de `getComputedStyle` (o TypeScript não contém hex nem `rgb(` literal: `check-styles`); loop por `requestAnimationFrame` pausado fora da viewport e com a aba oculta; DPR limitado a 1,5; limpeza completa no `DestroyRef` (cancela o loop, desconecta o observer, libera o contexto WebGL); sem comentários no código.
- Condições para animar: WebGL disponível; `prefers-reduced-motion: no-preference`; não mobile (`max-width: 767px` ou `pointer: coarse`); sem `Save-Data` nem conexão lenta; desempenho não baixo (`hardwareConcurrency` e `deviceMemory` acima de um limite fixado nos testes). Fora dessas condições, ou se o import/contexto falhar, mostra o **fallback estático**: um elemento com `--gradient-rays-static` (token), sem WebGL e sem custo.
- Aceite:
  - Dado `prefers-reduced-motion: reduce`, Quando o Início abre, Então `ogl` não é importado, não há loop de animação e o fallback estático aparece.
  - Dado mobile/toque, `Save-Data` ou aparelho de baixo desempenho, Quando o Início abre, Então o mesmo vale (nenhum download de `ogl`).
  - Dado ambiente sem WebGL (jsdom e navegador sem suporte), Quando o componente monta, Então mostra o fallback e não lança erro.
  - Dado o componente fora da viewport ou a aba oculta, Quando o tempo passa, Então o loop está parado; ao voltar, retoma.
  - Dado o componente destruído, Quando a rota muda, Então o loop é cancelado e o contexto WebGL liberado (teste com `ogl` simulado confere as chamadas de limpeza).
  - Dado `ng build` de produção, Quando medido, Então `ogl` está num chunk separado carregado sob demanda, o bundle inicial cresce no máximo 1 kB gzip e o tamanho gzip do chunk é registrado no ADR-020 e no relatório (meta proposta <= 30 kB gzip, a confirmar pelo revisor).
  - Dado `npm run lint`, Quando rodado, Então `check-styles` e `lint:deps` passam.
  - Dado axe-core, Quando rodado com o efeito ativo e no fallback, Então zero violações (canvas `aria-hidden`, `pointer-events: none`, sem foco).
  - Dado o painel de vidro sobre o efeito, Quando o contraste é verificado, Então o método é por cálculo no pior caso: o `check-contrast` usa a cor da luz do efeito na opacidade máxima (token `--rays-opacity-max`) misturada ao fundo, sob a alfa **mínima** do painel (token), e exige >= 4,5:1 para texto e >= 3:1 para gráfico; o resultado vai ao ADR-020. Uma captura do canvas no frame de pior caso é anexada ao relatório do tester apenas como auditoria visual.

**DG-03 · dev-frontend · Primitivos de apresentação** (depende de: DG-01)
- Objetivo: `GlassPanel`, `SegmentedToggle`, `MetricTile`, `TrendBadge`, `StatusTag` (rótulo + ícone para cada tipo da tabela da DG-08, mais "Agendada" e "Estornada"), reutilizáveis.
- Arquivos: `common/components/{glass-panel,segmented-toggle,metric-tile,trend-badge,status-tag}/*`, `icons.ts`, specs.
- Aceite:
  - Dado um valor positivo, Quando `TrendBadge` renderiza, Então mostra seta para cima, "+" e o texto acessível "aumento"; para negativo, seta para baixo, "-" e "queda"; para `null`, "sem base de comparação".
  - Dado `SegmentedToggle` como `radiogroup` (cada opção `role="radio"` com `aria-checked`), Quando o usuário usa setas e Enter/Espaço, Então a seleção muda e o foco permanece visível.
  - Dado qualquer botão só com ícone, Quando renderizado, Então tem `aria-label` traduzido.
  - Dado axe-core em cada primitivo, Quando rodado, Então zero violações.

**DG-04 · dev-frontend · Ocultar valores** (depende de: DG-03, Q-11; padrão Q-12)
- Objetivo: `ValuesVisibilityService` (signal persistido por `safe-storage`), botão `ValuesToggle` e `MoneyComponent`/`MoneyPipe` honrando o estado **só onde o input `maskable` é ligado** (Início e painel de notificações, Q-11 assumida); as demais telas não mudam.
- Aceite:
  - Dado valores ocultos, Quando um valor mascarável renderiza, Então o texto é "R$ •••••" e o leitor de tela lê "Valor oculto"; o valor real não está no DOM, em `title`, tooltip nem `aria-label`.
  - Dado valores ocultos, Quando o gráfico é lido por teclado, Então o tooltip e a tabela equivalente mostram data e rótulo, nunca o valor; o resumo textual do gráfico não cita montantes.
  - Dado valores ocultos, Quando a página muda, Então `document.title` não contém valores (verificado em teste).
  - Dado o botão, Quando acionado, Então tem `aria-pressed` e rótulo "Ocultar valores"/"Mostrar valores"; o estado persiste por aparelho (Q-12).
  - Dado `1245090` centavos em `pt-BR` com valores visíveis, Quando formatado, Então `R$ 12.450,90`; `-12050` centavos vira `-R$ 120,50` (`util/money.spec.ts`).
  - Dado o toggle ligado, Quando `/transactions` renderiza, Então seus valores continuam visíveis.
  - Dado push/notificações do sistema, Quando o texto vem do backend, Então a limitação (o mascaramento não alcança a notificação do sistema) fica registrada na documentação da task.

**DG-05 · dev-frontend · Facades e dados do Início** (depende de: Q-8, Q-9, Q-13)
- Objetivo: expor pelas facades de negócio existentes (nada de HTTP no componente, FE 01) a atividade recente, o cartão em destaque, a meta em destaque, o insight de maior destaque e a contagem de não lidas, com mocks e **demo** contendo os casos de PR 01 (transferência de R$ 1.000, fatura paga de R$ 1.283, reembolso de R$ 50, compra de R$ 1.200 em 6x, lançamento agendado).
- Arquivos: `modules/{transactions,cards,goals,insights,notifications}/*`, `src/demo/*`.
- Aceite:
  - Dado a resposta de `GET /v1/transactions?pageSize=5`, Quando mapeada, Então preserva a ordem da API, mantém `status`, `type` e `date` e não calcula total.
  - Dado cada um dos 11 valores de `TransactionType` (e `direction` quando houver), Quando mapeado, Então o item recebe rótulo, ícone, sinal e tom da tabela da DG-08, com um teste por tipo; o sinal vem do tipo e da `direction` do contrato, nunca do sinal do valor; tipo desconhecido cai em neutro com o rótulo genérico "Movimentação".
  - Dado transferência, aplicação, resgate, fatura paga, empréstimo, quitação de dívida ou ajuste, Quando mapeado, Então o tom nunca é o de despesa (vermelho) nem o de receita (verde).
  - Dado uma movimentação com data depois de `asOf`, Quando mapeada, Então é marcada "Agendada" e o tratamento na lista segue Q-13 (se fora da lista, não aparece; se dentro, aparece com o selo).
  - Dado falha em uma fonte, Quando o Início carrega, Então só o bloco afetado mostra erro com "Tentar novamente".
  - Dado o demo, Quando carregado, Então contém os cinco casos de PR 01 acima e a faixa "Modo demonstração" continua visível.

**DG-06 · dev-frontend · Cabeçalho e saldo da carteira** (depende de: DG-03, DG-04, DG-05)
- Objetivo: saudação, wordmark, sino, saldo `available` com alternância de ocultar, rótulo estático "BRL" (não é botão nem seletor), ação "Nova transação" (leva ao quick-add), seguindo os rótulos de Q-10.
- Arquivos: `features/home/components/wallet-header/*`, reaproveita `register-button`, `notifications-popover`, `available-balance`.
- Aceite:
  - Dado `balances.available = "12450.90"`, Quando renderiza, Então o número principal é `R$ 12.450,90` com o rótulo "Disponível"; "Em contas" e "Resultado do mês" nunca recebem esse rótulo.
  - Dado `available` negativo, Quando renderiza, Então mostra `-R$ ...`, cor de risco do token e o texto "Saldo negativo".
  - Dado `unread-count > 0`, Quando renderiza, Então o sino mostra o número e o `aria-label` informa "N notificações não lidas".
  - Dado "Nova transação", Quando acionado por teclado ou toque, Então abre o fluxo existente `/quick-add`, com foco visível e alvo >= 44 px.
  - Dado `displayName` preenchido ou nulo, Quando renderiza, Então a saudação o inclui ou não (Q-20).

**DG-07 · dev-frontend · Cartões reais por emissor** (depende de: DG-03, DG-04, DG-05)
- Objetivo: cartão escuro de vidro com os dados reais do cartão e seleção entre os cartões do usuário (carrossel ou seletor acessível). O emissor aparece pelo **nome** (`Card.institution`), sem logo de terceiros; cada emissor conhecido ganha uma variação **sutil** do cartão escuro por token (`--card-issuer-*`): Itaú, Nubank, Banco do Brasil e Mercado Pago; outro emissor ou `institution` nulo usa o visual neutro. A escolha do emissor é só apresentação (texto normalizado, sem acento nem caixa) e não afeta nenhum número.
- Cadastro/seed: **sem seed em produção** (os cartões reais do dono já existem e são dado dele). Nesta task, o modo demo passa a ter os quatro emissores como cartões de exemplo rotulados, e o formulário de cartão sugere os quatro nomes como atalhos de `institution` (sem obrigar).
- Arquivos: `features/home/components/{card-visual,card-carousel}/*`, `src/demo/*` (só acrescenta cartões), `features/cards/pages/card-form.page.*` (atalhos), specs (os `--card-issuer-*` e seus pares de contraste já vêm da DG-01).
- Aceite:
  - Dado nenhum cartão cadastrado, Quando renderiza, Então mostra estado vazio com ação "Cadastrar cartão" (`/cards/new`), nunca um cartão inventado.
  - Dado um cartão cadastrado, Quando renderiza, Então mostra só campos do contrato (nome, emissor pelo nome, limite disponível, fatura corrente) e uma máscara fixa sem número, validade ou bandeira; com valores ocultos os montantes ficam mascarados.
  - Dado `institution` "Itaú", "Nubank", "Banco do Brasil" ou "Mercado Pago" (com ou sem acento e caixa), Quando renderiza, Então aplica a variação do emissor; dado outro texto ou nulo, o visual neutro; nenhum arquivo de logo existe no repositório.
  - Dado cada variação de emissor, Quando o `check-contrast` roda, Então o texto sobre o cartão é >= 4,5:1.
  - Dado vários cartões, Quando renderiza, Então abre no de maior fatura corrente (a API traz `currentInvoice`; o front só escolhe, não soma), o usuário troca por botões e por setas do teclado, o cartão ativo é anunciado ("Cartão 2 de 4") e a escolha é lembrada por aparelho.
  - Dado a conferência dos 4 cartões do dono (Itaú, Nubank, Banco do Brasil, Mercado Pago, com a lista de apelidos conhecidos: "Itaú Unibanco", "BB", "Nu Pagamentos", "MercadoPago"), Quando o tester abre o Início com os cartões reais, Então cada um recebe a variação do seu emissor (critério de aceite, não passo opcional).
  - Dado cartões arquivados, Quando renderiza, Então só os `ACTIVE` entram no carrossel; dado `currentInvoice` nulo, mostra "Sem fatura aberta".
  - Dado dois cartões com fatura, Quando o inicial é escolhido, Então a comparação usa decimal exato (sem `Number`), empate fica na ordem da API; o rótulo é "Fatura atual" e nunca se confunde com `totalCommitted` nem com gasto do mês.
  - Dado um cartão com `overLimit`, Quando renderiza, Então mostra o aviso textual "Acima do limite", além da cor.

**DG-08 · dev-frontend · Atividade recente** (depende de: DG-03, DG-04, DG-05, Q-13; padrão Q-14)
- Objetivo: lista curta com ícone de categoria, descrição, categoria, data, valor com sinal, selo de status e link ao detalhe. É a única dona de `recent-activity/*`.
- Aceite:
  - Dado cada tipo de transação, Quando renderiza, Então usa a tabela abaixo (rótulo, ícone, sinal, tom) e há um teste por linha; vermelho aparece **apenas** em despesa de consumo.

    | Tipo (`TransactionType`) | Rótulo | Ícone | Sinal | Tom |
    |---|---|---|---|---|
    | `EXPENSE` | Despesa | seta de saída | `-` | vermelho (despesa de consumo) |
    | `CARD_PURCHASE` | Compra no cartão | cartão | `-` | vermelho (consumo na competência da parcela; não é caixa) |
    | `INCOME` | Receita | seta de entrada | `+` | verde |
    | `REFUND` | Reembolso | seta de retorno | `+` | neutro (abate consumo, não é receita) |
    | `TRANSFER` | Transferência | setas opostas | sem sinal | neutro |
    | `INVESTMENT` com `CONTRIBUTION` | Aplicação | gráfico | `-` | neutro |
    | `INVESTMENT` com `REDEMPTION` | Resgate | gráfico | `+` | neutro |
    | `INVOICE_PAYMENT` | Pagamento de fatura | cartão | `-` | neutro |
    | `LOAN_GIVEN` | Empréstimo concedido | pessoa | `-` | neutro |
    | `MONEY_RECEIVED` | Dinheiro recebido | pessoa | `+` | neutro (não é renda) |
    | `DEBT_PAYMENT` | Pagamento de dívida | pessoa | `-` | neutro |
    | `ADJUSTMENT` com `INCREASE` ou `DECREASE` | Ajuste | ajuste | `+` ou `-` | neutro |

  - Dado `VOIDED`, Quando renderiza, Então mostra "Estornada" (tom neutro, valor riscado) e a linha não entra em nenhum total exibido.
  - Dado clique ou Enter, Quando acionado, Então navega para `/transactions/{id}`.
  - Dado zero movimentações, Quando renderiza, Então mostra estado vazio com ação para registrar a primeira.

**DG-09 · dev-frontend · Painel analítico** (depende de: DG-03, DG-04, DG-05, Q-15)
- Objetivo: resumo mensal, variação vs mês anterior (`comparison`), alternância de visualização, 3 métricas (Q-15), com o contrato 2.20.0 (competência vinda do `month.competence` do dashboard; o front não faz aritmética de datas).
- Aceite:
  - Dado `comparison.percent = "-0.0420"`, Quando renderiza, Então o badge mostra a queda da API formatada a partir do string (`-4,2%`) com seta e texto "queda"; com `percent = null`, "sem base de comparação".
  - Dado `savingsRate = "0.4109"`, Quando renderiza, Então mostra `41,1%` formatado do string; o componente não divide `net/income`.
  - Dado a alternância de visualização, Quando acionada por teclado, Então o conteúdo muda e o estado é anunciado.
  - Dado falha em `summaries/{mês}`, Quando ocorre, Então só este painel mostra erro com "Tentar novamente".

**DG-10 · dev-frontend · Painel de gráfico** (depende de: DG-03, DG-04, DG-05)
- Objetivo: gráfico receitas x despesas (a série vermelha chama-se **"Despesas"**, consumo, nunca "Saídas", para não ser lida como caixa) com legenda, tooltip, resumo textual e insight, nos períodos que o contrato 2.20.0 já tem (D7, D30, M3, M12).
- Aceite:
  - Dado o gráfico, Quando focado por teclado, Então as setas movem entre pontos, o tooltip é anunciado por região viva e Esc fecha.
  - Dado o gráfico, Quando lido por leitor de tela, Então há `role="img"` com resumo textual (período, total de receitas, total de despesas) e a tabela equivalente abre por "Ver como tabela".
  - Dado série só com zeros, Quando renderiza, Então mostra "Sem movimentações no período" sem quebrar.
  - Dado receitas e despesas em escala de cinza, Quando observadas, Então continuam distintas por forma do marcador, traço e rótulo direto.
  - Dado o build, Quando medido, Então `check-chart-budget` fica <= 8 kB gzip.
  - Dado troca rápida de período, Quando duas respostas chegam fora de ordem, Então só a mais recente é exibida.

**DG-11 · dev-frontend · Navegação inferior com rotas reais** (depende de: DG-03, Q-18, Q-19)
- Objetivo: barra "Visão geral, Transações, Orçamentos, Metas, Configurações" (rotas `/`, `/transactions`, `/budgets`, `/goals`, `/settings`) fixa no mobile com safe-area e dentro do painel central no desktop, conforme Q-18 e Q-19.
- Arquivos: `common/components/app-shell/bottom-nav/*`, `navigation.ts` (+ specs), i18n.
- Aceite:
  - Dado cada item, Quando acionado, Então navega para a rota, marca `aria-current="page"` e o ativo tem indicador além da cor.
  - Dado `/budgets`, Quando aberto, Então mostra a página "em breve" honesta (ou o que Q-18 decidir), nunca 404.
  - Dado um aparelho com notch, Quando renderiza, Então respeita `env(safe-area-inset-bottom)` e o conteúdo não fica atrás da barra.
  - Dado a barra nova, Quando o usuário procura captura rápida e `/more`, Então ambas continuam alcançáveis conforme Q-19 (teste e2e: `/more` acessível a partir do Início em 375 px).

**DG-12 · dev-frontend · Meta, insight e notificações** (depende de: DG-03, DG-05)
- Arquivos: `features/home/components/{goal-card,insight-card}/*`, `notifications-popover` (estilo e `maskable` nos valores do painel).
- Aceite:
  - Dado nenhuma meta ativa, Quando o Início renderiza, Então o card de meta **não** aparece.
  - Dado meta com `current "8500.00"`, `target "20000.00"`, `remaining "11500.00"`, `progress "0.4250"`, Quando renderiza, Então mostra os três valores formatados, `role="progressbar"` com `aria-valuenow` do `progress` e o texto "42,5%".
  - Dado insight `CATEGORY_DELTA`, Quando renderiza, Então o texto vem das chaves i18n e `params` da API, sem recalcular percentual; sem insights, o card some.
  - Dado valores ocultos, Quando o painel de notificações abre, Então os montantes citados nas notificações são mascarados (`maskable`).
  - Dado o sino aberto, Quando o usuário marca como lida ou todas, Então usa os endpoints existentes, devolve o foco ao sino ao fechar e prende o foco enquanto aberto.

**DG-13 · dev-frontend · Composição desktop (>= 1200 px)** (depende de: DG-06 a DG-12)
- Objetivo: `home.page` com painel analítico à esquerda, carteira alta ao centro, gráfico à direita, insight e meta flutuantes; atualiza `home.page.spec` e e2e `home-dashboard`, `shell`, `workspace-shell`, `page-spacing`, `theme-a11y` no desktop.
- Aceite:
  - Dado larguras 1200 e 1440 px, Quando renderiza, Então os três painéis aparecem lado a lado e nenhum card flutuante cobre texto ou controle.
  - Dado o herói, Quando a rede é lenta, Então o saldo aparece antes do painel analítico e do gráfico (carga progressiva) sem salto de layout.
  - Dado estados loading, vazio, erro e offline, Quando renderiza, Então há mensagem clara por bloco; "sem contas" usa o `empty-state` existente.
  - Dado a ordem do DOM, Quando lida por leitor de tela, Então há uma `h1` e uma `h2` por seção.
  - Dado a suíte e2e do desktop, Quando rodada, Então passa com as expectativas alteradas só onde o layout mudou de propósito.

**DG-14 · dev-frontend · Composição tablet (768 a 1199 px)** (depende de: DG-13)
- Aceite:
  - Dado 768 e 1199 px, Quando renderiza, Então a grade tem duas colunas equilibradas e no máximo um elemento flutuante, sem sobreposição.
  - Dado a sidebar em trilho, Quando renderiza, Então o conteúdo respeita o ritmo de página (`page-spacing` verde).
  - Dado os e2e de tablet (`fit-screen`, `page-spacing`), Quando rodados, Então passam atualizados na mesma task.

**DG-15 · dev-frontend · Composição mobile (< 768 px)** (depende de: DG-13)
- Objetivo: ordem header compacto, saldo, ações, resumo receita/despesa, cartão, gráfico, transações recentes, metas e insights, navegação fixa.
- Aceite:
  - Dado 320, 375, 390 e 430 px, Quando renderiza, Então `scrollWidth <= innerWidth` (sem rolagem horizontal).
  - Dado o DOM, Quando lido por leitor de tela, Então a ordem de leitura é a visual (sem `order` CSS que a quebre).
  - Dado zoom de 200% e fonte do sistema aumentada, Quando renderiza, Então não há perda de conteúdo.
  - Dado Q-25, Quando medido (CPU 4x mais lenta), Então a rolagem fica >= 50 fps e há no máximo 3 painéis com blur simultâneos.
  - Dado os e2e de mobile (`fit-screen`, `shell`), Quando rodados, Então passam atualizados na mesma task.

**DG-16 · tester · Validação da entrega 1** (depende de: DG-01 a DG-15, incluindo DG-02B)
- Objetivo: validar e relatar em `docs/qa/2026-10-xx-qa-dashboard-glass-entrega-1.md`.
- Aceite:
  - **Oráculo de consistência (PR 01, regra 10).** Dado um mês com: compra de R$ 1.200 em 6x (parcela de R$ 200), fatura paga de R$ 1.283, aplicação de R$ 10.000, transferência de R$ 1.000 entre contas próprias, reembolso de R$ 50 e receita de R$ 5.500, Quando comparados, Então `month.income` e `month.consumption` do Início são iguais aos `totals` de `GET /v1/entries` (lentes `INCOME` e `CONSUMPTION`), ao ponto do mês corrente de `reports/income-expenses?period=M12` e a `summaries/{mês}`; e `month.cashFlow` é igual a `GET /v1/transactions?from=<1º dia>&to=<último dia>` `totals.cashFlow`. Nota: `transactions.totals` traz só `count` e `cashFlow` e **não** se compara com consumo.
  - Dado esses mesmos eventos, Quando o fluxo de caixa e o consumo são lidos, Então divergem exatamente assim: fatura de R$ 1.283 paga (caixa -1.283,00; consumo 0), aplicação de R$ 10.000 (caixa -10.000,00; consumo 0), transferência de R$ 1.000 (caixa líquido 0; consumo 0), compra em 6x (caixa 0 no mês da compra; consumo 200,00).
  - Dado as larguras 320, 375, 390, 430, 768, 1024, 1200 e 1440 px, Quando o Playwright navega, Então não há rolagem horizontal, o foco é visível e o axe tem zero violações nos temas aprovados (Q-6).
  - Dado `prefers-reduced-motion` e `prefers-reduced-transparency`, Quando emulados, Então não há animação nem transparência.
  - Dado Safari/WebKit e Chromium, Quando o Início abre, Então o visual corresponde à política do ADR-020 (Q-7 assumida: blur em painéis não fixos com orçamento de camadas, medido em iPhone real; sólido se não passar) em cada um.
  - Dado `npm run lint && lint:deps && typecheck && test && build && e2e`, Quando rodados, Então tudo passa.
  - Dado o fundo, Quando auditado, Então o LCP do Início cumpre Q-25 e o chunk do `ogl` não é carregado no mobile.

### Entrega 2: períodos reais (backend primeiro)

**DG-17 · dev-backend · Contrato dos períodos novos** (depende de: Q-37)
- Objetivo: (só depois de Q-37 respondida) escrever em `backend/contracts/openapi.yaml` (2.21.0) o que a seção 4.1 e 4.2 decidirem (extensão de `ReportPeriod` e de `income-expenses`, ou endpoint separado se Q-30 recusar), com exemplos, `basis` por granularidade, `includesScheduled`, `previous`, `change`, `savingsRate` e a descrição atualizada de `REPORT_PERIOD_INVALID`.
- Aceite:
  - Dado o contrato, Quando validado e comparado com o anterior, Então só há acréscimos (diff dos tipos gerados do front sem linha removida; campos novos fora de `required`).
  - Dado cada `period`, Quando documentado, Então diz calendário ou móvel, `from/to` inclusivos, fuso `America/Sao_Paulo`, granularidade, `basis`, se inclui agendados, comparável anterior e o tratamento de `percent = null`.
  - Dado `D30`, Quando comparado ao resto do contrato, Então continua sendo o único "30 dias".

**DG-18 · dev-backend · Implementação dos períodos novos** (depende de: DG-17)
- Objetivo: caso de uso no `core` reusando as calculadoras de `income-expenses` (nenhuma regra paralela).
- Aceite (datas em `America/Sao_Paulo`, "hoje" = 13/10/2026 salvo indicação):
  - Dado `D90`, Quando consultado, Então `from = 2026-07-16` e `to = 2026-10-13` e o período anterior é a janela imediatamente anterior de 90 dias (Q-29).
  - Dado `PREVIOUS_MONTH`, Quando consultado, Então `from = 2026-09-01` e `to = 2026-09-30`.
  - Dado `YEAR_TO_DATE` em 29/02/2028 e em 01/01, Quando consultado, Então os limites estão corretos e `previous` cobre o mesmo intervalo do ano anterior.
  - Dado transferência de R$ 1.000, aplicação, fatura de R$ 1.283, empréstimo e quitação de dívida, Quando consultado, Então nada disso entra em `income` nem `expenses`.
  - Dado compra de R$ 1.200 em 6x, Quando o período é o mês corrente, Então entra R$ 200,00 (a parcela), nunca R$ 1.200,00 nem R$ 1.283,00.
  - Dado reembolso de R$ 50, Quando consultado, Então abate no mês do reembolso e `expenses` pode ficar negativo.
  - Dado movimentação estornada, Quando consultado, Então não entra; dado lançamento agendado, Então entra ou não conforme Q-27 e `includesScheduled` reflete a decisão.
  - Dado recorrência realizada, Então conta uma vez; ocorrência pendente não conta.
  - Dado base anterior 0, Então `percent = null` e `difference` é a diferença absoluta.
  - Dado `D30`, `D90` e consumo de qualquer período, Quando comparado a `income-expenses` (D30), `entries` e `spending-by-category`, Então soma dos pontos = `totals` = totais dos outros endpoints (teste de propriedade com semente fixa, incluindo horário de verão de 2018/2019 e virada de ano).
  - Dado `CURRENT_MONTH` e `PREVIOUS_MONTH`, Quando a receita de um mês é comparada, Então `totals.income` = `month.income` = `summaries.income` = `entries` (lente `INCOME`) da competência (base por competência, Q-37).
  - Dado uma receita de R$ 3.000,00 com data 16/09 e `incomeCompetence` 2026-10, Quando `CURRENT_MONTH` (outubro) e `PREVIOUS_MONTH` (setembro) são consultados, Então o `totals.income` de outubro inclui os R$ 3.000,00, o de setembro não, e o ponto `DAY` de 16/09 mostra os R$ 3.000,00 por data; o teste afirma essa diferença documentada entre soma dos pontos e `totals`.
  - Dado `YEAR_TO_DATE` e `D90`, Quando consultados, Então `YEAR_TO_DATE` fecha por competência e `D90` por data, cada um com seu `totals.basis`.
  - Dado `period` inválido e requisição sem token, Então `400 REPORT_PERIOD_INVALID` e `401`; respostas validadas contra o OpenAPI nos ITs.

**DG-19 · dev-backend · `period` em `spending-by-category`** (depende de: DG-17; em paralelo a DG-18, arquivos disjuntos)
- Aceite:
  - Dado `period=D30`, Quando consultado, Então `total` é igual a `totals.expenses` de `income-expenses?period=D30`; `base`, `other` e `share` mantêm as regras atuais.
  - Dado `month` e `period` juntos, Então `400 VALIDATION_FAILED`.
  - Dado reembolso, Então abate na categoria dele.

**DG-20 · tester · Validação dos períodos no backend** (depende de: DG-18, DG-19)
- Aceite:
  - Dado 10.000 e 50.000 movimentações, Quando medido, Então o p95 do endpoint cumpre Q-25 (<= 1,5 s com 10.000) e os tempos com 50.000 são registrados no relatório.
  - Dado um único fuso (`America/Sao_Paulo`) e dois instantes de borda (23:59:59 do dia D e 00:00:00 do dia D+1), Quando consultado, Então a data efetiva cai no dia correto em cada período.

**DG-21 · dev-frontend · Seletor de período e consumo do contrato novo** (depende de: DG-20, `./moneylog contract sync`, DG-09, DG-10; DG-13 a DG-15 já entregues, portanto esta task é a única a editar `analytics-panel` e `chart-panel` nesta fase)
- Objetivo: seletor (Mês atual, Mês anterior, 30 dias, 90 dias, Ano) nos painéis analítico e de gráfico; gateway, facade, mapper, mocks e demo.
- Aceite:
  - Dado cada opção, Quando escolhida, Então a requisição leva o `period` correspondente; gráfico, totais, variação e categorias mudam juntos; o rótulo diz "Mês civil" ou "Janela móvel" conforme `calendar`, e "inclui agendados" conforme `includesScheduled`.
  - Dado troca rápida, Quando duas respostas chegam fora de ordem, Então só a mais recente é exibida (cancelamento da anterior).
  - Dado erro em um período, Quando ocorre, Então o seletor continua usável e o bloco mostra erro com "Tentar novamente", sem misturar dois períodos.
  - Dado `percent = null`, Então "sem base de comparação".
  - Dado o front, Quando auditado, Então nenhum `Date` local calcula `from/to`; rótulos de data vêm do `from/to` da API formatados com `Intl`.
  - Dado `schema.gen.ts`, Quando `api:check` roda, Então passa.

**DG-22 · tester · Validação da entrega 2** (depende de: DG-21)
- Aceite: Dado cada período, Quando o Início é comparado ao oráculo da DG-16 (com a base de Q-37) (entries/income-expenses/summaries para consumo e receita; `transactions.totals.cashFlow` para caixa) usando o mesmo `from/to`, Então batem; dado troca de período, Então gráfico e categorias refletem o filtro; e2e mock, produção e WebKit verdes.

### Entrega 3: parte funcional de Transações e formulário (sem restyle glass; cortável)

Por Q-2 e Q-33, o visual glass não se estende a Transações, formulário nem Metas neste épico. Entram só ordenação, filtros, busca e validação. O restyle depende de Q-34 (decisão do dono, plano próprio).

**DG-23 · dev-backend · `sort` em `GET /v1/transactions`** (depende de: Q-32)
- Aceite:
  - Dado `sort=AMOUNT_DESC`, Quando listado, Então a ordem é por valor decrescente com desempate estável (`createdAt`, `id`) e a paginação não repete nem perde itens.
  - Dado ausência de `sort`, Então a ordem atual é mantida, sem mudança de contrato; `sort` inválido dá `400 VALIDATION_FAILED`; `totals` é o mesmo para qualquer `sort`.
  - Dado a resposta, Quando validada, Então bate com o OpenAPI nos ITs.

**DG-24 · dev-frontend · Transações: filtros, busca e ordenação (funcional, no visual atual)** (depende de: DG-23, `contract sync`)
- Aceite:
  - Dado filtro por tipo e categoria, Quando aplicado, Então a requisição leva `type` e `categoryId`, o rodapé exibe os `totals` da API e a URL reflete o filtro.
  - Dado busca, Quando o usuário digita, Então há espera de 300 ms antes da requisição e o termo vai em `q`, sem filtrar no cliente.
  - Dado ordenação, Quando muda, Então a requisição leva `sort` e a página recarrega do servidor.
  - Dado nenhum resultado, Então estado vazio com "Limpar filtros"; dado clique em uma linha, Então abre o detalhe existente com impacto e estorno preservados.

**DG-25 · dev-frontend · Formulário de nova transação: validação** (independente)
- Primeiro passo: verificar o que a validação do quick-add já cobre; o que já existe vira só teste (sem restyle). Só se faltar validação, ela é implementada.
- Aceite:
  - Dado valor vazio, zero ou negativo, Quando o usuário envia, Então o envio é bloqueado, o campo mostra erro com `aria-describedby` e o foco vai ao primeiro campo inválido.
  - Dado a entrada `12450,90`, Quando enviada, Então vai como string decimal `"12450.90"` (sem `Number`/ponto flutuante) e a resposta `201` com o recurso alimenta a tela, que recarrega do backend.
  - Dado falha de rede ou `400`, Quando ocorre, Então o formulário permanece preenchido com a mensagem do problema e o reenvio não duplica a transação.
  - Dado o teclado, Então a ordem de foco é lógica e Esc fecha o modal devolvendo o foco ao botão que abriu.

**DG-26 · removida.** O restyle glass de Metas fica fora do épico até a decisão do dono (Q-34). O card de meta do Início continua na DG-12.

**DG-27 · tester · Validação da entrega 3** (depende de: DG-24, DG-25)
- Aceite: Dado filtros combinados (tipo + categoria + busca + ordenação) e paginação, Quando percorridos, Então não há itens repetidos ou perdidos e `totals` bate com o contrato; formulário valida e não duplica; e2e e axe verdes nos temas aprovados.

### Entrega 4: orçamentos em BRL (backend e frontend; regras assumidas em 3.2, Q-36)

Antes de despachar DG-28, o revisor confere o desenho contra PR 01 (consumo, histórico, sem dupla contagem) e o ADR-021 (redigido, status **Proposto**, `docs/adrs/ADR-021-orcamentos.md`) registra as regras; o dono precisa aprová-lo. Só BRL.

**DG-28 · dev-backend · Domínio e migração de orçamentos** (depende de: ADR-021 aprovado)
- Objetivo: agregado `Budget` (identidade: usuário + categoria de consumo, ou total do mês) com **linhas de vigência imutáveis** (`effectiveFrom` em competência, `amount` BRL) e `archivedFrom`, conforme o ADR-021, migração nova `V8.18__budgets.sql` (sem editar migrações aplicadas), repositório, casos de uso (criar, alterar limite, arquivar, desarquivar) e a consulta do mês que calcula gasto, restante, razão e situação **reaproveitando a calculadora de consumo existente** (nenhuma regra paralela).
- Arquivos: `core` (domínio, casos de uso, portas), `infra/persistence` (adapter, migração), testes (BE 07), ArchUnit intacto.
- Aceite:
  - Dado limite de R$ 800,00 em Alimentação e consumo da categoria no mês de R$ 820,00, Quando consultado, Então `spent = 820.00`, `remaining = -20.00`, `ratio` com 4 casas e situação `OVER`; com R$ 640,00 (80%), `NEAR`; com R$ 639,99, `OK`.
  - Dado compra de R$ 1.200 em 6x na categoria, Quando consultado no mês da compra, Então o gasto é R$ 200,00 (a parcela), nunca R$ 1.200,00.
  - Dado fatura paga de R$ 1.283, transferência de R$ 1.000, aplicação e empréstimo, Quando consultado, Então nenhum entra no gasto (sem dupla contagem).
  - Dado reembolso de R$ 50 na categoria original, Então abate o gasto dessa categoria; dado movimentação estornada, Então não conta.
  - Dado o limite alterado em 2026-10 de R$ 800,00 para R$ 1.000,00, Quando consultado 2026-09, Então o limite continua R$ 800,00 (histórico preservado); de 2026-10 em diante, R$ 1.000,00.
  - Dado um orçamento total, Quando consultado, Então compara com o consumo do mês inteiro (incluindo lançamentos sem categoria), podendo ser maior que a soma dos gastos dos orçamentos por categoria.
  - Dado categoria arquivada com gasto no mês, Quando consultado, Então o orçamento aparece.
  - Dado o gasto do mês, Quando comparado a `spending-by-category` e `month.consumption` do mesmo mês, Então os valores batem (teste de propriedade com semente fixa, incluindo horário de verão e virada de ano).
  - Dado valor <= 0 ou com mais de 2 casas, Quando criado, Então é rejeitado.
  - Dado limite alterado duas vezes na competência corrente N, Quando consultado, Então vale a última alteração de N, e a vigência anterior a N segue intacta; dado `effectiveFrom` anterior à competência corrente, Então é recusado (retroativo proibido).
  - Dado orçamento arquivado a partir de N e depois desarquivado, Quando consultados os meses anteriores a N, Então os valores não mudam.
  - Dado reembolso maior que o gasto da categoria (gasto negativo), Quando consultado, Então `spent` e `ratio` negativos e situação `OK`; dado categoria sem orçamento no mês, Então não aparece em `items`.
  - Dado categoria que não é de consumo (receita ou sistema), Quando o orçamento é criado, Então `400 CATEGORY_KIND_MISMATCH`; dado categoria arquivada, Então `400 CATEGORY_ARCHIVED`.
  - Dado gasto que inclui lançamento agendado dentro do mês, Quando consultado, Então a resposta traz `includesScheduled = true`.

**DG-29 · dev-backend · API e contrato de orçamentos** (depende de: DG-28)
- Objetivo: contrato 2.23.0 (aditivo) e controllers: `GET /v1/budgets?month=AAAA-MM` (resposta com `competence`, `total` opcional e `items[]` com `id`, `category`, `limit`, `spent`, `remaining`, `ratio`, `status`, `effectiveFrom`, `includesScheduled`, `version`), `POST /v1/budgets` (devolve o recurso), `PATCH /v1/budgets/{id}` (`id` é a identidade do orçamento; acrescenta uma vigência com `amount` e `effectiveFrom` >= competência corrente; controle por `version`; devolve o orçamento com as vigências), `POST /v1/budgets/{id}/archive` e `/unarchive` (devolvem o recurso). Erros: `400 VALIDATION_FAILED`, `BUDGET_MONTH_INVALID`, `CATEGORY_KIND_MISMATCH`, `CATEGORY_ARCHIVED`, `BUDGET_EFFECTIVE_FROM_PAST`, `404`, `409` de versão, `401`. Sem `DELETE`.
- Aceite:
  - Dado o contrato, Quando comparado ao 2.22.0, Então só há acréscimos.
  - Dado cada endpoint, Quando exercitado nos ITs, Então request e response são validados contra o OpenAPI e a escrita devolve o recurso atualizado.
  - Dado `PATCH` com `version` antiga, Quando enviado, Então `409` sem alterar nada; sem token, `401`; mês fora de 2000-01..2100-12, `400`.
  - Dado o usuário A consultando orçamento do usuário B, Então `404` (isolamento).

**DG-30 · tester · Validação do backend de orçamentos** (depende de: DG-29)
- Aceite: Dado os casos de PR 01 de DG-28 contra a API real, Quando executados, Então o gasto bate com `entries`, `spending-by-category` e `summaries` do mesmo mês; dado 10.000 movimentações, Então o p95 da consulta do mês cumpre Q-25; dado a virada de mês em `America/Sao_Paulo` (23:59:59 e 00:00:00), Então o lançamento cai na competência certa.

**DG-31 · dev-frontend · Página de orçamentos e card no Início** (depende de: DG-30, `./moneylog contract sync`, DG-03)
- Objetivo: `/budgets` funcional (substitui a página "em breve"): lista por categoria com limite, gasto, restante e barra de progresso (valores da API), total do mês, criar/editar limite e arquivar; card compacto de orçamentos no Início.
- Arquivos: `features/budgets/*`, `modules/budgets/*` (gateway, facade, mapper, mock-data, demo), i18n, `features/home/components/budget-card/*`.
- Aceite:
  - Dado `includesScheduled = true`, Quando renderiza, Então mostra o rótulo "inclui agendados".
  - Dado `spent`, `remaining`, `ratio` e `status` da API, Quando renderiza, Então mostra os valores em BRL, a barra com `role="progressbar"` (`aria-valuenow` do `ratio`) e o selo textual "Dentro", "Perto do limite" ou "Acima do limite" além da cor; o front não soma, não divide nem compara.
  - Dado `remaining` negativo, Quando renderiza, Então mostra `-R$ 20,00` com o texto "Acima do limite".
  - Dado criar ou editar, Quando o usuário envia, Então valida valor > 0 com erro associado ao campo, envia string decimal, usa a resposta do servidor e trata `409` com "Recarregar".
  - Dado nenhum orçamento, Quando renderiza, Então estado vazio com ação "Criar orçamento".
  - Dado valores ocultos, Quando o card do Início renderiza, Então os montantes são mascarados.
  - Dado a navegação inferior, Quando "Orçamentos" é acionado, Então abre a tela funcional; e2e atualizado na mesma task.

**DG-32 · tester · Validação da entrega 4** (depende de: DG-31)
- Aceite: Dado o fluxo criar, editar, arquivar e a virada de mês, Quando percorrido, Então os números batem com o backend e com o oráculo da DG-16; e2e e axe verdes nos temas aprovados; sem rolagem horizontal de 320 a 430 px.

### Descartado

- **Multimoeda:** o dono decidiu BRL apenas; o rótulo "BRL" é estático.

## 6. Ordem de execução

1. **Decisões e liberação:** seção 3 respondida ou assumida. **DG-05 está liberada agora** (não depende do ADR-020) e pode correr enquanto o dono aprova o ADR-020. Todo o resto da Entrega 1 espera o ADR-020 aprovado (DG-00). Entrega 2 espera Q-37. Entrega 4 espera o ADR-021 aprovado. Entrega 3 (funcional) só depende de Q-32.
2. **Entrega 1 (só contrato 2.20.0), na ordem do grafo:**
   - DG-05 já pode rodar. Sequencial: DG-00 (aprovação), DG-01.
   - Depois, em paralelo (arquivos disjuntos): DG-02, DG-03 (DG-02B pode correr junto ao lote seguinte: só tem `package.json` e pasta própria).
   - Depois de DG-03: DG-04 e DG-11 em paralelo.
   - Depois de DG-03, DG-04 e DG-05: DG-06, DG-07, DG-08, DG-09, DG-10 e DG-12 em paralelo (cada uma em pasta própria; DG-08 é a única dona de `recent-activity/*`).
   - Depois: DG-13 (desktop), então DG-14 e DG-15 (tablet e mobile, ambas editam `home.page.css`: **em sequência**, não em paralelo), e por último DG-16 (tester). O merge de i18n, `icons.ts` e `tokens.css` segue as regras de arquivos compartilhados da seção 5.
3. **Entrega 2:** DG-17 (contrato) → DG-18 e DG-19 em paralelo → DG-20 (tester) → `./moneylog contract sync` → DG-21 → DG-22. O front **não** consome o contrato novo antes de DG-18/19; até lá usa D7/D30/M3/M12. A entrega 2 só começa depois de Q-26 a Q-30 estarem respondidas e pode correr em paralelo à entrega 1 no backend (não no `analytics-panel`/`chart-panel`).
4. **Entrega 3 (funcional):** DG-23 em paralelo a DG-25; DG-24 depois de DG-23; DG-27 por último. Não depende da entrega 2. Restyle fora (Q-34).
5. **Entrega 4 (orçamentos):** ADR-021 e revisão do desenho; depois DG-28, DG-29, DG-30, `contract sync`, DG-31, DG-32. O backend (DG-28 a DG-30) pode correr em paralelo à entrega 1; DG-31 não depende da entrega 2.

Fluxo por task (CLAUDE.md): dev implementa, revisor revisa o código, tester valida. Backend e frontend em PRs e commits separados, backend primeiro; os ponteiros de submódulo no repo principal depois.

## 7. Riscos e ADRs necessárias

- **ADR-021 (orçamentos): redigido, status Proposto; o dono precisa aprová-lo antes da DG-28.**
- **ADR-020 (dashboard glass): redigido, status Proposto; o dono precisa aprová-lo antes da DG-01 (inclui a dependência `ogl` e a exceção de cor de despesa):** parte do `tokens.css` e do ADR-011 emendado; registra paleta, entrada/saída, raios, política de vidro por navegador e o resultado do contraste.
- **Vidro em Safari/mobile (Q-7 assumida):** blur só em painéis não fixos, no máximo 3 por vez; risco de desempenho do compositor em iPhone, medido em aparelho real (Q-25); se falhar, volta ao sólido no Safari e o relatório diz isso.
- **Conflito DS x demanda (Q-3 a Q-5):** retrabalho se a paleta for decidida depois de DG-01; por isso DG-00 antecede o código.
- **Contraste sobre fundo com gradiente e SideRays:** `check-contrast` só lê tokens sólidos; mitigação em DG-02 e DG-02B (pares nos pontos extremos do gradiente, opacidade baixa do efeito, axe, números no ADR-020).
- **Desempenho:** Início com 50.000 movimentações leva ~16,8 s (Q-31); carga progressiva só melhora a percepção. Orçamentos numéricos em Q-25 e medição em DG-15, DG-16, DG-20.
- **Correção financeira (PR 01):** risco de confundir saldo disponível, saldo em contas e fluxo do mês, e de mostrar agendada ou estornada como realizada. Mitigação: rótulos fixos (Q-10, Q-14), oráculo de consistência corrigido em DG-16 (consumo contra `entries`/`income-expenses`/`summaries`, caixa contra `transactions.totals.cashFlow`), casos de PR 01 em DG-05 (demo) e DG-18.
- **Semântica de período (Q-27, Q-28):** misturar mês com agendado e janela de 30 dias sem agendado pode induzir leitura errada de "resultado do mês"; a UI marca `includesScheduled` e o rótulo do comparativo.
- **Testes existentes:** `home.page.spec` e os e2e `home-dashboard`, `shell`, `fit-screen`, `page-spacing`, `workspace-shell`, `charts`, `theme-a11y` mudam de propósito; cada task de composição atualiza os seus.
- **Cartão e "falsa conexão":** número ou saldo inventado de cartão viola PR 02; o visual usa dado real ou estado vazio (Q-8).
- **Dependência nova `ogl` (DG-02B):** acrescenta uma dependência de runtime (FE 08: versão exata e lockfile). Impacto no bundle inicial ~0 (import dinâmico e chunk separado; meta <= 30 kB gzip, medida). Riscos: WebGL custoso em aparelho fraco (mitigado pelas condições de animação e pelo fallback estático), perda de contexto, licença do componente colado (verificar) e `jsdom` sem WebGL (testes usam `ogl` simulado).
- **Exceção ao DS 00 (Q-4):** vermelho para saída comum contraria o DS 00; registrada no ADR-020 como decisão do dono, restrita ao Início.
- **Orçamentos (entrega 4):** regra financeira nova (consumo, vigência, histórico); as regras assumidas em 3.2 passam por revisão do desenho (PR 01) e ADR-021 antes de DG-28.
- **Escopo:** 34 tasks. Fatiamento: entregar a entrega 1 (composição com dados reais existentes) e validar com o dono antes de gastar backend na entrega 2; as entregas 3 e 4 são independentes e cortáveis.
