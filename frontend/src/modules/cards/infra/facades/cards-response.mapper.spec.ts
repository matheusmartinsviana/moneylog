import {
  toBillingChangePreview,
  toCard,
  toCreateRequest,
  toFutureInstallments,
  toInvoice,
  toPaymentBody,
  toPaymentPreview,
  toPurchasePreview,
  toPurchasePreviewBody,
  toUpdateRequest,
} from '~/modules/cards/infra/facades/cards-response.mapper';
import {
  aCardResponse,
  anInvoiceResponse,
  anInvoiceSummaryResponse,
  brl,
} from '~/testing/cards-response-testing';

describe('cards-response.mapper', () => {
  it('Dado um cartão, então copia os campos do backend sem recalcular nada e o dinheiro continua string', () => {
    // Os números não "fecham" de propósito: limite − disponível ≠ comprometidos. O front não corrige.
    const response = aCardResponse({
      limit: brl('10000.00'),
      availableLimit: brl('1.00'),
      totalCommitted: brl('3.33'),
      committedFuture: brl('4.44'),
      creditBalance: brl('17.00'),
      usedRatio: 0.5,
      overLimit: true,
    });

    const card = toCard(response);

    expect(card).toMatchObject({
      id: 'card-1',
      name: 'Roxinho',
      limit: { amount: '10000.00', currency: 'BRL' },
      availableLimit: { amount: '1.00', currency: 'BRL' },
      totalCommitted: { amount: '3.33', currency: 'BRL' },
      committedFuture: { amount: '4.44', currency: 'BRL' },
      creditBalance: { amount: '17.00', currency: 'BRL' },
      usedRatio: 0.5,
      overLimit: true,
      closingDay: 25,
      dueDay: 5,
      defaultPaymentAccountId: 'acc-1',
      archivable: false,
      version: 2,
    });
    expect(typeof card.limit?.amount).toBe('string');
    expect(card.currentInvoice?.outstanding.amount).toBe('1283.00');
    expect(Object.keys(card)).not.toContain('number');
    expect(Object.keys(card)).not.toContain('cvv');
  });

  it('Dado um cartão sem fatura corrente, então currentInvoice é null', () => {
    expect(toCard(aCardResponse({ currentInvoice: null })).currentInvoice).toBeNull();
  });

  it('Dado uma fatura, então traz itens, pagamentos e os valores como vieram', () => {
    const invoice = toInvoice(
      anInvoiceResponse({
        creditCarry: brl('17.00'),
        carryIn: brl('5.00'),
        hasLateEntries: true,
        payments: [
          { transactionId: 'pay-1', accountId: 'acc-1', amount: brl('500.00'), date: '2026-10-20' },
        ],
      }),
    );

    expect(invoice.creditCarry.amount).toBe('17.00');
    expect(invoice.carryIn.amount).toBe('5.00');
    expect(invoice.hasLateEntries).toBe(true);
    expect(invoice.items[0]).toMatchObject({
      kind: 'INSTALLMENT',
      number: 1,
      totalInstallments: 6,
    });
    expect(invoice.payments).toEqual([
      { transactionId: 'pay-1', accountId: 'acc-1', amount: brl('500.00'), date: '2026-10-20' },
    ]);
  });

  it('Dado a prévia de compra, então mantém cada parcela, a fatura alvo e os avisos como recebidos', () => {
    const preview = toPurchasePreview({
      installments: [
        {
          number: 1,
          total: 2,
          amount: brl('600.01'),
          competence: '2026-10',
          invoice: {
            id: 'inv-1',
            referenceMonth: '2026-11',
            closingDate: '2026-10-25',
            dueDate: '2026-11-05',
            status: 'OPEN',
          },
          lateEntry: true,
        },
      ],
      total: brl('9.99'),
      availableLimitAfter: brl('-1.00'),
      overLimit: true,
      warnings: ['OVER_LIMIT', 'LATE_ENTRY'],
    });

    expect(preview.total.amount).toBe('9.99');
    expect(preview.availableLimitAfter?.amount).toBe('-1.00');
    expect(preview.installments[0]?.amount.amount).toBe('600.01');
    expect(preview.installments[0]?.invoice.dueDate).toBe('2026-11-05');
    expect(preview.warnings).toEqual(['OVER_LIMIT', 'LATE_ENTRY']);
  });

  it('Dado as demais prévias e as parcelas futuras, então copiam os campos', () => {
    expect(
      toBillingChangePreview({
        effectiveFromClosingDate: '2026-11-25',
        firstNewInvoice: { closingDate: '2026-11-10', dueDate: '2026-11-20' },
        movedInstallments: 5,
        movedCredits: 1,
        notice: 'FROM_NEXT_INVOICE',
      }),
    ).toEqual({
      effectiveFromClosingDate: '2026-11-25',
      firstNewInvoice: { closingDate: '2026-11-10', dueDate: '2026-11-20' },
      movedInstallments: 5,
      movedCredits: 1,
      notice: 'FROM_NEXT_INVOICE',
    });
    expect(
      toPaymentPreview({
        kind: 'OVERPAY',
        outstandingAfter: brl('0.00'),
        creditCarryAfter: brl('17.00'),
      }),
    ).toEqual({ kind: 'OVERPAY', outstandingAfter: brl('0.00'), creditCarryAfter: brl('17.00') });
    const future = toFutureInstallments({
      total: brl('1000.00'),
      byInvoice: [
        {
          invoiceId: 'inv-2',
          referenceMonth: '2026-12',
          dueDate: '2026-12-05',
          amount: brl('200.00'),
          items: anInvoiceResponse().items,
        },
      ],
    });
    expect(future.total.amount).toBe('1000.00');
    expect(future.byInvoice[0]?.items[0]?.description).toBe('Notebook');
  });

  it('Dado o formulário, então o corpo segue o contrato: limite como Money e nada além dos campos', () => {
    const input = {
      name: 'Roxinho',
      institution: '  ',
      limit: '10000.00',
      closingDay: 25,
      dueDay: 5,
      defaultPaymentAccountId: null,
    };

    expect(toCreateRequest(input)).toEqual({
      name: 'Roxinho',
      institution: null,
      limit: { amount: '10000.00', currency: 'BRL' },
      closingDay: 25,
      dueDay: 5,
      defaultPaymentAccountId: null,
    });
    expect(
      toUpdateRequest({ ...input, version: 3, confirmedEffectiveFrom: '2026-11-25' }),
    ).toMatchObject({ version: 3, confirmedEffectiveFrom: '2026-11-25' });
    expect(Object.keys(toCreateRequest(input)).sort()).toEqual([
      'closingDay',
      'defaultPaymentAccountId',
      'dueDay',
      'institution',
      'limit',
      'name',
    ]);
  });

  it('Dado a prévia e o pagamento, então os corpos levam só o que o contrato pede', () => {
    expect(
      toPurchasePreviewBody({ amount: '1200.00', installments: 6, date: '2026-10-10' }),
    ).toEqual({
      amount: '1200.00',
      installments: 6,
      date: '2026-10-10',
    });
    expect(toPaymentBody({ accountId: 'acc-1', amount: '1283.00', date: '2026-10-26' })).toEqual({
      accountId: 'acc-1',
      amount: '1283.00',
      date: '2026-10-26',
    });
    expect(anInvoiceSummaryResponse().id).toBe('inv-1');
  });
});

describe('cards-response.mapper (sem limite e fechamento)', () => {
  it('Dado cartão sem limite, então limit, availableLimit e usedRatio ficam nulos e nada é calculado', () => {
    const card = toCard(
      aCardResponse({ limit: null, availableLimit: null, usedRatio: null, overLimit: false }),
    );

    expect(card.limit).toBeNull();
    expect(card.availableLimit).toBeNull();
    expect(card.usedRatio).toBeNull();
    expect(card.overLimit).toBe(false);
  });

  it('Dado campos ausentes (omitidos pelo backend), então também viram nulos', () => {
    const response = aCardResponse();
    delete response.limit;
    delete response.availableLimit;
    delete response.usedRatio;

    const card = toCard(response);

    expect(card.limit).toBeNull();
    expect(card.availableLimit).toBeNull();
    expect(card.usedRatio).toBeNull();
  });

  it('Dado closingConfirmed falso, então o cartão carrega a marca', () => {
    expect(toCard(aCardResponse({ closingConfirmed: false })).closingConfirmed).toBe(false);
  });

  it('Dado criar sem limite, então o corpo manda limit nulo', () => {
    const body = toCreateRequest({
      name: 'Azul',
      institution: null,
      limit: null,
      closingDay: 10,
      dueDay: 17,
      defaultPaymentAccountId: null,
    });

    expect(body.limit).toBeNull();
  });
});
