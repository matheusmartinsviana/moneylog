import {
  BOTTOM_NAV_ORDER,
  expect,
  expectNoHorizontalScroll,
  Lang,
  NAV_LABELS,
  ROUTES,
  seedPreferences,
  test,
  VIEWPORTS,
  waitForApp,
} from './support';

/**
 * T31 (Etapa 2): BUG-02 e BUG-04 do QA da Etapa 1.
 * - S-56: rótulos da barra inferior completos em 375 px, com a tipografia de tab bar (10 px).
 * - S-57: "Novo registro" é o nome único da ação e da página `/quick-add`.
 */

const LANGS: Lang[] = ['pt', 'en', 'es'];

/** Rótulos com texto visível na barra inferior (o "+" só tem nome acessível). */
const LABELED_KEYS = BOTTOM_NAV_ORDER.filter((key) => key !== 'quickAdd');

test.describe('barra inferior em 375 × 812 (S-56)', () => {
  test.use({ viewport: VIEWPORTS.mobile });

  for (const lang of LANGS) {
    test(`idioma ${lang}: os 4 rótulos aparecem inteiros, com ≥ 10 px e sem reticências`, async ({
      page,
    }) => {
      await seedPreferences(page, { language: lang });
      for (const route of ROUTES) {
        await page.goto(route.path);
        await waitForApp(page);

        const labels = await page
          .locator('[data-cy="bottom-nav"] .bottom-nav__label')
          .evaluateAll((nodes) =>
            nodes.map((node) => {
              const style = getComputedStyle(node);
              return {
                text: node.textContent?.trim() ?? '',
                scrollWidth: node.scrollWidth,
                clientWidth: node.clientWidth,
                fontSize: Number.parseFloat(style.fontSize),
                textOverflow: style.textOverflow,
              };
            }),
          );

        expect(
          labels.map((label) => label.text),
          route.path,
        ).toEqual(LABELED_KEYS.map((key) => NAV_LABELS[lang][key]));
        for (const label of labels) {
          expect(label.scrollWidth, `"${label.text}" cabe em ${route.path}`).toBeLessThanOrEqual(
            label.clientWidth,
          );
          expect(label.fontSize, `"${label.text}" com fonte ≥ 10 px`).toBeGreaterThanOrEqual(10);
          expect(label.textOverflow, `"${label.text}" sem reticências`).not.toBe('ellipsis');
        }
        await expectNoHorizontalScroll(page);
      }
    });
  }

  test('o nome acessível de Movimentações contém o texto visível (WCAG 2.5.3)', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForApp(page);
    const link = page.locator('[data-cy="bottom-nav-transactions"]');
    const visible = (await link.locator('.bottom-nav__label').innerText()).trim();
    expect(visible).toBe(NAV_LABELS.pt['transactions']);
    await expect(link).toHaveAccessibleName(new RegExp(visible));
  });
});

test.describe('"Novo registro" é o nome único de /quick-add (S-57)', () => {
  for (const lang of LANGS) {
    const name = NAV_LABELS[lang]['quickAdd']!;

    test(`idioma ${lang} em 1280: botão da sidebar e título da página são "${name}"`, async ({
      page,
    }) => {
      await page.setViewportSize(VIEWPORTS.desktop);
      await seedPreferences(page, { language: lang });
      await page.goto('/');
      await waitForApp(page);

      const button = page.locator('[data-cy="sidebar-quickAdd"]');
      await expect(button).toHaveText(name);
      await expect(button).toHaveAccessibleName(name);
      await button.click();
      await expect(page).toHaveURL(/\/quick-add$/);
      await expect(page.locator('h1')).toHaveText(name);
      await expect(page).toHaveTitle(`${name} · moneylog`);
    });

    test(`idioma ${lang} em 375: o "+" e o título da página são "${name}"`, async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.mobile);
      await seedPreferences(page, { language: lang });
      await page.goto('/');
      await waitForApp(page);

      const plus = page.locator('[data-cy="bottom-nav-quickAdd"]');
      await expect(plus).toHaveAccessibleName(name);
      await plus.click();
      await expect(page).toHaveURL(/\/quick-add$/);
      await expect(page.locator('h1')).toHaveText(name);
      await expect(page.locator('body')).not.toContainText(/captura rápida|quick capture/i);
    });
  }
});
