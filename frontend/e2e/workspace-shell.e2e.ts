import {
  expect,
  expectNoHorizontalScroll,
  expectNoRawKeys,
  seedMockResponses,
  runAxe,
  seedPreferences,
  test,
  VIEWPORTS,
  waitForApp,
} from './support';
import { homeResponses } from './support/home-fixtures';

/**
 * Casca do workspace (DS 02, fatia A: T191 a T195, ADR-011): janela flutuante só a partir de 1024 px, página
 * que rola (sem rolagem interna), sidebar em grupos, cabeçalho com ações rápidas, microinterações e
 * movimento reduzido. As capturas de evidência estão em `evidence-redesign.e2e.ts`.
 */

const px = (value: string) => Number.parseFloat(value);

const MAIN_ITEMS = [
  'home',
  'transactions',
  'accounts',
  'cards',
  'goals',
  'planning',
  'people',
  'notes',
];

test.describe('shell em telas largas (trilho sempre recolhido)', () => {
  test.use({ viewport: VIEWPORTS.desktop });

  test('1280 px: trilho de 64 px, conteúdo sobre o canvas e sem rolagem horizontal', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForApp(page);

    const aside = (await page.locator('.shell__aside').boundingBox())!;
    expect(Math.round(aside.width)).toBe(64);
    await expect(page.locator('[data-cy="bottom-nav"]')).toBeHidden();
    await expectNoHorizontalScroll(page);
  });

  test('a página rola (não há rolagem interna) e a sidebar acompanha por sticky', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 500 });
    await page.goto('/settings');
    await waitForApp(page);

    const scrollable = await page.evaluate(
      () => document.documentElement.scrollHeight > document.documentElement.clientHeight,
    );
    expect(scrollable, 'a página, não a janela, rola').toBe(true);
    const before = (await page.locator('[data-cy="sidebar"]').boundingBox())!.y;
    await page.evaluate(() => window.scrollTo(0, 300));
    const after = (await page.locator('[data-cy="sidebar"]').boundingBox())!.y;
    expect(Math.abs(after - before), 'a sidebar continua no mesmo lugar').toBeLessThanOrEqual(1);
    await page.locator('[data-cy="sidebar-cards"]').click();
    await expect(page.locator('[data-cy="page-title"]')).toHaveText('Cartões');
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('o menu do perfil abre por cima do conteúdo (portal no body), por teclado, e devolve o foco', async ({
    page,
  }) => {
    await page.goto('/cards');
    await waitForApp(page);
    const trigger = page.locator('[data-cy="header-profile"]');
    await trigger.click();
    const panel = page.locator('[data-cy="header-profile-menu"]');
    await expect(panel).toBeVisible();
    expect(await panel.evaluate((el) => el.closest('[data-cy="sidebar"]'))).toBeNull();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});

test.describe('shell em telas menores', () => {
  test('375 px: barra inferior, sem sidebar e sem rolagem horizontal', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto('/');
    await waitForApp(page);

    await expect(page.locator('[data-cy="bottom-nav"]')).toBeVisible();
    await expect(page.locator('.shell__aside')).toBeHidden();
    await expectNoHorizontalScroll(page);
  });

  test('768 px: trilho recolhido, sem barra inferior', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.tablet);
    await page.goto('/');
    await waitForApp(page);

    expect(Math.round((await page.locator('.shell__aside').boundingBox())!.width)).toBe(64);
    await expect(page.locator('[data-cy="bottom-nav"]')).toBeHidden();
    await expectNoHorizontalScroll(page);
  });
});

test.describe('sidebar em trilho', () => {
  test.use({ viewport: VIEWPORTS.desktop });

  test('os itens essenciais na ordem; o ativo tem aria-current e o indicador fica sobre ele', async ({
    page,
  }) => {
    await page.goto('/cards');
    await waitForApp(page);

    const keys = await page
      .locator('[data-cy="sidebar-main"] a[data-cy^="sidebar-"]')
      .evaluateAll((links) => links.map((a) => a.getAttribute('data-cy')!.replace('sidebar-', '')));
    expect(keys).toEqual(MAIN_ITEMS);
    await expect(page.locator('[data-cy="sidebar-cards"]')).toHaveAttribute('aria-current', 'page');

    const [item, indicator] = await Promise.all([
      page.locator('[data-cy="sidebar-cards"] .sidebar__sq').boundingBox(),
      page.locator('[data-cy="sidebar-indicator"]').boundingBox(),
    ]);
    expect(Math.abs(item!.y - indicator!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(item!.x - indicator!.x)).toBeLessThanOrEqual(1);
  });

  test('"Mais" abre um popover com os atalhos secundários e leva à rota escolhida', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForApp(page);

    await page.locator('[data-cy="sidebar-more"]').click();
    const menu = page.locator('[data-cy="sidebar-more-menu"]');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem')).toHaveCount(7);
    await page.locator('[data-cy="sidebar-more-item-vault"]').click();
    await expect(page).toHaveURL(/\/vault$/);
    await expect(page.locator('[data-cy="sidebar-more"]')).toHaveClass(/is-active/);
  });

  test('o rodapé tem Configurações e Sair; Configurações fica ativo na rota', async ({ page }) => {
    await page.goto('/settings');
    await waitForApp(page);
    await expect(page.locator('[data-cy="sidebar-settings"]')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.locator('[data-cy="sidebar-signOut"]')).toBeVisible();
  });
});

test.describe('cabeçalho do workspace', () => {
  test.use({ viewport: VIEWPORTS.desktop });

  test('o Início saúda sem nome; outras telas não saúdam e mantêm o h1 próprio', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForApp(page);
    const greeting = page.locator('[data-cy="workspace-greeting"]');
    await expect(greeting).toHaveText(/^(Bom dia|Boa tarde|Boa noite)$/);
    await expect(page.locator('[data-cy="workspace-subtitle"]')).toHaveText(
      'Veja o que está acontecendo com o seu dinheiro.',
    );
    await expect(page.locator('h1')).toHaveCount(1);

    await page.locator('[data-cy="sidebar-cards"]').click();
    await expect(page.locator('[data-cy="page-title"]')).toHaveText('Cartões');
    await expect(greeting).toHaveCount(0);
    await expectNoRawKeys(page);
  });

  test('os atalhos do Quick Capture levam a /quick-add?mode=transfer ou trocam o tipo; sem IA não há atalho de IA', async ({
    page,
  }) => {
    await seedMockResponses(page, homeResponses());
    await page.goto('/');
    await waitForApp(page);

    await expect(page.locator('[data-cy="capture-type-expense"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.locator('[data-cy="capture-type-income"]').click();
    await expect(page.locator('[data-cy="capture-type-income"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.locator('[data-cy="capture-transfer"]').click();
    await expect(page).toHaveURL(/\(modal:quick-add\)\?mode=transfer$/);
    await expect(page.locator('[data-cy="capture-ask-ai"]')).toHaveCount(0);
    await expect(page.locator('[data-cy="header-ai-status"]')).toHaveText('IA desligada');
  });

  test('mobile: cabeçalho compacto sem rolagem horizontal; o perfil fica no cabeçalho', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto('/');
    await waitForApp(page);
    await expect(page.locator('[data-cy="header-profile"]')).toBeVisible();
    await expectNoHorizontalScroll(page);

    const box = (await page.locator('[data-cy="header-profile"]').boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(36);
  });

  test('o menu do avatar abre por teclado, fecha com Esc e devolve o foco; Sair leva ao login', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto('/cards');
    await waitForApp(page);
    const trigger = page.locator('[data-cy="header-profile"]');
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-cy="header-profile-item-settings"]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-cy="header-profile-item-settings"]')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[data-cy="header-profile-item-signOut"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('microinterações e movimento reduzido', () => {
  test.use({ viewport: VIEWPORTS.desktop });

  test('o botão pressionado de verdade encolhe para 0,98 (com movimento permitido)', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/transactions');
    await waitForApp(page);
    const button = page.locator('[data-cy="transactions-add"]');
    await button.hover();
    await page.mouse.down();
    await expect
      .poll(() => button.evaluate((el) => getComputedStyle(el).transform))
      .toBe('matrix(0.98, 0, 0, 0.98, 0, 0)');
    await page.mouse.up();
  });

  test('o cartão interativo (.lift) sobe até 2px e ganha sombra com o mouse, e o movimento reduzido o desliga (elemento real)', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mock', 'o UI Kit só existe no build de desenvolvimento');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/dev/ui-kit');
    await waitForApp(page);
    const card = page.locator('[data-cy="ui-kit-lift-card"] .section');
    await expect(card).toHaveClass(/lift/);
    const rest = await card.evaluate((el) => ({
      transform: getComputedStyle(el).transform,
      shadow: getComputedStyle(el).boxShadow,
    }));
    expect(rest.transform).toBe('none');
    await card.hover();
    await expect
      .poll(() => card.evaluate((el) => getComputedStyle(el).transform))
      .toBe('matrix(1, 0, 0, 1, 0, -2)');
    const lifted = await card.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(lifted).not.toBe(rest.shadow);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.mouse.move(0, 0);
    await card.hover();
    await expect.poll(() => card.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
  });

  test('a classe .row-hover destaca o fundo no hover com o mouse (elemento real no DOM, folha de estilo real)', async ({
    page,
  }) => {
    // O mock não traz movimentações para listar: o item é montado na página com a classe que
    // `transaction-list-item` usa (conferida em `transactions.page.spec.ts`), e o efeito vem da folha global de verdade.
    await page.goto('/cards');
    await waitForApp(page);
    await page.evaluate(() => {
      const row = document.createElement('div');
      row.id = 'probe-row';
      row.className = 'row-hover';
      row.style.cssText = 'position:fixed;top:300px;left:300px;width:200px;height:40px;z-index:5';
      row.textContent = 'linha';
      document.body.appendChild(row);
    });
    const row = page.locator('#probe-row');
    const before = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
    await row.hover();
    await expect
      .poll(() => row.evaluate((el) => getComputedStyle(el).backgroundColor))
      .not.toBe(before);
  });

  test('prefers-reduced-motion: durações zeradas e nenhuma transform de pressão ou elevação', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/transactions');
    await waitForApp(page);

    const durations = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return ['--duration-fast', '--duration-base', '--duration-slow'].map((name) =>
        style.getPropertyValue(name).trim(),
      );
    });
    expect(durations.map((d) => px(d))).toEqual([0, 0, 0]);

    const button = page.locator('[data-cy="transactions-add"]');
    await button.hover();
    await page.mouse.down();
    const transform = await button.evaluate((el) => getComputedStyle(el).transform);
    await page.mouse.up();
    expect(transform).toBe('none');
  });

  test('sem preferência de movimento, as durações são 160, 240 e 300 ms', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/cards');
    await waitForApp(page);

    const durations = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return ['--duration-fast', '--duration-base', '--duration-slow'].map((name) =>
        style.getPropertyValue(name).trim(),
      );
    });
    // O build de produção minifica `180ms` para `.18s`: compara em milissegundos.
    const ms = durations.map((d) => (d.endsWith('ms') ? px(d) : px(d) * 1000));
    expect(ms).toEqual([160, 240, 300]);
    const transition = await page
      .locator('[data-cy="sidebar-home"] .sidebar__sq')
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(transition.split(',').every((d) => px(d) <= 0.3 && px(d) >= 0.16)).toBe(true);
  });
});

for (const scheme of ['light', 'dark'] as const) {
  for (const [name, viewport] of Object.entries({
    mobile: VIEWPORTS.mobile,
    tablet: VIEWPORTS.tablet,
    desktop: VIEWPORTS.desktop,
  })) {
    test(`axe e idiomas na casca nova: ${name}, tema ${scheme}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await seedPreferences(page, { theme: scheme });
      await page.emulateMedia({ colorScheme: scheme });
      for (const path of ['/', '/more', '/quick-add']) {
        await page.goto(path);
        await waitForApp(page);
        const violations = await runAxe(page);
        expect(violations, JSON.stringify(violations)).toEqual([]);
      }
    });
  }
}

test('estados de tema: surface é mais clara que canvas no escuro (degrau de superfície, nada invertido)', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await seedPreferences(page, { theme: 'dark' });
  await page.goto('/');
  await waitForApp(page);

  const [canvas, surface] = await page.evaluate(() => {
    const read = (name: string) => {
      const probe = document.createElement('span');
      probe.style.color = `var(${name})`;
      document.body.append(probe);
      const rgb = getComputedStyle(probe).color.match(/\d+/g)!.map(Number);
      probe.remove();
      return rgb[0]! + rgb[1]! + rgb[2]!;
    };
    return [read('--color-canvas'), read('--color-surface')];
  });
  expect(surface).toBeGreaterThan(canvas!);
});
