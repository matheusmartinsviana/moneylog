/* eslint-disable @typescript-eslint/no-explicit-any */
import { brl, todayInSaoPaulo } from '../support/api';

import { cy, cyText, expect, fmt, norm, open, pick, resetDatabase, test } from './fixtures';

/**
 * Etapa 4 com o backend real, parte de recorrências (T90 do front): criar a recorrência → ver no Início e
 * na lista de pendentes → realizar com o valor real → pular → compra no cartão realizada cai na fatura →
 * resposta perdida ao realizar reenvia a mesma `Idempotency-Key`. O teste só compara a tela com a API.
 * **Escrito, não executado pelo dev-frontend** (o backend estava em teste): a QA roda `npm run e2e:integration`.
 */
test.describe.configure({ mode: 'serial' });

test.beforeEach(() => resetDatabase());

const TODAY = (): string => todayInSaoPaulo();

async function createInternet(api: any, accountId: string, categoryId: string) {
  return api.ok(
    api.call('POST', '/v1/recurrences', {
      type: 'EXPENSE',
      amount: '119.00',
      description: 'Internet',
      categoryId,
      accountId,
      method: 'BOLETO',
      frequency: 'MONTHLY',
      startDate: TODAY(),
    }),
    [201],
  );
}

test('criar a recorrência Internet → ver no Início e nos pendentes → realizar com 124,90 → a despesa entra e a ocorrência some', async ({
  page,
  api,
  signIn,
  net,
}) => {
  test.setTimeout(300_000);
  net.checkDuplicates = false;
  const nubank = await api.createAccount({ name: 'Nubank', openingBalance: '2000.00' });
  await signIn(page);

  // 1. Cria pela tela (despesa mensal, em conta, boleto), começando hoje.
  await open(page, '/planning/recurrences/new');
  await cy(page, 'recurrence-amount').fill('119,00');
  await cy(page, 'recurrence-amount').blur();
  await cy(page, 'recurrence-description').fill('Internet');
  await pick(page, 'recurrence-category', 'Moradia');
  await pick(page, 'recurrence-account', 'Nubank');
  await pick(page, 'recurrence-method', 'Boleto');
  await cy(page, 'recurrence-form-save').click();
  await expect(page).toHaveURL(/\/planning\/recurrences$/);
  const recurrence = await net.body('POST', '/v1/recurrences', 'first');
  expect(net.find('POST', '/v1/recurrences')[0]?.idempotencyKey).toBeTruthy();
  expect(recurrence.frequency).toBe('MONTHLY');
  expect(recurrence.amount.amount).toBe('119.00');
  expect(recurrence.account.id).toBe(nubank.id);

  // 2. A lista e a estimativa mensal (rotulada) são as da API.
  const summary = await net.body('GET', '/v1/recurrences/summary');
  expect(summary.estimate).toBe(true);
  expect(await cyText(page, 'recurrence-fixed-costs')).toBe(fmt(summary.fixedCosts.amount));
  expect(await cyText(page, 'recurrence-recurring-income')).toBe(
    fmt(summary.recurringIncome.amount),
  );
  expect(await cyText(page, 'recurrence-summary-estimate')).toBe('Estimativa');
  expect(await cyText(page, `recurrence-amount-${recurrence.id}`)).toBe(fmt('119.00'));
  expect(await cyText(page, `recurrence-frequency-${recurrence.id}`)).toBe('Todo mês');
  expect(await cyText(page, `recurrence-monthly-${recurrence.id}`)).toContain(
    fmt(recurrence.monthlyEstimate.amount),
  );

  // 3. O Início mostra a ocorrência com "Realizar"; os totais são os do /upcoming.
  await open(page, '/planning/overview');
  await expect(cy(page, 'home-legacy')).toBeVisible();
  const upcoming = await net.body('GET', '/v1/dashboard/upcoming');
  const item = upcoming.items.find(
    (i: any) => i.kind === 'RECURRENCE' && i.refId === recurrence.id && i.dueDate === TODAY(),
  );
  expect(item.amount.amount).toBe('119.00');
  expect(await cyText(page, 'home-upcoming-total-out')).toBe(fmt(upcoming.totals.out.amount));
  const row = page
    .locator('[data-cy="home-upcoming-item"][data-kind="RECURRENCE"]')
    .filter({ hasText: 'Internet' })
    .first();
  expect(norm(await row.innerText())).toContain(fmt('119.00'));

  // 4. Realiza do Início com o valor real 124,90 (a folha abre com o valor do modelo).
  await row.locator('[data-cy="home-upcoming-realize"]').click();
  await expect(cy(page, 'realize-sheet-panel')).toBeVisible();
  await expect(cy(page, 'realize-amount')).toHaveValue('119,00');
  await cy(page, 'realize-amount').fill('124,90');
  await cy(page, 'realize-amount').blur();
  await cy(page, 'realize-submit').click();
  await expect(cy(page, 'realize-sheet-panel')).toBeHidden();
  const realizePath = new RegExp(
    `/v1/recurrences/${recurrence.id}/occurrences/${TODAY()}/realize$`,
  );
  const realizeCall = net.find('POST', realizePath)[0];
  expect(realizeCall?.idempotencyKey).toBeTruthy();
  expect(realizeCall?.requestBody).toEqual({ amount: '124.90' });
  const realized = await net.body('POST', realizePath);
  expect(realized.source).toBe('RECURRENCE');
  expect(realized.amount.amount).toBe('124.90');
  expect(realized.date).toBe(TODAY());
  expect(realized.recurrenceId).toBe(recurrence.id);

  // 5. A ocorrência some do Início e do /upcoming (sem dupla contagem) e a despesa está na lista.
  const upcomingAfter = await api.get('/v1/dashboard/upcoming');
  expect(
    upcomingAfter.body.items.filter(
      (i: any) => i.kind === 'RECURRENCE' && i.refId === recurrence.id && i.dueDate === TODAY(),
    ),
  ).toHaveLength(0);
  // O Início recarrega em segundo plano (sem esqueleto). Sem mais compromissos a lista mostra o vazio
  // (os totais só aparecem com itens); com itens, os totais são os do /upcoming.
  const itemsLeft = upcomingAfter.body.items.length + upcomingAfter.body.undated.length;
  if (itemsLeft === 0) {
    await expect(cy(page, 'home-upcoming-empty')).toBeVisible();
  } else {
    await expect(cy(page, 'home-upcoming-total-out')).toHaveText(
      fmt(upcomingAfter.body.totals.out.amount),
    );
  }
  await open(page, '/transactions');
  await expect(cy(page, `transaction-row-${realized.id}`)).toBeVisible();
  expect(norm(await cy(page, `transaction-row-${realized.id}`).innerText())).toContain(
    fmt('124.90'),
  );
  await open(page, `/transactions/${realized.id}`);
  await expect(cy(page, 'detail-field-recurrence')).toBeVisible();
});

test('pular uma ocorrência: não cria movimentação e ela some dos pendentes e do Início', async ({
  page,
  api,
  signIn,
  net,
}) => {
  test.setTimeout(240_000);
  net.checkDuplicates = false;
  const nubank = await api.createAccount({ name: 'Nubank', openingBalance: '2000.00' });
  const category = await api.categoryId('Moradia');
  const recurrence = await createInternet(api, nubank.id, category);
  await signIn(page);

  await open(page, '/planning/occurrences');
  const apiList = await net.body('GET', '/v1/recurrences/occurrences');
  const pending = apiList.items.filter((o: any) => o.status === 'PENDING');
  expect(pending.length).toBeGreaterThan(0);
  const target = pending[0];
  const key = `${target.recurrenceId}-${target.date}`;
  expect(await cyText(page, `occurrence-amount-${key}`)).toBe(fmt(target.amount.amount));
  const txBefore = (await api.get('/v1/transactions?pageSize=50')).body.items.length;

  await cy(page, `occurrence-skip-${key}`).click();
  await cy(page, 'confirm-dialog-confirm').click();
  await expect(cy(page, `occurrence-row-${key}`)).toHaveCount(0);
  const skipped = await net.body(
    'POST',
    `/v1/recurrences/${recurrence.id}/occurrences/${target.date}/skip`,
  );
  expect(skipped.status).toBe('SKIPPED');
  expect((await api.get('/v1/transactions?pageSize=50')).body.items.length).toBe(txBefore);

  await open(page, '/planning/overview');
  await expect(cy(page, 'home-legacy')).toBeVisible();
  const upcoming = await net.body('GET', '/v1/dashboard/upcoming');
  expect(
    upcoming.items.filter((i: any) => i.kind === 'RECURRENCE' && i.dueDate === target.date),
  ).toHaveLength(0);
});

test('compra no cartão recorrente: realizar leva à fatura que o backend escolheu', async ({
  page,
  api,
  signIn,
  net,
}) => {
  test.setTimeout(240_000);
  net.checkDuplicates = false;
  const nubank = await api.createAccount({ name: 'Nubank', openingBalance: '2000.00' });
  const closingDay = ((Number(TODAY().slice(8, 10)) + 9) % 28) + 1;
  const card = await api.ok(
    api.call('POST', '/v1/cards', {
      name: 'Roxinho',
      institution: 'Nubank',
      limit: brl('5000.00'),
      closingDay,
      dueDay: 5,
      defaultPaymentAccountId: nubank.id,
    }),
    [201],
  );
  const category = await api.categoryId('Lazer').catch(() => api.categoryId('Alimentação'));
  const recurrence = await api.ok(
    api.call('POST', '/v1/recurrences', {
      type: 'CARD_PURCHASE',
      amount: '50.00',
      description: 'Streaming',
      categoryId: category,
      cardId: card.id,
      frequency: 'MONTHLY',
      startDate: TODAY(),
    }),
    [201],
  );
  await signIn(page);

  await open(page, '/planning/occurrences');
  const key = `${recurrence.id}-${TODAY()}`;
  expect(await cyText(page, `occurrence-via-${key}`)).toBe('No cartão');
  await cy(page, `occurrence-realize-${key}`).click();
  await expect(cy(page, 'realize-card-note')).toBeVisible();
  await cy(page, 'realize-submit').click();
  await expect(cy(page, 'realize-sheet-panel')).toBeHidden();
  const realized = await net.body(
    'POST',
    new RegExp(`/v1/recurrences/${recurrence.id}/occurrences/${TODAY()}/realize$`),
  );
  expect(realized.type).toBe('CARD_PURCHASE');
  expect(realized.installments).toHaveLength(1);
  const invoiceId = realized.installments[0].invoiceId as string;

  // O aviso leva à fatura da 1ª parcela, a que o backend escolheu, com o item da compra.
  await cy(page, 'toast-info').getByRole('button', { name: 'Ver fatura' }).click();
  await expect(page).toHaveURL(new RegExp(`/cards/${card.id}/invoices/${invoiceId}$`));
  expect(norm(await cy(page, 'invoice-items').innerText())).toContain('Streaming');
  const invoice = await net.body('GET', `/v1/invoices/${invoiceId}`);
  expect(await cyText(page, 'invoice-total')).toBe(fmt(invoice.total.amount));
});

test('resposta perdida ao realizar: o "tentar de novo" reenvia a mesma Idempotency-Key e só uma movimentação nasce', async ({
  page,
  api,
  signIn,
  net,
}) => {
  test.setTimeout(240_000);
  net.checkDuplicates = false;
  const nubank = await api.createAccount({ name: 'Nubank', openingBalance: '2000.00' });
  const category = await api.categoryId('Moradia');
  const recurrence = await createInternet(api, nubank.id, category);
  await signIn(page);
  await open(page, '/planning/occurrences');
  const key = `${recurrence.id}-${TODAY()}`;
  const realizePath = new RegExp(
    `/v1/recurrences/${recurrence.id}/occurrences/${TODAY()}/realize$`,
  );

  // O backend processa, mas a resposta se perde.
  net.dropNextResponse('POST', realizePath);
  await cy(page, `occurrence-realize-${key}`).click();
  await cy(page, 'realize-submit').click();
  await expect(cy(page, 'realize-retry')).toBeVisible();
  await cy(page, 'realize-retry').click();
  await expect(cy(page, 'realize-sheet-panel')).toBeHidden();

  const calls = net.find('POST', realizePath);
  expect(calls).toHaveLength(2);
  expect(calls[1]?.idempotencyKey).toBe(calls[0]?.idempotencyKey);
  expect(calls[0]?.dropped).toBe(true);
  const list = (await api.get('/v1/transactions?pageSize=50')).body.items.filter(
    (t: any) => t.recurrenceId === recurrence.id,
  );
  expect(list).toHaveLength(1);
});

test('realizar uma ocorrência já realizada: a mensagem é clara e a lista recarrega (RECURRENCE_OCCURRENCE_ALREADY_REALIZED)', async ({
  page,
  api,
  signIn,
  net,
}) => {
  test.setTimeout(240_000);
  net.checkDuplicates = false;
  net.allow(422);
  const nubank = await api.createAccount({ name: 'Nubank', openingBalance: '2000.00' });
  const category = await api.categoryId('Moradia');
  const recurrence = await createInternet(api, nubank.id, category);
  await signIn(page);
  await open(page, '/planning/occurrences');
  const key = `${recurrence.id}-${TODAY()}`;

  // Outra aba (a API) realiza antes.
  await api.ok(
    api.call('POST', `/v1/recurrences/${recurrence.id}/occurrences/${TODAY()}/realize`, undefined, {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    }),
    [201],
  );
  await cy(page, `occurrence-realize-${key}`).click();
  await cy(page, 'realize-submit').click();

  await expect(cy(page, 'realize-error')).toContainText('já foi realizada');
  await cy(page, 'realize-cancel').click();
  await expect(cy(page, `occurrence-row-${key}`)).toHaveCount(0);
});
