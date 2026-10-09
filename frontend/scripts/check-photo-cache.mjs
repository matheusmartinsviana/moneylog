#!/usr/bin/env node
/**
 * Guarda de privacidade das fotos (ADR-018, T263): o service worker NUNCA pode guardar `/v1/**` nem fotos.
 * Foto de meta é dado pessoal e a rota de conteúdo é autenticada (`Cache-Control: no-store`); um cache do
 * `ngsw` deixaria bytes no dispositivo depois do logout. Falha se o `ngsw-config.json`:
 *  - declarar `dataGroups` (é por onde a API seria cacheada);
 *  - tiver `assetGroups` cujos `resources.files/urls` casem `/v1`, `photos` ou `/api`, ou usem um curinga que
 *    cubra tudo (`/**`, `/**` sem extensão) e, portanto, também a API.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEFAULT_CONFIG = new URL('../ngsw-config.json', import.meta.url);

/** @param {unknown} config @returns {string[]} */
export function findPhotoCacheProblems(config) {
  const problems = [];
  if (typeof config !== 'object' || config === null) return ['ngsw-config.json inválido'];
  const root = /** @type {Record<string, unknown>} */ (config);
  const dataGroups = root['dataGroups'];
  if (Array.isArray(dataGroups) ? dataGroups.length > 0 : dataGroups !== undefined) {
    problems.push(
      'dataGroups: o service worker não pode cachear respostas da API (/v1/**) nem fotos',
    );
  }
  const groups = Array.isArray(root['assetGroups']) ? root['assetGroups'] : [];
  for (const group of groups) {
    const name = String(group?.name ?? '?');
    const resources = group?.resources ?? {};
    const patterns = [...(resources.files ?? []), ...(resources.urls ?? [])].map(String);
    for (const pattern of patterns) {
      if (/\/v1(\/|$|\*)|photos|\/api(\/|$)/i.test(pattern)) {
        problems.push(`assetGroups "${name}": "${pattern}" cobre a API ou fotos de metas`);
      }
      if (/^\/?\*\*(\/\*)?$/.test(pattern) || /^https?:\/\//i.test(pattern)) {
        problems.push(`assetGroups "${name}": "${pattern}" é amplo demais e pode cobrir /v1/**`);
      }
    }
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = JSON.parse(readFileSync(DEFAULT_CONFIG, 'utf8'));
  const problems = findPhotoCacheProblems(config);
  if (problems.length > 0) {
    console.error('check-photo-cache: o ngsw-config.json pode cachear a API ou fotos:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log('check-photo-cache: /v1/** e fotos fora do cache do service worker.');
}
