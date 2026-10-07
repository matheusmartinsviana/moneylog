import {
  BOTTOM_NAV_ORDER,
  expect,
  expectNoHorizontalScroll,
  expectNoRawKeys,
  HTML_LANG,
  Lang,
  MORE_ORDER,
  NAV_LABELS,
  NOT_FOUND_TITLE,
  ROUTES,
  seedPreferences,
  SIDEBAR_ORDER,
  test,
  VIEWPORTS,
  ViewportName,
  waitForApp,
} from './support';

/**
 * T17 CA 1–6 e T20 CA 3: shell responsivo, rotas, idiomas, navegação sem recarregar e teclado.
 * Roda contra o `ng serve` (projeto `dev`) e contra o build de produção (projeto `prod`).
 */

test.describe('shell em 375 × 812 (mobile)', () => {
  test.use({ viewport: VIEWPORTS.mobile });

  test('barra inferior fixa com Início · Movimentações · + · Metas · Mais e sem sidebar', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForApp(page);

    const bottomNav = page.locator('[data-cy="bottom-nav"]');
    await expect(bottomNav).toBeVisible();
    await expect(page.locator('[data-cy="sidebar"]')).toBeHidden();

    const keys = await bottomNav
      .locator('a[data-cy^="bottom-nav-"]')
      .evaluateAll((links) =>
        links.map((a) => a.getAttribute('data-cy')!.replace('bottom-nav-', '')),
      );
    expect(keys).toEqual(BOTTOM_NAV_ORDER);

    for (const key of BOTTOM_NAV_ORDER) {
      await expect(page.locator(`[data-cy="bottom-nav-${key}"]`)).toHaveAccessibleName(
        NAV_LABELS.pt[key]!,
      );
    }

    // Fixa no rodapé: encostada na borda inferior da viewport, inclusive depois de rolar.
    const box = await bottomNav.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.round(box!.y + box!.height)).toBe(VIEWPORTS.mobile.height);
    const position = await bottomNav.evaluate((el) => getComputedStyle(el).position);
    expect(position).toBe('fixed');

    // O "+" é o item central e tem destaque visual próprio (círculo com a cor de acento).
    const add = page.locator('[data-cy="bottom-nav-quickAdd"]');
    const addBg = await add
      .locator('.bottom-nav__add-circle')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    const homeBg = await page
      .locator('[data-cy="bottom-nav-home"]')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(addBg).not.toBe(homeBg);

    await add.click();
    await expect(page).toHaveURL(/\/quick-add$/);
    await expect(page.locator('[data-cy="page-title"]')).toHaveText(NAV_LABELS.pt['quickAdd']!);
    await expectNoHorizontalScroll(page);
  });

  test('a navegação pela barra inferior não recarrega a página e marca aria-current', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForApp(page);
    await page.evaluate(() => ((window as unknown as { __spa: number }).__spa = 1));

    for (const key of BOTTOM_NAV_ORDER) {
      const link = page.locator(`[data-cy="bottom-nav-${key}"]`);
      await link.click();
      await expect(link).toHaveAttribute('aria-current', 'page');
      // A sidebar fica no DOM com display:none no mobile; conta só o que está visível, na barra inferior
      // (as abas de uma página, como "Ativas" em Metas, também usam aria-current).
      await expect(
        page.locator('[data-cy="bottom-nav"] [aria-current="page"]:visible'),
      ).toHaveCount(1);
      await expect(page.locator('[data-cy="page-title"]')).toHaveText(NAV_LABELS.pt[key]!);
      await expectNoHorizontalScroll(page);
    }
    expect(await page.evaluate(() => (window as unknown as { __spa?: number }).__spa)).toBe(1);
  });

  test('/more lista as seções que não estão na barra inferior e cada uma abre', async ({
    page,
  }) => {
    await page.goto('/more');
    await waitForApp(page);
    const keys = await page
      .locator('[data-cy="more-list"] a[data-cy^="more-"]')
      .evaluateAll((links) => links.map((a) => a.getAttribute('data-cy')!.replace('more-', '')));
    expect(keys).toEqual(MORE_ORDER);

    for (const key of MORE_ORDER) {
      await page.goto('/more');
      await page.locator(`[data-cy="more-${key}"]`).click();
      await expect(page.locator('[data-cy="page-title"]')).toHaveText(NAV_LABELS.pt[key]!);
      await expectNoHorizontalScroll(page);
    }
  });

  test('Tab percorre a barra inferior na ordem, com foco visível, e Enter navega', async ({
    page,
  }) => {
    await page.goto('/goals');
    await waitForApp(page);

    const reached: string[] = [];
    for (let i = 0; i < 30 && reached.length < BOTTOM_NAV_ORDER.length; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return null;
        const style = getComputedStyle(el);
        return {
          cy: el.getAttribute('data-cy'),
          focusVisible: el.matches(':focus-visible'),
          ring: style.boxShadow,
          outline: style.outlineStyle,
        };
      });
      if (info?.cy?.startsWith('bottom-nav-')) {
        expect(info.focusVisible, `${info.cy} com :focus-visible`).toBe(true);
        // O anel de foco do tema (--focus-ring) é um box-shadow de duas camadas.
        expect(info.ring, `${info.cy} com anel de foco`).toMatch(/0px 0px 0px 4px/);
        reached.push(info.cy.replace('bottom-nav-', ''));
      }
    }
    expect(reached).toEqual(BOTTOM_NAV_ORDER);

    // O foco está no "Mais" (último). Três Shift+Tab voltam até Movimentações e Enter navega.
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('[data-cy="bottom-nav-transactions"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/transactions$/);
  });

  test('link "Pular para o conteúdo" aparece no foco e leva o foco ao <main>', async ({ page }) => {
    await page.goto('/cards');
    await waitForApp(page);
    await page.keyboard.press('Tab');
    const skip = page.locator('[data-cy="skip-to-content"]');
    await expect(skip).toBeFocused();
    // Entra na tela com uma transição curta: espera terminar.
    await expect
      .poll(() => skip.evaluate((el) => el.getBoundingClientRect().top))
      .toBeGreaterThanOrEqual(0);
    await page.keyboard.press('Enter');
    await expect(page.locator('main#main-content')).toBeFocused();
    await expect(page).toHaveURL(/\/cards$/);
  });
});

test.describe('shell em 768 × 1024 (tablet)', () => {
  test.use({ viewport: VIEWPORTS.tablet });

  test('sidebar recolhida com rótulo acessível e sem barra inferior', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await expect(page.locator('[data-cy="bottom-nav"]')).toBeHidden();
    const sidebar = page.locator('[data-cy="sidebar"]');
    await expect(sidebar).toBeVisible();

    const width = (await sidebar.boundingBox())!.width;
    expect(width, 'sidebar recolhida (só ícones)').toBeLessThan(100);

    for (const key of SIDEBAR_ORDER) {
      const link = page.locator(`[data-cy="sidebar-${key}"]`);
      await expect(link).toBeVisible();
      await expect(link).toHaveAccessibleName(NAV_LABELS.pt[key]!);
    }
    // Rótulos escondidos visualmente no estado recolhido (o balão vem do appTooltip, no body).
    const labelWidth = await page
      .locator('[data-cy="sidebar-cards"] .sidebar__label')
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(labelWidth).toBeLessThanOrEqual(1);
    await expectNoHorizontalScroll(page);
  });

  test('Tab alcança a sidebar com foco visível e o rótulo aparece como tooltip', async ({
    page,
  }) => {
    // Página fora da sidebar: nenhum item ativo (o foco no item ativo é testado à parte).
    await page.goto('/more');
    await waitForApp(page);
    const reached: string[] = [];
    // Marca, "Novo registro", 11 itens, perfil e as ações do cabeçalho: o laço precisa de folga (era 20).
    for (let i = 0; i < 40 && reached.length < SIDEBAR_ORDER.length; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        return { cy: el.getAttribute('data-cy'), ring: getComputedStyle(el).boxShadow };
      });
      if (info.cy && SIDEBAR_ORDER.includes(info.cy.replace('sidebar-', ''))) {
        reached.push(info.cy.replace('sidebar-', ''));
        expect(info.ring, `${info.cy} com anel de foco`).toMatch(/0px 0px 0px 4px/);
        // O tooltip aparece com transição de opacidade: espera estabilizar.
        await expect
          .poll(
            () =>
              page.evaluate(() => {
                const label = document.activeElement?.querySelector('.sidebar__label');
                return label ? getComputedStyle(label).opacity : null;
              }),
            { message: `${info.cy} mostra o rótulo no foco` },
          )
          .toBe('1');
      }
    }
    expect(reached).toEqual(SIDEBAR_ORDER);
  });
});

test.describe('shell em 1280 × 800 (desktop)', () => {
  test.use({ viewport: VIEWPORTS.desktop });

  test('sidebar expandida com as 16 seções na ordem, sem Dream Board', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await expect(page.locator('[data-cy="bottom-nav"]')).toBeHidden();
    const sidebar = page.locator('[data-cy="sidebar"]');
    await expect(sidebar).toBeVisible();
    expect((await sidebar.boundingBox())!.width, 'sidebar expandida').toBeGreaterThan(180);

    const nav = sidebar.locator('nav');
    const keys = await nav
      .locator('li a[data-cy^="sidebar-"]')
      .evaluateAll((links) => links.map((a) => a.getAttribute('data-cy')!.replace('sidebar-', '')));
    expect(keys).toEqual(SIDEBAR_ORDER);
    for (const key of SIDEBAR_ORDER) {
      await expect(page.locator(`[data-cy="sidebar-${key}"] .sidebar__label`)).toHaveText(
        NAV_LABELS.pt[key]!,
      );
    }
    await expect(sidebar).not.toContainText(/dream/i);
    await expectNoHorizontalScroll(page);
  });

  test('o item ativo da sidebar continua com foco visível', async ({ page }) => {
    // Regressão do BUG-01 (docs/qa/2026-10-04-qa-frontend-etapa-1.md): a sombra de
    // `.sidebar__link.is-active` não pode substituir o anel de foco.
    await page.goto('/transactions');
    await waitForApp(page);
    const active = page.locator('[data-cy="sidebar-transactions"]');
    await expect(active).toHaveAttribute('aria-current', 'page');
    // Foco por teclado no item ativo: precisa do mesmo anel de foco dos outros itens.
    await page.locator('[data-cy="sidebar-home"]').focus();
    await page.keyboard.press('Tab');
    await expect(active).toBeFocused();
    const ring = await active.evaluate((el) => ({
      focusVisible: el.matches(':focus-visible'),
      boxShadow: getComputedStyle(el).boxShadow,
      outline: getComputedStyle(el).outlineStyle,
    }));
    expect(ring.focusVisible).toBe(true);
    expect(ring.boxShadow, 'anel de foco no item ativo').toMatch(/0px 0px 0px 4px/);
  });

  test('o "Novo registro" ativo continua com foco visível', async ({ page }) => {
    await page.goto('/quick-add');
    await waitForApp(page);
    const quickAdd = page.locator('[data-cy="sidebar-quickAdd"]');
    await expect(quickAdd).toHaveAttribute('aria-current', 'page');
    await page.locator('[data-cy="sidebar-brand"]').focus();
    await page.keyboard.press('Tab');
    await expect(quickAdd).toBeFocused();
    const boxShadow = await quickAdd.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(boxShadow, 'anel de foco no "Novo registro" ativo').toMatch(/0px 0px 0px 4px/);
  });
});

/** Páginas com conteúdo próprio (menu, formulário de importação, Vault e MCP): não mostram o estado vazio de lista. */
const NO_EMPTY_STATE = new Set(['more', 'import', 'vault', 'mcp']);

for (const viewport of Object.keys(VIEWPORTS) as ViewportName[]) {
  test.describe(`todas as rotas em ${viewport}`, () => {
    test.use({ viewport: VIEWPORTS[viewport] });

    for (const lang of ['pt', 'en', 'es'] as Lang[]) {
      test(`idioma ${lang}: títulos, estado vazio, sem chave crua e sem scroll horizontal`, async ({
        page,
      }) => {
        await seedPreferences(page, { language: lang });
        for (const route of ROUTES) {
          await page.goto(route.path);
          await waitForApp(page);
          await expect(page.locator('html')).toHaveAttribute('lang', HTML_LANG[lang]);
          await expect(page.locator('h1')).toHaveCount(1);
          await expect(page.locator('main')).toHaveCount(1);
          await expect(page.locator('[data-cy="page-title"]')).toHaveText(
            NAV_LABELS[lang][route.key]!,
          );
          if (!NO_EMPTY_STATE.has(route.key)) {
            await expect(page.locator('[data-cy="empty-state"]').first()).toBeVisible();
          }
          await expectNoRawKeys(page);
          await expectNoHorizontalScroll(page);
        }

        await page.goto('/rota-que-nao-existe');
        await expect(page.locator('[data-cy="page-title"]')).toHaveText(NOT_FOUND_TITLE[lang]);
        await expectNoRawKeys(page);
        await page.locator('[data-cy="empty-state-action-go-home"]').click();
        await expect(page.locator('[data-cy="page-title"]')).toHaveText(NAV_LABELS[lang]['home']!);
      });
    }
  });
}

test.describe('troca de idioma pelas Configurações', () => {
  test.use({ viewport: VIEWPORTS.desktop });

  test('troca para en e es, atualiza <html lang> e persiste no reload', async ({ page }) => {
    await page.goto('/settings');
    await waitForApp(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');

    await page.locator('[data-cy="settings-language"]').click();
    await page.locator('[data-cy="settings-language-option-en"]').click();
    await expect(page.locator('[data-cy="page-title"]')).toHaveText('Settings');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('[data-cy="sidebar-home"]')).toHaveAccessibleName('Home');

    await page.locator('[data-cy="settings-language"]').click();
    await page.locator('[data-cy="settings-language-option-es"]').click();
    await expect(page.locator('[data-cy="page-title"]')).toHaveText('Ajustes');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');

    await page.reload();
    await expect(page.locator('[data-cy="page-title"]')).toHaveText('Ajustes');
    await expectNoRawKeys(page);
  });

  test('o idioma do navegador não muda o padrão pt-BR', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ locale: 'en-US', baseURL });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('[data-cy="page-title"]')).toHaveText('Início');
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
    await context.close();
  });
});
