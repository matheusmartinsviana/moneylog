#!/usr/bin/env node
/**
 * Orçamento do chunk dos gráficos (revisão M8, ADR-011): quando os gráficos viram um chunk **isolado** (carga
 * sob demanda das telas que os usam), o chunk pesa no máximo 8 kB gzip. Desde a fatia C o Início carrega o
 * gráfico de linhas por `@defer` (`spending-overview.component.ts`), então o chunk isolado existe e é medido
 * aqui (FE-S-244). O Angular só impõe orçamento por
 * bundle nomeado, não por chunk preguiçoso; por isso o `postbuild` roda este script sobre o `dist`.
 *
 * Um chunk "dos gráficos" é um arquivo `.js` que contém o CSS do gráfico de linhas (`lc__plot`) e o
 * desenho (`lc__svg`). Se esses textos estão no bundle principal (`main-*.js`), o peso entra no orçamento
 * `initial` e o script só informa; em qualquer outro chunk, vale o limite de 8 kB gzip. Sem os gráficos no
 * build, nada a medir.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const LIMIT_BYTES = 8 * 1024;
const dist = process.argv[2] ?? new URL('../dist/moneylog/browser', import.meta.url).pathname;

let files;
try {
  files = readdirSync(dist).filter((name) => /\.js$/.test(name));
} catch {
  console.log(`check-chart-budget: sem build em ${dist}; nada a medir.`);
  process.exit(0);
}

const charts = files.filter((name) => {
  const text = readFileSync(join(dist, name), 'utf8');
  return text.includes('lc__plot') && text.includes('lc__svg');
});

if (charts.length === 0) {
  console.log('check-chart-budget: os gráficos não estão no build de produção (nada a medir).');
  process.exit(0);
}

let failures = 0;
for (const name of charts) {
  const text = readFileSync(join(dist, name));
  const gz = gzipSync(text).length;
  const isMain = /^main-/.test(name);
  // Isolado = chunk preguiçoso pequeno de verdade: se ele traz o app inteiro (main), vale o orçamento `initial`.
  const verdict = isMain
    ? `no bundle principal (orçamento \`initial\`): ${(gz / 1024).toFixed(1)} kB gzip no arquivo todo`
    : `${(gz / 1024).toFixed(1)} kB gzip (limite ${LIMIT_BYTES / 1024} kB)`;
  console.log(`check-chart-budget: ${name}: ${verdict}`);
  if (!isMain && gz > LIMIT_BYTES) {
    failures++;
    console.error(`  FALHA: o chunk dos gráficos passa de ${LIMIT_BYTES / 1024} kB gzip.`);
  }
}
process.exit(failures > 0 ? 1 : 0);
