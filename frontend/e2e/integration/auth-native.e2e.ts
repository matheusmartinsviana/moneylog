import { cy, expect, loginViaUi, test, waitForApp } from './fixtures';

/**
 * Mesmo fluxo de sessão, **sem interceptar `/v1`** (rede 100% nativa do Chromium, cookie `Secure` em
 * `http://localhost` guardado pelo próprio navegador). Prova que o cookie real funciona sem o
 * `route.fetch()` do Playwright que as outras specs usam para capturar corpos.
 */
test.use({ interceptApi: false });

test('login, F5, nova aba, logout e retorno com o cookie nativo do navegador', async ({
  page,
  context,
  net,
}) => {
  await page.goto('/accounts');
  await expect(page).toHaveURL(/\/login\?returnUrl=%2Faccounts$/);
  await loginViaUi(page);
  await expect(page).toHaveURL(/\/accounts$/);
  await waitForApp(page);

  const cookie = (await context.cookies()).find((c) => c.name === 'ml_refresh');
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.secure).toBe(true);
  expect(cookie?.sameSite).toBe('Strict');
  // O JavaScript da página não enxerga o cookie.
  expect(await page.evaluate(() => document.cookie)).not.toContain('ml_refresh');

  await page.reload();
  await waitForApp(page);
  await expect(page).toHaveURL(/\/accounts$/);

  const other = await context.newPage();
  await other.goto('/transactions');
  await waitForApp(other);
  await expect(other).toHaveURL(/\/transactions$/);
  await other.close();

  await page.goto('/settings');
  await waitForApp(page);
  await cy(page, 'settings-sign-out').click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/accounts');
  await expect(page).toHaveURL(/\/login\?returnUrl=%2Faccounts$/);

  const refreshes = net.find('POST', '/v1/auth/refresh').map((c) => c.status);
  expect(refreshes.filter((s) => s === 200).length).toBe(2);
  net.allowAnonymousBoot = true;
});
