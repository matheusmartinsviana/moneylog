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
 * Etapa 5 no ambiente mock (sem backend: nenhuma meta, resumo vazio, projeção sem série). Os fluxos com dados
 * (criar meta → reservar 8.500,00 → ver reservado e disponível no Início → liberar → resumo → projeções →
 * exportar) são do projeto `integration` (`integration/etapa5.e2e.ts`). Aqui: estados vazios, formulários,
 * validação, o download autenticado do CSV e do backup (sem `<a download>` com token), rótulos de projeção,
 * a11y, 375 px e idiomas.
 */

test.describe('/goals sem metas', () => {
  test('mostra o estado vazio com "Criar meta" habilitado e leva ao formulário', async ({
    page,
  }) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/goals');
    await waitForApp(page);

    await expect(page.locator('[data-cy="empty-state-title"]')).toHaveText('Nenhuma meta criada.');
    const action = page.locator('[data-cy="empty-state-action-create-goal"]');
    await expect(action).toBeEnabled();
    await action.click();
    await expect(page).toHaveURL(/\/goals\/new$/);
  });

  test('as abas Atingidas e Arquivadas vão para a URL e dizem que não há nenhuma', async ({
    page,
  }) => {
    await page.goto('/goals');
    await waitForApp(page);

    await page.locator('[data-cy="goals-tab-achieved"]').click();
    await expect(page).toHaveURL(/status=ACHIEVED/);
    await expect(page.locator('[data-cy="goals-empty-achieved"]')).toBeVisible();

    await page.locator('[data-cy="goals-tab-archived"]').click();
    await expect(page).toHaveURL(/status=ARCHIVED/);
    await expect(page.locator('[data-cy="goals-empty-archived"]')).toBeVisible();
    await page.reload();
    await waitForApp(page);
    await expect(page.locator('[data-cy="goals-tab-archived"]')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

test.describe('/goals/new', () => {
  test('valida só para UX: nome e valor alvo obrigatórios', async ({ page }) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/goals/new');
    await waitForApp(page);

    await page.locator('[data-cy="goal-form-save"]').click();

    await expect(page.locator('[data-cy="goal-name"]')).toHaveAttribute('aria-invalid', 'true');
    await expectNoRawKeys(page);
  });

  test('não tem campo de imagem (S-149) e a prioridade é uma chave própria, sem controle nativo', async ({
    page,
  }) => {
    await page.goto('/goals/new');
    await waitForApp(page);

    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expect(page.locator('select')).toHaveCount(0);
    await page.locator('[data-cy="goal-priority-HIGH"]').click();
    await expect(page.locator('[data-cy="goal-priority-HIGH"]')).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  test('criar mostra o aviso e abre a meta (no mock ela não persiste: "não encontrada" com o caminho de volta)', async ({
    page,
  }) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/goals/new');
    await waitForApp(page);

    await page.locator('[data-cy="goal-name"]').fill('Reserva de emergência');
    await page.locator('[data-cy="goal-target"]').fill('20.000,00');
    await page.locator('[data-cy="goal-form-save"]').click();

    await expect(page).toHaveURL(/\/goals\/[0-9a-f-]{36}$/);
    await expect(page.locator('[data-cy="empty-state-title"]')).toHaveText('Meta não encontrada');
    await page.locator('[data-cy="empty-state-action-back"]').click();
    await expect(page).toHaveURL(/\/goals$/);
  });
});

test.describe('/planning/summary', () => {
  test('a aba "Resumo do mês" abre o mês, com "Analisar com IA" desligado e honesto', async ({
    page,
  }) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/planning/recurrences');
    await waitForApp(page);

    await page.locator('[data-cy="planning-tab-summary"]').click();

    await expect(page).toHaveURL(/\/planning\/summary$/);
    await expect(page.locator('[data-cy="summary-income"]')).toContainText('R$ 0,00');
    await expect(page.locator('[data-cy="summary-analyze"]')).toHaveCount(0);
    await expect(page.locator('[data-cy="summary-analyze-note"]')).toHaveText(
      'Disponível quando a IA estiver configurada.',
    );
  });

  test('sem receitas no mês, a economia é "—" com a explicação', async ({ page }) => {
    await page.goto('/planning/summary/2026-10');
    await waitForApp(page);

    await expect(page.locator('h1')).toHaveText('Resumo de outubro de 2026');
    await expect(page.locator('[data-cy="summary-savings-text"]')).toHaveText('—');
    await expect(page.locator('[data-cy="summary-savings-note"]')).toContainText('Sem receitas');
  });

  test('trocar o mês muda a URL e o F5 volta ao mesmo mês', async ({ page }) => {
    await page.goto('/planning/summary/2026-10');
    await waitForApp(page);

    await page.locator('[data-cy="summary-month"]').click();
    await page.locator('[data-cy="summary-month-grid-2026-09"]').click();

    await expect(page).toHaveURL(/\/planning\/summary\/2026-09$/);
    await page.reload();
    await waitForApp(page);
    await expect(page.locator('h1')).toHaveText('Resumo de setembro de 2026');
  });

  test('um mês inválido diz isso e oferece o mês atual', async ({ page }) => {
    await page.goto('/planning/summary/2026-13');
    await waitForApp(page);

    await expect(page.locator('[data-cy="empty-state-title"]')).toHaveText(
      'Este mês não é válido.',
    );
    await page.locator('[data-cy="empty-state-action-current-month"]').click();
    await expect(page).toHaveURL(/\/planning\/summary\/\d{4}-\d{2}$/);
  });
});

test.describe('/planning/projections', () => {
  test('diz "Projeção, não certeza." e, sem dados, leva a adicionar uma conta', async ({
    page,
  }) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/planning/projections');
    await waitForApp(page);

    await expect(page.locator('[data-cy="projection-banner-title"]')).toHaveText(
      'Projeção, não certeza.',
    );
    await expect(page.locator('[data-cy="empty-state-title"]')).toHaveText(
      'Sem dados para projetar.',
    );
    await page.locator('[data-cy="empty-state-action-add-account"]').click();
    await expect(page).toHaveURL(/\/accounts\/new$/);
  });

  test('horizonte e tendência vão para a URL e o F5 restaura', async ({ page }) => {
    await page.goto('/planning/projections');
    await waitForApp(page);

    await page.locator('[data-cy="projection-horizon-M12"]').click();
    await expect(page).toHaveURL(/horizon=M12/);
    await page.locator('[data-cy="projection-trend"]').click();
    await expect(page).toHaveURL(/trend=1/);

    await page.reload();
    await waitForApp(page);
    await expect(page.locator('[data-cy="projection-horizon-M12"]')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.locator('[data-cy="projection-trend"]')).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  test('o horizonte é navegável por teclado (setas) e tem foco visível', async ({ page }) => {
    await page.goto('/planning/projections');
    await waitForApp(page);

    await page.locator('[data-cy="projection-horizon-M6"]').focus();
    await page.keyboard.press('ArrowRight');

    await expect(page).toHaveURL(/horizon=M12/);
    await expect(page.locator('[data-cy="projection-horizon-M12"]')).toBeFocused();
  });
});

test.describe('/settings: exportar', () => {
  test('o CSV baixa por uma ação autenticada (Blob), com o nome do arquivo, sem link com token', async ({
    page,
  }) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/settings');
    await waitForApp(page);

    await page.locator('[data-cy="export-csv-action"]').click();
    // Nada baixa sozinho: aparece "Arquivo pronto" e o download só nasce do clique em "Salvar".
    await expect(page.locator('[data-cy="export-ready"]')).toBeVisible();
    await expect(page.locator('[data-cy="export-save"]')).toBeVisible();
    const downloading = page.waitForEvent('download');
    await page.locator('[data-cy="export-save"]').click();
    const download = await downloading;
    await expect(page).toHaveURL(/\/settings$/);

    expect(download.suggestedFilename()).toBe('moneylog-transactions.csv');
    expect(download.url()).toMatch(/^blob:/);
    expect(download.url()).not.toMatch(/token|access|bearer/i);
    // Nenhum <a download> fica na página (o link temporário é removido).
    await expect(page.locator('a[download]')).toHaveCount(0);
  });

  test('o backup avisa que contém todos os dados e baixa o JSON', async ({ page }) => {
    await page.goto('/settings');
    await waitForApp(page);

    await expect(page.locator('[data-cy="export-backup-privacy"]')).toHaveText(
      'Guarde este arquivo com segurança: contém todos os seus dados.',
    );
    await page.locator('[data-cy="export-backup-action"]').click();
    const downloading = page.waitForEvent('download');
    await page.locator('[data-cy="export-save"]').click();
    const download = await downloading;

    expect(download.suggestedFilename()).toBe('moneylog-backup.json');
  });

  test('data inicial depois da final avisa e não baixa', async ({ page }) => {
    await page.goto('/settings');
    await waitForApp(page);

    await page.locator('[data-cy="export-from"]').fill('31/10/2026');
    await page.locator('[data-cy="export-to"]').fill('01/10/2026');
    await page.locator('[data-cy="export-csv-action"]').click();

    await expect(page.locator('[data-cy="export-range-invalid"]')).toBeVisible();
  });
});

for (const [name, viewport] of Object.entries({
  mobile: VIEWPORTS.mobile,
  desktop: VIEWPORTS.desktop,
})) {
  test.describe(`layout e acessibilidade em ${name}`, () => {
    test.use({ viewport });

    for (const path of [
      '/goals',
      '/goals/new',
      '/planning/summary/2026-10',
      '/planning/projections',
      '/settings',
    ]) {
      test(`${path}: sem scroll horizontal, sem chave crua e sem violações do axe`, async ({
        page,
      }) => {
        await seedPreferences(page, { language: 'pt' });
        await page.goto(path);
        await waitForApp(page);

        await expectNoHorizontalScroll(page);
        await expectNoRawKeys(page);
        const violations = await runAxe(page);
        expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
      });
    }

    test('no tema escuro, as telas novas passam no axe', async ({ page }) => {
      await seedPreferences(page, { language: 'pt', theme: 'dark' });
      for (const path of ['/goals/new', '/planning/projections']) {
        await page.goto(path);
        await waitForApp(page);
        const violations = await runAxe(page);
        expect(violations, `${path}: ${JSON.stringify(violations, null, 2)}`).toEqual([]);
      }
    });

    test('em inglês e espanhol, as telas novas não vazam texto em português', async ({ page }) => {
      for (const lang of ['en', 'es'] as const) {
        await seedPreferences(page, { language: lang });
        for (const path of ['/goals', '/planning/summary/2026-10', '/planning/projections']) {
          await page.goto(path);
          await waitForApp(page);
          await expectNoRawKeys(page);
          const text = await page.locator('main').innerText();
          expect(text, `${lang} ${path}`).not.toMatch(
            /Nova meta|Resumo do mês|Projeção, não certeza|Sem dados para projetar/,
          );
        }
      }
    });
  });
}
