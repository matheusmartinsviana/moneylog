---
tipo: revisão de código
alvo: frontend/ (fatias A e B do redesign: T183, T191 a T195, T198, T199)
plano: docs/planos/2026-10-10-redesign-workspace.md (seção 15; FE-S-222 a FE-S-229)
data: 2026-10-11
autor: revisor
parecer: 🟡 aprovado com ajustes (nenhum 🔴; 4 achados 🟠 para corrigir antes de a fatia C consumir os gráficos)
---

# Revisão de código: redesign, fatias A e B (tokens, casca, cabeçalho, navegação, microinterações, gráficos)

Confrontado com: ADR-011, ADR-007, DS 00/01/02, revisão do plano (R1 a R13), README de componentes e as 28 capturas de `docs/qa/evidencias/redesign/`.
O repositório não tem commits (`git diff` indisponível): li os arquivos completos. Rodei só o que não toca backend nem Docker: `check-styles`, `check-brand`, `check-native-controls`, `check-contrast` (56 pares) e `lint:deps` passam; `ng test` completo: 2406 de 2424 passam e as 18 falhas são **timeouts** (17 mensagens "timed out", load average ~40 com o tester e o dev-backend rodando). Resultado inconclusivo para essas 18; repetir com a máquina livre (as especificações afetadas são as pesadas em axe: `app-shell`, `ui-kit.page`, `quick-add`, `line-chart`).

## 1. Resumo

A casca, os tokens e os gráficos estão bem executados e honestos no essencial: o front **não calcula** nos gráficos (só posiciona), a tabela equivalente está sempre no DOM, o tooltip funciona por mouse, toque e teclado, a região viva anuncia, `prefers-reduced-motion` é respeitado, não há `innerHTML`/`title`/controle nativo, `data-cy` e rotas ficaram intactos, o i18n pt/en/es está completo e em sentence case, e o contraste dos tokens passa nos dois temas (conferi a mais os pares fora da lista: todos passam, ver 2). O desenho (janela de 28 px, sidebar `sticky`, página que rola) é coerente com o ADR-011 e as capturas parecem um app de Mac calmo, sem cara de banco.

Os problemas reais são quatro: (1) as **fixtures de demonstração e a facade demo vão no bundle de produção** (inicial) e nada impede que um futuro consumidor as mostre sem rótulo; (2) a **sidebar recolhida não rola** (`overflow: visible` dentro de um quadro `sticky` de altura fixa) e some itens em janelas baixas; (3) o **anel de foco é cortado** nas ações rápidas do cabeçalho (`overflow-x: auto`); (4) o botão "Ver como tabela" e os itens da sidebar em tablet ficam **abaixo de 44 px** em toque.

## 2. Itens conformes

- **O front não calcula** (`chart-geometry`, `line-chart`, `bar-list`, `segmented-bar`, `income-expense-chart.mapper`): `Number()` só em `line-chart.component.ts:93` e `ratioForBar` para posicionar; valores exibidos são sempre a string do backend via `formatMoney`/`formatRatio`; o mapper repassa `p.income`/`p.expenses` sem tocar; nenhum `reduce`, soma, percentual, "variação" ou normalização no código de produção dos gráficos. O eixo Y mostra o texto do maior valor (seleção, não aritmética) e `0` (`line-chart.component.ts:146-158`). A geometria é pura (Fritsch-Carlson) e testada (monotonia, passa por todos os pontos, sem gradiente). Arredondar a largura a 2 casas (`bar-list.component.ts:188`) é só posição.
- **Honestidade**: "Perguntar à IA" é `aria-disabled`, sem handler, com dica própria (`workspace-header.component.html:41-50`), coberto por E2E (clique forçado não navega); chip "IA desligada" estático sem chamar endpoint; sem sino, sem nome, sem seletor de workspace; `.sidebar__logo-slot` e `.login__logo-slot` vazios; ícones do PWA são ladrilhos lisos; `/quick-add?mode=` é lido de fato pela página (`quick-add.page.ts:268`); itens `vault/ai/mcp/budgets` não entram na navegação (R8).
- **Acessibilidade dos gráficos**: `role="img"` com resumo, grupo focável com `aria-describedby` da dica de teclado, `←/→/Home/End/Esc`, região viva `polite` via `LiveAnnouncer`, `touch-action: pan-y`, `forced-colors`, estado final já no DOM, `revealOnEnter` degrada sem `IntersectionObserver` (jsdom, SSR) e com movimento reduzido, e o spec stuba `IntersectionObserver` para provar a revelação única.
- **Sidebar**: `role="group"` + `aria-labelledby` + título não focável; rótulo continua no DOM no modo recolhido; `aria-current="page"`; menu do avatar por `Menu` próprio (Esc, foco devolvido, `Tab`), sem `title`.
- **Layout**: janela só a partir de 1024 px, **sem** `overflow` oculto no contêiner, `sticky` sem ancestral com `overflow`, `safe-area` na barra inferior e no topo do mobile, `backdrop-filter` só na barra inferior, sombra grande só ≥ 1024 px.
- **Contraste** (conferi além da lista de 56): `text-muted` sobre cada `*-soft` 4,82 a 5,44:1; texto sobre `warning/risk/positive-soft` ≥ 12:1; `focus` sobre `surface` 5,43 (claro) e 5,64 (escuro); tooltip (`canvas` sobre `text`) 15 a 17:1; `chart-2` sobre `canvas` 3,51:1 e sobre `surface-muted` 3,57:1 (claro). Nenhum par importante falha.
- **Movimento**: `check-styles` agora barra duração literal e propriedades de layout em `transition` (FE-S-229); `transform` de pressão e hover só sob `prefers-reduced-motion: no-preference`; durações vão a 0 e o global zera `animation/transition-duration`.
- **Camadas e testes**: `lint:deps` sem violação (661 módulos); os specs de gráficos cobrem negativo, vazio, um ponto, idiomas e axe; E2E `charts` e `workspace-shell` cobrem teclado, mouse, toque, 375/768/1024/1280 e os dois temas.

## 3. Achados

### 🟠 Altos

**A1. Dados de demonstração dentro do bundle de produção, sem trava contra consumo sem rótulo**
`frontend/src/app/app.config.ts:75` (`provideReports()`), `modules/reports/infra/reports.providers.ts:12`, `modules/reports/infra/facades/reports-demo.facade.ts:12` (`providedIn: 'root'`), `modules/reports/mock-data/*`.
- Problema: `useExisting: ReportsDemoFacade` referencia a classe, então o bundler não faz tree-shake. Confirmei no build de produção existente: `dist/moneylog/browser/main-GNQPO4RV.js` contém `demo-housing`, `demo-food`, etc. (as fixtures, com a aritmética de centavos e de share que o `demo-support` admite fazer). Hoje nenhuma tela de produto consome a porta (verifiquei: só `features/dev/ui-kit`), mas qualquer componente que injete `ReportsGateway` em produção recebe dado fictício; `isDemo` é só um campo e **nada** (lint, teste, tipo) obriga o consumidor a rotular. Também é código "que calcula dinheiro" no app de produção, contrário à regra do projeto.
- Impacto: a fatia C (T201) é a próxima a injetar a porta; se o `useExisting` não for trocado no mesmo commit, o Início mostra "Moradia R$ 1.820,00" como se fosse dado real. Peso extra no bundle inicial.
- Correção: (a) prover a facade demo só nos builds `development`/`mock` (mesmo mecanismo do `dev-routes`: `fileReplacements` para `reports.providers.dev.ts`), e em produção prover uma implementação que falha de forma explícita ou devolve estado "indisponível" até T201; (b) remover o `providedIn: 'root'` da facade demo; (c) regra do `dependency-cruiser` proibindo importar `reports-demo.facade` e `mock-data/**` fora de `features/dev` e `modules/reports`; (d) E2E do projeto `prod` (ou um teste de build) que falha se `demo-housing` aparecer em `dist`; (e) um teste de contrato: quem renderiza dados de uma porta com `isDemo` precisa renderizar `t.charts.demo` (hoje o UI Kit escreve "Dados de demonstração" em português fixo, fora do i18n, `ui-kit-charts.component.ts`, e a chave `charts.demo` das três línguas está sem uso).

**A2. Sidebar recolhida (768 a 1199 px) não rola e perde itens em janelas baixas**
`sidebar.component.css:119-122` (`overflow: visible`) com `app-shell.component.css:72-76` e `:117-120` (`height: 100dvh` / `calc(100dvh - var(--space-6) * 2)`, `position: sticky`).
- Problema: no modo recolhido o `.sidebar` abre mão do `overflow-y: auto` para o rótulo-tooltip (`position: absolute; left: 100%`) sair da coluna. Somando as alturas (padding 32, marca 48, "Novo registro" 44, três grupos 267+141+99, rodapé com avatar 48, gaps 48) a coluna precisa de cerca de **727 px**. Abaixo disso (iPad paisagem com barra do Safari, notebook 1366×768 com janela entre 1024 e 1199 px de largura, janela de 1100×650) os itens finais (Importar extrato, Configurações) e o avatar com o menu **Sair** ficam fora da tela e, como a sidebar é `sticky`, a rolagem da página não os traz de volta. É estimativa por soma; nenhum E2E usa altura baixa.
- Impacto: itens de navegação inalcançáveis (WCAG 2.1.1, 1.4.10); "Sair" só chegaria por Configurações.
- Correção: manter `overflow-y: auto` também no modo recolhido e trocar o tooltip absoluto por `appTooltip` (balão no `body`, já existe e já cobre foco e hover), ou reduzir o ritmo vertical (altura 2,5 rem e gaps) e fazer o rodapé `position: sticky; bottom: 0`. Adicionar E2E em 1100×600 e 1024×640 verificando que "Configurações" e o avatar são clicáveis.

**A3. Anel de foco cortado nas ações rápidas do cabeçalho**
`workspace-header.component.css:61-71` (`.wh__actions { overflow-x: auto; padding-bottom: var(--space-1) }`) com `base.css:75-78` (foco = `box-shadow` de 4 px).
- Problema: `overflow-x: auto` torna `overflow-y` também não visível; o anel de 4 px do primeiro botão (esquerda e topo) e de todos (topo) é cortado, só há folga embaixo. Aparece em todas as telas (o cabeçalho está no shell).
- Impacto: foco visível parcialmente cortado em todas as rotas (WCAG 2.4.7/2.4.11), justamente nos controles mais usados.
- Correção: padding de 4 px em todos os lados do contêiner (com margem negativa igual para não mexer no layout) e `scroll-padding-inline`; ou desligar a rolagem horizontal ≥ 768 px (as quatro ações cabem) e deixá-la só no mobile. Adicionar teste que foca o primeiro botão e confere que o anel cabe no contêiner.

**A4. Alvos de toque abaixo de 44 px que deveriam ter**
- `line-chart.component.css:189-194` (`.lc__toggle { min-height: 2rem }`): o seletor de componente (especificidade 0,2,0) vence a regra global `@media (width <= 640px), (pointer: coarse) { .button { min-height: 2.75rem } }` (`utilities.css`), então "Ver como tabela" fica com 32 px no celular. É o controle que dá a alternativa acessível ao gráfico.
- `sidebar.component.css:66-69` (`.sidebar__link { min-height: 2.5rem }`) sem elevação em `pointer: coarse`: no tablet (768 a 1023 px, o caso de toque) cada item tem 40 px de altura; `wh__actions` já trata isso (`workspace-header.component.css:154-158`), a sidebar não.
- Correção: `min-height: 2.75rem` em `(pointer: coarse)` nos dois (o toggle também em `width <= 640px`); acrescentar ao E2E de tablet uma conferência de `boundingBox().height >= 44` com `hasTouch`.

### 🟡 Médios

**M1. `check-brand` não prova "um só lugar"** (`scripts/check-brand.mjs:49`). Só detecta `'moneylog'` entre aspas ou `>moneylog<`. Frases com a marca no meio passam: `pt.ts:269, 1822, 1823, 2060`, `es.ts:269, 1825, 1826` ("Guardado no servidor do moneylog"). Renomear `BRAND_NAME` deixa esses textos para trás. A guarda do logo (`:57-62`) só confere o `<span ...></span>` exato: um logo colocado por `background-image`/`::before` no CSS do slot passa; e nada confere que os SVG/PNG do PWA seguem sem marca. Correção: interpolar `BRAND_NAME` nessas frases (ou registrar uma lista de exceções), estender o regex a palavra inteira (`\bmoneylog\b`, ignorando a chave reservada de frontmatter) e checar `content:`/`background-image`/`url(` nos `.css` dos dois slots.

**M2. `.button--soft:hover` perde contraste** (`utilities.css:116-119`, `opacity: 0.88`): `accent` sobre `accent-soft` cai de 4,70/4,64 para ~3,9:1 nos dois temas durante o hover (conta feita com a mistura de 88% sobre `surface`). O mesmo vale para o avatar (`menu.component.ts`, `opacity: 0.85`, ícone: 3:1 ainda ok). Correção: escurecer o fundo (token `accent-soft-hover` sólido, par entrando no `check-contrast`) em vez de `opacity`.

**M3. Bordas de 1,13 a 1,24:1 (claro) e 1,46:1 (escuro) delimitam campos** (`tokens.css` `--color-border`, usado em `.input`, `.tabs`, `.button`). Bom para cartões decorativos, mas o limite de um campo precisa de 3:1 (1.4.11). O `check-contrast` não tem um par `border`/`surface`. Correção: token `--color-border-control` ≥ 3:1 para campos, ou garantir que o fundo do campo (`surface-muted`) o distinga, e acrescentar o par à guarda.

**M4. Tooltip por toque sem fechamento por toque fora** (`line-chart.component.ts:236-239`, `:277-279`). O comentário promete "some ao tocar fora", mas só há `blur`, que o Safari iOS não dispara ao tocar numa área não focável; também falta `pointercancel`. Resultado: tooltip preso depois de rolar a página. Correção: `pointercancel` e um `pointerdown` global no `document` enquanto `active() !== null` (e teste em WebKit com `hasTouch`).

**M5. Cabeçalho no tablet corta "Perguntar à IA"** (captura `768-claro-cartoes.png`). Nas telas que não são o Início, ações e chip dividem a linha; a rolagem horizontal está oculta (`scrollbar-width: none`), então o botão aparece truncado ("Pergunta") sem pista de que rola. Correção: quebrar a linha em 768 a 1023 px, ou reservar `min-width` e mostrar o chip abaixo; é o mesmo ajuste do A3.

**M6. Hierarquia do Início**: a saudação (20 px, `p`) fica sobre o `h1` "Início" (32 px) e as duas ações primárias competem (`Adicionar despesa` do cabeçalho e o `Adicionar conta`/`Adicionar cartão` da página, ambos azul cheio). O cabeçalho com quatro ações repete em **toda** tela, o que dilui a ação principal da página. O plano previu "saudação só no Início", mas a ordem visual (menor acima do maior) lê como erro. Decisão de UX para a fatia C: ou o `h1` vira a própria saudação, ou as ações do cabeçalho viram secundárias fora do Início.

**M7. Cobertura de fonte e de demonstração**: os dois testes de fonte reescritos provam a ordem da pilha (leitura de `getComputedStyle`, tautologia sobre o token) e que o Geist empacotado carrega do próprio domínio e é servido offline (`pwa.e2e.ts:162-168`); **deixa de ser provado** que o Geist de fato renderiza o texto onde a SF não existe (Linux/Windows). Aceitável, mas anotar como risco residual e, se houver CI Linux, afirmar `document.fonts.check` sem pedir o carregamento. Além disso, `reports.fixture.spec.ts` reimplementa a mesma aritmética da fixture para conferir a própria fixture (valor baixo; convém trocar por casos fixos escritos à mão).

**M8. Orçamento de 8 kB gz**: realista **só se o chunk for isolado**. Estimativa pelos fontes (ts 25 kB, html 6,5 kB, css 4,4 kB): `line-chart` + `chart-geometry` + `reveal` ≈ 3,5 a 4,5 kB gz; com `bar-list`, `segmented-bar` e o mapper ≈ 6,5 a 7,5 kB gz. Cabe, com pouca folga, e as chaves `charts.*` das três línguas vão no pacote de tradução (inicial) em qualquer cenário. O `angular.json` só tem orçamento `initial` (500 kB/1 MB) e `anyComponentStyle` (4/8 kB): **nada impõe os 8 kB**, e o CSS do `line-chart` tem 4.377 bytes de fonte (minificado deve ficar abaixo de 4 kB, margem pequena). Correção: medir quando a fatia C importar os gráficos e acrescentar um orçamento por chunk ou um script de tamanho no `lint`. Nota: o inicial atual (430 kB) já carrega as fixtures (A1).

### 🟢 Baixos

- `workspace-header.component.ts:75-77`: o `computed` da saudação só depende do idioma; a hora é lida uma vez (`new Date().getHours()` fica em cache), então um PWA aberto de manhã continua em "Bom dia" à noite. Só apresentação, mas lê errado; reavaliar na troca de rota (`url()`) ou a cada 30 min.
- `bar-list.component.ts:188` e o comentário de `:187` divergem: razão negativa vira largura 0 e ainda desenha um filete de 2 px (`min-width: 2px`, em tom de risco), o comentário diz "não desenham barra". Trocar por `bar = null` quando `bar <= 0`, ou ajustar o texto.
- `ul` com `list-style: none` perde a semântica de lista no VoiceOver/WebKit (`base.css`, também nas barras e na sidebar): acrescentar `role="list"`.
- `line-chart`: o eixo Y não rotula o valor mínimo quando há ponto negativo (por regra do plano, 5a); o tooltip e a tabela cobrem. A animação usa `clip-path`, que o ADR-011 §4 não lista (só `transform`, `opacity`, `box-shadow`, `grid-template-rows`) e o `check-styles` não barra (blocklist, não allowlist). Em captura de página inteira, um gráfico fora da viewport sai recortado (`pending`); as evidências foram por elemento.
- `base.css:75-78`: o foco é só `box-shadow`, invisível em `forced-colors` (só o `Menu` tem fallback); preexistente, mas a sidebar e os botões novos herdam.
- es: "Añadir gasto/ingreso" × "Agregar cuenta/tarjeta" (inconsistência de verbo).
- "Perguntar à IA" desabilitado não dá retorno ao toque (a dica só vem por foco, hover ou pressão longa). Aceitável pela decisão do dono; o item 🟡 da revisão do plano (omitir em vez de desabilitar) segue com o Produto.
- Ícones do PWA em `#F6F4F1` (tom de `surface-muted`) ficam quase invisíveis sobre telas iniciais claras; decisão do dono, só registrar.

## 4. Avaliação visual das capturas

- **Composição e "app de Mac"**: boa. Janela de 28 px sobre canvas cinza `#f2f2f5`, sidebar `surface-muted` com grupos em sentence case, item ativo em tinta azul, avatar discreto, bordas finas e sombra quase invisível. No escuro o degrau canvas, janela e sidebar funciona e a hierarquia se mantém (`1280-escuro-configuracoes`). Não tem cara de banco: sem gradientes, sem saturação, tom calmo.
- **Densidade e hierarquia**: ainda vazia, porque a fatia C não existe: o Início mostra título e estado vazio. A saudação menor sobre o `h1` maior e as duas ações azuis competindo (M6) enfraquecem a hierarquia. O cabeçalho com quatro ações em toda tela é pesado para telas de cadastro.
- **Detalhes**: o espaço do logo vazio deixa um recuo de ~24 px antes de "moneylog" que lê como desalinhado (decisão do dono, mas visível); no menu do perfil o balão cobre "Importar extrato" e o avatar fica pequeno no canto; a linha de ações no tablet corta o último botão (M5).
- **Gráficos** (`1280-escuro-graficos`): legíveis, com entradas em azul e saídas tracejadas com marcador quadrado (a diferença não é só de cor); a curva de 30 dias com dados de demonstração fica em picos finos (um salário domina a escala e achata o resto, honesto mas pouco informativo), o `0` do eixo encosta na linha, o tooltip cobre a série e o gráfico de um ponto gasta altura demais. Barras de categoria e barra segmentada boas, com valor e percentual em texto. O selo "Dados de demonstração" está bem destacado (e deve ser obrigatório, A1).
- **Mobile 375**: coerente, sem rolagem horizontal, chip e avatar no topo, ações em fileira rolável que mostra a quarta cortada (pista de rolagem natural), barra inferior preservada.

## 5. Riscos

- Fatia C trocar a porta sem remover a facade demo (A1).
- Navegação inalcançável em janelas baixas (A2) passa nos E2E atuais porque eles usam 800 px ou mais de altura.
- Cabeçalho global repetindo ações em todas as telas cresce em peso quando "Perguntar à IA" e a busca (T209) entrarem.
- 18 testes sem veredito por sobrecarga da máquina.

## 6. Pendências por dono

- **Dev-frontend**: A1 a A4, M1 a M5, M7, M8, baixos.
- **UX**: M6 (hierarquia do cabeçalho e do Início), M3 (token de borda de controle), espaço vazio do logo.
- **Produto**: manter ou omitir "Perguntar à IA" (revisão do plano), ícones do PWA claros demais.
- **Arquitetura**: regra do `dependency-cruiser` e orçamento por chunk (A1, M8).
- **Tester**: E2E de altura baixa (A2), toque com `boundingBox >= 44` (A4), repetir `ng test` com a máquina livre, teste de prod que falha se houver `demo-` no `dist` (A1).

## 7. Parecer

**🟡 Aprovado com ajustes.** Nenhum 🔴: não há cálculo financeiro no front, nada finge funcionar, o contraste e a guarda de movimento estão sólidos e as suítes que mudaram "de propósito" continuam cobrindo o essencial. Os 🟠 A1 a A4 voltam ao dev-frontend; **A1 precisa estar resolvido antes de T201** (fatia C), os demais antes do fechamento da fatia A. Não aprovei por educação: o A1 é um vazamento real de dado fictício e de aritmética de dinheiro para o bundle de produção, comprovado no `dist`.
