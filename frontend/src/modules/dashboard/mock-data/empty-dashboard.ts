/**
 * Dados de apoio da Etapa 1 (sem backend): o dashboard de quem ainda não cadastrou nenhuma conta.
 * Têm o formato bruto da API (arquitetura §4.4) e passam pelo mesmo mapeamento da resposta real.
 * Saem quando a Etapa 2 ligar `GET /v1/dashboard/*`.
 */

import type {
  DashboardSummaryResponse,
  MoneyResponse,
  UpcomingResponse,
} from '~/modules/dashboard/infra/responses/dashboard-summary.response';

const zero = (): MoneyResponse => ({ amount: '0.00', currency: 'BRL' });

/** Data fixa: o mock não lê o relógio do aparelho. */
const AS_OF = '2026-10-10';

export const EMPTY_DASHBOARD_SUMMARY: DashboardSummaryResponse = {
  asOf: AS_OF,
  isProjection: false,
  hasAccounts: false,
  balances: {
    inAccounts: zero(),
    investments: zero(),
    available: zero(),
    reserved: zero(),
    committed30d: zero(),
  },
  committed: { d7: zero(), d30: zero(), d60: zero(), d90: zero(), m6: zero(), m12: zero() },
  projected: { d30: zero(), d90: zero(), m6: zero(), m12: zero() },
  month: {
    competence: '2026-10',
    income: zero(),
    expensesPaid: {
      total: zero(),
      byMethod: {
        DEBIT: zero(),
        PIX: zero(),
        CASH: zero(),
        BOLETO: zero(),
        TRANSFER: zero(),
        OTHER: zero(),
      },
    },
    credit: zero(),
    refunds: zero(),
    consumption: zero(),
    debtConsumption: zero(),
    cashFlow: { in: zero(), out: zero(), net: zero() },
    investedNet: zero(),
    lent: zero(),
    received: zero(),
    net: zero(),
  },
  netWorth: {
    accounts: zero(),
    receivables: zero(),
    cardLiabilities: zero(),
    payables: zero(),
    total: zero(),
    cardFutureInstallments: zero(),
  },
};

export const EMPTY_UPCOMING: UpcomingResponse = {
  items: [],
  undated: [],
  totals: { out: zero(), in: zero() },
  overdueTruncated: false,
};
