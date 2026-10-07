import type { TransactionResponse } from '~/modules/transactions/infra/responses/transaction.response';

export const brl = (amount: string) => ({ amount, currency: 'BRL' as const });
export const ref = (id: string, name = id) => ({ id, name });

export function aResponse(overrides: Partial<TransactionResponse> = {}): TransactionResponse {
  return {
    id: 'tx-1',
    type: 'EXPENSE',
    status: 'ACTIVE',
    amount: brl('35.00'),
    date: '2026-10-04',
    description: 'Almoço',
    notes: 'sem glúten',
    category: ref('cat-1', 'Alimentação'),
    card: null,
    account: ref('acc-1', 'Nubank'),
    counterpartAccount: null,
    method: 'PIX',
    direction: null,
    adjustmentKind: null,
    reason: null,
    refundOf: null,
    installments: [],
    invoice: null,
    impact: {
      cash: brl('-35.00'),
      consumption: [{ competence: '2026-10', amount: brl('35.00') }],
      netWorth: brl('-35.00'),
      commitment: brl('0.00'),
    },
    editable: true,
    voidable: true,
    voidBlockedBy: null,
    voidReason: null,
    voidedAt: null,
    source: 'MANUAL',
    version: 4,
    createdAt: '2026-10-04T12:00:00Z',
    updatedAt: '2026-10-04T12:00:00Z',
    ...overrides,
  };
}
