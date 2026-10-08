import type {
  CardResponse,
  InvoiceResponse,
  InvoiceSummaryResponse,
} from '~/modules/cards/infra/responses/card.response';

export const brl = (amount: string) => ({ amount, currency: 'BRL' as const });

export function anInvoiceSummaryResponse(
  overrides: Partial<InvoiceSummaryResponse> = {},
): InvoiceSummaryResponse {
  return {
    id: 'inv-1',
    cardId: 'card-1',
    referenceMonth: '2026-11',
    periodStart: '2026-09-25',
    closingDate: '2026-10-25',
    dueDate: '2026-11-05',
    status: 'OPEN',
    total: brl('1283.00'),
    carryIn: brl('0.00'),
    paid: brl('0.00'),
    outstanding: brl('1283.00'),
    creditCarry: brl('0.00'),
    hasLateEntries: false,
    ...overrides,
  };
}

export function aCardResponse(overrides: Partial<CardResponse> = {}): CardResponse {
  return {
    id: 'card-1',
    name: 'Roxinho',
    institution: 'Nubank',
    limit: brl('10000.00'),
    availableLimit: brl('7717.00'),
    overLimit: false,
    creditBalance: brl('0.00'),
    usedRatio: 0.2283,
    closingDay: 25,
    dueDay: 5,
    defaultPaymentAccountId: 'acc-1',
    status: 'ACTIVE',
    currentInvoice: anInvoiceSummaryResponse(),
    totalCommitted: brl('1283.00'),
    committedFuture: brl('1000.00'),
    closingConfirmed: true,
    archivable: false,
    version: 2,
    createdAt: '2026-10-01T12:00:00Z',
    updatedAt: '2026-10-01T12:00:00Z',
    ...overrides,
  };
}

export function anInvoiceResponse(overrides: Partial<InvoiceResponse> = {}): InvoiceResponse {
  return {
    ...anInvoiceSummaryResponse(),
    items: [
      {
        kind: 'INSTALLMENT',
        transactionId: 'tx-1',
        description: 'Notebook',
        number: 1,
        totalInstallments: 6,
        amount: brl('200.00'),
        date: '2026-10-10',
        lateEntry: false,
      },
    ],
    payments: [],
    ...overrides,
  };
}
