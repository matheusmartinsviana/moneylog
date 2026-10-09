import type { Page } from '@playwright/test';

import { expect, seedMockResponses, seedPreferences, test, waitForApp } from './support';
import { homeResponses, upcoming } from './support/home-fixtures';

/**
 * Regra "tela sucinta" (`src/styles/README.md`, ADR-011): o Início cabe na tela **sem rolar a página** nem
 * cortar valores, em 1280×720, 1440×800 e no celular 390×844, nos temas claro e escuro, em português. Roda em
 * `mock`, `prod` (respostas do contrato semeadas, com 3 compromissos para o pior caso) e `demo` (o backend de exemplo,
 * dados sintéticos). Falha se o documento passa da viewport (vertical ou horizontal), se algum elemento do conteúdo
 * tem rolagem ou corte horizontal ou se o painel do Início precisou de rolagem própria.
 */
const SCREENS = [
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1440x800', width: 1440, height: 800 },
  { name: '390x844', width: 390, height: 844 },
] as const;
const THEMES = ['light', 'dark'] as const;

/** Três compromissos dos próximos 7 dias (sintéticos): o máximo que o Início mostra. */
const UPCOMING_THREE = {
  ...upcoming,
  items: [
    ['Aluguel', '2026-10-11', '1800.00', 'TOMORROW'],
    ['Internet', '2026-10-12', '119.90', 'NEXT_7_DAYS'],
    ['Streaming', '2026-10-14', '39.90', 'NEXT_7_DAYS'],
  ].map(([label, dueDate, amount, bucket]) => ({
    kind: 'RECURRENCE',
    bucket,
    dueDate,
    direction: 'OUT',
    amount: { amount, currency: 'BRL' },
    label,
    refType: 'RECURRENCE',
    refId: null,
    items: [],
  })),
};

/** Mede o que o teste cobra: o documento, os elementos do conteúdo e o painel do Início. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const content = document.querySelector('main') ?? document.body;
    const scrollsX = (el: Element): boolean => {
      const overflow = getComputedStyle(el).overflowX;
      // Elementos só para leitores de tela (1 px, recortados) não são conteúdo cortado.
      if (el.clientWidth <= 1) return false;
      // Folga de 4 px: o `Disclosure` ("Mais") sobra 4 px de cada lado para o anel de foco (margem negativa).
      return el.scrollWidth > el.clientWidth + 4 && overflow !== 'auto' && overflow !== 'scroll';
    };
    const dash = document.querySelector('[data-cy="home-dashboard"]');
    return {
      pageHeight: doc.scrollHeight,
      innerHeight: window.innerHeight,
      pageWidth: doc.scrollWidth,
      innerWidth: window.innerWidth,
      horizontal: [content, ...content.querySelectorAll('*')]
        .filter(scrollsX)
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className)}`.slice(0, 80)),
      panelScroll: dash ? dash.scrollHeight - dash.clientHeight : 0,
    };
  });
}

for (const screen of SCREENS) {
  for (const theme of THEMES) {
    test(`Dado ${screen.name} no tema ${theme} em português, quando abro o Início, então ele cabe na tela sem rolar`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: screen.width, height: screen.height });
      await seedPreferences(page, { language: 'pt', theme });
      if (testInfo.project.name !== 'demo') {
        await seedMockResponses(page, {
          ...homeResponses(),
          '/v1/dashboard/upcoming': UPCOMING_THREE,
        });
      }
      await page.goto('/');
      await waitForApp(page);
      await expect(page.locator('[data-cy="home-dashboard"]')).toBeVisible();
      await expect(page.locator('[data-cy="home-overview-chart"]')).toBeVisible();
      // Dá tempo de a fila de leituras terminar (as últimas a chegar mexem na altura dos blocos).
      await page.waitForTimeout(600);

      const m = await measure(page);
      expect(m.pageHeight, 'a página não rola na vertical').toBeLessThanOrEqual(m.innerHeight);
      expect(m.pageWidth, 'a página não rola na horizontal').toBeLessThanOrEqual(m.innerWidth);
      expect(m.horizontal, 'nenhum elemento com corte ou rolagem horizontal').toEqual([]);
      expect(
        m.panelScroll,
        'o painel do Início não precisa de rolagem própria',
      ).toBeLessThanOrEqual(1);
    });
  }
}

/**
 * As demais telas (auditoria "tela sucinta"): em 1280×720, com os dados sintéticos do modo demo, a página não rola nem na
 * vertical nem na horizontal; a lista principal rola dentro do próprio painel. Só roda no projeto `demo` (os projetos
 * `mock` partem do banco vazio, o que não exercita as listas).
 */
const OTHER_SCREENS = [
  '/transactions',
  '/accounts',
  '/cards',
  '/goals',
  '/planning/overview',
  '/planning/recurrences',
  '/planning/occurrences',
  '/planning/summary',
  '/planning/projections',
  '/planning/debts',
  '/planning/third-parties',
  '/planning/commitments',
  '/people',
  '/notes',
  '/vault',
  '/ai',
  '/mcp',
  '/settings',
  '/import',
  '/notifications',
  '/budgets',
  '/insights',
  // Detalhes (ids determinísticos do mundo de exemplo do modo demo): cartão, fatura, meta, pessoa e compromisso.
  '/cards/00000003-0000-4000-8000-000000000001',
  '/cards/00000003-0000-4000-8000-000000000001/invoices/00000004-0000-4000-8000-000000000014',
  '/goals/00000008-0000-4000-8000-000000000001',
  '/people/00000006-0000-4000-8000-000000000001',
  '/planning/commitments/00000010-0000-4000-8000-000000000001',
] as const;

for (const route of OTHER_SCREENS) {
  test(`Dado 1280x720 em português, quando abro ${route}, então a página não rola`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'demo', 'usa os dados sintéticos do modo demo');
    await page.setViewportSize({ width: 1280, height: 720 });
    await seedPreferences(page, { language: 'pt', theme: 'dark' });
    await page.goto(route);
    await waitForApp(page);
    // Dá tempo de o backend de exemplo responder e de a lista aparecer.
    await page.waitForTimeout(2500);

    const m = await measure(page);
    expect(m.pageHeight, 'a página não rola na vertical').toBeLessThanOrEqual(m.innerHeight);
    expect(m.pageWidth, 'a página não rola na horizontal').toBeLessThanOrEqual(m.innerWidth);
    expect(m.horizontal, 'nenhum elemento com corte ou rolagem horizontal').toEqual([]);
  });
}
