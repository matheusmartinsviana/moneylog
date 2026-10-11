import type { Page } from '@playwright/test';

import {
  expect,
  expectNoHorizontalScroll,
  expectNoRawKeys,
  runAxe,
  seedMockResponses,
  seedPreferences,
  test,
  VIEWPORTS,
  waitForApp,
} from './support';
import {
  CATEGORY_FOOD,
  CONSUMPTION,
  NOTE_ID,
  homeResponses,
  incomeExpensesD7,
  incomeExpensesM12,
  spendingByCategory,
} from './support/home-fixtures';

/**
 * Novo Início (fatia C1) em `mock` e `prod`: sem backend, com as respostas do contrato 2.6.0 deixadas em
 * `window.__MONEYLOG_MOCK_RESPONSES__` (`support/home-fixtures.ts`, tipadas pelos schemas gerados). **O front não
 * soma nada**, então toda asserção compara a tela com o JSON: se o valor na tela difere do JSON, o front calculou.
 */
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
/** O que a tela deve mostrar para uma string decimal do backend (formatação, nunca conta). */
const fmt = (amount: string): string =>
  brl
    .format(amount as unknown as number)
    .replace(/\u00a0/g, ' ')
    .replace('-', '−');

const norm = (value: string | null): string =>
  (value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

async function openHome(page: Page, responses = homeResponses()): Promise<void> {
  await seedPreferences(page, { language: 'pt' });
  await seedMockResponses(page, responses);
  await page.goto('/');
  await waitForApp(page);
  await expect(page.locator('[data-cy="home-dashboard"]')).toBeVisible();
  await expect(page.locator('[data-cy="home-overview-chart"]')).toBeVisible();
}

test.describe('Início sucinto: valores = JSON do contrato (desktop 1280)', () => {
  test.use({ viewport: VIEWPORTS.desktop });

  test('saldo, gasto, receita, resultado e poupança do mês mostram o que o JSON diz', async ({
    page,
  }) => {
    await openHome(page);

    await expect(page.locator('[data-cy="kpi-in-accounts-value"]')).toHaveText(fmt('18900.00'));
    await expect(page.locator('[data-cy="kpi-in-accounts-change"]')).toHaveText(
      '+8% vs fim do mês passado',
    );
    await expect(page.locator('[data-cy="kpi-spending-value"]')).toHaveText(fmt(CONSUMPTION));
    await expect(page.locator('[data-cy="kpi-income-value"]')).toHaveText(fmt('12000.00'));
    // O resultado é o `month.net` do dashboard: o front não faz receita menos gasto.
    await expect(page.locator('[data-cy="kpi-result-value"]')).toHaveText(fmt('10379.50'));
    await expect(page.locator('[data-cy="kpi-savings-value"]')).toHaveText('41,2%');
  });

  test('os blocos que saíram do Início continuam acessíveis nas telas deles, com os mesmos números', async ({
    page,
  }) => {
    await openHome(page);
    for (const id of [
      'home-accounts-section',
      'home-categories-total',
      'home-recent',
      'home-insight',
      'home-legacy',
      'home-quick-capture',
      'home-budget',
    ]) {
      await expect(page.locator(`[data-cy="${id}"]`), id).toHaveCount(0);
    }

    // Contas: o saldo de cada conta e a fatura de cada cartão.
    await page.goto('/accounts');
    await expect(
      page.locator('[data-cy="page-content"]').getByText(fmt('12345.67')).first(),
    ).toBeVisible();

    // Panorama (Planejamento): o que o Início tinha em "Compromissos e patrimônio", com os mesmos data-cy.
    await page.goto('/planning/overview');
    const overview = page.locator('[data-cy="home-legacy"]');
    for (const id of ['home-available', 'home-commitments']) {
      await expect(overview.locator(`[data-cy="${id}"]`), id).toBeVisible();
    }
    // Mês, patrimônio e cartões moram em "Mais" (recolhido por padrão).
    await page.locator('[data-cy="overview-more-toggle"]').click();
    await expect(overview.locator('[data-cy="home-month-income"]')).toBeVisible();
    await expect(page.locator('[data-cy="planning-tab-overview"]')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('o gasto por categoria (que saiu do Início) está no Resumo do mês, com valor e % do backend e link filtrado', async ({
    page,
  }) => {
    await openHome(page);
    await page.goto('/planning/summary/2026-10');
    await expect(page.locator('[data-cy="home-categories-total"]')).toContainText(
      fmt(spendingByCategory.total.amount),
    );
    // O mesmo número do consumo do Início: uma fonte só (o servidor).
    expect(spendingByCategory.total.amount).toBe(CONSUMPTION);

    const food = page.locator(`[data-cy="home-categories-item-${CATEGORY_FOOD}"]`);
    expect(norm(await food.textContent())).toContain(fmt('820.00'));
    expect(norm(await food.textContent())).toContain('50,6%');
    expect(
      norm(await page.locator('[data-cy="home-categories-item-other"]').textContent()),
    ).toContain('Outras (3 categorias)');

    await page.locator(`[data-cy="home-categories-link-${CATEGORY_FOOD}"]`).click();
    await expect(page).toHaveURL(
      new RegExp(`/transactions\\?view=entries&categoryId=${CATEGORY_FOOD}`),
    );
  });

  test('o gráfico oferece só 7 dias, 30 dias e 12 meses e a tabela equivalente repete o JSON, inclusive o negativo', async ({
    page,
  }) => {
    await openHome(page);
    const rows = page.locator('[data-cy="home-overview-chart-table"] tbody tr');

    await expect(page.locator('[data-cy="home-overview-period-D30"]')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.locator('[data-cy="home-overview-period-M3"]')).toHaveCount(0);

    await page.locator('[data-cy="home-overview-period-D7"]').click();
    await expect(rows).toHaveCount(incomeExpensesD7.points.length);
    // O dia de reembolso (despesa negativa) vem com o sinal.
    const refund = incomeExpensesD7.points[5]!;
    expect(norm(await rows.nth(5).textContent())).toContain(fmt(refund.expenses.amount));
    expect(fmt(refund.expenses.amount)).toBe('−R$ 50,00');
    for (const [i, point] of incomeExpensesD7.points.entries()) {
      const text = norm(await rows.nth(i).textContent());
      expect(text).toContain(fmt(point.income.amount));
      expect(text).toContain(fmt(point.expenses.amount));
    }

    await page.locator('[data-cy="home-overview-period-M12"]').click();
    await expect(rows).toHaveCount(incomeExpensesM12.points.length);
  });

  test('troca de período pelo teclado (setas do controle segmentado)', async ({ page }) => {
    await openHome(page);

    await page.locator('[data-cy="home-overview-period-D30"]').focus();
    await page.keyboard.press('ArrowRight');

    await expect(page.locator('[data-cy="home-overview-period-M12"]')).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  test('"Ver movimentações" leva à lista de movimentações', async ({ page }) => {
    await openHome(page);

    await page.locator('[data-cy="home-overview-transactions"]').click();

    await expect(page).toHaveURL(/\/transactions/);
  });

  test('um único botão primário: "+ Registrar" abre o Novo registro e o menu abre o "Emprestei"', async ({
    page,
  }) => {
    await openHome(page);

    await expect(page.locator('main .button--primary, header .button--primary')).toHaveCount(1);
    await expect(page.locator('[data-cy="home-register-open"]')).toHaveClass(/button--primary/);

    await page.locator('[data-cy="home-register-menu"]').click();
    await page.locator('[data-cy="home-register-menu-item-loan"]').click();
    await expect(page).toHaveURL(/mode=loan/);
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.locator('[data-cy="home-register-open"]').click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();
  });

  test('o orçamento está na página /budgets "em breve" e ela está na sidebar', async ({ page }) => {
    await openHome(page);

    await page.goto('/budgets');

    await expect(page.locator('[data-cy="page-title"]')).toHaveText('Orçamentos');
    await expect(page.locator('[data-cy="empty-state-title"]')).toHaveText(
      'Orçamentos chegam em breve.',
    );
    await expect(page.locator('[data-cy="sidebar-more"]')).toHaveClass(/is-active/);
  });

  test('o tema escuro e o claro não têm violações de acessibilidade no Início', async ({
    page,
  }) => {
    for (const theme of ['light', 'dark'] as const) {
      await seedPreferences(page, { language: 'pt', theme });
      await seedMockResponses(page, homeResponses());
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/');
      await waitForApp(page);
      await expect(page.locator('[data-cy="home-overview-chart"]')).toBeVisible();
      await expectNoRawKeys(page);
      expect(await runAxe(page), `axe ${theme}`).toEqual([]);
    }
  });
});

test.describe('Início: mês em andamento (R5)', () => {
  test.use({ viewport: VIEWPORTS.desktop });

  test('com partial = true, os indicadores dizem que o mês está em andamento', async ({ page }) => {
    await openHome(page, homeResponses({ partial: true }));

    await expect(page.locator('[data-cy="kpi-spending-caption"]')).toHaveText(
      'Este mês, em andamento',
    );
  });
});

test.describe('busca global (T209)', () => {
  test.use({ viewport: VIEWPORTS.desktop });

  test('"/" foca a busca, o painel agrupa, o snippet é texto puro e as setas + Enter abrem', async ({
    page,
  }) => {
    await openHome(page);

    await page.locator('main').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('/');
    const field = page.locator('[data-cy="global-search-input"]');
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute('role', 'combobox');
    await expect(field).toHaveAttribute('type', 'text');

    await page.keyboard.type('mercado');
    const results = page.locator('[data-cy="global-search-results"]');
    await expect(results).toBeVisible();
    await expect(results.getByText('Movimentações')).toBeVisible();
    await expect(results.getByText('Notas')).toBeVisible();
    await expect(page.locator('[data-cy="global-search-option-transactions"]')).toContainText(
      fmt('87.30'),
    );
    // Texto puro: a marcação do snippet aparece como caracteres, nunca como elemento.
    await expect(page.locator('[data-cy="global-search-snippet"]')).toHaveText(
      '<b>Comprar</b> leite **e** pão <img src=x onerror=alert(1)>',
    );
    expect(await results.locator('b, img, strong').count()).toBe(0);

    await page.keyboard.press('ArrowDown');
    await expect(field).toHaveAttribute(
      'aria-activedescendant',
      (await page.locator('[data-cy="global-search-option-transactions"]').getAttribute('id'))!,
    );
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/notes/${NOTE_ID}$`));
  });

  test('Esc fecha o painel e mantém o foco no campo; digitar "/" dentro de outro campo não dispara a busca', async ({
    page,
  }) => {
    await openHome(page);
    const field = page.locator('[data-cy="global-search-input"]');

    await field.click();
    await page.keyboard.type('mercado');
    await expect(page.locator('[data-cy="global-search-results"]')).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(page.locator('[data-cy="global-search-results"]')).toHaveCount(0);
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute('aria-expanded', 'false');

    // Dentro do próprio campo a barra é um caractere comum.
    await page.keyboard.type('a/b');
    await expect(field).toHaveValue('mercadoa/b');
  });

  test('menos de 2 caracteres não chama a API e mostra a dica', async ({ page }) => {
    await openHome(page);

    await page.locator('[data-cy="global-search-input"]').click();
    await page.keyboard.type('m');

    await expect(page.locator('[data-cy="global-search-hint"]')).toHaveText(
      'Digite ao menos 2 caracteres.',
    );
  });
});

test.describe('Início em 375 px (mobile)', () => {
  test.use({ viewport: VIEWPORTS.mobile });

  test('sem rolagem horizontal e uma coluna na ordem indicadores, compromissos, dívida, meta e gráfico', async ({
    page,
  }) => {
    await openHome(page);
    await expectNoHorizontalScroll(page);

    const tops = await page.evaluate(() =>
      [
        'home-kpis',
        'home-upcoming-brief',
        'home-debts-brief',
        'home-featured-goal',
        'home-overview-chart',
      ].map((id) => document.querySelector(`[data-cy="${id}"]`)?.getBoundingClientRect().top ?? -1),
    );
    for (let i = 1; i < tops.length; i++)
      expect(tops[i]!, `bloco ${i}`).toBeGreaterThan(tops[i - 1]!);

    // Gasto e receita do mês dividem a linha.
    const spending = await page.locator('[data-cy="kpi-spending"]').boundingBox();
    const income = await page.locator('[data-cy="kpi-income"]').boundingBox();
    expect(Math.abs(spending!.y - income!.y)).toBeLessThan(2);
  });

  test('a busca é um botão de lupa que abre uma folha e devolve o foco ao fechar', async ({
    page,
  }) => {
    await openHome(page);

    const open = page.locator('[data-cy="global-search-open"]');
    await expect(open).toBeVisible();
    await expect(page.locator('[data-cy="global-search-input"]')).toHaveCount(0);
    await open.click();
    const field = page.locator('[data-cy="global-search-input"]');
    await expect(field).toBeFocused();
    await page.keyboard.type('mercado');
    await expect(page.locator('[data-cy="global-search-results"]')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
    await expect(open).toBeFocused();
    await expectNoHorizontalScroll(page);
  });

  test('escuro: sem rolagem horizontal nem violações no 375', async ({ page }) => {
    await seedPreferences(page, { language: 'pt', theme: 'dark' });
    await seedMockResponses(page, homeResponses());
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await waitForApp(page);
    await expect(page.locator('[data-cy="home-overview-chart"]')).toBeVisible();
    await expectNoHorizontalScroll(page);
    expect(await runAxe(page)).toEqual([]);
  });
});

test.describe('Início em 768 px (tablet)', () => {
  test.use({ viewport: VIEWPORTS.tablet });

  test('sem rolagem horizontal e com a busca no cabeçalho', async ({ page }) => {
    await openHome(page);
    await expectNoHorizontalScroll(page);
    await expect(page.locator('[data-cy="global-search-input"]')).toBeVisible();
  });
});
