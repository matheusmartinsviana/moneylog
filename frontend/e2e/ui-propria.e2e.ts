import {
  expect,
  expectNoHorizontalScroll,
  expectNoRawKeys,
  ROUTES,
  runAxe,
  seedPreferences,
  test,
  VIEWPORTS,
  waitForApp,
} from './support';

/**
 * UI própria (FE-S-112): nenhum controle nativo do navegador e os controles próprios por teclado
 * e por toque (375 px: folha inferior). Ambiente mock (sem backend).
 */

const NATIVE =
  'select, datalist, details, summary, dialog, progress, meter, [popover], [title]:not(svg *), ' +
  'input[type=date], input[type=month], input[type=week], input[type=time], input[type=datetime-local], ' +
  'input[type=checkbox], input[type=radio], input[type=range], input[type=color], ' +
  'input[type=search], input[type=number]';

test.describe('guarda de runtime: nenhum controle nativo', () => {
  for (const [name, viewport] of Object.entries(VIEWPORTS)) {
    for (const theme of ['light', 'dark'] as const) {
      test(`nenhuma rota tem controle nativo (${name}, ${theme})`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await seedPreferences(page, { language: 'pt', theme });
        const dialogs: string[] = [];
        page.on('dialog', (d) => {
          dialogs.push(d.type());
          void d.dismiss();
        });
        for (const route of ROUTES) {
          await page.goto(route.path);
          await waitForApp(page);
          expect(await page.locator(NATIVE).count(), `${route.path} tem controle nativo`).toBe(0);
          // FE-S-119: a única exceção é o `<input type="file">` escondido dentro do FilePicker.
          const strayFiles = await page
            .locator('input[type=file]')
            .evaluateAll(
              (els) =>
                els.filter((el) => !el.closest('app-file-picker') || !el.hasAttribute('hidden'))
                  .length,
            );
          expect(strayFiles, `${route.path} tem input file fora do FilePicker`).toBe(0);
        }
        expect(dialogs).toEqual([]);
      });
    }
  }
});

test.describe('Configurações: Select próprio', () => {
  test('1280 px: abre por teclado, escolhe com setas e Enter, Esc fecha e o foco volta', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/settings');
    await waitForApp(page);

    const theme = page.locator('[data-cy="settings-theme"]');
    await theme.focus();
    await page.keyboard.press('ArrowDown');
    await expect(theme).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(theme).toBeFocused();

    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(theme).toBeFocused();
    expect(await runAxe(page)).toEqual([]);
  });

  test('375 px: abre como folha inferior, sem scroll horizontal, com alvos de 44 px', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/settings');
    await waitForApp(page);

    await page.locator('[data-cy="settings-language"]').click();
    const sheet = page.getByRole('dialog', { name: 'Idioma' });
    await expect(sheet).toBeVisible();
    const option = page.locator('[data-cy="settings-language-option-en"]');
    expect((await option.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalScroll(page);
    await option.click();

    await expect(page.locator('[data-cy="page-title"]')).toHaveText('Settings');
    await expect(sheet).toHaveCount(0);
  });
});

test.describe('Movimentações: filtros próprios', () => {
  test('1280 px: data digitada com máscara, calendário por teclado e checkbox próprio', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/transactions');
    await waitForApp(page);

    const from = page.locator('[data-cy="filter-from"]');
    await from.fill('');
    await from.pressSequentially('01092026');
    await expect(from).toHaveValue('01/09/2026');
    await expect(page).toHaveURL(/from=2026-09-01/);

    await page.locator('[data-cy="filter-to-calendar"]').click();
    const dialog = page.getByRole('dialog', { name: 'Escolher data' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/to=/);

    const voided = page.locator('[data-cy="filter-voided"]');
    await expect(voided).toHaveAttribute('aria-checked', 'false');
    await voided.focus();
    await page.keyboard.press('Space');
    await expect(voided).toHaveAttribute('aria-checked', 'true');
    await expect(page).toHaveURL(/status=VOIDED/);
  });

  test('375 px: o calendário abre como folha, com células de 44 px, e o filtro recolhe', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/transactions');
    await waitForApp(page);

    const toggle = page.locator('[data-cy="filters-toggle"]');
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    await page.locator('[data-cy="filter-from-calendar"]').click();
    const sheet = page.getByRole('dialog', { name: 'Escolher data' });
    await expect(sheet).toBeVisible();
    const day = sheet.locator('[data-iso$="-15"]').first();
    expect((await day.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalScroll(page);
    await day.click();
    await expect(sheet).toHaveCount(0);
    await expect(page).toHaveURL(/from=\d{4}-\d{2}-15/);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expectNoRawKeys(page);
  });

  test('a visão por competência usa o seletor de mês próprio', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/transactions?view=entries');
    await waitForApp(page);

    await page.locator('[data-cy="filter-competence"]').click();
    await expect(page.getByRole('dialog', { name: 'Escolher mês' })).toBeVisible();
    await page.locator('[data-cy="filter-competence-grid-prev-year"]').click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('BUG-E2E-01 (mock)', () => {
  test('/quick-add não tem scroll horizontal a 375 px', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto('/quick-add?mode=pix');
    await waitForApp(page);
    await expectNoHorizontalScroll(page);
  });
});
