import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { Locator } from '@playwright/test';

import {
  expect,
  expectNoHorizontalScroll,
  runAxe,
  seedPreferences,
  test,
  VIEWPORTS,
  waitForApp,
} from './support';

/** Espera as animações do elemento acabarem (entradas com `translate`): só então a caixa é a final. */
async function settleAnimations(locator: Locator): Promise<void> {
  await locator.evaluate((el) =>
    Promise.all(el.getAnimations().map((animation) => animation.finished)),
  );
}

/**
 * UI Kit (`/dev/ui-kit`): só nos builds de desenvolvimento/mock. O projeto `mock` confere a página
 * (estados, dois temas, acessibilidade, overlays); o projeto `prod` (build de produção) confere que
 * a rota não existe e que nenhum arquivo do bundle carrega o UI Kit.
 */
test.describe('UI Kit (mock)', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'mock',
      'o UI Kit só existe nos builds de desenvolvimento/mock',
    );
  });

  for (const [name, viewport] of Object.entries({
    mobile: VIEWPORTS.mobile,
    desktop: VIEWPORTS.desktop,
  })) {
    for (const theme of ['light', 'dark'] as const) {
      test(`mostra todos os componentes nos dois temas, sem violação de acessibilidade (${name}, app ${theme})`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await seedPreferences(page, { language: 'pt', theme });
        await page.goto('/dev/ui-kit');
        await waitForApp(page);

        for (const scope of ['light', 'dark']) {
          for (const kind of [
            'select',
            'text',
            'money',
            'date',
            'month',
            'seg',
            'radio',
            'stepper',
            'tabs',
            'progress',
            'menu',
            'check',
            'switch',
            'charts',
          ]) {
            await expect(page.locator(`[data-cy="${scope}-${kind}"]`)).toBeVisible();
          }
        }
        // Cada tema mostra o seu canvas (tokens por escopo), independente do tema do app.
        const canvas = async (scope: string) =>
          page
            .locator(`[data-cy="kit-${scope}"]`)
            .evaluate((el) => getComputedStyle(el).backgroundColor);
        expect(await canvas('light')).not.toBe(await canvas('dark'));
        await expectNoHorizontalScroll(page);
        expect(await runAxe(page)).toEqual([]);
      });
    }
  }

  test('os overlays abrem a partir do UI Kit (Select como folha a 375 px, calendário, diálogo)', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto('/dev/ui-kit');
    await waitForApp(page);

    await page.locator('[data-cy="light-select-default"]').click();
    await expect(page.locator('[data-cy="light-select-default-panel-panel"]')).toHaveAttribute(
      'data-side',
      'sheet',
    );
    await page.keyboard.press('Escape');

    await page.locator('[data-cy="light-open-dialog"]').click();
    await expect(page.getByRole('dialog', { name: 'Arquivar a conta?' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

/**
 * Gate G-UI-E3 (T157, T163, T164, T166): RadioGroup, NumberStepper, Dialog, Sheet, Menu, Tabs e
 * ProgressBar no navegador de verdade (Chromium): teclado, foco preso/devolvido, `inert`, camadas e
 * alvos de toque. O WebKit (iPhone/Safari) está em `webkit.e2e.ts`.
 */
test.describe('UI Kit: componentes do gate G-UI-E3 (mock)', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'mock',
      'o UI Kit só existe nos builds de desenvolvimento/mock',
    );
  });

  test('Menu (desktop): teclado abre, navega, escolhe e devolve o foco; Esc fecha', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto('/dev/ui-kit');
    await waitForApp(page);
    const trigger = page.locator('[data-cy="light-menu-default"]');
    await trigger.scrollIntoViewIfNeeded();

    await trigger.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu', { name: 'Ações do cartão' });
    await expect(menu).toBeVisible();
    await expect(page.locator('[data-cy="light-menu-default-item-pay"]')).toBeFocused();

    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[data-cy="light-menu-default-item-export"]')).toBeFocused();
    // O item desabilitado ("Fatura fechada") é pulado.
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[data-cy="light-menu-default-item-archive"]')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(page.locator('[data-cy="light-menu-default-item-pay"]')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await page.keyboard.press('ArrowUp');
    await expect(page.locator('[data-cy="light-menu-default-item-archive"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.locator('[data-cy="light-menu-last"]')).toHaveText('Último: archive');

    await trigger.press('Enter');
    await page.keyboard.press('Tab');
    await expect(menu).toHaveCount(0);
  });

  test('Menu (375 px): abre como folha inferior com alvos de 44 px e fecha pelo botão', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto('/dev/ui-kit');
    await waitForApp(page);
    const trigger = page.locator('[data-cy="light-menu-default"]');
    await trigger.scrollIntoViewIfNeeded();
    expect((await trigger.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    await trigger.click();
    const panel = page.locator('[data-cy="light-menu-default-panel-panel"]');
    await expect(panel).toHaveAttribute('data-side', 'sheet');
    await expect(panel).toHaveAttribute('aria-modal', 'true');
    for (const id of ['pay', 'export', 'archive']) {
      const box = await page.locator(`[data-cy="light-menu-default-item-${id}"]`).boundingBox();
      expect(box!.height, `item ${id}`).toBeGreaterThanOrEqual(44);
    }
    await page.locator('[data-cy="light-menu-default-panel-close"]').click();
    await expect(panel).toHaveCount(0);
  });

  test('Dialog: foco preso, fundo inert, Select aninhado por cima, Esc fecha por camadas e devolve o foco', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto('/dev/ui-kit');
    await waitForApp(page);
    const open = page.locator('[data-cy="light-open-dialog-basic"]');
    await open.scrollIntoViewIfNeeded();

    await open.click();
    const dialog = page.getByRole('dialog', { name: 'Nova compra parcelada' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAttribute('data-side', 'center');
    expect(await page.evaluate(() => document.body.style.position)).toBe('fixed');
    // O fundo está inert: nada fora do diálogo recebe foco.
    expect(await page.locator('[data-cy="ui-kit"]').evaluate((el) => !!el.closest('[inert]'))).toBe(
      true,
    );

    // Tab circula só dentro do diálogo.
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }

    // Um Select dentro do diálogo abre por cima dele; o primeiro Esc fecha só a lista.
    await page.locator('[data-cy="light-dialog-select"]').click();
    const list = page.locator('[data-cy="light-dialog-select-panel-panel"]');
    await expect(list).toBeVisible();
    const zList = await list.locator('xpath=..').evaluate((el) => +getComputedStyle(el).zIndex);
    const zDialog = await page
      .locator('[data-cy="light-dialog-basic-backdrop"]')
      .evaluate((el) => +getComputedStyle(el).zIndex);
    expect(zList).toBeGreaterThan(zDialog);
    await page.keyboard.press('Escape');
    await expect(list).toHaveCount(0);
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.position)).toBe('');
    await expect(open).toBeFocused();
  });

  test('Dialog de alerta (dismissable=false): Esc e fundo não fecham; só a resposta fecha', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto('/dev/ui-kit');
    await waitForApp(page);
    const open = page.locator('[data-cy="light-open-dialog-alert"]');
    await open.scrollIntoViewIfNeeded();

    await open.click();
    const dialog = page.getByRole('alertdialog', { name: 'Descartar as alterações?' });
    await expect(dialog).toBeVisible();
    await expect(page.locator('[data-cy="light-dialog-alert-keep"]')).toBeFocused();
    await expect(page.locator('[data-cy="light-dialog-alert-close"]')).toHaveCount(0);

    await page.keyboard.press('Escape');
    await page
      .locator('[data-cy="light-dialog-alert-backdrop"]')
      .click({ position: { x: 4, y: 4 } });
    await expect(dialog).toBeVisible();

    await page.locator('[data-cy="light-dialog-alert-discard"]').click();
    await expect(dialog).toHaveCount(0);
    await expect(open).toBeFocused();
  });

  test('Dialog com conteúdo longo rola por dentro e não passa da tela', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto('/dev/ui-kit');
    await waitForApp(page);
    const open = page.locator('[data-cy="light-open-dialog-long"]');
    await open.scrollIntoViewIfNeeded();
    await open.click();

    const panel = page.locator('[data-cy="light-dialog-long-panel"]');
    await expect(panel).toBeVisible();
    const box = (await panel.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(800);
    const scrolls = await panel
      .locator('.panel__body')
      .evaluate((el) => el.scrollHeight > el.clientHeight);
    expect(scrolls).toBe(true);
  });

  test('Sheet: folha inferior a 375 px, painel lateral a 1280 px; Esc fecha e devolve o foco', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto('/dev/ui-kit');
    await waitForApp(page);
    const open = page.locator('[data-cy="light-open-sheet"]');
    await open.scrollIntoViewIfNeeded();
    await open.click();
    const panel = page.locator('[data-cy="light-sheet-panel"]');
    await expect(panel).toHaveAttribute('data-side', 'sheet');
    // A folha entra com `translateY(24px)`: mede só depois de a animação acabar (senão lê 1 px a menos).
    await settleAnimations(panel);
    const box = (await panel.boundingBox())!;
    expect(Math.round(box.x)).toBe(0);
    expect(Math.round(box.width)).toBe(VIEWPORTS.mobile.width);
    expect(Math.round(box.y + box.height)).toBe(VIEWPORTS.mobile.height);
    expect(
      (await page.locator('[data-cy="light-sheet-close"]').boundingBox())!.height,
    ).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(open).toBeFocused();

    await page.setViewportSize(VIEWPORTS.desktop);
    const side = page.locator('[data-cy="light-open-sheet-side"]');
    await side.scrollIntoViewIfNeeded();
    await side.click();
    const sidePanel = page.locator('[data-cy="light-sheet-side-panel"]');
    await expect(sidePanel).toHaveAttribute('data-side', 'side');
    await settleAnimations(sidePanel);
    const sideBox = (await sidePanel.boundingBox())!;
    expect(Math.round(sideBox.x + sideBox.width)).toBe(VIEWPORTS.desktop.width);
    expect(Math.round(sideBox.height)).toBe(VIEWPORTS.desktop.height);
  });

  test('Tabs: setas ativam e movem o foco; com muitas abas a lista rola e a ativa entra na vista', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto('/dev/ui-kit');
    await waitForApp(page);
    const first = page.locator('[data-cy="light-tabs-default-tab-invoice"]');
    await first.scrollIntoViewIfNeeded();
    expect((await first.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    await first.focus();
    await page.keyboard.press('ArrowRight');
    const limit = page.locator('[data-cy="light-tabs-default-tab-limit"]');
    await expect(limit).toBeFocused();
    await expect(limit).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-cy="light-tabs-default-panel-limit"]')).toBeVisible();
    await expect(page.locator('[data-cy="light-tabs-default-panel-invoice"]')).toBeHidden();
    // A desabilitada é pulada.
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-cy="light-tabs-default-tab-history"]')).toBeFocused();

    const manyFirst = page.locator('[data-cy="light-tabs-full-tab-t1"]');
    await manyFirst.scrollIntoViewIfNeeded();
    const list = page.locator('[data-cy="light-tabs-full"] [role="tablist"]');
    expect(await list.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    await manyFirst.focus();
    await page.keyboard.press('End');
    const last = page.locator('[data-cy="light-tabs-full-tab-t10"]');
    await expect(last).toBeFocused();
    await expect
      .poll(async () => {
        const [tab, box] = await Promise.all([last.boundingBox(), list.boundingBox()]);
        return tab!.x >= box!.x - 1 && tab!.x + tab!.width <= box!.x + box!.width + 1;
      })
      .toBe(true);
    await expectNoHorizontalScroll(page);
  });

  test('NumberStepper: teclado, botões de 44 px, só dígitos, limites e segurar o botão', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto('/dev/ui-kit');
    await waitForApp(page);
    const field = page.locator('[data-cy="light-stepper-default"]');
    await field.scrollIntoViewIfNeeded();
    const plus = page.locator('[data-cy="light-stepper-default-increase"]');
    const minus = page.locator('[data-cy="light-stepper-default-decrease"]');
    for (const button of [plus, minus]) {
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await expect(field).toHaveValue('6');
    await expect(field).toHaveAttribute('aria-valuetext', '6 parcelas');

    await field.focus();
    await page.keyboard.press('ArrowUp');
    await expect(field).toHaveValue('7');
    await page.keyboard.press('PageUp');
    await expect(field).toHaveValue('17');
    await page.keyboard.press('End');
    await expect(field).toHaveValue('36');
    await page.keyboard.press('Home');
    await expect(field).toHaveValue('1');
    await expect(minus).toHaveAttribute('aria-disabled', 'true');

    await field.fill('');
    await page.keyboard.type('1e,.-2');
    await expect(field).toHaveValue('12');
    await page.keyboard.press('Tab');
    await expect(field).toHaveValue('12');

    await plus.click();
    await expect(field).toHaveValue('13');
    await plus.hover();
    await page.mouse.down();
    await page.waitForTimeout(1000);
    await page.mouse.up();
    expect(Number(await field.inputValue())).toBeGreaterThanOrEqual(16);
    expect(Number(await field.inputValue())).toBeLessThanOrEqual(36);
  });

  test('RadioGroup: Tab entra no marcado, setas movem e marcam, a desabilitada é pulada', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto('/dev/ui-kit');
    await waitForApp(page);
    const group = page.locator('[data-cy="light-radio-default"]');
    await group.scrollIntoViewIfNeeded();
    const full = page.locator('[data-cy="light-radio-default-full"]');
    const min = page.locator('[data-cy="light-radio-default-min"]');
    const custom = page.locator('[data-cy="light-radio-default-custom"]');

    await full.focus();
    await page.keyboard.press('ArrowDown');
    await expect(min).toBeFocused();
    await expect(min).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(custom).toBeFocused();
    await expect(custom).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(full).toBeFocused();
    expect((await full.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });

  test('ProgressBar: papel, valores e texto de estado (não só cor)', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto('/dev/ui-kit');
    await waitForApp(page);
    const warning = page.locator('[data-cy="light-progress-warning-track"]');
    await warning.scrollIntoViewIfNeeded();

    await expect(warning).toHaveAttribute('role', 'progressbar');
    await expect(warning).toHaveAttribute('aria-valuenow', '85');
    await expect(warning).toHaveAttribute('aria-valuetext', /^Atenção: /);
    await expect(page.locator('[data-cy="light-progress-warning-text"]')).toContainText('Atenção');
    await expect(page.locator('[data-cy="light-progress-risk-text"]')).toContainText('Risco');
    await expect(page.locator('[data-cy="light-progress-busy-track"]')).not.toHaveAttribute(
      'aria-valuenow',
      /.*/,
    );
    expect(
      await page
        .locator('[data-cy="light-progress-default-track"] > div')
        .evaluate(
          (el) =>
            el.getBoundingClientRect().width / el.parentElement!.getBoundingClientRect().width,
        ),
    ).toBeCloseTo(0.4, 1);
  });

  for (const [name, viewport] of Object.entries({
    mobile: VIEWPORTS.mobile,
    desktop: VIEWPORTS.desktop,
  })) {
    test(`sem violação de acessibilidade com Menu e Dialog abertos (${name})`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/dev/ui-kit');
      await waitForApp(page);

      const trigger = page.locator('[data-cy="light-menu-full"]');
      await trigger.scrollIntoViewIfNeeded();
      await trigger.click();
      await expect(page.getByRole('menu')).toBeVisible();
      // Popover de menu no portal do `body` (sem papel de diálogo): o axe acusa só `region` ("conteúdo
      // fora de marcos") para ele; é o padrão de menu do APG, não um defeito.
      const violations = await runAxe(page);
      expect(
        violations.filter(
          (v) => !(v.id === 'region' && v.targets.every((t) => t.includes('app-overlay-panel'))),
        ),
      ).toEqual([]);
      await page.keyboard.press('Escape');

      const open = page.locator('[data-cy="light-open-dialog-basic"]');
      await open.scrollIntoViewIfNeeded();
      await open.click();
      await expect(page.getByRole('dialog', { name: 'Nova compra parcelada' })).toBeVisible();
      expect(await runAxe(page)).toEqual([]);
    });
  }
});

test.describe('UI Kit fora do build de desenvolvimento', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'prod', 'só o build de produção tem de ficar sem o UI Kit');
  });

  test('a rota /dev/ui-kit cai na página "não encontrada"', async ({ page }) => {
    await page.goto('/dev/ui-kit');
    await waitForApp(page);

    await expect(page.locator('[data-cy="ui-kit"]')).toHaveCount(0);
    await expect(page.locator('[data-cy="page-title"]')).toHaveText('Página não encontrada');
  });

  test('nenhum arquivo do bundle de produção contém o UI Kit', async () => {
    const dist = resolve(process.cwd(), 'dist', 'moneylog', 'browser');
    const files = (function walk(dir: string): string[] {
      return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? walk(path) : [path];
      });
    })(dist).filter((f) => /\.(js|mjs|css|html)$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      expect(text, `${file} cita o UI Kit`).not.toMatch(/ui-kit|UiKit|dev\/ui-kit/);
    }
  });

  test('nenhum arquivo do bundle de produção contém dados de demonstração (A1 da revisão)', async () => {
    const dist = resolve(process.cwd(), 'dist', 'moneylog', 'browser');
    const files = (function walk(dir: string): string[] {
      return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? walk(path) : [path];
      });
    })(dist).filter((f) => /\.(js|mjs|json|html)$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    // Ids das fixtures de `modules/reports/mock-data` e a facade demo: só podem existir em dev/mock.
    // `DEMO_MODE` fica de fora: é o código de erro do backend (ProblemDetails) com a mensagem traduzida, presente em produção.
    const demo =
      /demo-(housing|food|shopping|transport|subscriptions|leisure|health)|ReportsDemoFacade|demoIncomeExpenseSeries|demoSpendingByCategory|reports-demo|DemoHttpBackend|mountDemoBanner|Modo demonstração|Demo mode: changes|buildWorld|demo-banner/;
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      expect(text, `${file} contém dado de demonstração`).not.toMatch(demo);
    }
  });
});
