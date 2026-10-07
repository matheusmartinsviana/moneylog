import {
  expect,
  expectNoHorizontalScroll,
  runAxe,
  seedPreferences,
  test,
  VIEWPORTS,
  waitForApp,
} from './support';

/**
 * Gráficos em SVG próprio (fatia B, T198 e T199): exercitados no UI Kit (`/dev/ui-kit`, só no projeto `mock`),
 * com os dados de DEMONSTRAÇÃO da porta de relatórios. Teclado, ponteiro, toque, tabela equivalente, entrada
 * na viewport e movimento reduzido.
 */
test.describe('gráficos (UI Kit, mock)', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'mock',
      'o UI Kit só existe nos builds de desenvolvimento/mock',
    );
  });

  test('o gráfico de 30 dias mostra o rótulo de demonstração, o máximo e o zero, e troca de período', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto('/dev/ui-kit');
    await waitForApp(page);

    await expect(page.locator('[data-cy="light-charts-demo"]')).toHaveText('Dados de demonstração');
    const chart = page.locator('[data-cy="light-line-chart"]');
    await expect(chart.locator('[data-cy="light-line-chart-y-zero"]')).toHaveText('0');
    await expect(chart.locator('[data-cy="light-line-chart-y-max"]')).toContainText('R$');
    const d30 = await chart.locator('tbody tr').count();
    expect(d30).toBe(30);

    await page.locator('[data-cy="light-charts-period-D7"]').click();
    await expect(chart.locator('tbody tr')).toHaveCount(7);
    await page.locator('[data-cy="light-charts-period-M12"]').click();
    await expect(chart.locator('tbody tr')).toHaveCount(12);
  });

  test('teclado: ← → Home End Esc movem o tooltip e a região viva anuncia', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto('/dev/ui-kit');
    await waitForApp(page);
    const plot = page.locator('[data-cy="light-line-chart-plot"]');
    await plot.focus();
    await expect(plot).toBeFocused();

    await page.keyboard.press('ArrowRight');
    const tip = page.locator('[data-cy="light-line-chart-tooltip"]');
    await expect(tip).toBeVisible();
    const first = await tip.innerText();
    await page.keyboard.press('ArrowRight');
    expect(await tip.innerText()).not.toBe(first);
    await page.keyboard.press('End');
    await expect(tip).toContainText('10 de outubro de 2026');
    await page.keyboard.press('Home');
    await expect(tip).toContainText('11 de setembro de 2026');
    await expect(page.locator('[aria-live="polite"]').last()).toContainText('11 de setembro');
    await page.keyboard.press('Escape');
    await expect(tip).toHaveCount(0);
    // Foco visível no gráfico.
    expect(await plot.evaluate((el) => getComputedStyle(el).boxShadow)).toMatch(/0px 0px 0px 4px/);
  });

  test('mouse: o tooltip acompanha o ponteiro e some ao sair; sem o atributo title', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto('/dev/ui-kit');
    await waitForApp(page);
    const plot = page.locator('[data-cy="light-line-chart-plot"]');
    await plot.scrollIntoViewIfNeeded();
    const box = (await plot.boundingBox())!;

    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2);
    const tip = page.locator('[data-cy="light-line-chart-tooltip"]');
    await expect(tip).toBeVisible();
    const left = await tip.innerText();
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2);
    await expect.poll(() => tip.innerText()).not.toBe(left);
    await page.mouse.move(box.x - 40, box.y - 40);
    await expect(tip).toHaveCount(0);
    expect(await page.locator('[data-cy="light-line-chart"] [title]').count()).toBe(0);
  });

  test('toque: arrastar o dedo move o tooltip e a rolagem vertical continua livre (touch-action: pan-y)', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto('/dev/ui-kit');
    await waitForApp(page);
    const plot = page.locator('[data-cy="light-line-chart-plot"]');
    await plot.scrollIntoViewIfNeeded();
    expect(await plot.evaluate((el) => getComputedStyle(el).touchAction)).toBe('pan-y');

    const tip = page.locator('[data-cy="light-line-chart-tooltip"]');
    const drag = (x: number) =>
      plot.evaluate((el, fraction) => {
        const rect = el.getBoundingClientRect();
        el.dispatchEvent(
          new PointerEvent('pointermove', {
            pointerType: 'touch',
            clientX: rect.left + rect.width * fraction,
            clientY: rect.top + 20,
            bubbles: true,
          }),
        );
      }, x);

    await drag(0.1);
    await expect(tip).toBeVisible();
    const first = await tip.innerText();
    await drag(0.9);
    await expect.poll(() => tip.innerText()).not.toBe(first);
    // Soltar o dedo (pointerleave de toque) não esconde o tooltip.
    await plot.evaluate((el) =>
      el.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'touch', bubbles: true })),
    );
    await expect(tip).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('a tabela equivalente existe sempre e o botão a mostra', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto('/dev/ui-kit');
    await waitForApp(page);

    const table = page.locator('[data-cy="light-line-chart-table"]');
    await expect(table.locator('table')).toHaveCount(1);
    await expect(table.locator('caption')).toHaveText('Entradas e saídas');
    expect((await table.boundingBox())!.width).toBeLessThanOrEqual(1);
    await page.locator('[data-cy="light-line-chart-table-toggle"]').click();
    expect((await table.boundingBox())!.width).toBeGreaterThan(100);
    await expectNoHorizontalScroll(page);
  });

  test('estados: vazio honesto, um ponto, valor negativo abaixo do zero e barras de categoria', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto('/dev/ui-kit');
    await waitForApp(page);

    await expect(page.locator('[data-cy="light-line-empty-empty"]')).toHaveText(
      'Sem movimentos neste período',
    );
    await expect(page.locator('[data-cy="light-line-empty"] path')).toHaveCount(0);
    await expect(page.locator('[data-cy="light-line-single"] .lc__dot')).toHaveCount(1);
    await expect(page.locator('[data-cy="light-line-negative-table"]')).toContainText('−R$ 49,90');
    const zero = page.locator('[data-cy="light-line-negative-y-zero"]');
    const zeroTop = await zero.evaluate((el) => (el as HTMLElement).style.top);
    expect(Number.parseFloat(zeroTop)).toBeLessThan(95);

    const bars = page.locator('[data-cy="light-bar-list"]');
    await expect(bars.locator('li')).toHaveCount(6);
    await expect(bars.locator('li').last()).toContainText('Outras (2 categorias)');
    await expect(bars.locator('li').first()).toContainText('44,6%');
    await expect(page.locator('[data-cy="light-segmented-disabled-disabled"]')).toHaveText(
      'Disponível em breve',
    );
  });

  test('entrada na viewport: o traço só é revelado ao aparecer, uma vez, e o DOM já tem o estado final', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 400 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/dev/ui-kit');
    await waitForApp(page);
    const svg = page.locator('[data-cy="light-line-empty"]'); // fora da viewport
    const last = page.locator('[data-cy="light-line-single"] .lc__svg');
    // Estado final presente (axe e E2E não esperam a animação).
    await expect(page.locator('[data-cy="light-line-chart-line-income"]')).toHaveCount(1);
    await expect(svg).toHaveCount(1);

    await last.scrollIntoViewIfNeeded();
    await expect(last).not.toHaveClass(/is-pending/);
    const duration = await last.evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(Number.parseFloat(duration)).toBeLessThanOrEqual(0.3);
  });

  test('prefers-reduced-motion: aparece completo, sem transição', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 400 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/dev/ui-kit');
    await waitForApp(page);

    const svg = page.locator('[data-cy="light-line-chart"] .lc__svg');
    await expect(svg).not.toHaveClass(/is-pending/);
    const duration = await svg.evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(Number.parseFloat(duration), 'sem transição (≤ 0,01 ms)').toBeLessThanOrEqual(0.00001);
    const clip = await svg.evaluate((el) => getComputedStyle(el).clipPath);
    expect(clip).not.toMatch(/100%/);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`axe nos gráficos (tabela aberta e fechada), app ${scheme}, 375 e 1280 px`, async ({
      page,
    }) => {
      await seedPreferences(page, { theme: scheme });
      for (const viewport of [VIEWPORTS.mobile, VIEWPORTS.desktop]) {
        await page.setViewportSize(viewport);
        await page.goto('/dev/ui-kit');
        await waitForApp(page);
        expect(await runAxe(page)).toEqual([]);
        await page.locator('[data-cy="light-line-chart-table-toggle"]').click();
        await page.locator('[data-cy="dark-line-chart-table-toggle"]').click();
        // A barra inferior é translúcida: com a coluna escura do kit por baixo o contraste dela não vale.
        await page.evaluate(() => window.scrollTo(0, 0));
        expect(await runAxe(page)).toEqual([]);
      }
    });
  }
});
