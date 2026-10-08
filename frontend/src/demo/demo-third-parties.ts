import { addMonths, addMonthsKey, dateIn } from '~/demo/demo-dates';
import { money, ratio, type S, type World } from '~/demo/demo-world';

/**
 * Terceiros e compromissos acompanhados do modo demonstração (2.14.0), com valores **sintéticos**. Este
 * código só existe no build `demo`: ele simula o servidor, que calcula tudo (pendente, saldo nominal,
 * progresso, líquido do mês). O app real não faz nenhuma destas contas.
 */

const DEMO_COMMITMENT_IDS = {
  loan: '00000010-0000-4000-8000-000000000001',
  project: '00000010-0000-4000-8000-000000000002',
} as const;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "Dinheiro a receber de terceiros": uma pessoa com uma despesa marcada e um empréstimo concedido. */
export function thirdPartyReceivablesView(
  w: World,
  month: string | null,
): S['ThirdPartyReceivables'] {
  const competence = month !== null && MONTH.test(month) ? month : w.month;
  const person = w.people[0]!;
  const expense =
    w.recs.find((rec) => rec.type === 'CARD_PURCHASE') ??
    w.recs.find((rec) => rec.type === 'EXPENSE');

  const expenseOwed = 30_000;
  const expenseReceived = 10_000;
  const loanOwed = 50_000;
  const loanReceived = 0;
  const items: S['ThirdPartyItem'][] = [];
  if (expense) {
    items.push({
      source: 'EXPENSE',
      refId: expense.id,
      description: expense.description,
      date: expense.date,
      expectedDate: addMonths(w.today, 1),
      owed: money(expenseOwed),
      received: money(expenseReceived),
      pending: money(expenseOwed - expenseReceived),
      status: 'PARTIAL',
    });
  }
  items.push({
    source: 'DEBT',
    refId: w.debts[0]?.id ?? 'demo-debt-receivable-1',
    description: 'Empréstimo de exemplo',
    date: addMonths(w.today, -1),
    expectedDate: addMonths(w.today, 2),
    owed: money(loanOwed),
    received: money(loanReceived),
    pending: money(loanOwed - loanReceived),
    status: 'OPEN',
  });
  const owed = items.reduce((sum, item) => sum + Math.round(Number(item.owed.amount) * 100), 0);
  const received = items.reduce(
    (sum, item) => sum + Math.round(Number(item.received.amount) * 100),
    0,
  );

  return {
    asOf: w.today,
    owed: money(owed),
    received: money(received),
    pending: money(owed - received),
    people: [
      {
        personId: person.id,
        name: person.name,
        owed: money(owed),
        received: money(received),
        pending: money(owed - received),
        items,
      },
    ],
    month: {
      competence,
      grossConsumption: money(320_000),
      refunds: money(expenseReceived),
      personalNet: money(310_000),
      thirdPartyConsumption: money(expenseOwed),
      thirdPartyReimbursed: money(expenseReceived),
      thirdPartyPending: money(expenseOwed - expenseReceived),
    },
  };
}

function item(
  position: number,
  label: string,
  type: S['CommitmentItemType'],
  dueDate: string | null,
  cents: number,
  paidOn: string | null,
): S['CommitmentItem'] {
  return {
    position,
    label,
    type,
    dueDate,
    amount: money(cents),
    paid: paidOn !== null,
    paidOn,
  };
}

const NOW = '2026-01-01T12:00:00Z';

export function commitmentViews(w: World): S['Commitment'][] {
  const first = addMonthsKey(w.month, 1);
  const schedule: S['CommitmentItem'][] = [
    item(1, 'Sinal', 'DOWN_PAYMENT', addMonths(w.today, -6), 3_000_000, addMonths(w.today, -6)),
    item(2, 'Parcela 1', 'INSTALLMENT', addMonths(w.today, -1), 500_000, addMonths(w.today, -1)),
    item(3, 'Parcela 2', 'INSTALLMENT', dateIn(first, 10), 500_000, null),
    item(4, 'Parcela 3', 'INSTALLMENT', dateIn(addMonthsKey(first, 1), 10), 500_000, null),
    item(5, 'Reforço anual', 'EXTRAORDINARY', dateIn(addMonthsKey(first, 5), 15), 2_000_000, null),
    item(6, 'Financiamento', 'FINANCING', dateIn(addMonthsKey(first, 12), 5), 15_000_000, null),
  ];
  const cents = (m: S['Money']) => Math.round(Number(m.amount) * 100);
  const total = schedule.reduce((sum, entry) => sum + cents(entry.amount), 0);
  const paid = schedule.filter((entry) => entry.paid).reduce((s, e) => s + cents(e.amount), 0);
  const direct = schedule.filter((e) => !e.paid && e.type !== 'FINANCING');
  const financing = schedule.filter((e) => !e.paid && e.type === 'FINANCING');
  const byMonth = new Map<string, number>();
  for (const entry of direct) {
    if (entry.dueDate === null) continue;
    const key = entry.dueDate.slice(0, 7);
    byMonth.set(key, (byMonth.get(key) ?? 0) + cents(entry.amount));
  }

  const project: S['Commitment'] = {
    id: DEMO_COMMITMENT_IDS.project,
    kind: 'LONG_TERM_PROJECT',
    name: 'Imóvel na planta (exemplo)',
    counterparty: 'Construtora de exemplo',
    notes: null,
    total: money(total),
    paid: money(paid),
    nominalBalance: money(total - paid),
    progress: ratio(paid, total),
    installmentsTotal: null,
    installmentsPaid: null,
    remainingInstallments: null,
    nextDueDate: direct[0]?.dueDate ?? null,
    directPending: money(direct.reduce((s, e) => s + cents(e.amount), 0)),
    financingPending: money(financing.reduce((s, e) => s + cents(e.amount), 0)),
    pendingByMonth: [...byMonth.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([competence, amount]) => ({ competence, amount: money(amount) })),
    schedule,
    version: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };

  const loan: S['Commitment'] = {
    id: DEMO_COMMITMENT_IDS.loan,
    kind: 'TRACKED_THIRD_PARTY',
    name: 'Empréstimo no nome de uma pessoa (exemplo)',
    counterparty: 'Pessoa de exemplo',
    notes: 'Informado por mim, sem saldo calculado.',
    total: null,
    paid: money(120_000),
    nominalBalance: null,
    progress: null,
    installmentsTotal: 24,
    installmentsPaid: 6,
    remainingInstallments: 18,
    nextDueDate: dateIn(first, 20),
    directPending: null,
    financingPending: null,
    pendingByMonth: [],
    schedule: [],
    version: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
  return [loan, project];
}

/** Os compromissos acompanhados na visão de dívidas: fora do total, com a curva à parte. */
export function trackedOverview(w: World): S['DebtOverviewTracked'] {
  const views = commitmentViews(w);
  return {
    items: views.map((c) => ({
      id: c.id,
      kind: c.kind,
      name: c.name,
      counterparty: c.counterparty,
      total: c.total,
      paid: c.paid,
      nominalBalance: c.nominalBalance,
      progress: c.progress,
      installmentsTotal: c.installmentsTotal,
      installmentsPaid: c.installmentsPaid,
      remainingInstallments: c.remainingInstallments,
      nextDueDate: c.nextDueDate,
      directPending: c.directPending,
    })),
    scheduleByMonth: views.flatMap((c) => c.pendingByMonth),
  };
}
