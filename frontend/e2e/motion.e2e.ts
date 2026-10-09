import { expect, seedMockResponses, seedPreferences, test, waitForApp } from './support';
import { homeResponses } from './support/home-fixtures';

/**
 * Fumaça do movimento LIGADO (o resto da suíte roda com `reducedMotion: 'reduce'`): o Início anima a entrada
 * e termina com todos os blocos visíveis, sem classes de animação sobrando, e clicáveis.
 */
test.use({ reducedMotion: 'no-preference' });

test('o Início entra em cascata e termina visível e clicável', async ({ page }) => {
  await seedPreferences(page, { language: 'pt' });
  await seedMockResponses(page, homeResponses());
  await page.goto('/');
  await waitForApp(page);

  const home = page.locator('[data-cy="home-dashboard"]');
  await expect(home).toBeVisible();
  // Os blocos abaixo da dobra entram ao aparecer: rola por todos e confere que terminam visíveis.
  for (const child of await home.locator(':scope > *').all()) {
    await child.scrollIntoViewIfNeeded();
    await expect(child).not.toHaveClass(/m-pending/, { timeout: 3000 });
    await expect(child).toHaveCSS('opacity', '1', { timeout: 3000 });
  }
  await expect(page.locator('.m-enter')).toHaveCount(0, { timeout: 4000 });
  await page.locator('[data-cy="home-overview-transactions"]').click();
  await expect(page).toHaveURL(/\/transactions/);
});
