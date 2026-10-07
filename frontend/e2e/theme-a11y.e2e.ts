import {
  bodyBackground,
  CANVAS,
  expect,
  ROUTES,
  runAxe,
  seedPreferences,
  test,
  VIEWPORTS,
  ViewportName,
  waitForApp,
} from './support';

/** T15 CA 1 (tema real no navegador) e T20 CA 5 (axe no shell e nos estados vazios). */

test.describe('tema claro e escuro', () => {
  test.use({ viewport: VIEWPORTS.desktop });

  test('sem preferência salva, segue o sistema (claro e escuro)', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await waitForApp(page);
    expect(await bodyBackground(page)).toBe(CANVAS.light);
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);

    await page.emulateMedia({ colorScheme: 'dark' });
    expect(await bodyBackground(page)).toBe(CANVAS.dark);
  });

  test('a escolha "claro" vale com o sistema escuro e persiste no reload', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/settings');
    await waitForApp(page);
    expect(await bodyBackground(page)).toBe(CANVAS.dark);

    await page.locator('[data-cy="settings-theme"]').click();
    await page.locator('[data-cy="settings-theme-option-light"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await bodyBackground(page)).toBe(CANVAS.light);

    await page.reload();
    await waitForApp(page);
    expect(await bodyBackground(page)).toBe(CANVAS.light);
    await expect(page.locator('[data-cy="settings-theme"]')).toContainText('Claro');

    await page.locator('[data-cy="settings-theme"]').click();
    await page.locator('[data-cy="settings-theme-option-system"]').click();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
    expect(await bodyBackground(page)).toBe(CANVAS.dark);
  });

  test('a escolha "escuro" vale com o sistema claro', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await seedPreferences(page, { theme: 'dark' });
    await page.goto('/');
    await waitForApp(page);
    expect(await bodyBackground(page)).toBe(CANVAS.dark);
  });

  test('prefers-reduced-motion desativa as transições do shell', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await waitForApp(page);
    const duration = await page
      .locator('[data-cy="sidebar-home"]')
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(duration.split(',').every((d) => parseFloat(d) <= 0.01)).toBe(true);
  });

  // DS 02 / ADR-011: a pilha começa na fonte do sistema (SF em aparelho Apple) e o Geist, empacotado, é o
  // fallback. Por isso o teste não exige mais que o Geist renderize a página (em macOS ele nem é usado):
  // confere a ordem da pilha e que o Geist carrega do próprio domínio quando é pedido (onde a SF não existe).
  test('a pilha de fontes começa na do sistema e o Geist é o fallback empacotado', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForApp(page);
    const stack = await page.evaluate(() => getComputedStyle(document.documentElement).fontFamily);
    const families = stack.split(',').map((f) => f.trim().replace(/^["']|["']$/g, ''));
    expect(families[0]).toBe('-apple-system');
    expect(families.indexOf('SF Pro Text')).toBeGreaterThan(0);
    expect(families.indexOf('Geist Variable')).toBeGreaterThan(families.indexOf('SF Pro Text'));
  });

  // M7: onde não há a SF (Linux, Windows) é o Geist que renderiza o texto. Tira da pilha real as fontes de
  // sistema da Apple e mede o mesmo texto com o que sobra e com `sans-serif`: larguras diferentes provam que
  // uma fonte própria (o Geist empacotado, já carregado) pintou o texto.
  test('sem a SF na pilha, o Geist empacotado é quem renderiza o texto', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    const result = await page.evaluate(async () => {
      const stack = getComputedStyle(document.documentElement)
        .getPropertyValue('--font-sans')
        .split(',')
        .map((f) => f.trim())
        .filter((f) => !/^(-apple-system|BlinkMacSystemFont|["']?SF Pro)/.test(f));
      const probe = document.createElement('span');
      probe.textContent = 'moneylog R$ 1.234,56 ilWmgQ';
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-size:32px';
      document.body.appendChild(probe);
      probe.style.fontFamily = stack.join(', ');
      await document.fonts.load('32px "Geist Variable"', probe.textContent);
      const withGeist = probe.getBoundingClientRect().width;
      probe.style.fontFamily = 'sans-serif';
      const generic = probe.getBoundingClientRect().width;
      probe.remove();
      return {
        stack,
        withGeist,
        generic,
        loaded: [...document.fonts].some(
          (f) => /Geist Variable/.test(f.family) && f.status === 'loaded',
        ),
      };
    });
    expect(result.stack[0]).toMatch(/Geist/);
    expect(result.loaded).toBe(true);
    expect(result.withGeist).not.toBe(result.generic);
  });

  test('as fontes Geist (fallback) carregam do próprio domínio', async ({ page, baseURL }) => {
    const fonts: string[] = [];
    page.on('request', (req) => {
      if (req.resourceType() === 'font') fonts.push(req.url());
    });
    await page.goto('/');
    await waitForApp(page);
    // Pede o Geist de propósito: num aparelho Apple a página renderiza em SF e não o baixaria sozinha.
    await page.evaluate(() => document.fonts.load('16px "Geist Variable"'));
    const loaded = await page.evaluate(() =>
      [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family),
    );
    expect(loaded.join(',')).toMatch(/Geist/);
    expect(fonts.length).toBeGreaterThan(0);
    for (const url of fonts) expect(url.startsWith(baseURL!)).toBe(true);
  });
});

for (const viewport of ['mobile', 'desktop'] as ViewportName[]) {
  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`axe em ${viewport}, tema ${scheme}`, () => {
      test.use({ viewport: VIEWPORTS[viewport], colorScheme: scheme });

      test('nenhuma violação crítica ou séria em todas as rotas', async ({ page }) => {
        const report: string[] = [];
        for (const route of [...ROUTES.map((r) => r.path), '/nao-existe']) {
          await page.goto(route);
          await waitForApp(page);
          const violations = await runAxe(page);
          for (const v of violations) {
            // `region` entra no relatório para travar a regressão do BUG-03 (conteúdo fora de landmark).
            if (v.impact === 'critical' || v.impact === 'serious' || v.id === 'region') {
              report.push(`${route} · ${v.impact} · ${v.id}: ${v.help} → ${v.targets.join(' | ')}`);
            } else {
              test.info().annotations.push({
                type: `axe-${v.impact}`,
                description: `${route} · ${v.id}: ${v.help} → ${v.targets.join(' | ')}`,
              });
            }
          }
        }
        expect(report).toEqual([]);
      });
    });
  }
}
