import {
  expect,
  expectNoHorizontalScroll,
  expectNoRawKeys,
  runAxe,
  seedPreferences,
  test,
  VIEWPORTS,
  waitForApp,
} from './support';

/**
 * T38, T40 e T41 no ambiente mock (sem backend: nenhuma conta, nenhuma movimentação). Os fluxos com
 * dados (salvar, estornar, editar) são dos testes de componente e do projeto `integration` (T44).
 * Aqui: o `/quick-add` sem conta, o atalho `?mode=` e o detalhe `/transactions/:id` como painel
 * (desktop) e como página (celular).
 */

test.describe('/quick-add sem contas', () => {
  for (const mode of ['', '?mode=pix', '?mode=debit', '?mode=refund', '?mode=investment']) {
    test(`mostra o estado vazio com "Adicionar conta" habilitado (${mode || 'padrão'})`, async ({
      page,
    }) => {
      await seedPreferences(page, { language: 'pt' });
      await page.goto(`/quick-add${mode}`);
      await waitForApp(page);

      await expect(page.locator('[data-cy="empty-state-title"]')).toHaveText(
        'Cadastre uma conta para registrar.',
      );
      const action = page.locator('[data-cy="empty-state-action-add-account"]');
      await expect(action).toBeEnabled();
      await expect(action).toHaveAttribute('href', '/accounts/new');
      await expectNoRawKeys(page);
    });
  }

  test('a ação leva para /accounts/new', async ({ page }) => {
    await page.goto('/quick-add');
    await waitForApp(page);

    await page.locator('[data-cy="empty-state-action-add-account"]').click();

    await expect(page).toHaveURL(/\/accounts\/new$/);
  });

  for (const [name, viewport] of Object.entries(VIEWPORTS)) {
    test(`sem scroll horizontal e sem violações de acessibilidade em ${name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/quick-add');
      await waitForApp(page);

      await expectNoHorizontalScroll(page);
      expect(await runAxe(page)).toEqual([]);
    });
  }
});

test.describe('detalhe /transactions/:id', () => {
  test('1280 px: abre como painel lateral sobre a lista, fecha com Esc e devolve a lista', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto('/transactions/00000000-0000-4000-8000-0000000000aa?type=EXPENSE');
    await waitForApp(page);

    const panel = page.locator('[data-cy="transaction-detail"]');
    await expect(panel).toBeVisible();
    await expect(page.locator('[data-cy="detail-title"]')).toBeFocused();
    await expect(page.locator('[data-cy="empty-state-title"]').first()).toBeVisible();
    // Painel encostado na borda direita, sobre a lista (que continua na página).
    const position = await panel.evaluate((el) => getComputedStyle(el.parentElement!).position);
    expect(position).toBe('fixed');
    await expect(page.locator('[data-cy="page-title"]')).toBeVisible();
    await expectNoHorizontalScroll(page);
    expect(await runAxe(page)).toEqual([]);

    await page.keyboard.press('Escape');

    await expect(panel).toHaveCount(0);
    await expect(page).toHaveURL(/\/transactions\?type=EXPENSE$/);
  });

  test('375 px: abre como página (a lista some) e o botão fechar volta para a lista', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto('/transactions/00000000-0000-4000-8000-0000000000aa');
    await page.locator('[data-cy="transaction-detail"]').waitFor();

    await expect(page.locator('[data-cy="page-title"]')).toBeHidden();
    const position = await page
      .locator('[data-cy="transaction-detail"]')
      .evaluate((el) => getComputedStyle(el.parentElement!).position);
    expect(position).not.toBe('fixed');
    await expectNoHorizontalScroll(page);

    await page.locator('[data-cy="detail-close"]').click();

    await expect(page).toHaveURL(/\/transactions$/);
    await expect(page.locator('[data-cy="page-title"]')).toBeVisible();
  });

  test('id inexistente: mostra "não encontrada" com link para a lista', async ({ page }) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/transactions/00000000-0000-4000-8000-0000000000aa');

    const notFound = page
      .locator('[data-cy="transaction-detail"]')
      .locator('[data-cy="empty-state-title"]');
    await expect(notFound).toHaveText('Movimentação não encontrada.');
    await page.locator('[data-cy="empty-state-action-back"]').click();
    await expect(page).toHaveURL(/\/transactions$/);
  });

  test('/transactions/:id/edit de um id inexistente mostra "não encontrada"', async ({ page }) => {
    await page.goto('/transactions/00000000-0000-4000-8000-0000000000aa/edit');
    await waitForApp(page);

    await expect(page.locator('[data-cy="empty-state-title"]')).toHaveText(
      'Movimentação não encontrada.',
    );
  });
});
