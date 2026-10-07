import type { DashboardSummary } from '~/modules/dashboard/core/types/dashboard-summary';
import type {
  Upcoming,
  UpcomingInstallment,
  UpcomingItem,
} from '~/modules/dashboard/core/types/upcoming';
import type {
  DashboardSummaryResponse,
  MoneyResponse,
  UpcomingInstallmentResponse,
  UpcomingItemResponse,
  UpcomingResponse,
} from '~/modules/dashboard/infra/responses/dashboard-summary.response';
import type { Money } from '~/util/money';

/**
 * Resposta → tipo do core. Só copia campos: nenhum valor é somado, subtraído, arredondado ou
 * convertido para `number` (arquitetura §1). O único ajuste é normalizar campos opcionais.
 */
function money(value: MoneyResponse): Money {
  return { amount: value.amount, currency: value.currency };
}

export function toDashboardSummary(response: DashboardSummaryResponse): DashboardSummary {
  const { balances, committed, projected, month, netWorth } = response;
  const byMethod = month.expensesPaid.byMethod;
  return {
    asOf: response.asOf,
    isProjection: response.isProjection,
    hasAccounts: response.hasAccounts,
    balances: {
      inAccounts: money(balances.inAccounts),
      investments: money(balances.investments),
      available: money(balances.available),
      reserved: money(balances.reserved),
      committed30d: money(balances.committed30d),
      inAccountsChange: balances.inAccountsChange
        ? {
            previous: money(balances.inAccountsChange.previous),
            amount: money(balances.inAccountsChange.amount),
            percent: balances.inAccountsChange.percent,
            since: balances.inAccountsChange.since,
          }
        : null,
    },
    committed: {
      d7: money(committed.d7),
      d30: money(committed.d30),
      d60: money(committed.d60),
      d90: money(committed.d90),
      m6: money(committed.m6),
      m12: money(committed.m12),
    },
    projected: {
      d30: money(projected.d30),
      d90: money(projected.d90),
      m6: money(projected.m6),
      m12: money(projected.m12),
    },
    month: {
      competence: month.competence,
      income: money(month.income),
      expensesPaid: {
        total: money(month.expensesPaid.total),
        byMethod: {
          DEBIT: money(byMethod.DEBIT),
          PIX: money(byMethod.PIX),
          CASH: money(byMethod.CASH),
          BOLETO: money(byMethod.BOLETO),
          TRANSFER: money(byMethod.TRANSFER),
          OTHER: money(byMethod.OTHER),
        },
      },
      credit: money(month.credit),
      refunds: money(month.refunds),
      consumption: money(month.consumption),
      debtConsumption: month.debtConsumption ? money(month.debtConsumption) : null,
      cashFlow: {
        in: money(month.cashFlow.in),
        out: money(month.cashFlow.out),
        net: money(month.cashFlow.net),
      },
      investedNet: money(month.investedNet),
      lent: money(month.lent),
      received: money(month.received),
      net: money(month.net),
    },
    netWorth: {
      accounts: money(netWorth.accounts),
      receivables: money(netWorth.receivables),
      cardLiabilities: money(netWorth.cardLiabilities),
      payables: money(netWorth.payables),
      total: money(netWorth.total),
      cardFutureInstallments: money(netWorth.cardFutureInstallments),
    },
  };
}

function toInstallment(response: UpcomingInstallmentResponse): UpcomingInstallment {
  return {
    kind: 'INSTALLMENT',
    label: response.label,
    installment: { number: response.installment.number, total: response.installment.total },
    amount: money(response.amount),
    informational: true,
  };
}

function toUpcomingItem(response: UpcomingItemResponse): UpcomingItem {
  return {
    kind: response.kind,
    bucket: response.bucket ?? null,
    dueDate: response.dueDate,
    direction: response.direction,
    amount: money(response.amount),
    label: response.label,
    refType: response.refType,
    refId: response.refId,
    items: response.items.map(toInstallment),
  };
}

export function toUpcoming(response: UpcomingResponse): Upcoming {
  return {
    items: response.items.map(toUpcomingItem),
    undated: response.undated.map(toUpcomingItem),
    totals: { out: money(response.totals.out), in: money(response.totals.in) },
    overdueTruncated: response.overdueTruncated ?? false,
  };
}
