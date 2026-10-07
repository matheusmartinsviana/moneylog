import type {
  MonthlySummary,
  SummaryDelta,
  SummaryTotals,
} from '~/modules/monthly-summary/core/types/monthly-summary';
import type {
  MonthlySummaryResponse,
  SummaryDeltaResponse,
  SummaryTotalsResponse,
} from '~/modules/monthly-summary/infra/responses/monthly-summary.response';
import type { Money } from '~/util/money';

/** Resposta → tipos do core. Só copia campos: nenhum valor é somado nem convertido para `number`. */
const money = (value: { amount: string; currency: string }): Money => ({
  amount: value.amount,
  currency: value.currency,
});

const delta = (value: SummaryDeltaResponse): SummaryDelta => ({
  amount: money(value.amount),
  percent: value.percent,
});

const totals = (value: SummaryTotalsResponse): SummaryTotals => ({
  competence: value.competence,
  income: money(value.income),
  expenses: money(value.expenses),
  investments: money(value.investments),
  net: money(value.net),
  savingsRate: value.savingsRate ?? null,
});

export function toMonthlySummary(response: MonthlySummaryResponse): MonthlySummary {
  const largestCategory = response.largestCategory;
  const largestExpense = response.largestExpense;
  return {
    competence: response.competence,
    partial: response.partial,
    isProjection: response.isProjection,
    income: money(response.income),
    expenses: money(response.expenses),
    investments: money(response.investments),
    net: money(response.net),
    savingsRate: response.savingsRate,
    largestCategory: largestCategory
      ? {
          category: { id: largestCategory.category.id, name: largestCategory.category.name },
          amount: money(largestCategory.amount),
        }
      : null,
    largestExpense: largestExpense
      ? {
          transactionId: largestExpense.transactionId,
          debtId: largestExpense.debtId,
          description: largestExpense.description,
          category: { id: largestExpense.category.id, name: largestExpense.category.name },
          date: largestExpense.date,
          amount: money(largestExpense.amount),
          installmentNumber: largestExpense.installmentNumber,
          installmentTotal: largestExpense.installmentTotal,
        }
      : null,
    card: {
      consumption: money(response.card.consumption),
      outstanding: money(response.card.outstanding),
    },
    futureInstallments: money(response.futureInstallments),
    comparison: {
      previousMonth: totals(response.comparison.previousMonth),
      incomeDelta: delta(response.comparison.incomeDelta),
      expensesDelta: delta(response.comparison.expensesDelta),
      investmentsDelta: delta(response.comparison.investmentsDelta),
      netDelta: delta(response.comparison.netDelta),
      savingsRateDelta: response.comparison.savingsRateDelta ?? null,
    },
  };
}
