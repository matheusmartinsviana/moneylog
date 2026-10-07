import type { components } from '../../src/util/api/schema.gen';

/**
 * Respostas **fiéis ao contrato 2.6.0** para o Início nos E2E de `mock` e `prod` (sem backend): tipadas pelos
 * schemas gerados de `contracts/openapi.yaml`, então uma mudança de contrato quebra o `tsc` daqui. O teste as deixa
 * em `window.__MONEYLOG_MOCK_RESPONSES__` (as facades em modo mock leem a chave do endpoint) e depois **compara a
 * tela com o JSON**: o front não soma nada, então o que aparece tem de ser o que está aqui.
 */
type S = components['schemas'];

const brl = (amount: string): S['Money'] => ({ amount, currency: 'BRL' });
const zero = brl('0.00');
const STAMP = '2026-10-10T12:00:00Z';

export const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
export const CARD_ID = '44444444-4444-4444-8444-444444444444';
export const CATEGORY_FOOD = '8a3c6b10-5e2f-4d7a-9b41-c0d1e2f3a4b5';
export const TX_TODAY = '11111111-1111-4111-8111-111111111111';
export const TX_YESTERDAY = '11111111-1111-4111-8111-222222222222';
export const NOTE_ID = '55555555-5555-4555-8555-555555555555';

/** O consumo do mês: o KPI de gasto, o total de "Where your money goes" e o resumo mensal dizem o mesmo número. */
export const CONSUMPTION = '1620.50';

export function dashboardSummary(
  overrides: Partial<S['DashboardSummary']> = {},
): S['DashboardSummary'] {
  return {
    asOf: '2026-10-10',
    isProjection: false,
    hasAccounts: true,
    balances: {
      inAccounts: brl('18900.00'),
      investments: brl('5000.00'),
      available: brl('17617.00'),
      reserved: brl('0.00'),
      committed30d: brl('1283.00'),
      inAccountsChange: {
        previous: brl('17500.00'),
        amount: brl('1400.00'),
        percent: '0.0800',
        since: '2026-09-30',
      },
    },
    committed: {
      d7: brl('1283.00'),
      d30: brl('1283.00'),
      d60: brl('1483.00'),
      d90: brl('1683.00'),
      m6: brl('2283.00'),
      m12: brl('2283.00'),
    },
    projected: {
      d30: brl('29767.00'),
      d90: brl('52517.00'),
      m6: brl('86917.00'),
      m12: brl('155717.00'),
    },
    month: {
      competence: '2026-10',
      income: brl('12000.00'),
      expensesPaid: {
        total: brl('1450.50'),
        byMethod: {
          DEBIT: brl('300.00'),
          PIX: brl('1000.50'),
          CASH: brl('50.00'),
          BOLETO: brl('100.00'),
          TRANSFER: brl('0.00'),
          OTHER: brl('0.00'),
        },
      },
      credit: brl('200.00'),
      refunds: brl('30.00'),
      consumption: brl(CONSUMPTION),
      cashFlow: { in: brl('12000.00'), out: brl('2450.50'), net: brl('9549.50') },
      investedNet: brl('1000.00'),
      lent: brl('150.00'),
      received: brl('0.00'),
      net: brl('10379.50'),
    },
    netWorth: {
      accounts: brl('23900.00'),
      receivables: brl('150.00'),
      cardLiabilities: brl('-200.00'),
      payables: brl('-80.00'),
      total: brl('23770.00'),
      cardFutureInstallments: brl('1000.00'),
    },
    ...overrides,
  };
}

export const upcoming: S['Upcoming'] = {
  items: [],
  undated: [],
  totals: { out: zero, in: zero },
  overdueTruncated: false,
};

/** Mês encerrado (`partial: false`): as variações são tendência de verdade. */
export function monthlySummary(overrides: Partial<S['MonthlySummary']> = {}): S['MonthlySummary'] {
  return {
    competence: '2026-10',
    partial: false,
    isProjection: false,
    income: brl('12000.00'),
    expenses: brl(CONSUMPTION),
    investments: brl('1000.00'),
    net: brl('10379.50'),
    savingsRate: '0.4120',
    largestCategory: {
      category: { id: CATEGORY_FOOD, name: 'Alimentação' },
      amount: brl('820.00'),
    },
    largestExpense: null,
    card: { consumption: brl('200.00'), outstanding: brl('200.00') },
    futureInstallments: brl('1000.00'),
    comparison: {
      previousMonth: {
        competence: '2026-09',
        income: brl('10000.00'),
        expenses: brl('1691.00'),
        investments: brl('0.00'),
        net: brl('8309.00'),
        savingsRate: '0.3740',
      },
      incomeDelta: { amount: brl('2000.00'), percent: '0.2000' },
      expensesDelta: { amount: brl('-70.50'), percent: '-0.0420' },
      investmentsDelta: { amount: brl('1000.00'), percent: null },
      netDelta: { amount: brl('2070.50'), percent: '0.2492' },
      savingsRateDelta: '0.0380',
    },
    ...overrides,
  };
}

/** Mês em andamento no dia 10: o "−80%" compara um mês pela metade com o anterior inteiro (R5). */
export function partialMonthlySummary(): S['MonthlySummary'] {
  const base = monthlySummary({ partial: true });
  return {
    ...base,
    comparison: {
      ...base.comparison,
      expensesDelta: { amount: brl('-1352.80'), percent: '-0.8000' },
      incomeDelta: { amount: brl('-8000.00'), percent: '-0.8000' },
      savingsRateDelta: '-0.0333',
    },
  };
}

export const accounts: S['AccountSlice'] = {
  items: [
    {
      id: ACCOUNT_ID,
      name: 'Nubank',
      type: 'CHECKING',
      liquidity: 'CASH',
      institution: 'Nubank',
      openingBalance: brl('1000.00'),
      openingDate: '2026-01-01',
      currentBalance: brl('12345.67'),
      status: 'ACTIVE',
      openingEditable: false,
      archivable: false,
      reservedAmount: zero,
      uncovered: false,
      version: 1,
      createdAt: STAMP,
      updatedAt: STAMP,
    },
    {
      id: '22222222-2222-4222-8222-333333333333',
      name: 'Reserva',
      type: 'SAVINGS',
      liquidity: 'CASH',
      institution: null,
      openingBalance: zero,
      openingDate: '2026-01-01',
      currentBalance: brl('6554.33'),
      status: 'ACTIVE',
      openingEditable: false,
      archivable: false,
      reservedAmount: zero,
      uncovered: false,
      version: 1,
      createdAt: STAMP,
      updatedAt: STAMP,
    },
  ],
  hasNext: false,
};

export const cards: S['CardSlice'] = {
  items: [
    {
      id: CARD_ID,
      name: 'Roxinho',
      institution: 'Nubank',
      limit: brl('10000.00'),
      availableLimit: brl('7717.00'),
      overLimit: false,
      creditBalance: zero,
      usedRatio: 0.2283,
      closingDay: 25,
      dueDay: 5,
      defaultPaymentAccountId: ACCOUNT_ID,
      status: 'ACTIVE',
      currentInvoice: {
        id: '66666666-6666-4666-8666-666666666666',
        cardId: CARD_ID,
        referenceMonth: '2026-11',
        periodStart: '2026-09-26',
        closingDate: '2026-10-25',
        dueDate: '2026-11-05',
        status: 'OPEN',
        total: brl('1283.00'),
        carryIn: zero,
        paid: zero,
        outstanding: brl('1283.00'),
        creditCarry: zero,
        hasLateEntries: false,
      },
      totalCommitted: brl('1283.00'),
      committedFuture: brl('1000.00'),
      archivable: false,
      version: 1,
      createdAt: STAMP,
      updatedAt: STAMP,
    },
  ],
  hasNext: false,
};

function transaction(
  id: string,
  description: string,
  date: string,
  amount: string,
  type: 'EXPENSE' | 'INCOME',
): S['Transaction'] {
  const out = type === 'EXPENSE';
  return {
    id,
    type,
    status: 'ACTIVE',
    amount: brl(amount),
    date,
    description,
    notes: null,
    category: { id: CATEGORY_FOOD, name: out ? 'Alimentação' : 'Salário' },
    card: null,
    account: { id: ACCOUNT_ID, name: 'Nubank' },
    counterpartAccount: null,
    method: 'PIX',
    direction: null,
    adjustmentKind: null,
    reason: null,
    refundOf: null,
    installments: [],
    impact: {
      cash: brl(out ? `-${amount}` : amount),
      consumption: out ? [{ competence: '2026-10', amount: brl(amount) }] : [],
      netWorth: brl(out ? `-${amount}` : amount),
      commitment: zero,
    },
    editable: true,
    voidable: true,
    voidBlockedBy: null,
    voidReason: null,
    voidedAt: null,
    source: 'MANUAL',
    version: 1,
    createdAt: STAMP,
    updatedAt: STAMP,
  };
}

export const transactions: S['TransactionSlice'] = {
  items: [
    transaction(TX_TODAY, 'Mercado do bairro', '2026-10-10', '87.30', 'EXPENSE'),
    transaction(TX_YESTERDAY, 'Salário', '2026-10-09', '3000.00', 'INCOME'),
    transaction('11111111-1111-4111-8111-333333333333', 'Cinema', '2026-10-04', '48.00', 'EXPENSE'),
  ],
  hasNext: false,
  totals: { count: 3, cashFlow: { in: brl('3000.00'), out: brl('135.30'), net: brl('2864.70') } },
};

const day = (
  date: string,
  income: string,
  expenses: string,
  net: string,
  partial = false,
): S['IncomeExpensePoint'] => ({
  periodStart: date,
  periodEnd: date,
  partial,
  income: brl(income),
  expenses: brl(expenses),
  net: brl(net),
});

/** 7 dias: o dia 09 tem `expenses` negativo (reembolso) e o de hoje é parcial, como o exemplo do contrato. */
export const incomeExpensesD7: S['IncomeExpenseSeries'] = {
  period: 'D7',
  from: '2026-10-04',
  to: '2026-10-10',
  basis: 'DATE',
  granularity: 'DAY',
  points: [
    day('2026-10-04', '0.00', '48.00', '-48.00'),
    day('2026-10-05', '3000.00', '0.00', '3000.00'),
    day('2026-10-06', '0.00', '120.00', '-120.00'),
    day('2026-10-07', '0.00', '0.00', '0.00'),
    day('2026-10-08', '0.00', '75.40', '-75.40'),
    day('2026-10-09', '0.00', '-50.00', '50.00'),
    day('2026-10-10', '0.00', '300.00', '-300.00', true),
  ],
  totals: { income: brl('3000.00'), expenses: brl('493.40'), net: brl('2506.60') },
};

export const incomeExpensesD30: S['IncomeExpenseSeries'] = {
  ...incomeExpensesD7,
  period: 'D30',
  from: '2026-09-11',
  points: [
    day('2026-09-11', '0.00', '90.00', '-90.00'),
    day('2026-09-18', '0.00', '210.00', '-210.00'),
    day('2026-09-25', '0.00', '640.00', '-640.00'),
    day('2026-10-05', '3000.00', '0.00', '3000.00'),
    day('2026-10-10', '0.00', '300.00', '-300.00', true),
  ],
  totals: { income: brl('3000.00'), expenses: brl('1240.00'), net: brl('1760.00') },
};

export const incomeExpensesM3: S['IncomeExpenseSeries'] = {
  period: 'M3',
  from: '2026-07-10',
  to: '2026-10-10',
  basis: 'DATE',
  granularity: 'WEEK',
  points: [
    { ...day('2026-07-10', '0.00', '320.00', '-320.00'), periodEnd: '2026-07-12' },
    { ...day('2026-07-13', '5000.00', '900.00', '4100.00'), periodEnd: '2026-07-19' },
    { ...day('2026-10-05', '3000.00', '500.00', '2500.00', true), periodEnd: '2026-10-10' },
  ],
  totals: { income: brl('8000.00'), expenses: brl('1720.00'), net: brl('6280.00') },
};

export const incomeExpensesM12: S['IncomeExpenseSeries'] = {
  period: 'M12',
  from: '2025-11-01',
  to: '2026-10-31',
  basis: 'COMPETENCE',
  granularity: 'MONTH',
  points: [
    { ...day('2025-11-01', '9000.00', '4100.00', '4900.00'), periodEnd: '2025-11-30' },
    { ...day('2026-09-01', '10000.00', '1691.00', '8309.00'), periodEnd: '2026-09-30' },
    { ...day('2026-10-01', '12000.00', CONSUMPTION, '10379.50', true), periodEnd: '2026-10-31' },
  ],
  totals: { income: brl('31000.00'), expenses: brl('7411.50'), net: brl('23588.50') },
};

export const spendingByCategory: S['SpendingByCategory'] = {
  basis: 'COMPETENCE',
  from: '2026-10-01',
  to: '2026-10-31',
  total: brl(CONSUMPTION),
  base: brl(CONSUMPTION),
  items: [
    {
      category: { id: CATEGORY_FOOD, name: 'Alimentação' },
      amount: brl('820.00'),
      share: '0.5060',
    },
    {
      category: { id: '8a3c6b10-5e2f-4d7a-9b41-c0d1e2f3a4b6', name: 'Transporte' },
      amount: brl('420.50'),
      share: '0.2595',
    },
  ],
  other: { amount: brl('380.00'), share: '0.2345', categories: 3 },
};

export const searchResults: S['SearchResults'] = {
  q: 'mercado',
  transactions: [
    {
      id: TX_TODAY,
      description: 'Mercado do bairro',
      date: '2026-10-09',
      amount: brl('87.30'),
      type: 'EXPENSE',
      category: { id: CATEGORY_FOOD, name: 'Alimentação' },
      account: { id: ACCOUNT_ID, name: 'Nubank' },
    },
  ],
  accounts: [],
  categories: [],
  cards: [],
  notes: [
    {
      id: NOTE_ID,
      title: 'Lista de mercado',
      path: 'casa/lista-de-mercado.md',
      snippet: '<b>Comprar</b> leite **e** pão <img src=x onerror=alert(1)>',
    },
  ],
  truncated: [],
};

/** O mapa chave do endpoint → JSON bruto que as facades em modo mock leem. */
/** `GET /v1/insights`: um insight de categoria que subiu (a frase é montada pelo front a partir de `key` e `params`). */
export const insights: S['InsightSlice'] = {
  hasNext: false,
  items: [
    {
      type: 'CATEGORY_DELTA',
      key: 'insight.category.up',
      params: {
        categoryId: CATEGORY_FOOD,
        categoryName: 'Alimentação',
        previous: '400.00',
        current: '500.00',
        deltaAmount: '100.00',
        deltaPercent: '25.0',
      },
      factRefs: [],
      source: 'COMPUTED',
    },
  ],
};

export function homeResponses(options: { partial?: boolean } = {}): Record<string, unknown> {
  return {
    '/v1/dashboard/summary': dashboardSummary(),
    '/v1/dashboard/upcoming': upcoming,
    '/v1/summaries/2026-10': options.partial ? partialMonthlySummary() : monthlySummary(),
    '/v1/accounts': accounts,
    '/v1/cards': cards,
    '/v1/transactions': transactions,
    '/v1/reports/income-expenses?period=D7': incomeExpensesD7,
    '/v1/reports/income-expenses?period=D30': incomeExpensesD30,
    '/v1/reports/income-expenses?period=M3': incomeExpensesM3,
    '/v1/reports/income-expenses?period=M12': incomeExpensesM12,
    '/v1/reports/spending-by-category?month=2026-10': spendingByCategory,
    '/v1/search': searchResults,
    '/v1/insights': insights,
  };
}
