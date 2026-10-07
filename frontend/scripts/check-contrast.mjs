#!/usr/bin/env node
/**
 * Confere o contraste WCAG dos pares texto/fundo de src/styles/tokens.css nos dois temas.
 * Mínimo 4,5:1 (texto normal, AA) e 3:1 para objetos gráficos (séries dos gráficos, borda de campos e anel de
 * foco, WCAG 1.4.11).
 * Os tokens `*-soft` (tintas) são hex sólido de propósito: este script só lê `#rrggbb`.
 * Imprime a tabela em Markdown (usada no README de styles/).
 */
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
const MIN = 4.5;
const FOREGROUNDS = ['text', 'text-muted', 'accent', 'positive', 'warning', 'risk'];
const BACKGROUNDS = ['canvas', 'surface', 'surface-muted', 'surface-inset'];
const MIN_GRAPHIC = 3;
/** Texto sobre a própria tinta (chip de variação, item ativo da sidebar). */
const SOFT_PAIRS = [
  ['accent', 'accent-soft'],
  ['positive', 'positive-soft'],
  ['warning', 'warning-soft'],
  ['risk', 'risk-soft'],
  ['text', 'accent-soft'],
  // Hover do `.button--soft`: tinta sólida (nada de `opacity`, que derrubava o contraste do texto).
  ['accent', 'accent-soft-hover'],
];
/** Objetos gráficos (séries) sobre as superfícies onde o gráfico fica. */
const GRAPHIC_PAIRS = [
  ['chart-1', 'surface'],
  ['chart-2', 'surface'],
  ['chart-1', 'surface-muted'],
  ['chart-2', 'surface-muted'],
  // Borda de campos e controles interativos (WCAG 1.4.11): `--color-control-border` (BUG-QA-09, FE-S-236).
  ['control-border', 'surface'],
  ['control-border', 'surface-muted'],
  ['control-border', 'canvas'],
  ['control-border', 'surface-inset'],
  ['chart-1', 'surface-inset'],
  ['chart-2', 'surface-inset'],
  ['focus', 'surface'],
  ['focus', 'surface-muted'],
];

/** Extrai as variáveis --color-* de um bloco CSS. */
function colors(block) {
  const map = {};
  for (const [, name, value] of block.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g))
    map[name] = value;
  return map;
}

const lightBlock = css.slice(
  css.indexOf(':root {'),
  css.indexOf('@media (prefers-color-scheme: dark)'),
);
const darkBlock = css.slice(css.indexOf(":root[data-theme='dark']"));
const mediaBlock = css.slice(
  css.indexOf('@media (prefers-color-scheme: dark)'),
  css.indexOf(":root[data-theme='dark']"),
);
const themes = { claro: colors(lightBlock), escuro: colors(darkBlock) };

// O bloco do sistema escuro e o [data-theme='dark'] precisam ser idênticos.
if (JSON.stringify(colors(mediaBlock)) !== JSON.stringify(themes.escuro)) {
  console.error(
    "Os tokens de @media (prefers-color-scheme: dark) e de [data-theme='dark'] divergem.",
  );
  process.exit(1);
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

const rows = ['| Tema | Texto | Fundo | Contraste | AA (4,5:1) |', '|---|---|---|---|---|'];
let failures = 0;
for (const [theme, map] of Object.entries(themes)) {
  for (const fg of FOREGROUNDS) {
    for (const bg of BACKGROUNDS) {
      if (!map[fg] || !map[bg]) {
        console.error(`Token ausente no tema ${theme}: ${fg} ou ${bg}`);
        process.exit(1);
      }
      const value = ratio(map[fg], map[bg]);
      const ok = value >= MIN;
      if (!ok) failures++;
      rows.push(
        `| ${theme} | \`${fg}\` ${map[fg]} | \`${bg}\` ${map[bg]} | ${value.toFixed(2)}:1 | ${ok ? 'ok' : 'FALHA'} |`,
      );
    }
  }
  const onAccent = ratio(map['on-accent'], map['accent']);
  if (onAccent < MIN) failures++;
  rows.push(
    `| ${theme} | \`on-accent\` ${map['on-accent']} | \`accent\` ${map['accent']} | ${onAccent.toFixed(2)}:1 | ${onAccent >= MIN ? 'ok' : 'FALHA'} |`,
  );
  for (const [pairs, min] of [
    [SOFT_PAIRS, MIN],
    [GRAPHIC_PAIRS, MIN_GRAPHIC],
  ]) {
    for (const [fg, bg] of pairs) {
      if (!map[fg] || !map[bg]) {
        console.error(`Token ausente no tema ${theme}: ${fg} ou ${bg}`);
        process.exit(1);
      }
      const value = ratio(map[fg], map[bg]);
      const ok = value >= min;
      if (!ok) failures++;
      rows.push(
        `| ${theme} | \`${fg}\` ${map[fg]} | \`${bg}\` ${map[bg]} | ${value.toFixed(2)}:1 | ${ok ? 'ok' : 'FALHA'} (${String(min).replace('.', ',')}:1) |`,
      );
    }
  }
}

if (process.argv.includes('--quiet')) {
  if (failures === 0)
    console.log(`check-contrast: ${rows.length - 2} pares ≥ ${MIN}:1 nos dois temas.`);
} else {
  console.log(rows.join('\n'));
}
if (failures > 0) {
  console.error(
    `\n${failures} par(es) abaixo do mínimo (${MIN}:1 texto, ${MIN_GRAPHIC}:1 gráfico).`,
  );
  process.exit(1);
}
