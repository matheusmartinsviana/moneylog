import type { DebtOverviewResponse } from '~/modules/debt-overview/infra/responses/debt-overview.response';

/** Ambiente mock (S-67): nada cadastrado. Mesmo formato bruto da API. */
export function emptyOverview(months: number): DebtOverviewResponse {
  const zero = { amount: '0.00', currency: 'BRL' as const };
  return {
    asOf: '1970-01-01',
    total: zero,
    parts: { cards: zero, people: zero, other: zero },
    cards: { total: zero, invoiced: zero, future: zero, items: [] },
    people: { total: zero, items: [] },
    other: { total: zero, items: [] },
    receivablesInfo: zero,
    hasRecords: false,
    fixedCosts: { monthly: zero, estimate: true },
    income: { monthly: null, source: 'NONE' },
    liquidity: { inAccounts: zero, available: zero },
    comparison: {
      debtToIncome: null,
      fixedCostToIncome: null,
      debtMinusInAccounts: zero,
      reason: 'NO_INCOME',
    },
    schedule: {
      months,
      points: [],
      overdue: zero,
      undated: zero,
      beyondHorizon: zero,
      payoffCompetence: null,
      payoffReason: null,
    },
    payoffGoal: null,
    tracked: { items: [], scheduleByMonth: [] },
  };
}
