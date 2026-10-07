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
