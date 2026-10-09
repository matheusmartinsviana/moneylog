# `src/styles`

Estilos globais, carregados pelo `angular.json` nesta ordem:

| Arquivo          | Conteúdo                                                                                                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokens.css`     | **única** fonte de cores, tipografia, raios, sombras, espaçamento e movimento (DS 00, arquitetura §5.4)                                                                          |
| (Fontsource)     | Geist e Geist Mono variáveis, self-hosted a partir de `node_modules` (sem CDN)                                                                                                   |
| `typography.css` | escala 12/13/15/17/20/24/32 e a classe `.num` (`tabular-nums` + `"tnum"`); 10px (`--text-tab`) só na barra inferior                                                              |
| `base.css`       | reset, foco visível e `prefers-reduced-motion`                                                                                                                                   |
| `utilities.css`  | `.visually-hidden`, `.surface`, `.button` (`--primary`, `--soft`), `.lift`, `.row-hover`, `.field` (`__label`, `__hint`), `.input`, `.select`, `.ledger` (lista de valores, T19) |

Tema: `:root` é o claro; `@media (prefers-color-scheme: dark)` aplica o escuro quando não há escolha
manual; `[data-theme="light|dark"]` (gravado pelo `ThemeService`) vale contra o sistema.

## Redesign "workspace" (DS 02, ADR-011)

- **Paleta (escala Tailwind zinc/teal/green/amber/rose):** claro com `canvas` off-white neutro (`#f4f4f2`) e cartões
  `surface` brancos (`#ffffff`); escuro com `canvas` `#0b0b0d` e `surface` `#161618` (cinzas neutros, sem preto puro, mais
  clara que o canvas). Acento teal (`#0f766e` claro / `#2dd4bf` escuro); positivo verde (`#15803d` / `#4ade80`), alerta âmbar
  (`#a85108` / `#fbbf24`), risco rose (`#be123c` / `#fb7185`). Tema escolhido no alternador do cabeçalho (Sistema, Claro, Escuro).
- **Tintas `*-soft`** (`accent`, `positive`, `warning`, `risk`): **hex sólido** (10% do tom sobre `surface` no claro, 14% no
  escuro) porque `check-contrast` só lê `#rrggbb` e uma tinta translúcida mudaria de contraste conforme o fundo. Dois pares
  que a revisão apontou como falha (`accent` sobre `accent-soft` em `surface-muted`, 4,40:1; `accent` a 18% no escuro,
  4,35:1) deixam de existir por esse desenho.
- **Gráficos:** `--color-chart-1` (acento) e `--color-chart-2` (neutro quente), conferidos a ≥ 3:1 (WCAG 1.4.11) sobre
  `surface` e `surface-muted`. Série 2 sempre tracejada: a diferença nunca é só de cor.
- **Bordas:** `--color-border` é decorativa (cartões, divisores). Campos e controles interativos usam `--color-control-border` (>= 3:1, WCAG 1.4.11; FE-S-236). `--color-accent-soft-hover` é o hover sólido do `.button--soft`.
- **Raios:** `--radius-window` 28px, `--radius-card` 20px, `--radius-panel` 24px, `--radius-control` 12px. **Sombras:**
  `--shadow-1`, `--shadow-2`, `--shadow-window` (todas por `--color-shadow*`, opacidade ≤ 12% no claro).
- **Tipografia:** `--font-sans` começa em `-apple-system`/SF e mantém o Geist como fallback; `--text-kpi` 28px e
  `--text-display` 32px; `.num` e `.num-kpi` são tabulares.
- **Movimento:** `--duration-fast` 180ms, `--duration-base` 240ms, `--duration-slow` 300ms, `--ease-emphasized`.
  `prefers-reduced-motion` zera as três durações e os efeitos de `transform` (hover do `.lift`, pressão do `.button`) só
  existem em `@media (prefers-reduced-motion: no-preference)`.
- **Casca:** `--window-max-width` 90rem. A janela flutuante só existe a partir de 1024 px e a página rola (ADR-011).

## Tela sucinta (ADR-011, 2026-10-15)

Toda tela tem **um propósito principal**: acima da dobra ficam só o título, de 1 a 3 números ou ações-chave e a lista
principal; o secundário vai para "Mais" (`app-disclosure` fechado, chave `brief.more`), abas ou páginas internas, os
filtros ficam recolhidos e os textos de ajuda são curtos. Sem blocos redundantes e sem tirar funcionalidade: o que sai de
uma tela tem de continuar acessível em outra.

- **Cabe na tela.** `<app-page-layout fit>` faz a página ocupar exatamente a altura da janela (`100dvh` por `flex`/`grid`
  com `min-height: 0`, **sem altura fixa em px**, com a safe-area do iPhone). A cadeia é `body` > `app-root` > `app-shell` >
  janela > página; `body:has([data-fit-page])` fixa `height: 100dvh` e a faixa do modo demo entra no fluxo, então nada soma
  `100dvh` mais uma faixa acima. O Início é a página mais estrita: **não rola** em 1280×720, 1440×800 e 390×844.
- **Lista longa rola dentro do painel.** Em páginas com muitas linhas (Movimentações, Notas, Pendentes, Recorrências,
  Notificações, Vault...) use `.fit-stack` (pilha que enche a altura) com `.fit-scroll` na lista: o que vem antes (abas,
  filtros, resumo) fica fixo e a lista rola com a barra fina do app. `position: relative` nesses contêineres contém os
  elementos só para leitores de tela (`.visually-hidden` é `absolute` e, sem isso, aumenta a altura da página).
- **Densidade.** `--page-pad-top`, `--page-pad-bottom` e `--page-gap` são curtos; `SectionContainer` tem `dense`
  (menos respiro), `fill` (ocupa a altura do pai) e `scroll` (corpo rola dentro do painel).
- **Teste.** `e2e/fit-screen.e2e.ts` abre o Início em 1280×720, 1440×800 e 390×844, nos temas claro e escuro, em
  português, nos projetos `mock`, `prod` e `demo`, e falha se `document.documentElement.scrollHeight > innerHeight`, se a
  página rola na horizontal, se algum elemento do conteúdo tem corte ou rolagem horizontal ou se o painel do Início
  precisou de rolagem própria. Tela nova sucinta entra nesse teste.

Regras verificadas no `npm run lint`:

- `scripts/check-styles.mjs`: nenhuma cor literal (hex/rgb/hsl) fora de `tokens.css` e nenhum gradiente literal fora dele (gradientes só como token `--gradient-*`, usados por `var()`),
  `theme-color`/manifest iguais ao `--color-canvas` e **movimento**: toda `transition`/`animation` usa duração por
  token (`--duration-*`; laços `infinite` de esqueleto são a exceção) e nenhuma transição anima `width`, `height`,
  `top`, `left`, `right`, `bottom`, `inset`, margens, `padding` nem `all` (exceção documentada: o preenchimento da
  `ProgressBar`, que é o próprio dado).
- `scripts/check-contrast.mjs` (`npm run contrast`): texto ≥ 4,5:1 (inclusive `accent`/`positive`/`warning`/`risk` sobre a
  própria tinta) e séries dos gráficos ≥ 3:1, nos dois temas.
- `scripts/check-brand.mjs`: a marca (`BRAND_NAME`) vive em um lugar só e os espaços de logo continuam vazios.

## Contraste (WCAG AA)

Gerado por `npm run contrast`.

| Tema   | Texto                    | Fundo                       | Contraste | AA (4,5:1) |
| ------ | ------------------------ | --------------------------- | --------- | ---------- |
| claro  | `text` #18181b           | `canvas` #f4f4f2            | 16.09:1   | ok         |
| claro  | `text` #18181b           | `surface` #ffffff           | 17.72:1   | ok         |
| claro  | `text` #18181b           | `surface-muted` #f4f4f5     | 16.12:1   | ok         |
| claro  | `text-muted` #52525b     | `canvas` #f4f4f2            | 7.02:1    | ok         |
| claro  | `text-muted` #52525b     | `surface` #ffffff           | 7.73:1    | ok         |
| claro  | `text-muted` #52525b     | `surface-muted` #f4f4f5     | 7.03:1    | ok         |
| claro  | `accent` #0f766e         | `canvas` #f4f4f2            | 4.97:1    | ok         |
| claro  | `accent` #0f766e         | `surface` #ffffff           | 5.47:1    | ok         |
| claro  | `accent` #0f766e         | `surface-muted` #f4f4f5     | 4.98:1    | ok         |
| claro  | `positive` #15803d       | `canvas` #f4f4f2            | 4.55:1    | ok         |
| claro  | `positive` #15803d       | `surface` #ffffff           | 5.02:1    | ok         |
| claro  | `positive` #15803d       | `surface-muted` #f4f4f5     | 4.56:1    | ok         |
| claro  | `warning` #a85108        | `canvas` #f4f4f2            | 4.96:1    | ok         |
| claro  | `warning` #a85108        | `surface` #ffffff           | 5.46:1    | ok         |
| claro  | `warning` #a85108        | `surface-muted` #f4f4f5     | 4.97:1    | ok         |
| claro  | `risk` #be123c           | `canvas` #f4f4f2            | 5.71:1    | ok         |
| claro  | `risk` #be123c           | `surface` #ffffff           | 6.29:1    | ok         |
| claro  | `risk` #be123c           | `surface-muted` #f4f4f5     | 5.72:1    | ok         |
| claro  | `on-accent` #ffffff      | `accent` #0f766e            | 5.47:1    | ok         |
| claro  | `accent` #0f766e         | `accent-soft` #e3f4f1       | 4.82:1    | ok (4,5:1) |
| claro  | `positive` #15803d       | `positive-soft` #eaf6ee     | 4.52:1    | ok (4,5:1) |
| claro  | `warning` #a85108        | `warning-soft` #fbefdb      | 4.80:1    | ok (4,5:1) |
| claro  | `risk` #be123c           | `risk-soft` #fce8ed         | 5.36:1    | ok (4,5:1) |
| claro  | `text` #18181b           | `accent-soft` #e3f4f1       | 15.59:1   | ok (4,5:1) |
| claro  | `accent` #0f766e         | `accent-soft-hover` #d6eeea | 4.50:1    | ok (4,5:1) |
| claro  | `chart-1` #0f766e        | `surface` #ffffff           | 5.47:1    | ok (3:1)   |
| claro  | `chart-2` #71717a        | `surface` #ffffff           | 4.83:1    | ok (3:1)   |
| claro  | `chart-1` #0f766e        | `surface-muted` #f4f4f5     | 4.98:1    | ok (3:1)   |
| claro  | `chart-2` #71717a        | `surface-muted` #f4f4f5     | 4.40:1    | ok (3:1)   |
| claro  | `control-border` #85858f | `surface` #ffffff           | 3.65:1    | ok (3:1)   |
| claro  | `control-border` #85858f | `surface-muted` #f4f4f5     | 3.32:1    | ok (3:1)   |
| claro  | `control-border` #85858f | `canvas` #f4f4f2            | 3.32:1    | ok (3:1)   |
| claro  | `focus` #0f766e          | `surface` #ffffff           | 5.47:1    | ok (3:1)   |
| claro  | `focus` #0f766e          | `surface-muted` #f4f4f5     | 4.98:1    | ok (3:1)   |
| escuro | `text` #fafafa           | `canvas` #0b0b0d            | 18.84:1   | ok         |
| escuro | `text` #fafafa           | `surface` #161618           | 17.31:1   | ok         |
| escuro | `text` #fafafa           | `surface-muted` #212124     | 15.39:1   | ok         |
| escuro | `text-muted` #a1a1aa     | `canvas` #0b0b0d            | 7.67:1    | ok         |
| escuro | `text-muted` #a1a1aa     | `surface` #161618           | 7.05:1    | ok         |
| escuro | `text-muted` #a1a1aa     | `surface-muted` #212124     | 6.27:1    | ok         |
| escuro | `accent` #2dd4bf         | `canvas` #0b0b0d            | 10.56:1   | ok         |
| escuro | `accent` #2dd4bf         | `surface` #161618           | 9.71:1    | ok         |
| escuro | `accent` #2dd4bf         | `surface-muted` #212124     | 8.63:1    | ok         |
| escuro | `positive` #4ade80       | `canvas` #0b0b0d            | 11.29:1   | ok         |
| escuro | `positive` #4ade80       | `surface` #161618           | 10.37:1   | ok         |
| escuro | `positive` #4ade80       | `surface-muted` #212124     | 9.22:1    | ok         |
| escuro | `warning` #fbbf24        | `canvas` #0b0b0d            | 11.78:1   | ok         |
| escuro | `warning` #fbbf24        | `surface` #161618           | 10.83:1   | ok         |
| escuro | `warning` #fbbf24        | `surface-muted` #212124     | 9.62:1    | ok         |
| escuro | `risk` #fb7185           | `canvas` #0b0b0d            | 7.31:1    | ok         |
| escuro | `risk` #fb7185           | `surface` #161618           | 6.71:1    | ok         |
| escuro | `risk` #fb7185           | `surface-muted` #212124     | 5.97:1    | ok         |
| escuro | `on-accent` #042f2e      | `accent` #2dd4bf            | 7.77:1    | ok         |
| escuro | `accent` #2dd4bf         | `accent-soft` #10302e       | 7.60:1    | ok (4,5:1) |
| escuro | `positive` #4ade80       | `positive-soft` #122c1b     | 8.60:1    | ok (4,5:1) |
| escuro | `warning` #fbbf24        | `warning-soft` #33270d      | 8.76:1    | ok (4,5:1) |
| escuro | `risk` #fb7185           | `risk-soft` #3a1620         | 5.93:1    | ok (4,5:1) |
| escuro | `text` #fafafa           | `accent-soft` #10302e       | 13.56:1   | ok (4,5:1) |
| escuro | `accent` #2dd4bf         | `accent-soft-hover` #0c2826 | 8.37:1    | ok (4,5:1) |
| escuro | `chart-1` #2dd4bf        | `surface` #161618           | 9.71:1    | ok (3:1)   |
| escuro | `chart-2` #a1a1aa        | `surface` #161618           | 7.05:1    | ok (3:1)   |
| escuro | `chart-1` #2dd4bf        | `surface-muted` #212124     | 8.63:1    | ok (3:1)   |
| escuro | `chart-2` #a1a1aa        | `surface-muted` #212124     | 6.27:1    | ok (3:1)   |
| escuro | `control-border` #74747d | `surface` #161618           | 3.90:1    | ok (3:1)   |
| escuro | `control-border` #74747d | `surface-muted` #212124     | 3.47:1    | ok (3:1)   |
| escuro | `control-border` #74747d | `canvas` #0b0b0d            | 4.25:1    | ok (3:1)   |
| escuro | `focus` #2dd4bf          | `surface` #161618           | 9.71:1    | ok (3:1)   |
| escuro | `focus` #2dd4bf          | `surface-muted` #212124     | 8.63:1    | ok (3:1)   |

## Linguagem "glass" lilás, dark-first (DS 03, ADR-011)

- **Paleta final.** Escuro (protagonista): `canvas` `#0b0b12`, `surface` `#14141e`, `surface-muted` `#1c1c2a`, `surface-inset`
  `#0f0f18` (linhas de lista e campos), `text` `#f2f1fb`, `text-muted` `#a5a3c0`, `accent` `#b7a3fb` (texto sobre ele
  `#1a1236`), `chart-2` (comparação tracejada) `#d8d3ee`, borda translúcida lilás 13%, `control-border` `#7a7896`. Claro:
  `canvas` `#f6f5fb`, `surface` `#ffffff`, `surface-muted` `#f1effa`, `surface-inset` `#f8f7fd`, borda `#e3dff3`, `text` `#1a1830`,
  `accent` `#6948d2`, `control-border` `#85809f`. Positivo/alerta/risco seguem os mesmos tons, com tintas sólidas novas.
- **Gradientes só por token** (`--gradient-glow-top`, `--gradient-panel-glow`, `--gradient-panel-glow-soft`, `--gradient-gauge`,
  `--gradient-stripes`) e máscaras (`--mask-scroll-fade`, `--mask-fade-down`). O halo é decorativo: nenhum texto crítico depende
  dele e o `check-contrast` é calculado sobre a cor sólida do token. Raios: cartão 20, painel 24, controle 12, `--radius-icon` 14.
- **Vidro (`.glass`, `.glass--strong`, `.glass-lens`).** Tokens `--glass-*` nos dois temas. Base **sólida**
  (`--glass-solid` = `surface`); `<html data-glass>` (definido em `common/services/glass-support.ts` no bootstrap) liga o desfoque:
  `refract` (Chromium desktop: refração SVG real, só nas lentes pequenas via diretiva `appLiquidGlass`), `blur` (demais, desfoque
  CSS; em celular/toque 12 px) ou ausente = sólido (Safari/WebKit, sem `backdrop-filter`, `prefers-reduced-transparency`).
  Uso: sidebar em trilho, painéis de overlay (modal, sheet, menu), tooltip do gráfico, painel do gráfico (`glow`) e resumo de
  Movimentações; nunca em listas. Utilitários novos: `.icon-button`, `.pill`, `.status`, `.glyph`, `.row-card`, `.search`.
- **Barras de rolagem:** finas e discretas (`scrollbar-width: thin`, cor por token); a sidebar rola por dentro sem barra visível.

## Movimento (`motion.css`)

Ver `src/app/common/motion/README.md`: tokens `--motion-*`, `.m-pending`/`.m-enter`, `data-motion="off"`.
