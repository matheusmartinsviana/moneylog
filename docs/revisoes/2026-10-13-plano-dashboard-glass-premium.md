---
alvo: docs/planos/2026-10-13-dashboard-glass-premium.md
tipo: revisão de plano
data: 2026-10-13
revisor: revisor
parecer: aprovado com ressalvas (entrega 1 só começa após corrigir os itens 🟠 e responder Q-1, Q-2, Q-12)
---

# Revisão do plano: Início "premium finance dashboard" com glass

## 1. Resumo
Plano bem fundamentado no código real (reuso de glass, charts, facades, guards de lint) e correto no essencial de PR 01: nenhum cálculo no front, rótulos distintos para Disponível, Em contas e Resultado do mês, transferência e agendada e estornada tratadas, cartão sem dado inventado, fatiamento em entregas cortáveis. Os problemas estão em (a) premissa defasada sobre o ADR-011, que muda o conflito de design real, (b) critérios de consistência entre Início e Transações que não podem ser verdadeiros como escritos, (c) endpoint novo que duplica `income-expenses` e tem semântica de período misturando realizado e agendado, (d) dependências e tamanhos de tasks inconsistentes, (e) perguntas compostas e uma sem número que bloqueia teste. Nada disso exige reescrever o plano, mas os 🟠 devem ser resolvidos antes de despachar DG-00/DG-01.

## 2. Itens conformes
- Regra "front não calcula" repetida nas convenções e nos aceites (DG-03, DG-07, DG-09, DG-14: percentual e savingsRate vêm da API, `percent = null` vira "sem base de comparação", nenhum `Date` local para `from/to`).
- Q-10 e Q-14 (rótulos de saldo e de agendada/estornada) e DG-05/DG-06 cobrem a confusão saldo/fluxo, transferência neutra e estornada fora dos totais.
- DG-11 traz os casos de PR 01 (transferência R$ 1.000, fatura R$ 1.283, 1.200 em 6x = 200, reembolso, recorrência, empréstimo, quitação) como testes, mais propriedade soma dos pontos = totals e bordas de DST/bissexto.
- Q-8: cartão só com campos do contrato e estado vazio; sem conexão bancária simulada. Q-7 e Q-9 recusam multimoeda e orçamentos falsos.
- Contrato aditivo, backend antes do front, `contract sync`, sem consumo antes de existir (seção 6, item 3). Ordem "entrega 1 só com 2.20.0, validar com o dono antes da 2" é a decisão certa de escopo.
- Acessibilidade (não só cor, teclado, tabela equivalente, reduced-motion/transparency, safe-area), i18n, `data-cy`, orçamentos de bundle e de gráfico, imagem fora do bundle com variantes por viewport.
- Pergunta de licença da imagem como bloqueio (Q-1) e risco de contraste sobre foto identificado.

## 3. Achados

### 🟠 A-1 Premissa defasada sobre o ADR-011 (o conflito real é outro)
`docs/planos/2026-10-13-dashboard-glass-premium.md:57,364` e DG-00:143. O plano trata o ADR-011 como "sem backdrop-filter nos painéis, sem gradiente, entradas azul/saídas neutras, tokens canvas #f6f5fb, accent #094360". O próprio ADR-011 (`docs/adrs/ADR-011-redesign-workspace.md`, seções "Nova linguagem visual (DS 03)" e "Fatia 2") já foi emendado: gradiente permitido como token, `.glass`/`.glass-lens`/`--glass-sheen` existem, paleta mudou (accent lilás/teal conforme a emenda), hover azul frio. O que **continua** valendo e conflita de verdade com a demanda: vidro **sólido no Safari/WebKit** (`glass-support.ts:detectGlassMode` retorna `solid` em Safari) e blur barato em celular/toque, mais DS 00 (verde só positivo, vermelho só risco, "dashboard bancário" e "verde agressivo" proibidos). Consequências: o ADR-020 pode ser escrito sobre fatos errados; o fallback "legível" do DG-09C passa a ser o comportamento padrão de todo iPhone/Mac Safari (a maior parte do público PWA mobile), ou seja o visual premium nunca é visto ali sem decisão explícita.
Correção: DG-00 deve partir do estado atual de `tokens.css` e das emendas do ADR-011, listar o que de fato muda e incluir pergunta nova (Q-19): o Início glass pode usar `backdrop-filter` em Safari/WebKit e no mobile (com orçamento de camadas), ou o visual aceito em Safari é sólido? Sem isso o aceite de DG-01/DG-09C é indecidível.

### 🟠 A-2 Critério de consistência Início x lista não pode ser verdadeiro
DG-09C:257 e DG-15:310. "`month.income`/`consumption` do Início = `totals` da lista". O contrato de `GET /v1/transactions` devolve em `totals` apenas `count` e `cashFlow` (openapi ~6893), e `cashFlow` inclui fatura paga e aplicação, justamente o que o consumo exclui (o openapi diz isso para `net` e `month.cashFlow`). Teste escrito assim reprova por construção, ou o tester o "ajusta" sem critério e deixa de proteger PR 01 regra 10. DG-15 contorna com "diferenças só pelo recorte documentado", vago.
Correção: reescrever o oráculo. Comparar `month.income/consumption` com `GET /v1/entries` (lens correspondente) e com `reports/income-expenses`/`period-overview` do mesmo período; e comparar `month.cashFlow` com `transactions.totals.cashFlow` do mesmo filtro. Listar no aceite os eventos que devem divergir entre consumo e caixa (fatura, aplicação, transferência) com valores do PR 01.

### 🟠 A-3 `period-overview` duplica `income-expenses` e mistura realizado com agendado
Seção 4.1, DG-10/11. (i) `LAST_30_DAYS` = `D30` existente; `LAST_90_DAYS` é quase `M3`. Um segundo endpoint com enum diferente e o mesmo `REPORT_PERIOD_INVALID` (cuja descrição no contrato lista só `D7/D30/M3/M12`) cria dois "30 dias" que podem divergir, o oposto de PR 01 regra 10. Alternativa mais barata e segura: estender `ReportPeriod` (`MONTH_TO_DATE`/`CURRENT_MONTH`, `PREVIOUS_MONTH`, `D90`, `YTD`) e acrescentar `previous` e `change` ao `income-expenses` existente (aditivo). (ii) `basis: "DATE"` fixo no exemplo ignora que o contrato atual usa `COMPETENCE` na granularidade mensal (ADR-017, competência da renda, `income-expenses` M12): `YEAR_TO_DATE` por mês tem de usar a mesma base e o plano precisa dizer qual. (iii) `CURRENT_MONTH` inclui agendados do mês (S-285) enquanto `LAST_30_DAYS` os exclui (DG-11:283): o mesmo seletor mostra "Mês atual" com compromisso somado a receita/consumo e "30 dias" sem, e o `change` compara mês parcial+agendado com mês anterior completo. Isso pode induzir leitura errada de "resultado do mês" (PR 01: compromisso futuro não é caixa realizado). Q-6 pergunta só "parcial x completo", não esta mistura.
Correção: decidir antes de DG-10 se o endpoint é extensão de `income-expenses`; fixar `basis` por granularidade; marcar `partial`/`includesScheduled` no payload e na UI; acrescentar a Q-6 a pergunta explícita "mês atual inclui agendados?".

### 🟠 A-4 Dependências e paralelismo contraditórios entre tasks
- DG-05 e DG-06 listam o mesmo diretório `features/home/components/recent-activity/*` e a seção 6 as roda em paralelo: conflito de arquivo e de dono do componente. DG-05 deve só montar o painel e DG-06 ser dona de `recent-activity`.
- DG-05 usa o rodapé de navegação (DG-08) mas não declara dependência; DG-09 depende de DG-05 e a seção 6 as coloca no mesmo lote paralelo.
- DG-04 "depende de: DG-01 não; pode rodar..." (texto quebrado). DG-04 depende de Q-8 (cartão em destaque) e Q-14 e não declara.
- Seção 6, item 2: "DG-03, DG-04 e DG-08 só dependem de DG-02" contradiz DG-08 (depende de Q-9) e DG-04 (nada). Aceitável, mas precisa ficar consistente.
- DG-09C lista "DG-01 a DG-09" e omite DG-06 do lote; DG-14 depende de DG-07 mas edita `analytics-panel`/`chart-panel` também tocados por DG-09B.
- Q-15 diz "Bloqueia DG-18", mas o `sort` é DG-16; riscos citam "DG-11/06/24" (DG-24 não existe); DG-13 fala em "dois fusos" (é um fuso, dois instantes).
Correção: refazer o grafo (tabela task, depende de, arquivos tocados) e só paralelizar tasks com arquivos disjuntos.

### 🟠 A-5 Tasks grandes demais para "um PR"
DG-05 (painel de carteira + card visual + atividade + saudação + moeda + sino + CTA + demo), DG-07 (dois painéis, tooltips, teclado, métricas, tabela, orçamento de gráfico) e DG-09B (três composições, ordem de leitura, zoom, carga progressiva, quatro e2e alterados) misturam coisas independentes e vários aceites de a11y e de layout. DG-01 mistura tokens, asset, componente de fundo, `ngsw-config` e dois guards. Risco: PRs não revisáveis, retrabalho de e2e.
Correção sugerida: dividir DG-05 (cabeçalho/saldo; cartão visual), DG-07 (analítico; gráfico), DG-01 (tokens/guards; fundo+asset) e mover a atualização dos e2e para a task que muda o layout (já dito em riscos, não nas tasks).

### 🟡 A-6 Ocultar valores altera `MoneyComponent`/`MoneyPipe` globais (DG-03)
Q-11 diz que afeta o Início e o painel de notificações, mas DG-03 muda o componente compartilhado: o estado global passa a mascarar Transações, Metas, Dívidas etc. sem decisão. Pode ser desejável, mas é mudança de comportamento de produto e de testes de todo o app.
Correção: input explícito (`maskable`) ou escopo por provider; ou decidir em Q-11 que vale para o app todo e ajustar o aceite. Incluir o que acontece com a leitura por teclas do gráfico, a tabela equivalente, `document.title`, notificações push e valores em `aria-label` de outros componentes.

### 🟡 A-7 Contraste sobre foto não é verificável pelo guard
Seção 7 admite que `check-contrast` só lê tokens sólidos. Os aceites de DG-01 ("contraste >= 4,5:1") têm o fallback sólido, mas não o caso com vidro translúcido sobre a imagem (o caso comum). Falta o critério mensurável: véu/painel com opacidade mínima por token, par calculado contra o pior pixel da região (claro e escuro) e um teste de axe/captura em Playwright com a imagem real.
Correção: acrescentar aceite com método (amostrar o luminance máximo/mínimo da imagem por zona e calcular o par com a alfa do token) e registrar o resultado no ADR-020.

### 🟡 A-8 Desempenho: orçamentos sem número e backdrop em lista
Q-17 não fixa orçamento, mas DG-13 testa contra "orçamento acordado em Q-17". Falta meta (ex.: p95 do endpoint novo e LCP do Início). `backdrop-filter` é limitado em risco, mas nenhum aceite o mede (nº máximo de painéis com blur por viewport, FPS de rolagem em aparelho fraco). Início já a 16,8 s com 50.000 movimentações: carga progressiva (DG-09B) mitiga só a percepção. Imagem: meta de peso por viewport existe, mas não há tratamento de `Save-Data` / conexão lenta no fundo.
Correção: números nos aceites (p95, LCP, camadas de blur) e `Save-Data`/fallback.

### 🟡 A-9 Perguntas em aberto: qualidade
- Q-2 empacota quatro decisões (escopo glass, cores novas, verde/vermelho, raio 36) em uma; Q-12 repete a primeira. Dividir; uma resposta parcial hoje trava DG-00 inteiro.
- Q-17 está com dono "Arquitetura" mas pede ao dono do produto aceitar 16,8 s; sem orçamento numérico (ver A-8).
- Q-6 mistura cinco decisões; falta a do agendado (A-3) e a do rótulo do comparativo parcial.
- Q-3, Q-13 e Q-18 já trazem proposta e são de baixo risco: marcar como "assume proposta se não houver resposta" para não bloquear.
- Faltam: política de vidro no Safari/mobile (A-1); o que "premium" faz na UI dado DS 00 (Q-18 cobre só a palavra); o que acontece com o fundo no modo offline/PWA (imagem `lazy` no `ngsw`).
- Q-4 (wordmark): CLAUDE.md usa moneylog e o DS usa Monelog; a proposta "BRAND_NAME sem logo" é razoável, mas o dono é Produto e deve responder antes de DG-05.

### 🟡 A-10 DG-00 atribuída a dev-frontend; ADR sem autor definido
ADR é decisão de arquitetura/produto; atribuir a `dev-frontend` e depender de respostas do dono faz o agente decidir regra de produto ("a decisão (escurecer o token ou restringir o uso)", DG-00:147). CLAUDE.md: nenhum agente decide regra de negócio sozinho. Correção: orquestrador redige, dono aprova, dev-frontend aplica os tokens.

### 🟡 A-11 Entrega 3 com fraco vínculo ao "Início"
DG-17 a DG-20 (Transações, formulário, Metas) estendem o escopo além do Início, contra Q-12 (proposta: só Início). `sort` em transações depende de Q-15 que nasceu da demanda; DG-18 "confirmar a validação" pode já estar implementada (verificar antes: se existir, vira só teste/restyle). Aceitável como entrega cortável, mas conferir o desejo do dono.

### 🟢 A-12 Menores
- DG-01: tokens de raio 36 px entra contra DS 00 (12 a 18) e ADR-011 (28 máximo); depende de Q-2.
- DG-02: aceite diz `aria-checked`/`aria-selected` (escolher um por role).
- DG-08: criar item "Orçamentos" para página "em breve" na barra inferior de 5 itens retira "+" e "Mais" no mobile; o aceite cobre, mas acrescentar teste e2e de que `/more` continua alcançável.
- DG-04: "últimas movimentações" via `pageSize=5` pode incluir agendadas futuras na frente (ordem `date desc`); definir se agendadas aparecem (Q-14 pergunta, mas o aceite de DG-04 assume o selo).
- Seção 2: dados "demo" rotulados são mencionados, mas não há aceite de que valores de PR 01 existem no demo.

## 4. Riscos
- Entregar o visual sem decisão sobre Safari/mobile (A-1): a maioria dos usuários vê fallback.
- Divergência entre dois "30 dias" e leitura de agendado como realizado (A-3): fere PR 01.
- Teste de consistência mal definido (A-2) dá falsa confiança ou falso alarme.
- Contraste de vidro sobre foto não verificado automaticamente (A-7).
- Retrabalho de e2e e de specs (`home.page.spec`, `shell`, `fit-screen`, `page-spacing`) se a recomposição não for fatiada (A-5).
- Desempenho do Início (16,8 s com 50.000 movimentações) e bundle inicial acima de 500 kB (a nota do ADR-011 diz 463 kB, o ST 00 diz 528 kB: confirmar o número vigente antes de usar como linha de base de DG-01).

## 5. Pendências por dono
- **Produto:** Q-1 (asset + licença), Q-2 dividida, Q-4, Q-6 (incluindo agendado e comparativo parcial), Q-7, Q-8, Q-9, Q-10, Q-11 (escopo global ou só Início), Q-12, Q-14, Q-15, Q-16, e nova Q-19 (vidro em Safari/mobile).
- **UX:** Q-3, Q-5, Q-13, Q-18; contraste sobre foto (A-7).
- **Backend:** decidir extensão de `income-expenses` versus endpoint novo, `basis` por granularidade, `percent = null`, marcação de agendado no payload (A-3).
- **Arquitetura:** ADR-020 sobre fatos atuais do ADR-011 (A-1, A-10); Q-17 com números (A-8); grafo de dependências e fatiamento (A-4, A-5).

## 6. Parecer
🟡 **Aprovado com ressalvas.** O plano preserva o MVP, respeita PR 01 e a regra de cálculo só no backend, e tem testes de integridade financeira na entrega backend. Não está pronto para despacho: antes de DG-00/DG-01, corrigir A-1 (premissa do ADR-011 e política de Safari), A-2 (oráculo de consistência), A-3 (endpoint de período), A-4 e A-5 (grafo e tamanho das tasks) e responder Q-1, Q-2 (dividida) e Q-12. Entrega 2 não deve começar antes de A-3 estar decidido.
