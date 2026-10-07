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

- **Paleta:** `canvas` cinza muito claro (`#f2f2f5` / `#0e0e10`) atrás da janela; `surface` branco quente (`#fdfcfa`) ou
  `#1c1c1e`, **mais clara que o canvas também no escuro**; acento azul Apple (`#0066cc` / `#2997ff`); verde, laranja e
  vermelho dessaturados, só para variação, risco e saldo negativo.
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

Regras verificadas no `npm run lint`:

- `scripts/check-styles.mjs`: nenhuma cor literal (hex/rgb/hsl) fora de `tokens.css`, nenhum gradiente,
  `theme-color`/manifest iguais ao `--color-canvas` e **movimento**: toda `transition`/`animation` usa duração por
  token (`--duration-*`; laços `infinite` de esqueleto são a exceção) e nenhuma transição anima `width`, `height`,
  `top`, `left`, `right`, `bottom`, `inset`, margens, `padding` nem `all` (exceção documentada: o preenchimento da
  `ProgressBar`, que é o próprio dado).
- `scripts/check-contrast.mjs` (`npm run contrast`): texto ≥ 4,5:1 (inclusive `accent`/`positive`/`warning`/`risk` sobre a
  própria tinta) e séries dos gráficos ≥ 3:1, nos dois temas.
- `scripts/check-brand.mjs`: a marca (`BRAND_NAME`) vive em um lugar só e os espaços de logo continuam vazios.

## Contraste (WCAG AA)

Gerado por `npm run contrast`.

| Tema   | Texto                | Fundo                   | Contraste | AA (4,5:1) |
| ------ | -------------------- | ----------------------- | --------- | ---------- |
| claro  | `text` #1d1d1f       | `canvas` #f2f2f5        | 15.06:1   | ok         |
| claro  | `text` #1d1d1f       | `surface` #fdfcfa       | 16.41:1   | ok         |
| claro  | `text` #1d1d1f       | `surface-muted` #f6f4f1 | 15.33:1   | ok         |
| claro  | `text-muted` #66666b | `canvas` #f2f2f5        | 5.11:1    | ok         |
| claro  | `text-muted` #66666b | `surface` #fdfcfa       | 5.57:1    | ok         |
| claro  | `text-muted` #66666b | `surface-muted` #f6f4f1 | 5.20:1    | ok         |
| claro  | `accent` #0066cc     | `canvas` #f2f2f5        | 4.98:1    | ok         |
| claro  | `accent` #0066cc     | `surface` #fdfcfa       | 5.43:1    | ok         |
| claro  | `accent` #0066cc     | `surface-muted` #f6f4f1 | 5.07:1    | ok         |
| claro  | `positive` #2e7048   | `canvas` #f2f2f5        | 5.33:1    | ok         |
| claro  | `positive` #2e7048   | `surface` #fdfcfa       | 5.81:1    | ok         |
| claro  | `positive` #2e7048   | `surface-muted` #f6f4f1 | 5.42:1    | ok         |
| claro  | `warning` #9a5b00    | `canvas` #f2f2f5        | 4.86:1    | ok         |
| claro  | `warning` #9a5b00    | `surface` #fdfcfa       | 5.29:1    | ok         |
| claro  | `warning` #9a5b00    | `surface-muted` #f6f4f1 | 4.94:1    | ok         |
| claro  | `risk` #b3402f       | `canvas` #f2f2f5        | 5.09:1    | ok         |
| claro  | `risk` #b3402f       | `surface` #fdfcfa       | 5.55:1    | ok         |
| claro  | `risk` #b3402f       | `surface-muted` #f6f4f1 | 5.18:1    | ok         |
| claro  | `on-accent` #ffffff  | `accent` #0066cc        | 5.57:1    | ok         |
| claro  | `accent` #0066cc     | `accent-soft` #e4edf5   | 4.70:1    | ok (4,5:1) |
| claro  | `positive` #2e7048   | `positive-soft` #e8eee8 | 5.05:1    | ok (4,5:1) |
| claro  | `warning` #9a5b00    | `warning-soft` #f3ece1  | 4.62:1    | ok (4,5:1) |
| claro  | `risk` #b3402f       | `risk-soft` #f6e9e6     | 4.80:1    | ok (4,5:1) |
| claro  | `text` #1d1d1f       | `accent-soft` #e4edf5   | 14.21:1   | ok (4,5:1) |
| claro  | `chart-1` #0066cc    | `surface` #fdfcfa       | 5.43:1    | ok (3:1)   |
| claro  | `chart-2` #8a7f72    | `surface` #fdfcfa       | 3.82:1    | ok (3:1)   |
| claro  | `chart-1` #0066cc    | `surface-muted` #f6f4f1 | 5.07:1    | ok (3:1)   |
| claro  | `chart-2` #8a7f72    | `surface-muted` #f6f4f1 | 3.57:1    | ok (3:1)   |
| escuro | `text` #f5f5f7       | `canvas` #0e0e10        | 17.71:1   | ok         |
| escuro | `text` #f5f5f7       | `surface` #1c1c1e       | 15.63:1   | ok         |
| escuro | `text` #f5f5f7       | `surface-muted` #2a2a2d | 13.14:1   | ok         |
| escuro | `text-muted` #a1a1a6 | `canvas` #0e0e10        | 7.50:1    | ok         |
| escuro | `text-muted` #a1a1a6 | `surface` #1c1c1e       | 6.61:1    | ok         |
| escuro | `text-muted` #a1a1a6 | `surface-muted` #2a2a2d | 5.56:1    | ok         |
| escuro | `accent` #2997ff     | `canvas` #0e0e10        | 6.40:1    | ok         |
| escuro | `accent` #2997ff     | `surface` #1c1c1e       | 5.64:1    | ok         |
| escuro | `accent` #2997ff     | `surface-muted` #2a2a2d | 4.75:1    | ok         |
| escuro | `positive` #7daf90   | `canvas` #0e0e10        | 7.72:1    | ok         |
| escuro | `positive` #7daf90   | `surface` #1c1c1e       | 6.81:1    | ok         |
| escuro | `positive` #7daf90   | `surface-muted` #2a2a2d | 5.73:1    | ok         |
| escuro | `warning` #cda765    | `canvas` #0e0e10        | 8.55:1    | ok         |
| escuro | `warning` #cda765    | `surface` #1c1c1e       | 7.54:1    | ok         |
| escuro | `warning` #cda765    | `surface-muted` #2a2a2d | 6.34:1    | ok         |
| escuro | `risk` #d08a7f       | `canvas` #0e0e10        | 7.00:1    | ok         |
| escuro | `risk` #d08a7f       | `surface` #1c1c1e       | 6.18:1    | ok         |
| escuro | `risk` #d08a7f       | `surface-muted` #2a2a2d | 5.20:1    | ok         |
| escuro | `on-accent` #00111f  | `accent` #2997ff        | 6.33:1    | ok         |
| escuro | `accent` #2997ff     | `accent-soft` #1e2d3e   | 4.64:1    | ok (4,5:1) |
| escuro | `positive` #7daf90   | `positive-soft` #2a312e | 5.33:1    | ok (4,5:1) |
| escuro | `warning` #cda765    | `warning-soft` #352f28  | 5.86:1    | ok (4,5:1) |
| escuro | `risk` #d08a7f       | `risk-soft` #352b2c     | 4.97:1    | ok (4,5:1) |
| escuro | `text` #f5f5f7       | `accent-soft` #1e2d3e   | 12.86:1   | ok (4,5:1) |
| escuro | `chart-1` #2997ff    | `surface` #1c1c1e       | 5.64:1    | ok (3:1)   |
| escuro | `chart-2` #a89c8c    | `surface` #1c1c1e       | 6.32:1    | ok (3:1)   |
| escuro | `chart-1` #2997ff    | `surface-muted` #2a2a2d | 4.75:1    | ok (3:1)   |
| escuro | `chart-2` #a89c8c    | `surface-muted` #2a2a2d | 5.31:1    | ok (3:1)   |
