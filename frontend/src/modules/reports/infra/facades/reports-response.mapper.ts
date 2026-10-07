import type { IncomeExpenseSeries, SpendingByCategory } from '~/modules/reports/core/types/reports';
import type {
  IncomeExpenseSeriesResponse,
  SpendingByCategoryResponse,
} from '~/modules/reports/infra/responses/reports.response';
import type { Money } from '~/util/money';

/** Resposta → tipos do core. Só copia campos: nenhum valor é somado, comparado nem convertido para `number`. */
const money = (value: { amount: string; currency: string }): Money => ({
  amount: value.amount,
  currency: value.currency,
});

export function toIncomeExpenseSeries(response: IncomeExpenseSeriesResponse): IncomeExpenseSeries {
  return {
    period: response.period,
    from: response.from,
    to: response.to,
    basis: response.basis,
    granularity: response.granularity,
    points: response.points.map((point) => ({
      periodStart: point.periodStart,
      periodEnd: point.periodEnd,
      partial: point.partial,
      income: money(point.income),
      expenses: money(point.expenses),
      net: money(point.net),
    })),
    totals: {
      income: money(response.totals.income),
      expenses: money(response.totals.expenses),
      net: money(response.totals.net),
    },
  };
}

export function toSpendingByCategory(response: SpendingByCategoryResponse): SpendingByCategory {
  return {
    basis: response.basis,
    from: response.from,
    to: response.to,
    total: money(response.total),
    base: money(response.base),
    items: response.items.map((item) => ({
      category: { id: item.category.id, name: item.category.name },
      amount: money(item.amount),
      share: item.share,
    })),
    other: response.other
      ? {
          amount: money(response.other.amount),
          share: response.other.share,
          categories: response.other.categories,
        }
      : null,
  };
}
