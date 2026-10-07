import type {
  DebtLine,
  DebtOverview,
  OngoingInstallmentsInput,
  OngoingPreview,
} from '~/modules/debt-overview/core/types/debt-overview';
import type {
  DebtOverviewResponse,
  OngoingInstallmentsRequest,
  OngoingPreviewResponse,
} from '~/modules/debt-overview/infra/responses/debt-overview.response';
import type { Money } from '~/util/money';

/** Resposta → tipos do core. Só copia campos: nenhum valor é somado nem convertido para `number`. */
const money = (value: { amount: string; currency: string }): Money => ({
  amount: value.amount,
  currency: value.currency,
});

function toLine(item: DebtOverviewResponse['people']['items'][number]): DebtLine {
  return {
    debtId: item.debtId,
    person: item.person ? { id: item.person.id, name: item.person.name } : null,
    creditorName: item.creditorName,
    description: item.description,
    outstanding: money(item.outstanding),
    expectedDate: item.expectedDate,
    overdue: item.overdue,
  };
}

export function toDebtOverview(response: DebtOverviewResponse): DebtOverview {
  return {
    asOf: response.asOf,
    total: money(response.total),
    parts: {
      cards: money(response.parts.cards),
      people: money(response.parts.people),
      other: money(response.parts.other),
    },
    cards: {
      total: money(response.cards.total),
      invoiced: money(response.cards.invoiced),
      future: money(response.cards.future),
      items: response.cards.items.map((item) => ({
        card: { id: item.card.id, name: item.card.name },
        total: money(item.total),
        invoiced: money(item.invoiced),
        future: money(item.future),
        otherCharges: money(item.otherCharges),
        adjustment: money(item.adjustment),
        plans: item.plans.map((plan) => ({
          purchaseId: plan.purchaseId,
          description: plan.description,
          ongoing: plan.ongoing,
          installmentAmount: money(plan.installmentAmount),
          totalInstallments: plan.totalInstallments,
          remainingInstallments: plan.remainingInstallments,
          nextInstallmentNumber: plan.nextInstallmentNumber,
          remaining: money(plan.remaining),
          nextDueDate: plan.nextDueDate,
          lastDueDate: plan.lastDueDate,
        })),
      })),
    },
    people: { total: money(response.people.total), items: response.people.items.map(toLine) },
    other: { total: money(response.other.total), items: response.other.items.map(toLine) },
    receivablesInfo: money(response.receivablesInfo),
    hasRecords: response.hasRecords,
    fixedCosts: {
      monthly: money(response.fixedCosts.monthly),
      estimate: response.fixedCosts.estimate,
    },
    income: {
      monthly: response.income.monthly ? money(response.income.monthly) : null,
      source: response.income.source,
    },
    liquidity: {
      inAccounts: money(response.liquidity.inAccounts),
      available: money(response.liquidity.available),
    },
    comparison: {
      debtToIncome: response.comparison.debtToIncome,
      fixedCostToIncome: response.comparison.fixedCostToIncome,
      debtMinusInAccounts: money(response.comparison.debtMinusInAccounts),
      reason: response.comparison.reason,
    },
    schedule: {
      months: response.schedule.months,
      points: response.schedule.points.map((point) => ({
        competence: point.competence,
        cards: money(point.cards),
        people: money(point.people),
        other: money(point.other),
        total: money(point.total),
        remainingAfter: money(point.remainingAfter),
      })),
      overdue: money(response.schedule.overdue),
      undated: money(response.schedule.undated),
      beyondHorizon: money(response.schedule.beyondHorizon),
      payoffCompetence: response.schedule.payoffCompetence,
      payoffReason: response.schedule.payoffReason,
    },
    payoffGoal: response.payoffGoal
      ? {
          goalId: response.payoffGoal.goalId,
          baselineSet: response.payoffGoal.baselineSet,
          progress: response.payoffGoal.progress,
          remaining: money(response.payoffGoal.remaining),
        }
      : null,
  };
}

export function toOngoingPreview(response: OngoingPreviewResponse): OngoingPreview {
  return {
    remainingInstallments: response.remainingInstallments,
    installmentAmount: money(response.installmentAmount),
    remaining: money(response.remaining),
    firstDueDate: response.firstDueDate,
    lastDueDate: response.lastDueDate,
  };
}

export function toOngoingRequest(input: OngoingInstallmentsInput): OngoingInstallmentsRequest {
  return {
    description: input.description.trim(),
    installmentAmount: input.installmentAmount,
    totalInstallments: input.totalInstallments,
    remainingInstallments: input.remainingInstallments,
    ...(input.firstInvoiceDate ? { firstInvoiceDate: input.firstInvoiceDate } : {}),
  };
}
