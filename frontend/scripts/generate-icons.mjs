#!/usr/bin/env node
/**
 * Gera os PNGs do PWA a partir das fontes SVG em src/assets/icons (S-35). Os SVGs estão sem logo por enquanto.
 * Rode `npm run icons` depois de alterar um SVG; os PNGs gerados são versionados.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { Resvg } from '@resvg/resvg-js';

const dir = new URL('../src/assets/icons/', import.meta.url);
const outputs = [
  { source: 'icon.svg', file: 'icon-32.png', size: 32 },
  { source: 'icon.svg', file: 'icon-192.png', size: 192 },
  { source: 'icon.svg', file: 'icon-512.png', size: 512 },
  { source: 'icon-maskable.svg', file: 'icon-maskable-192.png', size: 192 },
  { source: 'icon-maskable.svg', file: 'icon-maskable-512.png', size: 512 },
  { source: 'icon-maskable.svg', file: 'apple-touch-icon.png', size: 180 },
];

for (const { source, file, size } of outputs) {
  const svg = readFileSync(new URL(source, dir));
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(new URL(file, dir), png);
  console.log(`${file} (${size}×${size})`);
}
