import {
  expect,
  expectNoHorizontalScroll,
  expectSidebarReachable,
  HOSTILE_MARKDOWN,
  maxMainThreadStallMs,
  openSeededNote,
  ROUTES,
  seedMockResponses,
  seedPreferences,
  test,
  waitForApp,
} from './support';
import { homeResponses, NOTE_ID } from './support/home-fixtures';

/**
 * Projetos `webkit-iphone` (iPhone 14, WebKit) e `webkit-desktop` (Safari desktop): o motor do iOS
 * Safari/Safari. Cobre as rotas principais e os componentes de overlay (Select como folha em
 * celular, DatePicker, trava de rolagem). Limitação: é o WebKit do Playwright, não o iOS Safari
 * real (sem teclado virtual nem barra de endereço dinâmica); ver ADR-007.
 */
const isPhone = (name: string): boolean => name === 'webkit-iphone';

test.describe('WebKit: rotas principais', () => {
  for (const route of ROUTES) {
    test(`${route.path} carrega, sem scroll horizontal`, async ({ page }, testInfo) => {
      await seedPreferences(page, { language: 'pt' });
      await page.goto(route.path);
      await waitForApp(page);
      await expectNoHorizontalScroll(page);
      if (isPhone(testInfo.project.name)) {
        await expect(page.locator('[data-cy="bottom-nav"]')).toBeVisible();
      }
    });
  }
});

test.describe('WebKit: Início com dados (fatia C1)', () => {
  test('KPIs, gráfico (chunk @defer), compromissos e botão Registrar aparecem, sem rolagem horizontal', async ({
    page,
  }) => {
    await seedPreferences(page, { language: 'pt' });
    await seedMockResponses(page, homeResponses());
    await page.goto('/');
    await waitForApp(page);

    await expect(page.locator('[data-cy="kpi-spending-value"]')).toContainText('1.620,50');
    await expect(page.locator('[data-cy="home-overview-chart"]')).toBeVisible();
    await expect(page.locator('[data-cy="home-upcoming-brief"]')).toBeVisible();
    await expect(page.locator('[data-cy="home-register-open"]')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.locator('[data-cy="home-overview-period-M12"]').click();
    await expect(page.locator('[data-cy="home-overview-chart"]')).toBeVisible();
  });

  test('a busca global abre, mostra os grupos e abre uma nota com teclado', async ({
    page,
  }, testInfo) => {
    await seedPreferences(page, { language: 'pt' });
    await seedMockResponses(page, homeResponses());
    await page.goto('/');
    await waitForApp(page);

    if (isPhone(testInfo.project.name)) {
      await page.locator('[data-cy="global-search-open"]').click();
    }
    const field = page.locator('[data-cy="global-search-input"]');
    await field.click();
    await field.fill('mercado');
    await expect(page.locator('[data-cy="global-search-results"]')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/notes/${NOTE_ID}$`));
  });
});

test.describe('WebKit: Etapa 3 (cartões)', () => {
  for (const path of ['/cards/new', '/quick-add?mode=credit', '/cards/x']) {
    test(`${path} carrega, sem scroll horizontal e com campos de 16 px ou mais`, async ({
      page,
    }) => {
      await seedPreferences(page, { language: 'pt' });
      await page.goto(path);
      await waitForApp(page);
      await expectNoHorizontalScroll(page);
      const sizes = await page
        .locator('input:visible')
        .evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
      for (const size of sizes) expect(size).toBeGreaterThanOrEqual(16);
    });
  }
});

test.describe('WebKit: Etapa 6 (vault de notas)', () => {
  for (const path of ['/notes', '/notes?view=trash', '/notes/x', '/settings']) {
    test(`${path} carrega, sem scroll horizontal e com campos de 16 px ou mais`, async ({
      page,
    }) => {
      await seedPreferences(page, { language: 'pt' });
      await page.goto(path);
      await waitForApp(page);
      await expectNoHorizontalScroll(page);
      const sizes = await page
        .locator('input:visible, textarea:visible')
        .evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
      for (const size of sizes) expect(size).toBeGreaterThanOrEqual(16);
    });
  }

  test('"Nova nota": a folha abre (celular: embaixo) e o campo de nome tem 16 px', async ({
    page,
  }, testInfo) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/notes');
    await waitForApp(page);

    await page.locator('[data-cy="notes-new"]').click();
    await expect(page.locator('[data-cy="new-note-form"]')).toBeVisible();
    const size = await page
      .locator('[data-cy="new-note-name"]')
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(16);
    await expectNoHorizontalScroll(page);
    if (isPhone(testInfo.project.name)) {
      const box = await page
        .locator('[data-cy="new-note-sheet-panel"], [role="dialog"]')
        .first()
        .boundingBox();
      const viewport = page.viewportSize();
      expect(box).not.toBeNull();
      if (box && viewport) expect(box.y + box.height).toBeGreaterThan(viewport.height - 2);
    }
  });

  test('FilePicker: o botão abre o seletor de arquivos e o nome do .zip aparece (gesto do usuário)', async ({
    page,
  }) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/settings');
    await waitForApp(page);

    const chooser = page.waitForEvent('filechooser');
    await page.locator('[data-cy="vault-file"]').click();
    await (
      await chooser
    ).setFiles({
      name: 'vault.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from([0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)]),
    });

    await expect(page.locator('[data-cy="vault-file-name"]')).toHaveText('vault.zip');
    await expect(page.locator('input[type="file"]')).toHaveCount(1);
  });

  test('exportar o vault funciona no WebKit (Blob + link temporário, sem token na URL)', async ({
    page,
  }) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/settings');
    await waitForApp(page);

    await page.locator('[data-cy="vault-export-action"]').click();
    await expect(page.locator('[data-cy="vault-export-ready"]')).toBeVisible();
    const downloading = page.waitForEvent('download');
    await page.locator('[data-cy="vault-export-save"]').click();
    const download = await downloading;

    expect(download.suggestedFilename()).toBe('moneylog-vault.zip');
    expect(download.url()).toMatch(/^blob:/);
  });
});

test.describe('WebKit: Etapa 5 (metas, resumo, projeções e exportação)', () => {
  for (const path of [
    '/goals',
    '/goals/new',
    '/goals/x',
    '/planning/summary/2026-10',
    '/planning/projections',
    '/settings',
  ]) {
    test(`${path} carrega, sem scroll horizontal e com campos de 16 px ou mais`, async ({
      page,
    }) => {
      await seedPreferences(page, { language: 'pt' });
      await page.goto(path);
      await waitForApp(page);
      await expectNoHorizontalScroll(page);
      const sizes = await page
        .locator('input:visible')
        .evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
      for (const size of sizes) expect(size).toBeGreaterThanOrEqual(16);
    });
  }

  test('o download do CSV funciona no WebKit (Blob + link temporário, sem token na URL)', async ({
    page,
  }) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/settings');
    await waitForApp(page);

    await page.locator('[data-cy="export-csv-action"]').click();
    await expect(page.locator('[data-cy="export-ready"]')).toBeVisible();
    const downloading = page.waitForEvent('download');
    await page.locator('[data-cy="export-save"]').click();
    const download = await downloading;

    expect(download.suggestedFilename()).toBe('moneylog-transactions.csv');
    await expect(page).toHaveURL(/\/settings$/);
  });
});

test.describe('WebKit: Etapa 4 (pessoas, dívidas e recorrências)', () => {
  for (const path of [
    '/people/new',
    '/quick-add?mode=loan',
    '/quick-add?mode=received',
    '/quick-add?mode=debt',
    '/planning/recurrences',
    '/planning/occurrences',
    '/planning/recurrences/new',
    '/debts/x',
  ]) {
    test(`${path} carrega, sem scroll horizontal e com campos de 16 px ou mais`, async ({
      page,
    }) => {
      await seedPreferences(page, { language: 'pt' });
      await page.goto(path);
      await waitForApp(page);
      await expectNoHorizontalScroll(page);
      const sizes = await page
        .locator('input:visible')
        .evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
      for (const size of sizes) expect(size).toBeGreaterThanOrEqual(16);
    });
  }

  test('"Nova dívida": o seletor de pessoa abre como folha no celular e como popover no desktop', async ({
    page,
  }, testInfo) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/quick-add?mode=debt');
    await waitForApp(page);

    await page.locator('[data-cy="debt-person"]').click();

    const panel = page.locator('[data-cy="debt-person-panel-panel"]');
    await expect(panel).toBeVisible();
    await expect(page.locator('[data-cy="debt-person-option-__new-person__"]')).toBeVisible();
    if (isPhone(testInfo.project.name)) await expect(panel).toHaveAttribute('aria-modal', 'true');
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  });
});

test.describe('WebKit: overlays', () => {
  test('Select: folha no celular (modal), popover no desktop; Esc devolve o foco', async ({
    page,
  }, testInfo) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/settings');
    await waitForApp(page);
    const language = page.locator('[data-cy="settings-language"]');

    await language.click();
    const panel = page.locator('[data-cy="settings-language-panel-panel"]');
    await expect(panel).toBeVisible();
    if (isPhone(testInfo.project.name)) {
      await expect(panel).toHaveAttribute('data-side', 'sheet');
      await expect(panel).toHaveAttribute('aria-modal', 'true');
      const box = await panel.boundingBox();
      const viewport = page.viewportSize()!;
      // Folha encostada embaixo e na largura toda; nada fora da tela.
      expect(Math.round(box!.x)).toBe(0);
      expect(Math.round(box!.width)).toBe(viewport.width);
      expect(Math.round(box!.y + box!.height)).toBeLessThanOrEqual(viewport.height);
    } else {
      await expect(panel).not.toHaveAttribute('data-side', 'sheet');
    }
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(language).toBeFocused();
  });

  test('Select a 375 px vira folha com alvos de toque de 44 px', async ({ page }, testInfo) => {
    test.skip(!isPhone(testInfo.project.name), 'só no celular');
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/settings');
    await waitForApp(page);

    await page.locator('[data-cy="settings-theme"]').tap();
    const option = page.locator('[data-cy="settings-theme-option-dark"]');
    await expect(option).toBeVisible();
    expect((await option.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await option.tap();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('DatePicker: máscara, calendário e escolha de um dia', async ({ page }, testInfo) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/transactions');
    await waitForApp(page);
    if (isPhone(testInfo.project.name)) {
      const toggle = page.locator('[data-cy="filters-toggle"]');
      if (await toggle.count()) await toggle.tap();
    }
    const from = page.locator('[data-cy="filter-from"]');
    await from.scrollIntoViewIfNeeded();
    await from.fill('');
    await from.pressSequentially('01102026');
    await expect(from).toHaveValue('01/10/2026');

    await page.locator('[data-cy="filter-from-calendar"]').click();
    const panel = page.locator('[data-cy="filter-from-panel-panel"]');
    await expect(panel).toBeVisible();
    if (isPhone(testInfo.project.name)) await expect(panel).toHaveAttribute('data-side', 'sheet');
    await page.locator('[data-cy="filter-from-cal-day-2026-10-15"]').click();
    await expect(panel).toHaveCount(0);
    await expect(from).toHaveValue('15/10/2026');
  });

  test('trava de rolagem: a folha segura a página (posição e fundo) e devolve ao fechar', async ({
    page,
  }, testInfo) => {
    test.skip(!isPhone(testInfo.project.name), 'folha só no celular');
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/dev/ui-kit');
    await waitForApp(page);
    // Um campo bem abaixo na página: a folha tem de segurar a posição de rolagem em que estava.
    const trigger = page.locator('[data-cy="light-month-default"]');
    await trigger.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(100);

    await trigger.tap();
    const panel = page.locator('[data-cy="light-month-default-panel-panel"]');
    await expect(panel).toHaveAttribute('data-side', 'sheet');
    const locked = await page.evaluate(() => ({
      position: document.body.style.position,
      overflow: document.body.style.overflow,
      top: document.body.style.top,
      inert: document.querySelector('app-root, #root, body > div')?.hasAttribute('inert'),
    }));
    expect(locked.position).toBe('fixed');
    expect(locked.overflow).toBe('hidden');
    expect(locked.top).toBe(`-${before}px`);

    // Rolar por trás da folha não move a página (o corpo é `position: fixed`).
    await page.evaluate(() => window.scrollTo(0, 900));
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(await page.evaluate(() => document.body.style.top)).toBe(`-${before}px`);

    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.position)).toBe('');
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });

  test('diálogo de confirmação: foco preso, Esc fecha e a rolagem do fundo é travada', async ({
    page,
  }) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/dev/ui-kit');
    await waitForApp(page);
    const open = page.locator('[data-cy="light-open-dialog-risk"]');
    await open.scrollIntoViewIfNeeded();

    await open.click();
    const dialog = page.getByRole('dialog', { name: 'Estornar a movimentação?' });
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => document.body.style.position)).toBe('fixed');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.position)).toBe('');
    await expect(open).toBeFocused();
  });
});

/**
 * Gate G-UI-E3 no WebKit (T157, T163, T164, T166): Menu como folha no iPhone, Dialog/Sheet (foco,
 * inert, trava de rolagem), NumberStepper por toque, Tabs e RadioGroup. As mesmas limitações do
 * WebKit do Playwright valem (sem teclado virtual nem iOS real).
 */
test.describe('WebKit: componentes do gate G-UI-E3', () => {
  test('Menu: folha no celular (44 px), popover no desktop; Esc devolve o foco ao botão', async ({
    page,
  }, testInfo) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/dev/ui-kit');
    await waitForApp(page);
    const trigger = page.locator('[data-cy="light-menu-default"]');
    await trigger.scrollIntoViewIfNeeded();

    if (isPhone(testInfo.project.name)) await trigger.tap();
    else await trigger.click();
    const panel = page.locator('[data-cy="light-menu-default-panel-panel"]');
    await expect(page.getByRole('menu', { name: 'Ações do cartão' })).toBeVisible();
    if (isPhone(testInfo.project.name)) {
      await expect(panel).toHaveAttribute('data-side', 'sheet');
      const item = page.locator('[data-cy="light-menu-default-item-pay"]');
      expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    } else {
      await expect(panel).not.toHaveAttribute('data-side', 'sheet');
    }
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(trigger).toBeFocused();

    // Escolher um item fecha e já deixa o foco no botão (o Safari não foca no toque).
    if (isPhone(testInfo.project.name)) await trigger.tap();
    else await trigger.click();
    const item = page.locator('[data-cy="light-menu-default-item-export"]');
    if (isPhone(testInfo.project.name)) await item.tap();
    else await item.click();
    await expect(page.locator('[data-cy="light-menu-last"]')).toHaveText('Último: export');
    await expect(trigger).toBeFocused();
  });

  test('Dialog: foco preso, fundo inert, rolagem travada; fechar devolve o foco e a posição', async ({
    page,
  }) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/dev/ui-kit');
    await waitForApp(page);
    const open = page.locator('[data-cy="light-open-dialog-basic"]');
    await open.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);

    await open.click();
    const dialog = page.getByRole('dialog', { name: 'Nova compra parcelada' });
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => document.body.style.position)).toBe('fixed');
    expect(await page.locator('[data-cy="ui-kit"]').evaluate((el) => !!el.closest('[inert]'))).toBe(
      true,
    );
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      const state = await dialog.evaluate((el) => ({
        inside: el.contains(document.activeElement),
        active: document.activeElement?.outerHTML.slice(0, 140) ?? null,
      }));
      expect(state.inside, `Tab ${i + 1}: foco em ${state.active}`).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.position)).toBe('');
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
    await expect(open).toBeFocused();
  });

  test('Sheet: folha inferior no celular encostada embaixo; lateral no desktop', async ({
    page,
  }, testInfo) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/dev/ui-kit');
    await waitForApp(page);
    const phone = isPhone(testInfo.project.name);
    const open = page.locator(`[data-cy="light-open-sheet${phone ? '' : '-side'}"]`);
    await open.scrollIntoViewIfNeeded();
    if (phone) await open.tap();
    else await open.click();

    const panel = page.locator(`[data-cy="light-sheet${phone ? '' : '-side'}-panel"]`);
    await expect(panel).toBeVisible();
    const box = (await panel.boundingBox())!;
    const viewport = page.viewportSize()!;
    if (phone) {
      await expect(panel).toHaveAttribute('data-side', 'sheet');
      expect(Math.round(box.x)).toBe(0);
      expect(Math.round(box.width)).toBe(viewport.width);
      expect(Math.round(box.y + box.height)).toBeLessThanOrEqual(viewport.height);
    } else {
      await expect(panel).toHaveAttribute('data-side', 'side');
      // A folha desliza ao abrir: espera ela assentar na borda direita (a medida logo após abrir pode vir 1 px adiante).
      await expect
        .poll(async () => {
          const settled = (await panel.boundingBox())!;
          return Math.round(settled.x + settled.width);
        })
        .toBe(viewport.width);
    }
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
  });

  test('NumberStepper: toque nos botões (44 px), teclado e só dígitos', async ({
    page,
  }, testInfo) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/dev/ui-kit');
    await waitForApp(page);
    const field = page.locator('[data-cy="light-stepper-default"]');
    await field.scrollIntoViewIfNeeded();
    const plus = page.locator('[data-cy="light-stepper-default-increase"]');
    const box = (await plus.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);

    if (isPhone(testInfo.project.name)) await plus.tap();
    else await plus.click();
    await expect(field).toHaveValue('7');
    await field.focus();
    await page.keyboard.press('ArrowDown');
    await expect(field).toHaveValue('6');
    await field.fill('');
    await page.keyboard.type('a1.2');
    await expect(field).toHaveValue('12');
  });

  test('Tabs e RadioGroup: setas movem o foco e a seleção', async ({ page }) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/dev/ui-kit');
    await waitForApp(page);
    const tab = page.locator('[data-cy="light-tabs-default-tab-invoice"]');
    await tab.scrollIntoViewIfNeeded();
    await tab.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-cy="light-tabs-default-tab-limit"]')).toHaveAttribute(
      'aria-selected',
      'true',
    );

    const radio = page.locator('[data-cy="light-radio-default-full"]');
    await radio.scrollIntoViewIfNeeded();
    await radio.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[data-cy="light-radio-default-min"]')).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});

test.describe('WebKit: Markdown hostil no Web Worker (F1)', () => {
  for (const name of ['asteriscos soltos (*a *a ...)', 'tachado aberto (~~a ...)']) {
    test(`nota de 200 KB (${name}): a página responde, o editor abre e a UI mostra o texto`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      await seedPreferences(page, { language: 'pt' });
      const payload = HOSTILE_MARKDOWN[name];
      if (!payload) throw new Error(`payload ${name} não existe`);

      await openSeededNote(page, payload.build(200_000));

      await expect(page.locator('[data-cy="note-text"]')).toBeVisible({ timeout: 20_000 });
      if (isPhone(testInfo.project.name)) {
        // No celular a pré-visualização só desenha na aba "Ler".
        await page.locator('[data-cy="note-mode-tab-read"]').click();
      }
      await expect(page.locator('[data-cy="markdown-too-complex"]')).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.locator('[data-cy="markdown-plain"]')).toBeVisible();
      expect(await maxMainThreadStallMs(page)).toBeLessThan(1000);
      if (isPhone(testInfo.project.name)) {
        await page.locator('[data-cy="note-mode-tab-write"]').click();
      }
      await page.locator('[data-cy="note-text"]').click();
      await page.keyboard.type('x');
      await expect(page.locator('[data-cy="note-status"]')).toContainText('Alterações não salvas');
    });
  }
});

test.describe('WebKit: casca e gráficos (revisão A2 e M4)', () => {
  for (const [width, height] of [
    [1100, 600],
    [844, 390],
    [1024, 600],
  ] as const) {
    test(`sidebar recolhida em ${width}x${height}: todo item e o avatar são alcançáveis`, async ({
      page,
    }) => {
      await seedPreferences(page, { language: 'pt' });
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await waitForApp(page);
      await expectSidebarReachable(page);
    });
  }

  test('gráfico: o toque abre o tooltip e tocar fora o fecha (o Safari não dispara blur)', async ({
    page,
  }, testInfo) => {
    test.skip(!isPhone(testInfo.project.name), 'toque real só no projeto iPhone');
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/dev/ui-kit');
    await waitForApp(page);
    const plot = page.locator('[data-cy="light-line-chart-plot"]');
    await plot.scrollIntoViewIfNeeded();
    const box = (await plot.boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('[data-cy="light-line-chart-tooltip"]')).toBeVisible();
    const tip = (await page.locator('[data-cy="light-line-chart-tooltip"]').boundingBox())!;
    expect(tip.x).toBeGreaterThanOrEqual(0);
    expect(tip.x + tip.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.touchscreen.tap(box.x + box.width / 2, Math.max(2, box.y - 40));
    await expect(page.locator('[data-cy="light-line-chart-tooltip"]')).toHaveCount(0);
  });
});
