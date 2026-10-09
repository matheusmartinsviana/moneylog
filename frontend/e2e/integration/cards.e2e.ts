/* eslint-disable @typescript-eslint/no-explicit-any */
import { todayInSaoPaulo } from '../support/api';

import {
  cy,
  cyText,
  expect,
  fillAmount,
  fmt,
  norm,
  open,
  pick,
  resetDatabase,
  test,
} from './fixtures';

/**
 * Etapa 3 com o backend real (T72, parte do front): criar cartão → compra parcelada com a prévia do
 * backend → ver a fatura → pagar a fatura em duas vezes → os mesmos números no cartão, na fatura, na
 * lista de cartões, no Início e na API. O teste só compara o que a tela mostra com o que a API devolveu;
 * nunca recalcula (as somas do backend são conferidas pelos testes do backend).
 */
test.describe.configure({ mode: 'serial' });

test.beforeEach(() => resetDatabase());

/** Fechamento que nunca cai no dia de hoje (compra no dia do fechamento vai para a fatura seguinte, S-12). */
function closingDayAwayFromToday(): number {
  const day = Number(todayInSaoPaulo().slice(8, 10));
  return ((day + 9) % 28) + 1;
}

test('criar cartão, comprar em 6x, ver a fatura, pagar em duas vezes: os mesmos números em todas as telas', async ({
  page,
  api,
  signIn,
  net,
  evidence,
}) => {
  test.setTimeout(240_000);
  net.checkDuplicates = false;
  const nubank = await api.createAccount({ name: 'Nubank', openingBalance: '20000.00' });
  await signIn(page);

  // 1. Cria o cartão pela tela.
  await open(page, '/cards/new');
  await cy(page, 'card-name').fill('Roxinho');
  await cy(page, 'card-institution').fill('Nubank');
  await cy(page, 'card-limit').fill('10.000,00');
  await cy(page, 'card-limit').blur();
  await cy(page, 'card-closing-day').fill(String(closingDayAwayFromToday()));
  await cy(page, 'card-due-day').fill('5');
  await pick(page, 'card-default-account', 'Nubank');
  await evidence(page, 'e2e-01-cartao-formulario');
  await cy(page, 'card-form-save').click();
  await expect(page).toHaveURL(/\/cards\/[0-9a-f-]{36}$/);
  const card = await net.body('POST', '/v1/cards', 'first');
  expect(card.limit.amount).toBe('10000.00');
  expect(card.defaultPaymentAccountId).toBe(nubank.id);
  await expect(cy(page, 'card-header')).toBeVisible();
  expect(await cyText(page, 'card-available')).toBe(fmt('10000.00'));

  // 2. Compra 1.200,00 em 6x pelo /quick-add (Crédito), com a prévia do backend.
  await open(page, `/quick-add?mode=credit&cardId=${card.id}`);
  await expect(cy(page, 'credit-form')).toBeVisible();
  await expect(cy(page, 'entry-card')).toContainText('Roxinho');
  await fillAmount(page, '1.200,00');
  await cy(page, 'entry-description').fill('Notebook');
  await pick(page, 'entry-category', 'Alimentação');
  await cy(page, 'entry-installments').fill('6');
  await cy(page, 'entry-installments').blur();
  await expect(cy(page, 'purchase-preview-summary')).toBeVisible();
  const preview = await net.body('POST', `/v1/cards/${card.id}/purchase-preview`);
  expect(preview.installments).toHaveLength(6);
  const rows = cy(page, 'purchase-preview-installment');
  await expect(rows).toHaveCount(6);
  for (let i = 0; i < 6; i++) {
    expect(norm(await rows.nth(i).innerText())).toContain(
      fmt(preview.installments[i].amount.amount),
    );
  }
  expect(await cyText(page, 'purchase-preview-available-after')).toBe(
    fmt(preview.availableLimitAfter.amount),
  );
  await evidence(page, 'e2e-02-compra-parcelada-previa');
  await cy(page, 'form-save').click();
  await expect(cy(page, 'toast-info')).toBeVisible();
  const created = await net.body('POST', '/v1/transactions', 'first');
  expect(created.type).toBe('CARD_PURCHASE');
  expect(created.installments).toHaveLength(6);
  for (let i = 0; i < 6; i++) {
    expect(created.installments[i].amount.amount).toBe(preview.installments[i].amount.amount);
  }
  expect(created.account).toBeNull();

  // 3. Tela do cartão: números iguais aos da API.
  await open(page, `/cards/${card.id}`);
  await expect(cy(page, 'card-header')).toBeVisible();
  const apiCard = await net.body('GET', `/v1/cards/${card.id}`);
  expect(await cyText(page, 'card-available')).toBe(fmt(apiCard.availableLimit.amount));
  expect(await cyText(page, 'card-total-committed')).toBe(fmt(apiCard.totalCommitted.amount));
  expect(await cyText(page, 'card-committed-future')).toContain(
    fmt(apiCard.committedFuture.amount),
  );
  await evidence(page, 'e2e-03-cartao');

  // 3b. Parcelas futuras: total do backend.
  await cy(page, 'card-tabs-tab-future').click();
  const future = await net.body('GET', `/v1/cards/${card.id}/future-installments`);
  expect(await cyText(page, 'future-total')).toContain(fmt(future.total.amount));
  expect(future.total.amount).toBe(apiCard.committedFuture.amount);
  await cy(page, 'card-tabs-tab-invoices').click();

  // 4. Fatura da 1ª parcela: itens e valores da API.
  const firstInvoiceId = created.installments[0].invoiceId as string;
  await cy(page, `invoice-open-${firstInvoiceId}`).click();
  await expect(page).toHaveURL(new RegExp(`/cards/${card.id}/invoices/${firstInvoiceId}$`));
  await expect(cy(page, 'invoice-totals')).toBeVisible();
  let invoice = await net.body('GET', `/v1/invoices/${firstInvoiceId}`);
  expect(await cyText(page, 'invoice-total')).toBe(fmt(invoice.total.amount));
  expect(await cyText(page, 'invoice-outstanding')).toBe(fmt(invoice.outstanding.amount));
  expect(norm(await cy(page, 'invoice-items').innerText())).toContain('Notebook 1/6');
  expect(norm(await cy(page, 'invoice-items').innerText())).toContain(
    fmt(invoice.items[0].amount.amount),
  );
  await evidence(page, 'e2e-04-fatura');

  // 5. Pagamento parcial (100,00) pela folha, com a prévia do backend.
  await cy(page, 'invoice-pay').click();
  await expect(cy(page, 'pay-sheet-panel')).toBeVisible();
  await expect(cy(page, 'pay-account')).toContainText('Nubank');
  await expect(cy(page, 'pay-amount')).toHaveValue(
    fmt(invoice.outstanding.amount).replace('R$ ', ''),
  );
  await cy(page, 'pay-amount').fill('100,00');
  await cy(page, 'pay-amount').blur();
  await expect(cy(page, 'pay-preview-text')).toBeVisible();
  const paymentPreview = await net.body('GET', `/v1/invoices/${firstInvoiceId}/payment-preview`);
  await evidence(page, 'e2e-05-pagar-fatura');
  await cy(page, 'pay-submit').click();
  await expect(cy(page, 'pay-sheet-panel')).toBeHidden();
  const afterFirst = await net.body('POST', `/v1/invoices/${firstInvoiceId}/payments`, 'first');
  expect(afterFirst.paid.amount).toBe('100.00');
  expect(['PARTIAL', 'PREPAY']).toContain(paymentPreview.kind);
  expect(await cyText(page, 'invoice-paid')).toBe(fmt('100.00'));
  expect(await cyText(page, 'invoice-outstanding')).toBe(fmt(afterFirst.outstanding.amount));

  // 6. Paga o restante (o valor sugerido é o outstanding recebido).
  await cy(page, 'invoice-pay').click();
  await expect(cy(page, 'pay-amount')).toHaveValue(
    fmt(afterFirst.outstanding.amount).replace('R$ ', ''),
  );
  await cy(page, 'pay-submit').click();
  await expect(cy(page, 'pay-sheet-panel')).toBeHidden();
  const payments = net.find('POST', `/v1/invoices/${firstInvoiceId}/payments`);
  expect(payments).toHaveLength(2);
  expect(payments[1]?.idempotencyKey).not.toBe(payments[0]?.idempotencyKey);
  invoice = await net.body('POST', `/v1/invoices/${firstInvoiceId}/payments`, 'last');
  expect(invoice.payments).toHaveLength(2);
  expect(await cyText(page, 'invoice-outstanding')).toBe(fmt(invoice.outstanding.amount));
  expect(await cyText(page, 'invoice-paid')).toBe(fmt(invoice.paid.amount));
  await expect(cy(page, 'invoice-payments')).toBeVisible();

  // 7. Cartão, lista e Início concordam com a API depois dos pagamentos.
  await open(page, `/cards/${card.id}`);
  const finalCard = await net.body('GET', `/v1/cards/${card.id}`);
  expect(await cyText(page, 'card-available')).toBe(fmt(finalCard.availableLimit.amount));
  expect(await cyText(page, 'card-total-committed')).toBe(fmt(finalCard.totalCommitted.amount));

  await open(page, '/cards');
  const list = await net.body('GET', '/v1/cards');
  expect(list.items[0].id).toBe(card.id);
  expect(await cyText(page, `card-limit-${card.id}-text`)).toContain(
    fmt(list.items[0].availableLimit.amount),
  );
  expect(await cyText(page, `card-invoice-${card.id}`)).toContain(
    fmt(list.items[0].currentInvoice.outstanding.amount),
  );
  await evidence(page, 'e2e-06-lista-cartoes');

  await open(page, '/planning/overview');
  await expect(cy(page, 'home-legacy')).toBeVisible();
  await expect(cy(page, `home-card-${card.id}`)).toBeVisible();
  expect(await cyText(page, `home-card-available-${card.id}`)).toBe(
    fmt(finalCard.availableLimit.amount),
  );
  expect(await cyText(page, `home-card-total-committed-${card.id}`)).toBe(
    fmt(finalCard.totalCommitted.amount),
  );
  expect(await cyText(page, `home-card-committed-future-${card.id}`)).toBe(
    fmt(finalCard.committedFuture.amount),
  );
  const summary = await net.body('GET', '/v1/dashboard/summary');
  expect(await cyText(page, 'home-net-worth-future-installments')).toBe(
    fmt(summary.netWorth.cardFutureInstallments.amount),
  );
  await evidence(page, 'e2e-07-inicio-com-cartao');

  // 8. A conta do pagamento perdeu exatamente o que a API diz.
  await open(page, '/accounts');
  const accounts = await net.body('GET', '/v1/accounts');
  const acc = accounts.items.find((a: any) => a.id === nubank.id);
  expect(await cyText(page, `account-balance-${nubank.id}`)).toContain(
    fmt(acc.currentBalance.amount),
  );
});

test('a mesma Idempotency-Key no pagamento não paga duas vezes (rede que cai na volta)', async ({
  page,
  api,
  signIn,
  net,
}) => {
  test.setTimeout(180_000);
  net.checkDuplicates = false;
  net.allow(409);
  const nubank = await api.createAccount({ name: 'Nubank', openingBalance: '5000.00' });
  const card = await api.ok(
    api.call('POST', '/v1/cards', {
      name: 'Roxinho',
      institution: null,
      limit: { amount: '5000.00', currency: 'BRL' },
      closingDay: closingDayAwayFromToday(),
      dueDay: 5,
      defaultPaymentAccountId: nubank.id,
    }),
    [201],
  );
  const category = await api.categoryId('Alimentação');
  const purchase = await api.txOk({
    type: 'CARD_PURCHASE',
    amount: '300.00',
    date: todayInSaoPaulo(),
    description: 'Fone',
    notes: null,
    cardId: card.id,
    categoryId: category,
    installments: 1,
  });
  const invoiceId = purchase.installments[0].invoiceId as string;
  await signIn(page);
  await open(page, `/cards/${card.id}/invoices/${invoiceId}`);

  // O backend processa o pagamento, mas a resposta se perde: o "tentar de novo" reenvia a mesma chave.
  net.dropNextResponse('POST', /\/v1\/invoices\/[^/]+\/payments$/);
  await cy(page, 'invoice-pay').click();
  await cy(page, 'pay-amount').fill('50,00');
  await cy(page, 'pay-amount').blur();
  await cy(page, 'pay-submit').click();
  await expect(cy(page, 'pay-retry')).toBeVisible();
  await cy(page, 'pay-retry').click();
  await expect(cy(page, 'pay-sheet-panel')).toBeHidden();

  const calls = net.find('POST', `/v1/invoices/${invoiceId}/payments`);
  expect(calls).toHaveLength(2);
  expect(calls[1]?.idempotencyKey).toBe(calls[0]?.idempotencyKey);
  const fresh = await api.get(`/v1/invoices/${invoiceId}`);
  expect(fresh.body.payments).toHaveLength(1);
  expect(await cyText(page, 'invoice-paid')).toBe(fmt('50.00'));
});

test('resposta perdida, fechar e reabrir a folha e pagar de novo: uma só Idempotency-Key, um só pagamento', async ({
  page,
  api,
  signIn,
  net,
}) => {
  test.setTimeout(180_000);
  net.checkDuplicates = false;
  net.allow(409);
  const nubank = await api.createAccount({ name: 'Nubank', openingBalance: '5000.00' });
  const card = await api.ok(
    api.call('POST', '/v1/cards', {
      name: 'Roxinho',
      institution: null,
      limit: { amount: '5000.00', currency: 'BRL' },
      closingDay: closingDayAwayFromToday(),
      dueDay: 5,
      defaultPaymentAccountId: nubank.id,
    }),
    [201],
  );
  const category = await api.categoryId('Alimentação');
  const purchase = await api.txOk({
    type: 'CARD_PURCHASE',
    amount: '300.00',
    date: todayInSaoPaulo(),
    description: 'Fone',
    notes: null,
    cardId: card.id,
    categoryId: category,
    installments: 1,
  });
  const invoiceId = purchase.installments[0].invoiceId as string;
  await signIn(page);
  await open(page, `/cards/${card.id}/invoices/${invoiceId}`);

  // O backend grava o pagamento, mas a resposta se perde: o usuário fecha a folha, reabre e paga de novo.
  net.dropNextResponse('POST', /\/v1\/invoices\/[^/]+\/payments$/);
  await cy(page, 'invoice-pay').click();
  await cy(page, 'pay-submit').click();
  await expect(cy(page, 'pay-retry')).toBeVisible();
  await cy(page, 'pay-cancel').click();
  await expect(cy(page, 'pay-sheet-panel')).toBeHidden();
  await cy(page, 'invoice-pay').click();
  await cy(page, 'pay-submit').click();
  await expect(cy(page, 'pay-sheet-panel')).toBeHidden();

  const calls = net.find('POST', `/v1/invoices/${invoiceId}/payments`);
  expect(calls).toHaveLength(2);
  expect(calls[1]?.idempotencyKey).toBe(calls[0]?.idempotencyKey);
  const fresh = await api.get(`/v1/invoices/${invoiceId}`);
  expect(fresh.body.payments).toHaveLength(1);
});
