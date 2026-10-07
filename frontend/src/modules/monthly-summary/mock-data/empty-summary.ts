import type { MonthlySummaryResponse } from '~/modules/monthly-summary/infra/responses/monthly-summary.response';

const zero = { amount: '0.00', currency: 'BRL' as const };
const noDelta = { amount: zero, percent: null };

/** Ambiente mock (S-67): mês sem nenhum registro. Mesmo formato bruto da API. */
export function emptySummary(month: string): MonthlySummaryResponse {
  return {
    competence: month,
    partial: false,
    isProjection: false,
    income: zero,
    expenses: zero,
    investments: zero,
    net: zero,
    savingsRate: null,
    largestCategory: null,
    largestExpense: null,
    card: { consumption: zero, outstanding: zero },
    futureInstallments: zero,
    comparison: {
      previousMonth: {
        competence: previousMonth(month),
        income: zero,
        expenses: zero,
        investments: zero,
        net: zero,
      },
      incomeDelta: noDelta,
      expensesDelta: noDelta,
      investmentsDelta: noDelta,
      netDelta: noDelta,
    },
  };
}

/** Só rótulo do mês anterior no mock vazio (texto `YYYY-MM`, sem relógio e sem valores). */
function previousMonth(month: string): string {
  const [year, number] = month.split('-').map(Number) as [number, number];
  return number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, '0')}`;
}
