/* eslint-disable @typescript-eslint/no-explicit-any */
import { psql } from '../support/api';

import { cy, expect, loginViaUi, open, resetDatabase, test, waitForApp } from './fixtures';

/**
 * T44 CA4: autenticação contra o backend real (cookie `ml_refresh` de verdade, JWT de verdade).
 * O access token vencido é um JWT HS256 assinado com o segredo do backend de teste, já expirado.
 */
test.beforeEach(() => resetDatabase());

test('sem sessão vai ao login preservando o destino; senha errada mostra mensagem; F5 mantém a sessão', async ({
  page,
  net,
  evidence,
}) => {
  net.allow(401);
  await page.goto('/transactions');
  await expect(page).toHaveURL(/\/login\?returnUrl=%2Ftransactions$/);
  await expect(cy(page, 'login-page')).toBeVisible();
  await expect(cy(page, 'bottom-nav')).toHaveCount(0);
  await expect(cy(page, 'sidebar')).toHaveCount(0);
  await evidence(page, 'e2e-20-login');

  // Senha errada: 401 INVALID_CREDENTIALS, mensagem genérica, continua no login.
  await cy(page, 'login-email').fill(process.env['E2E_OWNER_EMAIL'] ?? '');
  await cy(page, 'login-password').fill('senha-errada');
  await cy(page, 'login-submit').click();
  await expect(cy(page, 'login-error')).toHaveText('E-mail ou senha incorretos.');
  await expect(page).toHaveURL(/\/login/);
  const bad = await net.body('POST', '/v1/auth/login');
  expect(bad.code).toBe('INVALID_CREDENTIALS');
  await evidence(page, 'e2e-21-login-senha-errada');

  // E-mail errado dá a mesma resposta (não revela qual campo falhou).
  await cy(page, 'login-email').fill('outro@moneylog.test');
  await cy(page, 'login-password').fill(process.env['E2E_OWNER_PASSWORD'] ?? '');
  await cy(page, 'login-submit').click();
  await expect(cy(page, 'login-error')).toHaveText('E-mail ou senha incorretos.');

  // Credenciais certas: vai para o destino original.
  await loginViaUi(page);
  await expect(page).toHaveURL(/\/transactions$/);
  await waitForApp(page);
  await expect(cy(page, 'login-page')).toHaveCount(0);

  // F5: o cookie de refresh devolve a sessão sem pedir login.
  await page.reload();
  await waitForApp(page);
  await expect(page).toHaveURL(/\/transactions$/);
  expect(net.find('POST', '/v1/auth/refresh').at(-1)?.status).toBe(200);

  // Quem já tem sessão não vê o login.
  await page.goto('/login');
  await expect(page).toHaveURL(/\/$/);
});

test('duas abas abertas ao mesmo tempo com a mesma sessão continuam as duas logadas (S-83)', async ({
  page,
  context,
  signIn,
}) => {
  await signIn(page);
  const second = await context.newPage();
  // As duas abas fazem o refresh com o mesmo cookie ao mesmo tempo.
  await Promise.all([page.goto('/'), second.goto('/accounts')]);
  await Promise.all([waitForApp(page), waitForApp(second)]);
  await expect(page).toHaveURL(/\/$/);
  await expect(second).toHaveURL(/\/accounts$/);
  // E continuam logadas depois de recarregar as duas juntas.
  await Promise.all([page.reload(), second.reload()]);
  await Promise.all([waitForApp(page), waitForApp(second)]);
  await expect(second).toHaveURL(/\/accounts$/);
  await second.close();
});

test('logout leva ao login e o refresh antigo deixa de valer', async ({
  page,
  signIn,
  net,
  playwright,
  baseURL,
  evidence,
}) => {
  net.allow(401);
  await signIn(page);
  await open(page, '/settings');
  const before = (await page.context().cookies()).find((c) => c.name === 'ml_refresh');
  expect(before, 'cookie ml_refresh existe').toBeTruthy();
  expect(before!.httpOnly).toBe(true);
  expect(before!.secure).toBe(true);
  expect(before!.sameSite).toBe('Strict');
  expect(before!.path).toBe('/v1/auth');
  await evidence(page, 'e2e-22-configuracoes-sair');

  await cy(page, 'settings-sign-out').click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.context().cookies()).find((c) => c.name === 'ml_refresh')).toBeUndefined();
  expect(net.find('POST', '/v1/auth/logout').at(-1)?.status).toBe(204);

  // O refresh antigo, mesmo reapresentado à mão, está revogado (401 REFRESH_INVALID).
  const raw = await playwright.request.newContext({ baseURL });
  const res = await raw.post('/v1/auth/refresh', {
    headers: { Cookie: `ml_refresh=${before!.value}`, Origin: baseURL ?? '' },
  });
  expect(res.status()).toBe(401);
  expect((await res.json()).code).toBe('REFRESH_INVALID');
  await raw.dispose();

  // E a rota protegida volta a pedir login.
  await page.goto('/accounts');
  await expect(page).toHaveURL(/\/login\?returnUrl=%2Faccounts$/);
});

test('access token vencido: um único refresh, as requisições são repetidas e a navegação segue sem ir ao login', async ({
  page,
  signIn,
  net,
}) => {
  const api = await signIn(page);
  await api.createAccount({ name: 'Conta', openingBalance: '10.00' });
  await page.goto('/accounts'); // sessão já renovada no boot
  await waitForApp(page);
  const refreshesBefore = net.find('POST', '/v1/auth/refresh').length;

  net.allow(401);
  net.forceExpiredToken(api.token, 2); // o Início faz 2 chamadas em paralelo (summary e upcoming)
  await page.getByRole('link', { name: 'Início' }).first().click();
  await expect(cy(page, 'home-dashboard')).toBeVisible();
  await expect(page).toHaveURL(/\/$/);

  const forced = net.calls.filter((c) => c.expiredTokenSent);
  expect(forced).toHaveLength(2);
  expect(forced.map((c) => c.method + ' ' + c.url.pathname + ' ' + c.status)).toEqual(
    forced.map((c) => c.method + ' ' + c.url.pathname + ' 401'),
  );
  expect((await net.body('GET', '/v1/dashboard/summary')).asOf).toBeTruthy();
  const refreshes = net.find('POST', '/v1/auth/refresh');
  expect(refreshes.length - refreshesBefore, 'um só refresh para as duas requisições 401').toBe(1);
  expect(refreshes.at(-1)?.status).toBe(200);
  // Cada requisição derrubada foi repetida uma vez, com 200.
  for (const c of forced) {
    const same = net.calls.filter(
      (x) => x.url.pathname === c.url.pathname && x.status === 200 && x.startedAt >= c.startedAt,
    );
    expect(same.length, `${c.url.pathname} repetida com sucesso`).toBeGreaterThanOrEqual(1);
  }
  // A navegação continua funcionando depois.
  await page.getByRole('link', { name: 'Movimentações' }).first().click();
  await expect(page).toHaveURL(/\/transactions$/);
  await waitForApp(page);
});

test('sessão expirada (refresh recusado): vai ao login com returnUrl, sem mostrar dados', async ({
  page,
  signIn,
  net,
}) => {
  const api = await signIn(page);
  await open(page, '/accounts');
  net.allow(401);
  // Derruba a sessão no servidor (todas as famílias de refresh) e vence o access token em memória.
  psql('DELETE FROM refresh_tokens');
  net.forceExpiredToken(api.token, 1);
  await page.getByRole('link', { name: 'Movimentações' }).first().click();
  await expect(page).toHaveURL(/\/login\?returnUrl=%2Ftransactions$/);
  await expect(cy(page, 'login-page')).toBeVisible();
  const last = net.find('POST', '/v1/auth/refresh').at(-1)!;
  expect(last.status).toBe(401);
  expect((last.responseBody as any).code).toBe('REFRESH_INVALID');
  await expect(cy(page, 'records-table')).toHaveCount(0);

  // Entrando de novo, volta para onde estava.
  await loginViaUi(page);
  await expect(page).toHaveURL(/\/transactions$/);
});
