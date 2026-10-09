/* eslint-disable @typescript-eslint/no-explicit-any */
import { expense } from '../support/api';

import { cy, cyText, expect, fmt, open, resetDatabase, test } from './fixtures';

/**
 * T44: estados de carregamento/erro/vazio e paginação com o backend real. As falhas de servidor são
 * injetadas na rede (`failNext`: resposta 500 no formato do contrato, sem chamar o backend); o resto
 * (404 de movimentação, paginação, totais do filtro inteiro) é o backend de verdade.
 */
test.beforeEach(() => resetDatabase());

test('erro de servidor no Início, na lista e no /quick-add: mensagem com "Tentar de novo" e recuperação', async ({
  page,
  api,
  signIn,
  net,
  evidence,
}) => {
  await api.createAccount({ name: 'Conta', openingBalance: '10.00' });
  await signIn(page);
  net.allow(500);

  net.failNext('GET', /\/v1\/dashboard\/summary$/);
  await open(page, '/planning/overview');
  await expect(cy(page, 'home-error')).toBeVisible();
  await evidence(page, 'e2e-40-inicio-erro');
  await page.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(cy(page, 'home-dashboard')).toBeVisible();
  expect(await cyText(page, 'home-in-accounts')).toBe(fmt('10.00'));

  net.failNext('GET', /\/v1\/transactions$/);
  await open(page, '/transactions');
  await expect(cy(page, 'error-state')).toBeVisible();
  await cy(page, 'error-state').getByRole('button').click();
  await expect(cy(page, 'empty-state')).toBeVisible();

  net.failNext('GET', /\/v1\/accounts$/);
  await open(page, '/quick-add');
  await expect(cy(page, 'error-state')).toBeVisible();
  await cy(page, 'error-state').getByRole('button').click();
  await expect(cy(page, 'expense-form')).toBeVisible();
});

test('falha em GET /v1/cards: despesa abre normal; Crédito mostra erro com "Tentar de novo"', async ({
  page,
  api,
  signIn,
  net,
}) => {
  await api.createAccount({ name: 'Conta', openingBalance: '10.00' });
  await signIn(page);
  net.allow(500);

  // Despesa não usa cartão: nem pede a lista.
  await open(page, '/quick-add');
  await expect(cy(page, 'expense-form')).toBeVisible();
  expect(net.find('GET', '/v1/cards')).toHaveLength(0);

  net.failNext('GET', /\/v1\/cards$/);
  await open(page, '/quick-add?mode=credit');
  await expect(cy(page, 'error-state')).toBeVisible();
  await cy(page, 'error-state').getByRole('button').click();
  await expect(cy(page, 'empty-state')).toBeVisible();
});

test('movimentação inexistente: 404 do backend vira "não encontrada"', async ({
  page,
  signIn,
  net,
}) => {
  await signIn(page);
  net.allow(404);
  await open(page, '/transactions/3f2b8a52-1c0e-4e4a-9d1b-0a0a0a0a0a0a/edit');
  await expect(
    page.getByText('Movimentação não encontrada', { exact: false }).first(),
  ).toBeVisible();
  expect((await net.body('GET', /\/v1\/transactions\/[^/]+$/)).code).toBe('TRANSACTION_NOT_FOUND');
});

test('lista paginada: "carregar mais" traz a 2ª página e o rodapé continua sendo o do filtro inteiro', async ({
  page,
  api,
  signIn,
  net,
  evidence,
}) => {
  const acc = await api.createAccount({ name: 'Conta', openingBalance: '1000.00' });
  const food = await api.categoryId('Alimentação');
  for (let i = 1; i <= 53; i++) {
    await api.txOk(
      expense({ amount: '2.00', accountId: acc.id, categoryId: food, description: `item ${i}` }),
    );
  }
  await signIn(page);
  await open(page, '/transactions');
  await expect(cy(page, 'transactions-load-more')).toBeVisible();
  expect(await cyText(page, 'totals-footer-count')).toBe('53'); // totais do filtro, não da página
  expect(await cyText(page, 'totals-footer-out')).toBe(fmt('106.00'));
  expect(await page.locator('[data-cy^="transaction-row-"]').count()).toBe(50);
  await evidence(page, 'e2e-41-lista-paginada');

  net.allow(500);
  net.failNext('GET', /\/v1\/transactions$/);
  await cy(page, 'transactions-load-more').click();
  await expect(cy(page, 'transactions-load-more-error')).toBeVisible();
  await cy(page, 'transactions-load-more').click();
  await expect(page.locator('[data-cy^="transaction-row-"]')).toHaveCount(53);
  await expect(cy(page, 'transactions-load-more')).toHaveCount(0);
  expect(await cyText(page, 'totals-footer-count')).toBe('53');
  const second = (await net.body('GET', '/v1/transactions')) as any;
  expect(second.items).toHaveLength(3);
  expect(second.hasNext).toBe(false);
});

test('filtros da lista: conta, busca e tipo batem com o total da API', async ({
  page,
  api,
  signIn,
  net,
}) => {
  const a = await api.createAccount({ name: 'A', openingBalance: '100.00' });
  const b = await api.createAccount({ name: 'B', openingBalance: '100.00' });
  const food = await api.categoryId('Alimentação');
  await api.txOk(
    expense({ amount: '10.00', accountId: a.id, categoryId: food, description: 'padaria' }),
  );
  await api.txOk(
    expense({ amount: '25.00', accountId: b.id, categoryId: food, description: 'mercado' }),
  );
  await signIn(page);
  await open(page, '/transactions');
  expect(await cyText(page, 'totals-footer-count')).toBe('2');
  await page.locator('[data-cy="filter-account"]').click();
  await page.locator(`[data-cy="filter-account-option-${a.id}"]`).click();
  await expect(cy(page, 'totals-footer-count')).toHaveText('1');
  expect(await cyText(page, 'totals-footer-out')).toBe(fmt('10.00'));
  const filtered = await net.body('GET', '/v1/transactions');
  expect(filtered.totals.cashFlow.out.amount).toBe('10.00');
  await page.locator('[data-cy="filter-account"]').click();
  await page.locator('[data-cy="filter-account-option-all"]').click();
  await cy(page, 'filter-search').fill('merc');
  await expect(cy(page, 'totals-footer-count')).toHaveText('1');
  expect(await cyText(page, 'totals-footer-out')).toBe(fmt('25.00'));
  await cy(page, 'filter-search').fill('zzz');
  await expect(cy(page, 'empty-state')).toBeVisible();
});
