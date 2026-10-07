import { resolve } from 'node:path';

import { expectNoHorizontalScroll, test, VIEWPORTS, ViewportName, waitForApp } from './support';

/**
 * Capturas de evidência do QA (T20 CA 3). Só roda com `E2E_EVIDENCE=1`, para não reescrever
 * arquivos versionados em toda execução: `E2E_EVIDENCE=1 npm run e2e -- --project=prod evidence`.
 */
const OUT_DIR = resolve(__dirname, '..', '..', 'docs', 'qa', 'evidencias', 'etapa-1');

const PAGES: Record<ViewportName, { path: string; name: string }[]> = {
  mobile: [
    { path: '/', name: 'inicio' },
    { path: '/more', name: 'mais' },
    { path: '/settings', name: 'configuracoes' },
  ],
  tablet: [
    { path: '/', name: 'inicio' },
    { path: '/cards', name: 'cartoes' },
  ],
  desktop: [
    { path: '/', name: 'inicio' },
    { path: '/settings', name: 'configuracoes' },
  ],
};

const SIZE: Record<ViewportName, number> = { mobile: 375, tablet: 768, desktop: 1280 };

test.skip(!process.env['E2E_EVIDENCE'], 'capturas só com E2E_EVIDENCE=1');

for (const viewport of Object.keys(VIEWPORTS) as ViewportName[]) {
  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`${SIZE[viewport]} ${scheme}`, () => {
      test.use({ viewport: VIEWPORTS[viewport], colorScheme: scheme });

      test(`capturas ${viewport} ${scheme}`, async ({ page }) => {
        for (const p of PAGES[viewport]) {
          await page.goto(p.path);
          await waitForApp(page);
          await page.evaluate(() => document.fonts.ready);
          await expectNoHorizontalScroll(page);
          const tema = scheme === 'light' ? 'claro' : 'escuro';
          await page.screenshot({
            path: `${OUT_DIR}/${SIZE[viewport]}-${tema}-${p.name}.png`,
            fullPage: false,
          });
        }
      });
    });
  }
}

test.describe('tooltip da sidebar recolhida', () => {
  test.use({ viewport: VIEWPORTS.tablet, colorScheme: 'light' });

  test('captura 768 com foco no item Cartões', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await page.locator('[data-cy="sidebar-transactions"]').focus();
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT_DIR}/768-claro-foco-sidebar.png` });
  });
});

test.describe('foco na barra inferior', () => {
  test.use({ viewport: VIEWPORTS.mobile, colorScheme: 'light' });

  test('captura 375 com foco no "+"', async ({ page }) => {
    await page.goto('/goals');
    await waitForApp(page);
    await page.locator('[data-cy="bottom-nav-transactions"]').focus();
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT_DIR}/375-claro-foco-bottom-nav.png` });
  });
});

test.describe('item ativo focado na sidebar', () => {
  test.use({ viewport: VIEWPORTS.desktop, colorScheme: 'light' });

  test('captura 1280 com foco no item ativo', async ({ page }) => {
    await page.goto('/transactions');
    await waitForApp(page);
    await page.locator('[data-cy="sidebar-home"]').focus();
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT_DIR}/1280-claro-foco-item-ativo.png` });
  });
});
