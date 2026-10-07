import type {
  OccurrenceSliceResponse,
  RecurrenceSliceResponse,
  RecurrenceSummaryResponse,
} from '~/modules/recurrences/infra/responses/recurrence.response';

/** Ambiente mock (S-67): nenhuma recorrência cadastrada. Mesmo formato bruto da API. */
export const EMPTY_RECURRENCES: RecurrenceSliceResponse = { items: [], hasNext: false };
export const EMPTY_OCCURRENCES: OccurrenceSliceResponse = { items: [], hasNext: false };
export const EMPTY_RECURRENCE_SUMMARY: RecurrenceSummaryResponse = {
  fixedCosts: { amount: '0.00', currency: 'BRL' },
  recurringIncome: { amount: '0.00', currency: 'BRL' },
  estimate: true,
};
