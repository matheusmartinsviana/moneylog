import { defineConfig } from 'vitest/config';

/**
 * Configuração extra do Vitest usada pelo builder `@angular/build:unit-test` (runnerConfig).
 * O coverageThreshold vale para as camadas que concentram regra e componentes reutilizáveis (FE 07).
 */
export default defineConfig({
  test: {
    // Testes de componente com axe e cobertura passam de 5 s em máquina carregada (ex.: CI com E2E).
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'lcov'],
      thresholds: {
        'src/modules/*/core/**': { lines: 80 },
        'src/app/common/**': { lines: 80 },
      },
    },
  },
});
