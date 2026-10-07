import type { DebtResponse } from '~/modules/debts/infra/responses/debt.response';
import type {
  PersonDetailResponse,
  PersonResponse,
} from '~/modules/people/infra/responses/person.response';
import type {
  OccurrenceResponse,
  RecurrenceResponse,
} from '~/modules/recurrences/infra/responses/recurrence.response';

export const brl = (amount: string) => ({ amount, currency: 'BRL' as const });

const STAMPS = { createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z' };

export function aPersonResponse(overrides: Partial<PersonResponse> = {}): PersonResponse {
  return {
    id: 'person-1',
    name: 'João',
    notes: null,
    archived: false,
    net: brl('150.00'),
    direction: 'RECEIVABLE',
    openDebts: 1,
    nextDueDate: '2026-10-20',
    version: 1,
    ...STAMPS,
    ...overrides,
  };
}

export function aDebtSummaryResponse(
  overrides: Partial<DebtResponse> = {},
): PersonDetailResponse['debts'][number] {
  return {
    id: 'debt-1',
    person: { id: 'person-1', name: 'João' },
    direction: 'RECEIVABLE',
    status: 'OPEN',
    principal: brl('300.00'),
    settled: brl('0.00'),
    outstanding: brl('300.00'),
    date: '2026-10-05',
    expectedDate: '2026-10-20',
    overdue: false,
    description: 'Empréstimo',
    ...overrides,
  } as PersonDetailResponse['debts'][number];
}

export function aPersonDetailResponse(
  overrides: Partial<PersonDetailResponse> = {},
): PersonDetailResponse {
  return { ...aPersonResponse(), debts: [aDebtSummaryResponse()], ...overrides };
}

export function aDebtResponse(overrides: Partial<DebtResponse> = {}): DebtResponse {
  return {
    id: 'debt-1',
    person: { id: 'person-1', name: 'João' },
    direction: 'RECEIVABLE',
    origin: 'WITH_MOVEMENT',
    originTransactionId: 'tx-loan',
    principal: brl('300.00'),
    settled: brl('100.00'),
    outstanding: brl('200.00'),
    status: 'PARTIALLY_SETTLED',
    date: '2026-10-05',
    expectedDate: '2026-10-20',
    overdue: false,
    description: 'Empréstimo',
    category: null,
    closureDate: null,
    closureReason: null,
    settlements: [
      { transactionId: 'tx-pay-1', amount: brl('100.00'), date: '2026-10-06', active: true },
    ],
    cancelable: true,
    voidable: false,
    voidBlockedBy: 'HAS_ORIGIN_TRANSACTION',
    version: 2,
    ...STAMPS,
    ...overrides,
  };
}

export function aRecurrenceResponse(
  overrides: Partial<RecurrenceResponse> = {},
): RecurrenceResponse {
  return {
    id: 'rec-1',
    type: 'EXPENSE',
    amount: brl('119.00'),
    description: 'Internet',
    category: { id: 'cat-1', name: 'Moradia' },
    account: { id: 'acc-1', name: 'Nubank' },
    card: null,
    method: 'BOLETO',
    frequency: 'MONTHLY',
    interval: 1,
    unit: null,
    startDate: '2026-09-10',
    endDate: null,
    maxOccurrences: null,
    active: true,
    nextOccurrence: '2026-10-10',
    monthlyEstimate: brl('119.00'),
    version: 1,
    ...STAMPS,
    ...overrides,
  } as RecurrenceResponse;
}

export function anOccurrenceResponse(
  overrides: Partial<OccurrenceResponse> = {},
): OccurrenceResponse {
  return {
    recurrenceId: 'rec-1',
    date: '2026-10-10',
    status: 'PENDING',
    overdue: false,
    type: 'EXPENSE',
    direction: 'OUT',
    amount: brl('119.00'),
    description: 'Internet',
    categoryId: 'cat-1',
    accountId: 'acc-1',
    cardId: null,
    transactionId: null,
    ...overrides,
  };
}
