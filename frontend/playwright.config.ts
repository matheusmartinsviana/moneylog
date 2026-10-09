import { defineConfig, devices } from '@playwright/test';

/**
 * E2E com Playwright (Chromium headless). Projetos (S-67, revisão A11):
 * - `mock`: `ng serve --configuration mock` (ambiente mock, sem service worker e sem backend);
 * - `prod`: build `production-mock` (produção + `environment.mock.ts`) servido por
 *   `e2e/serve-dist.mjs`, com service worker. A suíte de PWA só roda aqui;
 * - `demo`: `ng serve --configuration demo` (backend de exemplo no navegador, dados sintéticos); só a regra de
 *   "cabe na tela" (`e2e/fit-screen.e2e.ts`);
 * - `webkit-iphone` / `webkit-desktop`: o mesmo ambiente `mock` no WebKit (iPhone 14 e Safari desktop), só
 *   `e2e/webkit.e2e.ts` (rotas principais, Select como folha, DatePicker, trava de rolagem). Requer
 *   `npx playwright install webkit`;
 * - `integration` (T44): backend real. Só existe com `E2E_INTEGRATION=1` (`npm run e2e:integration`).
 *   Nesse modo `mock` e `prod` não rodam (não há motivo para subir os dois servidores de mock), e a
 *   configuração sobe: `e2e/stack/global-setup.ts` (Postgres descartável + backend com perfil `dev`),
 *   e o `ng serve --configuration local` na porta 4400 (proxy `/v1` para `http://localhost:8080`,
 *   `proxy.conf.json`). O cookie de refresh é `Secure`: o Chromium o aceita em `http://localhost`
 *   (contexto seguro), então a suíte não precisa de `mkcert`; o HTTPS local é para o Safari/iPhone (README).
 *   `E2E_STACK=external` pula o global setup (stack já de pé; veja `e2e/stack/global-setup.ts`).
 * As capturas de evidência só rodam com `E2E_EVIDENCE=1`.
 */
/** As portas podem ser trocadas por ambiente (`E2E_MOCK_PORT`, `E2E_PROD_PORT`, `E2E_DEMO_PORT`) quando a padrão está ocupada. */
const MOCK_PORT = Number(process.env['E2E_MOCK_PORT'] ?? 4200);
const PROD_PORT = Number(process.env['E2E_PROD_PORT'] ?? 4300);
const DEMO_PORT = Number(process.env['E2E_DEMO_PORT'] ?? 4212);
const INTEGRATION_PORT = 4400;
const integration = process.env['E2E_INTEGRATION'] === '1';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  outputDir: './e2e/.results',
  // A suíte de integração compartilha um banco único (um dono): um worker por vez.
  fullyParallel: !integration,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  workers: integration ? 1 : process.env['CI'] ? 2 : undefined,
  reporter: [['list']],
  timeout: integration ? 90_000 : 60_000,
  expect: { timeout: integration ? 10_000 : 5_000 },
  globalSetup: integration ? './e2e/stack/global-setup.ts' : undefined,
  use: {
    ...devices['Desktop Chrome'],
    headless: true,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'allow',
    // Movimento desligado por padrão (sem flakiness); o e2e de movimento liga com `test.use({ reducedMotion: 'no-preference' })`.
    reducedMotion: 'reduce',
  },
  projects: integration
    ? [
        {
          name: 'integration',
          testMatch: '**/integration/**/*.e2e.ts',
          use: { baseURL: `http://localhost:${INTEGRATION_PORT}`, serviceWorkers: 'block' },
        },
      ]
    : [
        {
          name: 'mock',
          testIgnore: [
            '**/pwa.e2e.ts',
            '**/evidence.e2e.ts',
            '**/webkit.e2e.ts',
            '**/integration/**',
          ],
          use: { baseURL: `http://localhost:${MOCK_PORT}` },
        },
        {
          name: 'prod',
          testIgnore: ['**/webkit.e2e.ts', '**/integration/**'],
          use: { baseURL: `http://localhost:${PROD_PORT}` },
        },
        // Build `demo` (backend de exemplo, dados sintéticos): só a regra de "cabe na tela" (`fit-screen.e2e.ts`).
        {
          name: 'demo',
          testMatch: '**/fit-screen.e2e.ts',
          use: { baseURL: `http://localhost:${DEMO_PORT}` },
        },
        // WebKit (motor do iOS Safari/Safari) na suíte mock: rotas principais e overlays.
        {
          name: 'webkit-iphone',
          testMatch: '**/webkit.e2e.ts',
          use: { ...devices['iPhone 14'], baseURL: `http://localhost:${MOCK_PORT}` },
        },
        {
          name: 'webkit-desktop',
          testMatch: '**/webkit.e2e.ts',
          use: { ...devices['Desktop Safari'], baseURL: `http://localhost:${MOCK_PORT}` },
        },
      ],
  webServer: integration
    ? [
        {
          command: `npx ng serve --configuration local --port ${INTEGRATION_PORT} --no-open`,
          url: `http://localhost:${INTEGRATION_PORT}`,
          reuseExistingServer: process.env['E2E_REUSE_SERVER'] === '1',
          timeout: 120_000,
          stdout: 'ignore',
          stderr: 'pipe',
        },
      ]
    : [
        {
          command: `npx ng serve --configuration mock --port ${MOCK_PORT} --no-open`,
          url: `http://localhost:${MOCK_PORT}`,
          reuseExistingServer: false,
          timeout: 120_000,
          stdout: 'ignore',
          stderr: 'pipe',
        },
        {
          command: `npx ng serve --configuration demo --port ${DEMO_PORT} --no-open`,
          url: `http://localhost:${DEMO_PORT}`,
          reuseExistingServer: false,
          timeout: 120_000,
          stdout: 'ignore',
          stderr: 'pipe',
        },
        {
          command: 'npm run build:production-mock && node e2e/serve-dist.mjs',
          url: `http://localhost:${PROD_PORT}`,
          env: { E2E_DIST_PORT: String(PROD_PORT) },
          reuseExistingServer: false,
          timeout: 180_000,
          stdout: 'ignore',
          stderr: 'pipe',
        },
      ],
});
