/* eslint-disable @typescript-eslint/no-explicit-any */
import { expense } from '../support/api';

import { cy, cyText, expect, fillAmount, fmt, open, pick, resetDatabase, test } from './fixtures';

/**
 * T44: os modos do `/quick-add` contra o backend real (transferência, aplicação/resgate, ajuste,
 * reembolso) e a idempotência do salvar. Cada número da tela é conferido contra a API.
 */
test.describe.configure({ mode: 'serial' });
test.beforeEach(() => resetDatabase());

const save = async (page: any) => {
  await cy(page, 'form-save').click();
  await expect(cy(page, 'toast-info')).toBeVisible();
};

test('transferência entre contas CASH: saldos mudam, impacto líquido zero no consumo e no fluxo', async ({
  page,
  api,
  signIn,
  net,
  evidence,
}) => {
  const a = await api.createAccount({ name: 'Nubank', openingBalance: '1000.00' });
  const b = await api.createAccount({ name: 'XP', openingBalance: '50.00', type: 'SAVINGS' });
  await signIn(page);

  await open(page, '/quick-add?mode=transfer');
  await fillAmount(page, '200,00');
  await pick(page, 'entry-from', 'Nubank');
  await pick(page, 'entry-to', 'XP');
  await cy(page, 'entry-description').fill('reserva');
  await save(page);
  const created = await net.body('POST', '/v1/transactions');
  expect(created.type).toBe('TRANSFER');
  // impacto da API: -200 em uma conta, +200 na outra, líquido 0
  expect(created.impact).toBeTruthy();

  const s = (await api.get('/v1/dashboard/summary')).body;
  expect(s.balances.inAccounts.amount).toBe('1050.00');
  expect(s.month.consumption.amount).toBe('0.00');
  expect(s.month.cashFlow.out.amount).toBe('0.00');
  expect(s.month.cashFlow.net.amount).toBe('0.00');

  await open(page, '/accounts');
  await expect(cy(page, 'accounts-list')).toBeVisible();
  const accounts = (await net.body('GET', '/v1/accounts')).items;
  expect(accounts.find((x: any) => x.id === a.id).currentBalance.amount).toBe('800.00');
  expect(accounts.find((x: any) => x.id === b.id).currentBalance.amount).toBe('250.00');
  expect(await cyText(page, `account-balance-${a.id}`)).toContain(fmt('800.00'));
  expect(await cyText(page, `account-balance-${b.id}`)).toContain(fmt('250.00'));

  await open(page, '/');
  expect(await cyText(page, 'home-in-accounts')).toBe(fmt('1050.00'));
  expect(await cyText(page, 'home-month-cash-net')).toBe(fmt('0.00'));
  expect(await cyText(page, 'home-month-consumption')).toBe(fmt('0.00'));

  await open(page, `/transactions/${created.id}`);
  await expect(cy(page, 'impact-panel')).toBeVisible();
  await evidence(page, 'e2e-10-detalhe-transferencia-impacto');

  // Mesma conta nos dois lados: a tela nem oferece a origem como destino; a API recusa (422).
  await open(page, '/quick-add?mode=transfer');
  await pick(page, 'entry-from', 'Nubank');
  await cy(page, 'entry-to').click();
  await expect(
    cy(page, 'entry-to-listbox').getByRole('option', { name: 'Nubank', exact: true }),
  ).toHaveCount(0);
  const same = await api.call(
    'POST',
    '/v1/transactions',
    {
      type: 'TRANSFER',
      amount: '10.00',
      date: created.date,
      description: 'x',
      notes: null,
      fromAccountId: a.id,
      toAccountId: a.id,
    },
    { headers: { 'Idempotency-Key': crypto.randomUUID() } },
  );
  expect(same.status).toBe(422);
  expect(same.body.code).toBe('TRANSFER_SAME_ACCOUNT');
  const list = (await api.get('/v1/transactions?pageSize=50')).body;
  expect(list.items).toHaveLength(1);
});

test('aplicação e resgate: saem e voltam do caixa, não são despesa', async ({
  page,
  api,
  signIn,
  net,
  evidence,
}) => {
  await api.createAccount({ name: 'Conta', openingBalance: '1000.00' });
  await api.createAccount({ name: 'CDB', type: 'INVESTMENT', openingBalance: '0.00' });
  await signIn(page);

  await open(page, '/quick-add?mode=investment');
  await fillAmount(page, '300,00');
  await pick(page, 'entry-cash-account', 'Conta');
  await pick(page, 'entry-investment-account', 'CDB');
  await cy(page, 'entry-direction-CONTRIBUTION').click();
  await cy(page, 'entry-description').fill('aporte');
  await evidence(page, 'e2e-11-quick-add-aplicacao');
  await save(page);

  let s = (await api.get('/v1/dashboard/summary')).body;
  expect(s.balances.inAccounts.amount).toBe('700.00');
  expect(s.balances.investments.amount).toBe('300.00');
  expect(s.month.consumption.amount).toBe('0.00');
  expect(s.month.cashFlow.out.amount).toBe('300.00');
  expect(s.month.investedNet.amount).toBe('300.00');

  await open(page, '/quick-add?mode=investment');
  await fillAmount(page, '100,00');
  await pick(page, 'entry-cash-account', 'Conta');
  await pick(page, 'entry-investment-account', 'CDB');
  await cy(page, 'entry-direction-REDEMPTION').click();
  await cy(page, 'entry-description').fill('resgate');
  await save(page);

  s = (await api.get('/v1/dashboard/summary')).body;
  expect(s.balances.inAccounts.amount).toBe('800.00');
  expect(s.balances.investments.amount).toBe('200.00');
  expect(s.month.consumption.amount).toBe('0.00');
  expect(s.month.investedNet.amount).toBe('200.00');

  await open(page, '/');
  expect(await cyText(page, 'home-in-accounts')).toBe(fmt('800.00'));
  expect(await cyText(page, 'home-investments')).toBe(fmt('200.00'));
  expect(await cyText(page, 'home-month-consumption')).toBe(fmt('0.00'));
  expect(await cyText(page, 'home-month-invested-net')).toBe(fmt('200.00'));
  void net;
});

test('ajuste: corrige o saldo sem virar despesa; rendimento só em conta de investimento', async ({
  page,
  api,
  signIn,
}) => {
  const conta = await api.createAccount({ name: 'Conta', openingBalance: '500.00' });
  await api.createAccount({ name: 'CDB', type: 'INVESTMENT', openingBalance: '100.00' });
  await signIn(page);

  await open(page, '/quick-add?mode=adjustment');
  await expect(cy(page, 'adjustment-help')).toBeVisible();
  await fillAmount(page, '25,00');
  await pick(page, 'entry-account', 'Conta');
  await cy(page, 'entry-direction-DECREASE').click();
  await cy(page, 'entry-kind-CORRECTION').click();
  await cy(page, 'entry-reason').fill('diferença do extrato');
  await cy(page, 'entry-description').fill('ajuste de saldo');
  await save(page);

  const s = (await api.get('/v1/dashboard/summary')).body;
  expect(s.balances.inAccounts.amount).toBe('475.00');
  expect(s.month.consumption.amount).toBe('0.00');
  const acc = (await api.get('/v1/accounts?pageSize=50')).body.items.find(
    (x: any) => x.id === conta.id,
  );
  expect(acc.currentBalance.amount).toBe('475.00');

  // Rendimento em conta CASH: a tela desabilita a opção (com a dica) e a API recusa (422).
  await open(page, '/quick-add?mode=adjustment');
  await pick(page, 'entry-account', 'Conta');
  await expect(cy(page, 'entry-kind-YIELD')).toHaveAttribute('aria-disabled', 'true');
  const yieldOnCash = await api.call(
    'POST',
    '/v1/transactions',
    {
      type: 'ADJUSTMENT',
      amount: '5.00',
      date: acc.openingDate,
      description: 'rendimento',
      notes: null,
      accountId: conta.id,
      direction: 'INCREASE',
      kind: 'YIELD',
      reason: 'juros',
    },
    { headers: { 'Idempotency-Key': crypto.randomUUID() } },
  );
  expect(yieldOnCash.status).toBe(422);
  expect(yieldOnCash.body.code).toBe('ADJUSTMENT_YIELD_REQUIRES_INVESTMENT_ACCOUNT');
});

test('reembolso: teto da despesa, categoria travada, editar e estornar com reembolso ativo', async ({
  page,
  api,
  signIn,
  net,
  evidence,
}) => {
  const conta = await api.createAccount({ name: 'Conta', openingBalance: '1000.00' });
  const food = await api.categoryId('Alimentação');
  const other = await api.categoryId('Lazer');
  const orig = await api.txOk(
    expense({ amount: '100.00', accountId: conta.id, categoryId: food, description: 'jantar' }),
  );
  await signIn(page);

  // Reembolso de 30,00 vinculado à despesa.
  await open(page, '/quick-add?mode=refund');
  await fillAmount(page, '30,00');
  await cy(page, 'entry-original-search').fill('jantar');
  await cy(page, `entry-original-option-${orig.id}`).click();
  await expect(cy(page, 'entry-original-chosen')).toHaveText('jantar');
  // A categoria fica travada na da despesa de origem.
  await expect(cy(page, 'entry-category')).toContainText('Alimentação');
  await expect(cy(page, 'entry-category')).toHaveAttribute('aria-disabled', 'true');
  await pick(page, 'entry-account', 'Conta');
  await evidence(page, 'e2e-12-quick-add-reembolso');
  await save(page);
  const refund1 = await net.body('POST', '/v1/transactions');
  expect(refund1.type).toBe('REFUND');
  expect(refund1.refundOf?.id ?? refund1.refundOfTransactionId).toBe(orig.id);

  let s = (await api.get('/v1/dashboard/summary')).body;
  expect(s.month.refunds.amount).toBe('30.00');
  expect(s.month.consumption.amount).toBe('70.00');

  // Teto: sobram 70,00; 80,00 é recusado (422 REFUND_EXCEEDS_ORIGINAL) e nada é gravado.
  net.allow(422);
  await open(page, '/quick-add?mode=refund');
  await fillAmount(page, '80,00');
  await cy(page, 'entry-original-search').fill('jantar');
  await cy(page, `entry-original-option-${orig.id}`).click();
  await pick(page, 'entry-account', 'Conta');
  await cy(page, 'form-save').click();
  await expect(page.locator('[data-cy="form-error"], [aria-invalid="true"]').first()).toBeVisible();
  const refused = await net.body('POST', '/v1/transactions');
  expect(refused.code).toBe('REFUND_EXCEEDS_ORIGINAL');
  await evidence(page, 'e2e-13-reembolso-acima-do-teto');
  await fillAmount(page, '70,00');
  await save(page);

  s = (await api.get('/v1/dashboard/summary')).body;
  expect(s.month.refunds.amount).toBe('100.00');
  expect(s.month.consumption.amount).toBe('0.00');

  // Início e competência batem: consumo 0,00; a visão por competência traz o reembolso negativo.
  await open(page, '/');
  expect(await cyText(page, 'home-month-refunds')).toBe(fmt('100.00'));
  expect(await cyText(page, 'home-month-consumption')).toBe(fmt('0.00'));
  await open(page, '/transactions');
  await cy(page, 'view-entries').click();
  expect(await cyText(page, 'totals-footer-total')).toBe(fmt('0.00'));
  const entries = await net.body('GET', '/v1/entries');
  expect(entries.totals.total.amount).toBe('0.00');
  expect(entries.items.some((e: any) => e.amount.amount.startsWith('-'))).toBe(true);

  // Categoria travada na edição da despesa de origem (422 REFUND_CATEGORY_LOCKED).
  await open(page, `/transactions/${orig.id}/edit`);
  await expect(cy(page, 'transaction-edit')).toBeVisible();
  await pick(page, 'entry-category', 'Lazer');
  await cy(page, 'form-save').click();
  await expect(page.locator('[data-cy="form-error"], [aria-invalid="true"]').first()).toBeVisible();
  expect((await net.body('PUT', `/v1/transactions/${orig.id}`)).code).toBe(
    'REFUND_CATEGORY_LOCKED',
  );
  await evidence(page, 'e2e-14-edicao-categoria-travada');
  void other;

  // Estorno da despesa bloqueado enquanto há reembolso ativo: botão com o motivo, e a API recusa.
  await open(page, `/transactions/${orig.id}`);
  await expect(cy(page, 'void-blocked')).toBeVisible();
  await expect(cy(page, 'void-open')).toHaveAttribute('aria-disabled', 'true');
  const blocked = await api.call('POST', `/v1/transactions/${orig.id}/void`, { reason: 'teste' });
  expect(blocked.status).toBe(422);
  expect(blocked.body.code).toBe('TRANSACTION_HAS_ACTIVE_REFUNDS');
  await evidence(page, 'e2e-15-estorno-bloqueado-por-reembolso');
  const detail = (await api.get(`/v1/transactions/${orig.id}`)).body;
  expect(detail.voidable).toBe(false);
  expect(detail.voidBlockedBy).toBe('HAS_ACTIVE_REFUNDS');

  // Estorna os reembolsos pela tela; depois a despesa pode ser estornada.
  const refunds = (await api.get('/v1/transactions?type=REFUND&pageSize=50')).body.items;
  for (const r of refunds) {
    await open(page, `/transactions/${r.id}`);
    await cy(page, 'void-open').click();
    await cy(page, 'confirm-dialog-reason').fill('desfeito');
    await cy(page, 'confirm-dialog-confirm').click();
    await expect(cy(page, 'detail-voided')).toBeVisible();
  }
  await open(page, `/transactions/${orig.id}`);
  await cy(page, 'void-open').click();
  await cy(page, 'confirm-dialog-reason').fill('erro de lançamento');
  await cy(page, 'confirm-dialog-confirm').click();
  await expect(cy(page, 'detail-voided')).toBeVisible();
  s = (await api.get('/v1/dashboard/summary')).body;
  expect(s.month.consumption.amount).toBe('0.00');
  expect(s.balances.inAccounts.amount).toBe('1000.00');
});

test('editar: o valor novo aparece no Início e na lista; versão desatualizada dá 409', async ({
  page,
  api,
  signIn,
  net,
  evidence,
}) => {
  const conta = await api.createAccount({ name: 'Conta', openingBalance: '1000.00' });
  const food = await api.categoryId('Alimentação');
  const tx = await api.txOk(
    expense({ amount: '100.00', accountId: conta.id, categoryId: food, description: 'mercado' }),
  );
  await signIn(page);

  await open(page, `/transactions/${tx.id}/edit`);
  await expect(cy(page, 'transaction-edit')).toBeVisible();
  await expect(cy(page, 'entry-amount')).toHaveValue(/100,00/);
  await fillAmount(page, '120,50');
  await cy(page, 'form-save').click();
  await expect(page).toHaveURL(new RegExp(`/transactions`));
  const updated = await net.body('PUT', `/v1/transactions/${tx.id}`);
  expect(updated.amount.amount).toBe('120.50');
  expect(updated.version).toBe(tx.version + 1);

  await open(page, '/');
  expect(await cyText(page, 'home-month-consumption')).toBe(fmt('120.50'));
  expect(await cyText(page, 'home-in-accounts')).toBe(fmt('879.50'));
  await open(page, '/transactions');
  expect(await cyText(page, `transaction-amount-${tx.id}`)).toContain(fmt('120.50'));
  expect(await cyText(page, 'totals-footer-out')).toBe(fmt('120.50'));

  // 409: abro a edição, outra "aba" (API) altera a movimentação, e o salvar da tela conflita.
  net.allow(409);
  await open(page, `/transactions/${tx.id}/edit`);
  await expect(cy(page, 'entry-amount')).toHaveValue(/120,50/);
  const current = (await api.get(`/v1/transactions/${tx.id}`)).body;
  const put = await api.call('PUT', `/v1/transactions/${tx.id}`, {
    type: 'EXPENSE',
    amount: '130.00',
    date: current.date,
    description: 'mercado (outra aba)',
    notes: null,
    accountId: conta.id,
    categoryId: food,
    method: 'PIX',
    version: current.version,
  });
  expect(put.status).toBe(200);
  await fillAmount(page, '140,00');
  await cy(page, 'form-save').click();
  await expect(page.locator('[data-cy="form-error"], [aria-invalid="true"]').first()).toBeVisible();
  const conflict = await net.body('PUT', `/v1/transactions/${tx.id}`);
  expect(conflict.code).toBe('VERSION_CONFLICT');
  await evidence(page, 'e2e-16-edicao-conflito-de-versao');
  // Nada foi sobrescrito: continua o valor da outra aba.
  expect((await api.get(`/v1/transactions/${tx.id}`)).body.amount.amount).toBe('130.00');
});

test('idempotência: clique duplo cria uma só; resposta perdida + reenvio devolve o mesmo registro', async ({
  page,
  api,
  signIn,
  net,
}) => {
  const conta = await api.createAccount({ name: 'Conta', openingBalance: '1000.00' });
  await signIn(page);
  net.duplicateOk = ['/v1/transactions'];

  // 1. Clique duplo no salvar.
  await open(page, '/quick-add?mode=pix');
  await fillAmount(page, '10,00');
  await cy(page, 'entry-description').fill('café');
  await pick(page, 'entry-category', 'Alimentação');
  await cy(page, 'form-save').dblclick();
  await expect(cy(page, 'toast-info')).toBeVisible();
  await page.waitForTimeout(500);
  let items = (await api.get('/v1/transactions?pageSize=50')).body.items;
  expect(items).toHaveLength(1);
  expect(net.find('POST', '/v1/transactions').length).toBeLessThanOrEqual(2);
  const keys = net.find('POST', '/v1/transactions').map((c) => c.idempotencyKey);
  expect(keys.every((k) => k && k === keys[0])).toBe(true); // 1 ou 2 envios, sempre a mesma chave

  // 2. O backend grava, mas a resposta se perde. O reenvio ("Tentar de novo") usa a mesma chave.
  await open(page, '/quick-add?mode=pix');
  await fillAmount(page, '20,00');
  await cy(page, 'entry-description').fill('lanche');
  await pick(page, 'entry-category', 'Alimentação');
  net.dropNextResponse('POST', /\/v1\/transactions$/);
  await cy(page, 'form-save').click();
  await expect(page.locator('[data-cy="form-error"], [aria-invalid="true"]').first()).toBeVisible();
  await expect(cy(page, 'form-retry')).toBeVisible();
  items = (await api.get('/v1/transactions?pageSize=50')).body.items;
  expect(items).toHaveLength(2); // o backend já gravou
  await cy(page, 'form-retry').click();
  await expect(cy(page, 'toast-info')).toBeVisible();
  items = (await api.get('/v1/transactions?pageSize=50')).body.items;
  expect(items).toHaveLength(2); // o reenvio não duplicou
  const attempts = net.find('POST', '/v1/transactions').slice(-2);
  expect(attempts).toHaveLength(2);
  expect(attempts[0]!.idempotencyKey).toBeTruthy();
  expect(attempts[1]!.idempotencyKey).toBe(attempts[0]!.idempotencyKey); // reenvio com a mesma chave
  expect(attempts[0]!.dropped).toBe(true);
  expect(attempts[1]!.status).toBe(201);
  expect((attempts[1]!.responseBody as any).id).toBe(
    items.find((i: any) => i.description === 'lanche').id,
  );
  const total = (await api.get('/v1/dashboard/summary')).body.balances.inAccounts.amount;
  expect(total).toBe('970.00');
  void conta;
});
