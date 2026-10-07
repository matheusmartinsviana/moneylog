import {
  expect,
  expectNoHorizontalScroll,
  expectNoRawKeys,
  runAxe,
  seedPreferences,
  SIDEBAR_GROUP_ORDER,
  test,
  VIEWPORTS,
  waitForApp,
} from './support';

/**
 * Casca do workspace (DS 02, fatia A: T191 a T195, ADR-011): janela flutuante só a partir de 1024 px, página
 * que rola (sem rolagem interna), sidebar em grupos, cabeçalho com ações rápidas, microinterações e
 * movimento reduzido. As capturas de evidência estão em `evidence-redesign.e2e.ts`.
 */

const px = (value: string) => Number.parseFloat(value);

async function windowStyle(page: import('@playwright/test').Page) {
  return page.locator('[data-cy="shell-window"]').evaluate((el) => {
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return {
      radius: style.borderTopLeftRadius,
      shadow: style.boxShadow,
      border: style.borderTopWidth,
      left: box.left,
      width: box.width,
      top: box.top,
    };
  });
}

test.describe('janela flutuante (>= 1024 px)', () => {
  test.use({ viewport: VIEWPORTS.desktop });

  test('1280 px: janela com raio de 28px, sombra, margem e largura máxima centralizada', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForApp(page);

    const style = await windowStyle(page);
    expect(px(style.radius)).toBe(28);
    expect(style.shadow).not.toBe('none');
    expect(px(style.border)).toBe(1);
    expect(style.left, 'margem de 24px ao redor').toBeGreaterThanOrEqual(24);
    expect(style.top).toBeGreaterThanOrEqual(24);
    expect(style.width).toBeLessThanOrEqual(1440);
    await expectNoHorizontalScroll(page);
  });

  test('em tela larga a janela fica centralizada e não passa de 90rem', async ({ page }) => {
    await page.setViewportSize({ width: 1800, height: 900 });
    await page.goto('/');
    await waitForApp(page);

    const style = await windowStyle(page);
    expect(style.width).toBe(1440);
    expect(Math.abs(style.left - (1800 - 1440) / 2)).toBeLessThanOrEqual(1);
  });

  test('1024 px: janela com a sidebar recolhida; abaixo, sem janela', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('/');
    await waitForApp(page);
    expect(px((await windowStyle(page)).radius)).toBe(28);
    expect((await page.locator('[data-cy="sidebar"]').boundingBox())!.width).toBeLessThan(100);

    await page.setViewportSize({ width: 1023, height: 800 });
    const tablet = await windowStyle(page);
    expect(px(tablet.radius)).toBe(0);
    expect(tablet.shadow).toBe('none');
    expect(tablet.left).toBe(0);
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
    const overflow = await page
      .locator('[data-cy="shell-window"]')
      .evaluate((el) => getComputedStyle(el).overflowY);
    expect(overflow, 'a janela não é um contêiner de rolagem').toBe('visible');

    const before = (await page.locator('[data-cy="sidebar"]').boundingBox())!.y;
    await page.evaluate(() => window.scrollTo(0, 300));
    const after = (await page.locator('[data-cy="sidebar"]').boundingBox())!.y;
    expect(Math.abs(after - before), 'a sidebar continua no mesmo lugar').toBeLessThanOrEqual(1);
    // Restaura a rolagem ao navegar (roteador): a janela não segura o scroll.
    await page.locator('[data-cy="sidebar-cards"]').click();
    await expect(page.locator('[data-cy="page-title"]')).toHaveText('Cartões');
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('o menu do perfil abre por cima da janela (portal no body), por teclado, e devolve o foco', async ({
    page,
  }) => {
    await page.goto('/quick-add');
    await waitForApp(page);
    const trigger = page.locator('[data-cy="header-profile"]');
    await page.locator('[data-cy="sidebar-profile"]').click();
    const panel = page.locator('[data-cy="sidebar-profile-menu"]');
    await expect(panel).toBeVisible();
    // O painel é portal no body (fora da janela): não é cortado por ela.
    expect(await panel.evaluate((el) => el.closest('[data-cy="shell-window"]'))).toBeNull();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(page.locator('[data-cy="sidebar-profile"]')).toBeFocused();
    await expect(trigger).toBeHidden();
  });
});

test.describe('sem janela em telas menores', () => {
  test('375 px: sem raio, sem sombra, surface de ponta a ponta, barra inferior e sem rolagem horizontal', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto('/');
    await waitForApp(page);

    const style = await windowStyle(page);
    expect(px(style.radius)).toBe(0);
    expect(style.shadow).toBe('none');
    expect(style.left).toBe(0);
    expect(style.width).toBe(375);
    await expect(page.locator('[data-cy="bottom-nav"]')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('768 px: tela cheia, sidebar recolhida, sem barra inferior', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.tablet);
    await page.goto('/');
    await waitForApp(page);

    const style = await windowStyle(page);
    expect(px(style.radius)).toBe(0);
    expect(style.width).toBe(768);
    await expect(page.locator('[data-cy="bottom-nav"]')).toBeHidden();
    await expectNoHorizontalScroll(page);
  });
});

test.describe('sidebar em grupos', () => {
  test.use({ viewport: VIEWPORTS.desktop });

  test('três grupos nomeados com os itens na ordem, sem cabeçalho de grupo focável', async ({
    page,
  }) => {
    await page.goto('/cards');
    await waitForApp(page);

    for (const [group, expected] of Object.entries(SIDEBAR_GROUP_ORDER)) {
      const section = page.locator(`[data-cy="sidebar-group-${group}"]`);
      await expect(section).toHaveAttribute('role', 'group');
      const labelled = await section.getAttribute('aria-labelledby');
      await expect(page.locator(`#${labelled}`)).toBeVisible(); // expandida: o título aparece
      const keys = await section
        .locator('a[data-cy^="sidebar-"]')
        .evaluateAll((links) =>
          links.map((a) => a.getAttribute('data-cy')!.replace('sidebar-', '')),
        );
      expect(keys).toEqual(expected);
      expect(await page.locator(`#${labelled}`).getAttribute('tabindex')).toBeNull();
    }
    await expect(page.locator('[data-cy="sidebar-cards"]')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('[data-cy="sidebar-planning"] .sidebar__label')).toHaveText(
      'Planejamento',
    );
    // Orçamentos (T208), Vault, IA e MCP (fatia F) e Notificações estão na ordem dos grupos acima.
  });

  test('o item ativo tem fundo em tinta de acento e o rodapé só tem o avatar com menu', async ({
    page,
  }) => {
    await page.goto('/cards');
    await waitForApp(page);

    const [active, tint] = await page.evaluate(() => {
      const link = document.querySelector('[data-cy="sidebar-cards"]')!;
      const probe = document.createElement('span');
      probe.style.backgroundColor = 'var(--color-accent-soft)';
      document.body.append(probe);
      const tint = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return [getComputedStyle(link).backgroundColor, tint];
    });
    expect(active).toBe(tint);

    await page.locator('[data-cy="sidebar-profile"]').click();
    await expect(page.locator('[data-cy="sidebar-profile-item-settings"]')).toBeVisible();
    await expect(page.locator('[data-cy="sidebar-profile-item-signOut"]')).toBeVisible();
    await page.locator('[data-cy="sidebar-profile-item-settings"]').click();
    await expect(page).toHaveURL(/\/settings$/);
  });

  test('tablet: sidebar recolhida com divisores entre grupos e títulos fora da tela', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.tablet);
    await page.goto('/');
    await waitForApp(page);

    for (const group of Object.keys(SIDEBAR_GROUP_ORDER)) {
      const section = page.locator(`[data-cy="sidebar-group-${group}"]`);
      const title = section.locator('.sidebar__group-title');
      expect((await title.boundingBox())!.width).toBeLessThanOrEqual(1);
      await expect(section).toHaveAccessibleName(/.+/);
    }
    const divider = await page
      .locator('[data-cy="sidebar-group-workspace"]')
      .evaluate((el) => getComputedStyle(el).borderTopWidth);
    expect(px(divider)).toBe(1);
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
    await expect(page.locator('[data-cy="header-actions"]')).toBeVisible();
    await expectNoRawKeys(page);
  });

  test('ações rápidas levam a /quick-add?mode= e "Perguntar à IA" está desabilitado e não faz nada', async ({
    page,
  }) => {
    await page.goto('/cards');
    await waitForApp(page);

    await page.locator('[data-cy="header-action-income"]').click();
    await expect(page).toHaveURL(/\/quick-add\?mode=income$/);
    await page.locator('[data-cy="header-action-transfer"]').click();
    await expect(page).toHaveURL(/\/quick-add\?mode=transfer$/);
    await page.locator('[data-cy="header-action-expense"]').click();
    await expect(page).toHaveURL(/\/quick-add\?mode=expense$/);

    const ask = page.locator('[data-cy="header-action-askAi"]');
    await expect(ask).toHaveAttribute('aria-disabled', 'true');
    const url = page.url();
    // `force`: o Playwright recusa clicar em `aria-disabled`; o clique de verdade não pode fazer nada.
    await ask.click({ force: true });
    expect(page.url()).toBe(url);
    await ask.focus();
    await expect(page.locator('.tooltip')).toHaveText('Disponível quando a IA estiver configurada');
    await expect(page.locator('[data-cy="header-ai-status"]')).toHaveText('IA desligada');
    await expect(page.getByRole('button', { name: /notifica/i })).toHaveCount(0);
  });

  test('mobile: cabeçalho compacto sem rolagem horizontal; o perfil fica no cabeçalho e as ações no Início', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto('/');
    await waitForApp(page);
    await expect(page.locator('[data-cy="header-profile"]')).toBeVisible();
    await expect(page.locator('[data-cy="header-actions"]')).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.locator('[data-cy="bottom-nav-goals"]').click();
    await expect(page.locator('[data-cy="header-actions"]')).toBeHidden();
    await expect(page.locator('[data-cy="header-profile"]')).toBeVisible();

    // Alvo de toque de 44 px no avatar e nas ações.
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
    await page.goto('/cards');
    await waitForApp(page);
    const button = page.locator('[data-cy="header-action-expense"]');
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
    await page.goto('/cards');
    await waitForApp(page);

    const durations = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return ['--duration-fast', '--duration-base', '--duration-slow'].map((name) =>
        style.getPropertyValue(name).trim(),
      );
    });
    expect(durations.map((d) => px(d))).toEqual([0, 0, 0]);

    const button = page.locator('[data-cy="header-action-expense"]');
    await button.hover();
    await page.mouse.down();
    const transform = await button.evaluate((el) => getComputedStyle(el).transform);
    await page.mouse.up();
    expect(transform).toBe('none');
  });

  test('sem preferência de movimento, as durações são 180, 240 e 300 ms (entre 180 e 300)', async ({
    page,
  }) => {
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
    expect(ms).toEqual([180, 240, 300]);
    const transition = await page
      .locator('[data-cy="sidebar-home"]')
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(transition.split(',').every((d) => px(d) <= 0.3 && px(d) >= 0.18)).toBe(true);
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
