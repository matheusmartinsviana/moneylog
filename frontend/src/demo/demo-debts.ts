import { addMonths, addMonthsKey, dateIn } from '~/demo/demo-dates';
import { dashboardView, recurrenceSummary } from '~/demo/demo-views';
import { money, ratio, type S, type World } from '~/demo/demo-world';

/**
 * Dívidas totais do modo demonstração. Este código só existe no build `demo`: ele **simula o servidor**
 * (que calcula total, partes, razões e cronograma). O app real não faz nenhuma destas contas.
 */

const cents = (m: S['Money']): number => Math.round(Number(m.amount) * 100);

interface Plan {
  id: string;
  description: string;
  ongoing: boolean;
  installment: number;
  total: number;
  remaining: number;
}

const PLANS: readonly Plan[] = [
  {
    id: 'demo-plan-1',
    description: 'Notebook',
    ongoing: true,
    installment: 15_000,
    total: 10,
    remaining: 8,
  },
  {
    id: 'demo-plan-2',
    description: 'Geladeira',
    ongoing: false,
    installment: 30_000,
    total: 12,
    remaining: 5,
  },
];
const ONE_TIME_CHARGES = 90_000;
const PEOPLE_DEBT = 45_000;
const OTHER_DEBT = 480_000;

export function debtOverviewView(w: World, months: number): S['DebtOverview'] {
  const dueDay = w.card.dueDay;
  const firstKey = addMonthsKey(w.month, 1);
  const dueOf = (index: number) => dateIn(addMonthsKey(firstKey, index), dueDay);

  const plans = PLANS.map((plan) => ({
    purchaseId: plan.id,
    description: plan.description,
    ongoing: plan.ongoing,
    installmentAmount: money(plan.installment),
    totalInstallments: plan.total,
    remainingInstallments: plan.remaining,
    nextInstallmentNumber: plan.total - plan.remaining + 1,
    remaining: money(plan.installment * plan.remaining),
    nextDueDate: dueOf(0),
    lastDueDate: dueOf(plan.remaining - 1),
  }));
  const plansTotal = PLANS.reduce((s, p) => s + p.installment * p.remaining, 0);
  const cardTotal = plansTotal + ONE_TIME_CHARGES;
  const invoiced = PLANS.reduce((s, p) => s + p.installment, 0) + ONE_TIME_CHARGES;
  const total = cardTotal + PEOPLE_DEBT + OTHER_DEBT;

  const person = w.people[0]!;
  const peopleDue = addMonths(w.today, 1);
  const otherDue = addMonths(w.today, 3);

  // Cronograma: cartão (parcelas + à vista na 1ª fatura), pessoa no mês do vencimento, financiamento em 3 meses.
  const points: S['DebtOverviewPoint'][] = [];
  let left = total;
  for (let i = 0; i < months; i++) {
    const key = addMonthsKey(firstKey, i);
    const cardCents =
      PLANS.reduce((s, p) => s + (i < p.remaining ? p.installment : 0), 0) +
      (i === 0 ? ONE_TIME_CHARGES : 0);
    const peopleCents = peopleDue.slice(0, 7) === key ? PEOPLE_DEBT : 0;
    const otherCents = otherDue.slice(0, 7) === key ? OTHER_DEBT : 0;
    const sum = cardCents + peopleCents + otherCents;
    left -= sum;
    points.push({
      competence: key,
      cards: money(cardCents),
      people: money(peopleCents),
      other: money(otherCents),
      total: money(sum),
      remainingAfter: money(left),
    });
  }

  const fixed = cents(recurrenceSummary(w).fixedCosts);
  const income = cents(recurrenceSummary(w).recurringIncome);
  const balances = dashboardView(w).balances;
  const inAccounts = cents(balances.inAccounts);

  return {
    asOf: w.today,
    total: money(total),
    parts: { cards: money(cardTotal), people: money(PEOPLE_DEBT), other: money(OTHER_DEBT) },
    cards: {
      total: money(cardTotal),
      invoiced: money(invoiced),
      future: money(cardTotal - invoiced),
      items: [
        {
          card: { id: w.card.id, name: w.card.name },
          total: money(cardTotal),
          invoiced: money(invoiced),
          future: money(cardTotal - invoiced),
          otherCharges: money(ONE_TIME_CHARGES),
          adjustment: money(0),
          plans,
        },
      ],
    },
    people: {
      total: money(PEOPLE_DEBT),
      items: [
        {
          debtId: 'demo-debt-people-1',
          person: { id: person.id, name: person.name },
          creditorName: person.name,
          description: 'Adiantamento do aluguel',
          outstanding: money(PEOPLE_DEBT),
          expectedDate: peopleDue,
          overdue: false,
        },
      ],
    },
    other: {
      total: money(OTHER_DEBT),
      items: [
        {
          debtId: 'demo-debt-other-1',
          person: null,
          creditorName: 'Banco Azul',
          description: 'Financiamento da moto',
          outstanding: money(OTHER_DEBT),
          expectedDate: otherDue,
          overdue: false,
        },
      ],
    },
    receivablesInfo: money(0),
    hasRecords: true,
    fixedCosts: { monthly: money(fixed), estimate: true },
    income: { monthly: money(income), source: 'RECURRING_ESTIMATE' },
    liquidity: { inAccounts: balances.inAccounts, available: balances.available },
    comparison: {
      debtToIncome: income === 0 ? null : ratio(total, income),
      fixedCostToIncome: income === 0 ? null : ratio(fixed, income),
      debtMinusInAccounts: money(total - inAccounts),
      reason: income === 0 ? 'NO_INCOME' : null,
    },
    schedule: {
      months,
      points,
      overdue: money(0),
      undated: money(0),
      beyondHorizon: money(left),
      payoffCompetence: left === 0 ? (points[points.length - 1]?.competence ?? null) : null,
      payoffReason: left === 0 ? null : 'BEYOND_HORIZON',
    },
    payoffGoal: null,
  };
}

/** Prévia do parcelado em andamento: o "servidor" do demo calcula o que falta. */
export function ongoingPreviewView(
  w: World,
  body: { installmentAmount: string; remainingInstallments: number },
): S['OngoingPreview'] {
  const installment = Math.round(Number(body.installmentAmount) * 100);
  const firstKey = addMonthsKey(w.month, 1);
  const due = (index: number) => dateIn(addMonthsKey(firstKey, index), w.card.dueDay);
  return {
    remainingInstallments: body.remainingInstallments,
    installmentAmount: money(installment),
    remaining: money(installment * body.remainingInstallments),
    firstDueDate: due(0),
    lastDueDate: due(body.remainingInstallments - 1),
    purchase: {
      installments: [],
      total: money(installment * body.remainingInstallments),
      availableLimitAfter: money(0),
      overLimit: false,
      warnings: [],
    },
  };
}
