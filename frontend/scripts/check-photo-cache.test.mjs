import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { findPhotoCacheProblems } from './check-photo-cache.mjs';

test('o ngsw-config.json real não cacheia /v1 nem fotos', () => {
  const config = JSON.parse(readFileSync(new URL('../ngsw-config.json', import.meta.url), 'utf8'));
  assert.deepEqual(findPhotoCacheProblems(config), []);
});

test('dataGroups falha', () => {
  const config = { assetGroups: [], dataGroups: [{ name: 'api', urls: ['/v1/**'] }] };
  assert.equal(findPhotoCacheProblems(config).length, 1);
});

test('asset que casa /v1 ou fotos falha', () => {
  for (const pattern of ['/v1/**', '/v1/goals/*/photos/**', '/api/**']) {
    const config = { assetGroups: [{ name: 'x', resources: { urls: [pattern] } }] };
    assert.ok(findPhotoCacheProblems(config).length > 0, pattern);
  }
});

test('curinga que cobre tudo falha', () => {
  const config = { assetGroups: [{ name: 'x', resources: { files: ['/**'] } }] };
  assert.ok(findPhotoCacheProblems(config).length > 0);
});

test('shell, fontes e imagens do app passam', () => {
  const config = {
    assetGroups: [
      { name: 'a', resources: { files: ['/index.html', '/*.js', '/media/*.woff2'] } },
      { name: 'b', resources: { files: ['/assets/**/*.(svg|png)'] } },
    ],
  };
  assert.deepEqual(findPhotoCacheProblems(config), []);
});
