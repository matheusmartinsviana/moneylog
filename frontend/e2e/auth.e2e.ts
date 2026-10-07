import { expect, seedPreferences, test, waitForApp } from './support';

/**
 * T33 em modo mock (projetos `mock` e `prod`): a sessão falsa abre o shell direto, "Sair" leva ao
 * login e o login mock volta ao app. Nenhuma chamada a `/v1` (o observador de `support.ts` falha o
 * teste se houver). O fluxo real (401, refresh, cookie) é do projeto `integration` (T44).
 */
test.describe('autenticação no ambiente mock', () => {
  test('abre o shell direto, sai pelas Configurações e volta pelo login', async ({ page }) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/transactions');
    await waitForApp(page);
    await expect(page).toHaveURL(/\/transactions$/);

    await page.goto('/settings');
    await waitForApp(page);
    await page.locator('[data-cy="settings-sign-out"]').click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('[data-cy="login-page"]')).toBeVisible();
    await expect(page.locator('[data-cy="bottom-nav"]')).toHaveCount(0);

    await page.locator('[data-cy="login-email"]').fill('dono@moneylog.app');
    await page.locator('[data-cy="login-password"]').fill('qualquer');
    await page.locator('[data-cy="login-submit"]').click();
    await expect(page).toHaveURL(/\/$/);
    await waitForApp(page);
  });

  test('o token não é guardado no localStorage nem no sessionStorage', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);

    const stored = await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }).toLowerCase(),
    );
    expect(stored).not.toContain('token');
  });
});
