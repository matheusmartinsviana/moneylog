# QA · T196 · Redesign workspace, fatia A (tokens, casca, microinterações, gráficos)

Plano: `docs/planos/2026-10-10-redesign-workspace.md` (T191 a T195, gráficos de `/dev/ui-kit`).
Escopo: **só frontend**. Nenhum código de produção foi alterado; não subi backend nem Docker, não rodei `e2e:integration` nem `api:types`.
Navegadores: Chromium (mock e prod) e WebKit (iPhone 14 e Safari desktop, projetos do repositório, mais sondagens manuais em WebKit).
Evidências: `docs/qa/evidencias/redesign/qa/` (26 capturas). Teste novo: `frontend/e2e/qa-redesign-fatia-a.e2e.ts`.

## 1. Resumo

A casca nova está sólida no caminho feliz: nenhuma rolagem horizontal de 320 a 1920 px (inclusive 1023/1024 e 1199/1200) nas rotas testadas e em pt, en e es; transições de breakpoint corretas; ordem de Tab coerente; menu do avatar com `Esc`, foco devolvido e `aria-expanded`; `aria-current` único; axe limpo em **todas** as rotas, claro e escuro, em 375 e 1280 px; `data-theme` vence o sistema nos dois sentidos; safe-area correta (simulada); PWA com ícones lisos; nenhum logo, nenhuma imagem de marca e nenhum dado de demonstração em tela de produto.

Os problemas que os testes do dev não pegam estão em três frentes: **altura de tela baixa** (sidebar recolhida corta itens e o avatar, sem rolagem), **forced-colors** (o foco de teclado some e o item ativo da navegação não se distingue) e **acabamentos** (anel de foco cortado, `theme-color` ignorando o tema escolhido, tooltip e rótulos do gráfico em casos de borda).

**Bugs: 0 🔴 · 2 🟠 · 5 🟡 · 5 🟢.** Parecer: **🟡 Aprovado com ressalvas** (os dois 🟠 voltam ao dev-frontend antes do T197).

## 2. Resultado das suítes (real, nesta máquina)

A máquina esteve com load average de 20 a 38 durante toda a validação (testes do dev-backend com Java/Docker em paralelo). Isso causou timeouts que **não** são defeito do código; registro como foram.

| Suíte | Resultado |
|---|---|
| `npm run lint` (ng lint, check-styles, check-brand, check-native-controls + teste, check-contrast) | verde: "All files pass linting", 56 pares ≥ 4,5:1 nos dois temas, 11/11 do teste de controles nativos |
| `npm run typecheck` | verde |
| `npm run format:check` e `npm run lint:deps` | verde (661 módulos, nenhuma violação) |
| `ng build` (produção) | verde; inicial 430 kB bruto / 113 kB transferido |
| `npm test` (unitário, 191 arquivos, 2.424 testes) | **1ª execução, com a máquina saturada: 2.406 passaram, 18 falharam por `Test timed out` (20 a 30 s)** em 9 arquivos (app-shell, home, ui-kit, quick-add etc.). Reexecutei esses 9 arquivos: 7 passaram; 2 ainda deram timeout sob carga; reexecutados à parte, **os 9 passam** (323 + 60 testes). Resultado final: 2.424/2.424 passaram, mas **sem uma única execução limpa de ponta a ponta** |
| `npm run e2e` (mock + prod + webkit-iphone + webkit-desktop, `--workers=3`) | **601 passaram, 77 ignorados (`skip` por projeto), 1 falhou em 20,7 min.** A falha foi `markdown-worker.e2e.ts` (prod, markdown hostil de 200 KB, travamento medido de 6,6 s contra o limite de 1 s) sob load 38; reexecutado sozinho: **10/10 passam** (maior travamento 276 ms). Não relacionado ao redesign |
| Meu arquivo `qa-redesign-fatia-a.e2e.ts` | mock e prod: **59 passaram + 9 ignorados** (os de gráfico dependem de `window.ng`, só existe no mock). 12 testes por projeto estão marcados `test.fail` para bugs abertos (seção 4); com `QA_SHOW_BUGS=1` todos falham pelo motivo documentado (confirmado) |

## 3. Casos executados

### 3.1 Aprovados

- **Layout:** rolagem horizontal ausente em 320, 375, 390, 414, 768, 820, 1023, 1024, 1180, 1199, 1200, 1280, 1440 e 1920 px em `/`, `/transactions` e `/settings`; varredura de todos os elementos fora da viewport em 13 larguras × 16 rotas (Chromium) e 8 larguras × 5 rotas (WebKit): nenhum. 1023→1024 liga a janela (raio 28) e 1199→1200 expande a sidebar (72→248), sem recarregar. Sidebar `sticky` correta (≥ 1200 rola por dentro; janela cresce com o conteúdo).
- **Idiomas:** en e es a 320 px, em todas as 14 rotas, sem rolagem horizontal e sem chave de i18n crua.
- **Barra inferior e safe-area:** com `env(safe-area-inset-*)` simulado (34 px embaixo, 47 px em cima), a barra ocupa 713 a 812, o conteúdo termina em 682 (nada atrás da barra) e o `padding-top` da janela vira 47 px. Teste automatizado de "fim da página acima da barra" em 4 rotas.
- **Temas:** `data-theme` vence o sistema nos dois sentidos; troca em tempo de execução repinta `body` (`#f2f2f5`/`#0e0e10`) e janela (`surface`); sem escolha, segue o sistema; `surface` mais clara que `canvas` no escuro.
- **Teclado:** ordem de Tab = skip-link, marca, "Novo registro", 11 itens da sidebar na ordem dos grupos, avatar, 4 ações rápidas, conteúdo, barra inferior (mobile). Menu do avatar (desktop e mobile): `Enter` abre com foco no 1º item, setas circulam, `Esc` fecha e devolve o foco ao botão, `aria-expanded` alterna. `aria-current="page"` único (também em `/settings/categories` e `/quick-add?mode=income`).
- **axe:** 0 violações em 16 rotas (13 + `/settings/categories` + `/dev/ui-kit` + não encontrada) × claro/escuro × 375/1280 (e 820 nas sondagens). Menu do avatar aberto (desktop, claro e escuro): só a exceção conhecida `region` do popover no portal (ver 5.4).
- **Honestidade da UI:** "Perguntar à IA" é `aria-disabled`, o clique não navega nem abre nada, o tooltip aparece no foco; chip "IA desligada"; nenhum texto "demonstração"/"demo"/"FinVault" em nenhuma rota de produto; `sidebar__brand` sem `img`/`svg`, wordmark = `BRAND_NAME` (`moneylog`), `<title>` com `moneylog`.
- **PWA:** manifest com 5 ícones; PNGs lisos (maskable e apple-touch: 1 cor sólida `#F6F4F1`, sem alfa; `any`: ladrilho liso com cantos transparentes), `background_color`/`theme_color` `#f2f2f5` = `canvas` claro, metas `theme-color` com os dois `canvas`; suíte `pwa.e2e.ts` verde em prod.
- **Gráficos (UI Kit):** zero e série vazia → estado vazio honesto (nenhuma linha reta); um ponto (positivo e negativo), todos iguais, só negativos, mistos, minúsculos (0,01), enormes (`99999999999999.99`), texto/vazio/`1e400` → nenhum `NaN`/`Infinity` nos caminhos e a tabela equivalente com todas as linhas; 400 pontos e 1000 pontos (limitado a 400 linhas) em ≤ 1,3 s; eixo Y mostra o texto do backend do maior valor; teclado (`←/→/Home/End/Esc`) anuncia na região viva e `Esc`/`Tab` escondem o tooltip; redimensionar de 1280 a 320 px com o tooltip aberto mantém o ponto e não gera rolagem; tabela abre pelo botão e tem `caption`; com `reduced-motion` o traço nasce revelado (sem `is-pending`, transição ≈ 0).
- **Regressão de fluxos:** login/Contas/Movimentações/Cartões/Metas/Notas/Configurações continuam alcançáveis e usáveis na casca nova (suíte e2e completa verde, `data-cy` e rotas intactos).

### 3.2 Reprovados (bugs na seção 4)

BUG-QA-01, 02, 04, 05, 06a, 06b, 07, 08 reproduzidos em teste; BUG-QA-03, 09, 10, 11, 12 reproduzidos por sondagem e captura (sem teste, ver "Testes adicionados").

## 4. Bugs

### 🟠 BUG-QA-01 · Sidebar recolhida corta itens e o avatar em telas baixas, sem rolagem (front)
- **Passos:** abrir qualquer rota em 844×390 (iPhone paisagem), 932×430, 1024×600 ou 1180×600; tentar chegar a Planejamento, Notas, Pessoas, Insights, Importar, Configurações ou ao avatar (Sair).
- **Esperado:** todo item da navegação alcançável (sidebar rolável como a expandida, que tem `overflow-y: auto`).
- **Obtido:** abaixo de 1200 px `.sidebar` é `overflow: visible` e a coluna é `sticky` com altura da viewport; o excedente fica fora da tela e a página não o traz de volta. Em 844×390 somem 7 de 14 itens (planning, notes, people, insights, import, settings, profile); em 1024×600 e 1180×600 somem import, settings e profile. O foco por teclado em `sidebar-settings` não rola (`top` 547 numa viewport de 390). Em ≥ 768 px não há barra inferior nem avatar no cabeçalho, então **Configurações e Sair ficam inalcançáveis** nessa altura (zoom do navegador em 125 a 150 % em notebook cai no mesmo caso). Reproduz em WebKit.
- **Evidência:** `paisagem-844x390.png`, `paisagem-932x430.png`, `paisagem-1024x600.png`, `sidebar-short-1180x600.png`; teste `BUG-QA-01 · …` (4 casos). Causa: `sidebar.component.css` (`@media (width < 1200px) { .sidebar { overflow: visible } }`, necessário hoje para o tooltip do rótulo recolhido).
- **Sugestão:** rolagem vertical na sidebar recolhida e tooltip por portal/`position: fixed`, ou mostrar a barra inferior em paisagem baixa.

### 🟠 BUG-QA-06a · Foco de teclado invisível em `forced-colors` (Windows alto contraste) (front, global)
- **Passos:** emular `forced-colors: active`, `Tab` por qualquer tela.
- **Esperado:** indicador de foco visível (outline do sistema).
- **Obtido:** `base.css` define `:focus-visible { outline: none; box-shadow: var(--focus-ring) }`; em `forced-colors` o `box-shadow` é descartado e nada o substitui, então o foco some em **todo** o app (WCAG 2.4.7). Computado: `outline-style: none`, `box-shadow: none`. Vários componentes têm blocos `forced-colors` próprios para outras coisas (progress, tabs, gráfico), mas o foco não.
- **Evidência:** `forced-colors-foco-1280.png` (item "Início" focado sem indicação); teste `BUG-QA-06a`.
- **Sugestão:** em `@media (forced-colors: active)`, `:focus-visible { outline: 2px solid CanvasText/Highlight; outline-offset: 2px }`. (Defeito anterior ao redesign, mas é a casca nova que o torna central.)

### 🟡 BUG-QA-02 · Anel de foco das ações rápidas é cortado (front)
- **Passos:** `Tab` até "Adicionar despesa" em qualquer rota ≥ 768 px (ou "Adicionar despesa" no Início mobile).
- **Obtido:** `.wh__actions` usa `overflow-x: auto` (que força `overflow-y` não visível) sem folga em cima e à esquerda; o anel de 4 px do 1º botão é cortado em cima e à esquerda, e o dos demais em cima. Teste: `top` cortado nas 4 ações, `left` na 1ª.
- **Evidência:** `focus-first-action-1280.png`; teste `BUG-QA-02`.
- **Sugestão:** `padding: 4px` com margem negativa equivalente, ou `outline-offset` interno nas ações dessa fileira.

### 🟡 BUG-QA-03 · Anel de foco cortado nos filtros de Movimentações (front, anterior ao redesign)
- **Obtido:** `filter-search` (e outros) dentro de `disclosure__inner` (`overflow: hidden`) perdem a borda esquerda/direita do anel. Varredura automática (todo foco com ancestral `overflow` ≠ visible) também listou SegmentedControl e Tabs, que usam anel interno por desenho e **não** conto como bug.
- **Evidência:** `focus-filter-search-1280.png`. Sem teste (o ajuste depende do desenho do Disclosure).

### 🟡 BUG-QA-04 · `theme-color` ignora o tema escolhido pelo usuário (front)
- **Passos:** sistema claro e tema "escuro" nas Configurações (ou o inverso), abrir como PWA/Safari.
- **Obtido:** as duas metas têm `media="(prefers-color-scheme: …)"` e nada as atualiza; a meta efetiva é `#f2f2f5` com o app escuro (barra de status/título claro sobre app escuro). `manifest.theme_color` é fixo claro.
- **Evidência:** teste `theme-color acompanha o tema ESCOLHIDO` (falha com `#f2f2f5` esperado `#0e0e10`), `tema-os-claro-pref-escuro.png`.
- **Sugestão:** o `ThemeService` reescreve as metas (sem `media`) ao aplicar a preferência.

### 🟡 BUG-QA-06b · Item ativo da navegação indistinguível em `forced-colors` (front)
- **Obtido:** o item ativo só muda fundo (`accent-soft`) e cor; em `forced-colors` ficam iguais aos demais (mesma cor, sem borda, sem sublinhado, fundo = canvas). Só o `aria-current` o diferencia. Vale para sidebar e barra inferior.
- **Evidência:** `forced-colors-foco-1280.png`, teste `BUG-QA-06b`.
- **Sugestão:** `forced-colors`: borda ou `outline` no `.is-active` (ou `font-weight`/barra lateral).

### 🟡 BUG-QA-07 · Cabeçalho do Início estoura a largura com fonte a 200 % em tela estreita (front)
- **Passos:** 320 px (e es também em 375 px), `html { font-size: 200% }`, rota `/`.
- **Obtido:** `.wh__status` (chip "IA desligada/desactivada" + avatar) não encolhe nem quebra; `scrollWidth` 363/320 (pt), 390/320 e 390/375 (es). Em en não estoura. Também estouram em 200 %, em componentes anteriores ao redesign: abas de `/goals`, `/cards`, `/accounts`, `/people`, seletor de visão de `/transactions` e estado vazio de `/goals`.
- **Evidência:** `fonte200-es-375-inicio.png`; testes `BUG-QA-07` (pt e es).
- **Sugestão:** `flex-wrap`/`min-width: 0` em `.wh__status` (o chip pode ir para a linha de baixo).

### 🟡 BUG-QA-09 · Borda de campos com 1,24:1 (WCAG 1.4.11) (front/DS)
- `--color-border` `#e7e4df` sobre `surface` `#fdfcfa` = **1,24:1** no claro e 1,46:1 no escuro; `.input` e os seletores usam essa borda como único limite do campo. O `check-contrast` só confere texto e gráficos, não a borda de componente (exigência de 3:1). Visível em `focus-filter-search-1280.png`. É decisão do DS 02 ("borda como principal separador"); registro para o dono decidir (um token `--color-border-strong` só para controles resolveria).

### 🟡 BUG-QA-10 · Teste de microinteração passa pelo motivo errado e o efeito não existe em nenhum cartão (teste/front)
- `workspace-shell.e2e.ts` ("o botão pressionado encolhe… e o cartão interativo sobe") só faz regex no texto da folha de estilo: nunca passa o mouse num cartão. Além disso `SectionContainer[interactive]` (`.lift`) e `.row-hover` **não são usados por nenhuma tela** (grep em `app/`): o critério T195-1 ("cartão sobe ≤ 2 px e ganha sombra") não tem elemento real que o exiba. O de pressão (`.button:active`) e o de movimento reduzido são testados de verdade.

### 🟢 BUG-QA-05 · Tooltip do gráfico passa 3,8 px da viewport em 320 px
- `flip` só a partir de 55 % do gráfico; em 320 px, no meio, a caixa de 148 px chega a x = 323,8 e é cortada (WCAG 1.4.10, reflow). Em 375 px a caixa sai do gráfico mas cabe na tela. Teste `BUG-QA-05`.

### 🟢 BUG-QA-08 · Rótulos longos do eixo X se sobrepõem
- Rótulos `nowrap` em porcentagem, sem truncar nem reduzir marcas: com 5 pontos e rótulo de 40 caracteres, a marca 2 começa 223 px antes do fim da 1ª; pontas vazam. Rótulos reais (`11 de set.`, `out. 2026`) cabem, então é risco para es/en com mês por extenso. Evidência `chart-long-labels.png`; teste `BUG-QA-08`.

### 🟢 BUG-QA-11 · Gráfico: escala negativa sem rótulo; valor máximo muito largo cobre a curva
- Só há "máximo e zero": séries só negativas mostram apenas "0" e séries mistas não rotulam o menor valor (`chart-all-neg.png`, `chart-mixed-sign.png`). Um máximo de 18 dígitos (`R$ 123.456.789.012.345,67`) ocupa 158 px sobre o início da curva (`chart-huge.png`). Honesto (nada inventado), mas pouco informativo.

### 🟢 BUG-QA-12 · `.button--soft:hover` cai a 3,87:1
- `opacity: 0.88` no botão inteiro faz `accent` sobre `accent-soft` descer de 4,70 para 3,87:1 (claro; 3,92 no escuro) durante o hover, texto de 13 px. Calculado, não visível no `check-contrast`. Também `button--primary:hover` (opacity .92) mantém 4,83:1, ok.

## 5. Observações, riscos e pendências

1. **Contraste fora do `check-contrast` (calculado):** texto sobre `*-soft` ok (≥ 4,82 muted sobre accent-soft; text ≥ 12:1 sobre as demais); `on-accent` sobre `accent` 5,57/6,33; `chart-2` sobre `surface` ≥ 3:1 nos dois temas (3,51 sobre canvas, o pior caso, claro); `accent` sobre `surface-muted` 5,07/4,75. Desabilitado (opacity .55) é isento por WCAG, mas "Perguntar à IA" fica em ~3,8:1; o texto "Disponível em breve" (muted) passa.
2. **Risco para as fatias seguintes (dado de demonstração em produção):** `provideReports()` liga `ReportsGateway` à `ReportsDemoFacade` (`isDemo = true`) **em todos os ambientes**; o build de produção contém a facade e as fixtures no `main-*.js`. Hoje nenhuma tela usa o gateway (só o UI Kit), então não há dado falso em tela de produto; quando o Início (T201+) consumir o gráfico, o rótulo `charts.demo` precisa ser obrigatório e o provider trocado por HTTP. Sugiro um teste que falhe se `isDemo` chegar a uma rota fora de `/dev`.
3. **Não verificado (limitação do ambiente):** leitor de tela real (VoiceOver/NVDA/TalkBack; só validei a árvore de acessibilidade, `aria-*` e a região viva), Windows alto contraste real (usei a emulação `forced-colors` do Chromium), iPhone físico (safe-area simulada por substituição de `env()`), toque real no gráfico (o Chromium deu `tap`, o WebKit não foi exercitado nos gráficos), `prefers-contrast`, impressão. A saudação por hora (`Bom dia/Boa tarde/Boa noite`) depende do relógio do aparelho (aceito no plano).
4. **Exceção conhecida:** o popover do menu/Select no portal do `body` gera `region` (moderate) no axe; `ui-kit.e2e.ts` já a filtra, e meu teste do menu aberto aplica o mesmo filtro. Não é regressão.
5. **Menu do avatar (desktop):** `Tab` com o menu aberto fecha o menu e o foco permanece no botão (um `Tab` "consumido"); no mobile o foco segue para o botão de fechar da folha. Comportamento aceitável, só registro.
6. **Estabilidade da máquina:** a suíte unitária e o e2e dependem de tempo; com load > 20 há falsos negativos (18 timeouts unitários, 1 travamento de worker). Recomendo repetir a execução limpa quando o backend não estiver rodando testes.
7. **Evidência visual do dev** (`docs/qa/evidencias/redesign/`, 28 capturas) confere com o comportamento; o espaço vazio do logo (24 px) deixa o wordmark recuado, o que é intencional (decisão do dono, `brand.ts`).

## 6. Testes adicionados

- `frontend/e2e/qa-redesign-fatia-a.e2e.ts` (35 testes por projeto; roda em `mock` e `prod`, 9 só no `mock`):
  - layout: 14 larguras × 3 rotas, transições 1023/1024 e 1199/1200, en/es a 320 px (14 rotas), fim da página acima da barra inferior;
  - teclado e foco: ordem de Tab, `aria-current`, menu do avatar desktop, axe com o menu aberto (claro e escuro), honestidade da UI (sem demonstração, sem logo, IA inerte);
  - temas: `data-theme` × sistema × troca em runtime;
  - axe em todas as rotas × claro/escuro × mobile/desktop;
  - gráficos (mock): vazio, um ponto, iguais, negativos, mistos, minúsculos, enormes, inválidos, 400/1000 pontos, eixo com texto do backend, teclado e região viva, resize, movimento reduzido;
  - `test.fail` (bugs abertos, referência `BUG-QA-xx` na mensagem): 01 (×4), 02, 04, 05, 06a, 06b, 07 (×2), 08. Rodar com `QA_SHOW_BUGS=1 npx playwright test qa-redesign-fatia-a --project=mock` mostra a falha real de cada um; quando o dev corrigir, o Playwright acusa "passou inesperadamente" e a marca sai.
- Sem teste (sondagem + captura): BUG-QA-03, 09, 10, 11, 12.
- Scripts de sondagem temporários ficaram só no scratchpad da sessão (não versionados).

## 7. Parecer

**🟡 Aprovado com ressalvas.** Todos os critérios do T196 (lint, typecheck, unitário, e2e nos quatro projetos, axe claro/escuro desktop e 375 px, teste de teclado da sidebar e do menu, capturas para o dono) estão atendidos, e não há 🔴. Os dois 🟠 (**BUG-QA-01**: navegação cortada em telas baixas e em paisagem de celular; **BUG-QA-06a**: foco invisível em alto contraste) devem voltar ao dev-frontend antes de o revisor (T197) fechar a fatia; os 🟡 (02, 03, 04, 06b, 07, 09, 10) podem ser tratados na mesma passada ou entrar no backlog da fatia B; os 🟢 não bloqueiam.
