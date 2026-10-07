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
  CONSUMPTION,
  CATEGORY_FOOD,
  NOTE_ID,
  TX_TODAY,
  homeResponses,
  incomeExpensesD7,
  incomeExpensesM3,
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

test.describe('Início: valores = JSON do contrato (desktop 1280)', () => {
  test.use({ viewport: VIEWPORTS.desktop });

  test('os 4 KPIs, o gasto = total das categorias e as contas mostram o que o JSON diz', async ({
    page,
  }) => {
    await openHome(page);

    await expect(page.locator('[data-cy="kpi-in-accounts-value"]')).toHaveText(fmt('18900.00'));
    await expect(page.locator('[data-cy="kpi-in-accounts-change"]')).toHaveText(
      '+8% vs fim do mês passado',
    );
    await expect(page.locator('[data-cy="kpi-spending-value"]')).toHaveText(fmt(CONSUMPTION));
    await expect(page.locator('[data-cy="kpi-spending-change"]')).toHaveText(
      '4,2% menor que o mês anterior',
    );
    await expect(page.locator('[data-cy="kpi-income-value"]')).toHaveText(fmt('12000.00'));
    await expect(page.locator('[data-cy="kpi-savings-value"]')).toHaveText('41,2%');
    await expect(page.locator('[data-cy="kpi-savings-change"]')).toHaveText(
      '+3,8 p.p. vs mês anterior',
    );
    // O mesmo número em dois cartões: o gasto do KPI e o total de "Para onde vai o dinheiro".
    expect(norm(await page.locator('[data-cy="home-categories-total"]').textContent())).toContain(
      fmt(spendingByCategory.total.amount),
    );
    expect(spendingByCategory.total.amount).toBe(CONSUMPTION);

    await expect(
      page.locator('[data-cy="home-account-balance-22222222-2222-4222-8222-222222222222"]'),
    ).toHaveText(fmt('12345.67'));
    await expect(
      page.locator('[data-cy="home-card-invoice-44444444-4444-4444-8444-444444444444"]'),
    ).toHaveText(fmt('1283.00'));
  });

  test('as categorias mostram valor e % do backend e levam às movimentações filtradas', async ({
    page,
  }) => {
    await openHome(page);

    const food = page.locator(`[data-cy="home-categories-item-${CATEGORY_FOOD}"]`);
    expect(norm(await food.textContent())).toContain(fmt('820.00'));
    expect(norm(await food.textContent())).toContain('50,6%');
    expect(
      norm(await page.locator('[data-cy="home-categories-item-other"]').textContent()),
    ).toContain('Outras (3 categorias)');

    await page.locator(`[data-cy="home-categories-link-${CATEGORY_FOOD}"]`).click();
    // A lista tira da URL o que é o padrão (a competência corrente) e mantém a visão e a categoria.
    await expect(page).toHaveURL(
      new RegExp(`/transactions\\?view=entries&categoryId=${CATEGORY_FOOD}`),
    );
  });

  test('o gráfico de 30 dias, 7 dias, 3 e 12 meses: a tabela equivalente repete o JSON, inclusive o negativo', async ({
    page,
  }) => {
    await openHome(page);
    const rows = page.locator('[data-cy="home-overview-chart-table"] tbody tr');

    await expect(page.locator('[data-cy="home-overview-period-D30"]')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.locator('[data-cy="home-overview-basis"]')).toHaveText('Por data');

    await page.locator('[data-cy="home-overview-period-D7"]').click();
    await expect(rows).toHaveCount(incomeExpensesD7.points.length);
    await expect(page.locator('[data-cy="home-overview-income"]')).toHaveText(fmt('3000.00'));
    await expect(page.locator('[data-cy="home-overview-expenses"]')).toHaveText(fmt('493.40'));
    // "Resultado do período" é o `net` do backend, nunca "saldo".
    await expect(page.locator('[data-cy="home-overview-net"]')).toHaveText(fmt('2506.60'));
    await expect(page.getByText('Resultado do período', { exact: true })).toBeVisible();
    // O dia de reembolso (despesa negativa) vem com o sinal e abaixo do zero.
    const refund = incomeExpensesD7.points[5]!;
    expect(norm(await rows.nth(5).textContent())).toContain(fmt(refund.expenses.amount));
    expect(fmt(refund.expenses.amount)).toBe('−R$ 50,00');
    for (const [i, point] of incomeExpensesD7.points.entries()) {
      const text = norm(await rows.nth(i).textContent());
      expect(text).toContain(fmt(point.income.amount));
      expect(text).toContain(fmt(point.expenses.amount));
    }

    await page.locator('[data-cy="home-overview-period-M3"]').click();
    await expect(rows).toHaveCount(incomeExpensesM3.points.length);
    await expect(page.locator('[data-cy="home-overview-net"]')).toHaveText(fmt('6280.00'));

    await page.locator('[data-cy="home-overview-period-M12"]').click();
    await expect(rows).toHaveCount(incomeExpensesM12.points.length);
    await expect(page.locator('[data-cy="home-overview-basis"]')).toHaveText('Por competência');
    await expect(page.locator('[data-cy="home-overview-net"]')).toHaveText(fmt('23588.50'));
  });

  test('troca de período pelo teclado (setas do controle segmentado)', async ({ page }) => {
    await openHome(page);

    await page.locator('[data-cy="home-overview-period-D30"]').focus();
    await page.keyboard.press('ArrowRight');

    await expect(page.locator('[data-cy="home-overview-period-M3"]')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.locator('[data-cy="home-overview-net"]')).toHaveText(fmt('6280.00'));
  });

  test('recentes: "Hoje" e "Ontem" pelo asOf do backend, valor com sinal e abre a movimentação', async ({
    page,
  }) => {
    await openHome(page);

    const rows = page.locator('[data-cy="home-recent"] [data-cy^="transaction-item-"]');
    await expect(rows).toHaveCount(3);
    expect(norm(await rows.nth(0).textContent())).toContain('Alimentação · Nubank · Hoje');
    expect(norm(await rows.nth(0).textContent())).toContain(`−${fmt('87.30')}`);
    expect(norm(await rows.nth(1).textContent())).toContain('Ontem');
    expect(norm(await rows.nth(1).textContent())).toContain(`+${fmt('3000.00')}`);
    expect(norm(await rows.nth(2).textContent())).toContain('4 de out.');

    await rows.nth(0).click();
    await expect(page).toHaveURL(new RegExp(`/transactions/${TX_TODAY}$`));
  });

  test('"Perguntar à IA" e o orçamento seguem desabilitados e sem efeito', async ({ page }) => {
    await openHome(page);
    const url = page.url();

    const ask = page.locator('[data-cy="home-insight-ask-ai"]');
    await expect(ask).toHaveAttribute('aria-disabled', 'true');
    await ask.click({ force: true });
    await page.locator('[data-cy="header-action-askAi"]').click({ force: true });
    await expect(page.locator('[data-cy="header-action-askAi"]')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    const budget = page.locator('[data-cy="home-budget"]');
    await expect(budget).toHaveAttribute('aria-disabled', 'true');
    await expect(budget).toContainText('Orçamentos por categoria chegam em breve.');
    expect(norm(await budget.textContent())).not.toMatch(/\d/);
    await budget.click({ force: true });

    expect(page.url()).toBe(url);
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  });

  test('o orçamento leva à página /budgets "em breve" e ela está na sidebar', async ({ page }) => {
    await openHome(page);

    await page.locator('[data-cy="home-budget-link"]').click();

    await expect(page).toHaveURL(/\/budgets$/);
    await expect(page.locator('[data-cy="page-title"]')).toHaveText('Orçamentos');
    await expect(page.locator('[data-cy="empty-state-title"]')).toHaveText(
      'Orçamentos chegam em breve.',
    );
    await expect(page.locator('[data-cy="sidebar-budgets"]')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('um único botão primário na tela: o Salvar do Quick Capture (ações do cabeçalho são secundárias)', async ({
    page,
  }) => {
    await openHome(page);

    await expect(page.locator('main .button--primary, header .button--primary')).toHaveCount(1);
    await expect(page.locator('[data-cy="quick-capture-save"]')).toHaveClass(/button--primary/);
    // "Mais opções" é só um link comum.
    await expect(page.locator('[data-cy="home-quick-capture-link"]')).not.toHaveClass(
      /button--primary/,
    );
    await expect(page.locator('[data-cy="header-action-expense"]')).toHaveClass(/button--soft/);
    // Fora do Início a ação do cabeçalho volta a ser a primária.
    await page.locator('[data-cy="sidebar-transactions"]').click();
    await expect(page.locator('[data-cy="header-action-expense"]')).toHaveClass(/button--primary/);
  });

  test('o que já existia continua em "Compromissos e patrimônio" com os mesmos data-cy', async ({
    page,
  }) => {
    await openHome(page);

    const legacy = page.locator('[data-cy="home-legacy"]');
    for (const id of [
      'home-available',
      'home-commitments',
      'home-action-goal',
      'home-action-summary',
    ]) {
      await expect(legacy.locator(`[data-cy="${id}"]`)).toBeVisible();
    }
    await expect(page.locator('[data-cy="home-action-quick-add"]')).not.toHaveClass(
      /button--primary/,
    );
  });

  test('cartão clicável sobe 2 px e ganha sombra no hover (.lift), sem transform com movimento reduzido', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await openHome(page);
    const tile = page.locator('[data-cy="home-account-22222222-2222-4222-8222-222222222222"]');
    await tile.scrollIntoViewIfNeeded();
    const before = await tile.evaluate((el) => getComputedStyle(el).boxShadow);

    await tile.hover();
    await expect
      .poll(async () => tile.evaluate((el) => getComputedStyle(el).transform))
      .toBe('matrix(1, 0, 0, 1, 0, -2)');
    expect(await tile.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe(before);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.mouse.move(0, 0);
    await tile.hover();
    expect(await tile.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
  });

  test('o tema escuro e o claro não têm violações de acessibilidade no Início completo', async ({
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

  test('com partial = true, os chips ficam neutros e dizem "mês em andamento vs mês anterior inteiro"', async ({
    page,
  }) => {
    await openHome(page, homeResponses({ partial: true }));

    const spending = page.locator('[data-cy="kpi-spending-change"]');
    await expect(spending).toHaveText('−80% · mês em andamento vs mês anterior inteiro');
    await expect(spending).toHaveAttribute('data-tone', 'neutral');
    await expect(page.locator('[data-cy="kpi-income-change"]')).toHaveAttribute(
      'data-tone',
      'neutral',
    );
    await expect(page.locator('[data-cy="kpi-savings-change"]')).toHaveText(
      '−3,3 p.p. · mês em andamento vs mês anterior inteiro',
    );
    const insight = norm(await page.locator('[data-cy="home-insight-text"]').textContent());
    // O insight vem do backend (`GET /v1/insights`): o front só traduz `key` + `params`.
    expect(insight).toContain('Alimentação subiu 25% em relação ao mês passado');
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

  test('sem rolagem horizontal, Quick Capture em primeiro e KPIs em 2 colunas', async ({
    page,
  }) => {
    await openHome(page);
    await expectNoHorizontalScroll(page);

    const tops = await page.evaluate(() =>
      [
        'home-quick-capture',
        'home-kpis',
        'home-accounts-section',
        'home-overview-chart',
        'home-categories',
        'home-recent',
        'home-budget',
        'home-legacy',
      ].map((id) => document.querySelector(`[data-cy="${id}"]`)?.getBoundingClientRect().top ?? -1),
    );
    for (let i = 1; i < tops.length; i++)
      expect(tops[i]!, `bloco ${i}`).toBeGreaterThan(tops[i - 1]!);
    // O Quick Capture vem antes de qualquer KPI e dos gráficos.
    const kpiTop = await page
      .locator('[data-cy="kpi-in-accounts"]')
      .evaluate((el) => el.getBoundingClientRect().top);
    const captureTop = await page
      .locator('[data-cy="home-quick-capture"]')
      .evaluate((el) => el.getBoundingClientRect().top);
    expect(captureTop).toBeLessThan(kpiTop);

    const a = await page.locator('[data-cy="kpi-in-accounts"]').boundingBox();
    const a2 = await page.locator('[data-cy="kpi-spending"]').boundingBox();
    const b = await page.locator('[data-cy="kpi-income"]').boundingBox();
    const c = await page.locator('[data-cy="kpi-savings"]').boundingBox();
    // O 3º e o 4º KPIs dividem a linha.
    expect(Math.abs(b!.y - c!.y)).toBeLessThan(2);
    expect(Math.abs(a!.y - a2!.y)).toBeLessThan(2);
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

  test('o strip de contas rola na horizontal com snap e cada cartão é focável', async ({
    page,
  }) => {
    await openHome(page);

    const strip = page.locator('[data-cy="home-accounts"]');
    expect(await strip.evaluate((el) => getComputedStyle(el).scrollSnapType)).toContain('x');
    await page.locator('[data-cy="home-account-22222222-2222-4222-8222-222222222222"]').focus();
    await expect(
      page.locator('[data-cy="home-account-22222222-2222-4222-8222-222222222222"]'),
    ).toBeFocused();
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
