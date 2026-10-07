import type {
  IncomeExpenseSeriesResponse,
  SpendingByCategoryResponse,
} from '~/modules/reports/infra/responses/reports.response';

const zero = () => ({ amount: '0.00', currency: 'BRL' as const });

/** Data fixa: o mock não lê o relógio do aparelho (como `empty-dashboard`). */
const AS_OF = '2026-10-10';

/**
 * Ambiente mock (S-67): usuário sem lançamentos. Mesmo formato bruto da API e **sem nenhum dado de
 * demonstração** (os de demonstração moram nas fixtures de `features/dev`, fora do bundle de produção).
 * O `E2E` coloca séries com valores em `window.__MONEYLOG_MOCK_RESPONSES__` quando precisa de dados.
 */
export function emptyIncomeExpenseSeries(
  period: IncomeExpenseSeriesResponse['period'],
): IncomeExpenseSeriesResponse {
  const monthly = period === 'M12';
  const weekly = period === 'M3';
  return {
    period,
    from: AS_OF,
    to: AS_OF,
    basis: monthly ? 'COMPETENCE' : 'DATE',
    granularity: monthly ? 'MONTH' : weekly ? 'WEEK' : 'DAY',
    points: [],
    totals: { income: zero(), expenses: zero(), net: zero() },
  };
}

export function emptySpendingByCategory(month: string): SpendingByCategoryResponse {
  return {
    basis: 'COMPETENCE',
    from: `${month}-01`,
    to: `${month}-01`,
    total: zero(),
    base: zero(),
    items: [],
    other: null,
  };
}
