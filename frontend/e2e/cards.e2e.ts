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
 * Etapa 3 no ambiente mock (sem backend: nenhum cartão). Os fluxos com dados (compra parcelada, fatura,
 * pagamento) são dos testes de componente e do projeto `integration` (`cards.e2e.ts` em `integration/`).
 * Aqui: estados vazios, o formulário do cartão, "Crédito" habilitado e o layout em 375 px.
 */

test.describe('/cards sem cartões', () => {
  test('mostra o estado vazio com "Adicionar cartão" habilitado e leva ao formulário', async ({
    page,
  }) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/cards');
    await waitForApp(page);

    await expect(page.locator('[data-cy="empty-state-title"]')).toHaveText(
      'Nenhum cartão cadastrado.',
    );
    const action = page.locator('[data-cy="empty-state-action-add-card"]');
    await expect(action).toBeEnabled();
    await action.click();
    await expect(page).toHaveURL(/\/cards\/new$/);
  });

  test('a aba "Arquivados" vai para a URL e diz que não há nenhum', async ({ page }) => {
    await page.goto('/cards');
    await waitForApp(page);

    await page.locator('[data-cy="cards-tab-archived"]').click();

    await expect(page).toHaveURL(/status=ARCHIVED/);
    await expect(page.locator('[data-cy="cards-empty-archived"]')).toBeVisible();
  });
});

test.describe('/cards/new', () => {
  test('o formulário não tem campo de número nem de CVV e valida só para UX', async ({ page }) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/cards/new');
    await waitForApp(page);

    await expect(page.locator('[data-cy="card-form-privacy"]')).toContainText('CVV');
    expect(await page.locator('input[name*="number" i], input[name*="cvv" i]').count()).toBe(0);
    await page.locator('[data-cy="card-form-save"]').click();
    await expect(page.locator('[data-cy="card-name"]')).toHaveAttribute('aria-invalid', 'true');
    await expectNoRawKeys(page);
  });

  test('os dias usam o contador (teclado e botões) de 1 a 31', async ({ page }) => {
    await page.goto('/cards/new');
    await waitForApp(page);
    const closing = page.locator('[data-cy="card-closing-day"]');

    await closing.fill('25');
    await closing.press('ArrowUp');
    await expect(closing).toHaveValue('26');
    await page.locator('[data-cy="card-closing-day-decrease"]').click();
    await expect(closing).toHaveValue('25');
    await closing.press('End');
    await expect(closing).toHaveValue('31');
  });

  test('criar fecha o modal, mostra o aviso e volta para a lista', async ({ page }) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/cards/new');
    await waitForApp(page);

    await page.locator('[data-cy="card-name"]').fill('Roxinho');
    await page.locator('[data-cy="card-limit"]').fill('10.000,00');
    await page.locator('[data-cy="card-closing-day"]').fill('25');
    await page.locator('[data-cy="card-due-day"]').fill('5');
    await page.locator('[data-cy="card-form-save"]').click();

    await expect(page.locator('[data-cy="toast-info"]')).toContainText('Roxinho');
    await expect(page).toHaveURL(/\/cards$/);
    await expect(page.locator('[data-cy="form-modal-panel"]')).toHaveCount(0);
  });
});

test.describe('Crédito', () => {
  test('/quick-add?mode=credit sem cartão leva a "Adicionar cartão"', async ({ page }) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/quick-add?mode=credit');
    await waitForApp(page);

    await expect(page.locator('[data-cy="empty-state-title"]')).toHaveText(
      'Cadastre um cartão para registrar.',
    );
    await page.locator('[data-cy="empty-state-action-add-card"]').click();
    await expect(page).toHaveURL(/\/cards\/new$/);
  });

  test('a rota de um cartão inexistente mostra "não encontrado" com voltar; a fatura também', async ({
    page,
  }) => {
    await page.goto('/cards/00000000-0000-4000-8000-000000000999');
    await waitForApp(page);
    await expect(page.locator('[data-cy="empty-state-action-back"]')).toHaveAttribute(
      'href',
      '/cards',
    );

    await page.goto('/cards/x/invoices/y');
    await waitForApp(page);
    await expect(page.locator('[data-cy="empty-state-title"]')).toHaveText(
      'Fatura não encontrada.',
    );
  });
});

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  test.describe(`layout em ${name}`, () => {
    for (const path of ['/cards', '/cards/new', '/quick-add?mode=credit', '/cards/x']) {
      test(`${path}: sem scroll horizontal e sem violações de acessibilidade`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto(path);
        await waitForApp(page);

        await expectNoHorizontalScroll(page);
        expect(await runAxe(page)).toEqual([]);
      });
    }
  });
}
