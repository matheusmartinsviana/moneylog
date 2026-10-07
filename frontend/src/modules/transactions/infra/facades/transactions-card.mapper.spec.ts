import {
  toFormValue,
  toRequestBody,
  toTransaction,
  toUpdateBody,
} from '~/modules/transactions/infra/facades/transactions-response.mapper';
import { aResponse, brl, ref } from '~/testing/transactions-response-testing';

const installment = (number: number, overrides = {}) => ({
  number,
  total: 6,
  amount: brl('200.00'),
  competence: '2026-10',
  invoiceId: `inv-${number}`,
  invoiceReferenceMonth: '2026-11',
  invoiceDueDate: '2026-11-05',
  status: 'PENDING' as const,
  lateEntry: false,
  ...overrides,
});

const purchase = () =>
  aResponse({
    id: 'tx-card',
    type: 'CARD_PURCHASE',
    amount: brl('1200.00'),
    description: 'Notebook',
    notes: null,
    category: ref('cat-tech', 'Tecnologia'),
    card: ref('card-1', 'Roxinho'),
    account: null,
    method: null,
    installments: [installment(1), installment(2, { status: 'CANCELED', lateEntry: true })],
    impact: {
      cash: brl('0.00'),
      consumption: [{ competence: '2026-10', amount: brl('200.00') }],
      netWorth: brl('-1200.00'),
      commitment: brl('1000.00'),
    },
  });

describe('Compra no cartão no módulo de movimentações (T63)', () => {
  it('Dado CARD_PURCHASE, então o valor do formulário leva cardId, categoryId e o total de parcelas, sem accountId', () => {
    expect(toFormValue(purchase())).toEqual({
      type: 'CARD_PURCHASE',
      amount: '1200.00',
      date: '2026-10-04',
      description: 'Notebook',
      notes: null,
      cardId: 'card-1',
      categoryId: 'cat-tech',
      installments: 6,
    });
    expect(toFormValue(purchase())).not.toHaveProperty('accountId');
  });

  it.each([
    ['sem cartão', { card: null }],
    ['sem parcelas', { installments: [] }],
  ])('Dado CARD_PURCHASE %s, então não há valor de edição (null)', (_, overrides) => {
    expect(toFormValue({ ...purchase(), ...overrides })).toBeNull();
  });

  it('Dado REFUND no cartão, então o valor do formulário leva cardId e accountId null; em conta, o inverso', () => {
    const onCard = aResponse({
      type: 'REFUND',
      method: null,
      account: null,
      card: ref('card-1', 'Roxinho'),
    });
    expect(toFormValue(onCard)).toMatchObject({
      type: 'REFUND',
      cardId: 'card-1',
      accountId: null,
    });
    expect(toFormValue(aResponse({ type: 'REFUND', method: null }))).toMatchObject({
      accountId: 'acc-1',
      cardId: null,
    });
  });

  it('Dado REFUND com conta e cartão ao mesmo tempo (ou nenhum), então não há valor de edição', () => {
    expect(
      toFormValue(aResponse({ type: 'REFUND', method: null, card: ref('card-1') })),
    ).toBeNull();
    expect(toFormValue(aResponse({ type: 'REFUND', method: null, account: null }))).toBeNull();
  });

  it('Dado a resposta de uma compra, então copia o cartão, as parcelas (status, fatura, lateEntry) e o impact do backend', () => {
    const tx = toTransaction(purchase());

    expect(tx.card).toEqual({ id: 'card-1', name: 'Roxinho' });
    expect(tx.installments).toHaveLength(2);
    expect(tx.installments[1]).toMatchObject({
      number: 2,
      status: 'CANCELED',
      lateEntry: true,
      invoiceId: 'inv-2',
      invoiceDueDate: '2026-11-05',
    });
    expect(tx.impact.commitment.amount).toBe('1000.00');
    expect(tx.invoice).toBeNull();
  });

  it('Dado INVOICE_PAYMENT, então a fatura vem da resposta e o tipo é conhecido', () => {
    const tx = toTransaction(
      aResponse({
        type: 'INVOICE_PAYMENT',
        card: ref('card-1', 'Roxinho'),
        invoice: {
          id: 'inv-1',
          referenceMonth: '2026-11',
          closingDate: '2026-10-25',
          dueDate: '2026-11-05',
          status: 'PAID',
        },
        impact: {
          cash: brl('-1283.00'),
          consumption: [],
          netWorth: brl('0.00'),
          commitment: brl('0.00'),
        },
      }),
    );

    expect(tx.type).toBe('INVOICE_PAYMENT');
    expect(tx.invoice).toEqual({
      id: 'inv-1',
      referenceMonth: '2026-11',
      closingDate: '2026-10-25',
      dueDate: '2026-11-05',
      status: 'PAID',
    });
    expect(tx.impact.cash.amount).toBe('-1283.00');
    expect(tx.formValue).toBeNull();
  });

  it('Dado voidBlockedBy TRANSACTION_IN_CLOSED_INVOICE, então passa tipado', () => {
    const tx = toTransaction({
      ...purchase(),
      voidable: false,
      voidBlockedBy: 'TRANSACTION_IN_CLOSED_INVOICE',
    });

    expect(tx.voidBlockedBy).toBe('TRANSACTION_IN_CLOSED_INVOICE');
    expect(tx.voidable).toBe(false);
  });

  it('Dado o envio da compra, então o corpo segue o contrato: cardId e installments, sem accountId', () => {
    const body = toRequestBody({
      type: 'CARD_PURCHASE',
      amount: '1200.00',
      date: '2026-10-10',
      description: 'Notebook',
      notes: '  ',
      cardId: 'card-1',
      categoryId: 'cat-tech',
      installments: 6,
    });

    expect(body).toEqual({
      type: 'CARD_PURCHASE',
      amount: '1200.00',
      date: '2026-10-10',
      description: 'Notebook',
      notes: null,
      cardId: 'card-1',
      categoryId: 'cat-tech',
      installments: 6,
    });
    expect(body).not.toHaveProperty('accountId');
  });

  it('Dado a edição da compra, então o PUT leva o corpo do POST + version', () => {
    const body = toUpdateBody(
      {
        type: 'CARD_PURCHASE',
        amount: '1200.00',
        date: '2026-10-10',
        description: 'Notebook Pro',
        notes: null,
        cardId: 'card-1',
        categoryId: 'cat-tech',
        installments: 6,
      },
      5,
    );

    expect(body).toMatchObject({ type: 'CARD_PURCHASE', description: 'Notebook Pro', version: 5 });
  });

  it('Dado reembolso no cartão ou em conta, então só o destino escolhido vai no corpo', () => {
    const base = {
      type: 'REFUND' as const,
      amount: '30.00',
      date: '2026-10-10',
      description: 'Reembolso',
      notes: null,
      categoryId: 'cat-1',
      refundOfTransactionId: null,
    };

    const onCard = toRequestBody({ ...base, accountId: null, cardId: 'card-1' });
    const onAccount = toRequestBody({ ...base, accountId: 'acc-1', cardId: null });

    expect(onCard).toMatchObject({ cardId: 'card-1' });
    expect(onCard).not.toHaveProperty('accountId');
    expect(onAccount).toMatchObject({ accountId: 'acc-1' });
    expect(onAccount).not.toHaveProperty('cardId');
  });
});
