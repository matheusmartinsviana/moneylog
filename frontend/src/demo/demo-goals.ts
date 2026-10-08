import { addMonthsKey } from '~/demo/demo-dates';
import { debtOverviewView } from '~/demo/demo-debts';
import { accRef, dashboardView, recurrenceSummary } from '~/demo/demo-views';
import { money, ratio, type GoalDef, type S, type World } from '~/demo/demo-world';

/**
 * Metas do modo demonstração (dados SINTÉTICOS). Este código só existe no build `demo`: ele **simula o
 * servidor**, que calcula valor atual, progresso, estágio, plano e consistência (ADR-016). O app real não
 * faz nenhuma destas contas.
 */

const cents = (m: S['Money']): number => Math.round(Number(m.amount) * 100);
const ts = (iso: string) => `${iso}T12:00:00Z`;

/** Meses-calendário de `from` a `to` (`YYYY-MM`), ambos inclusive. */
function monthsInclusive(from: string, to: string): number {
  return (
    (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
    Number(to.slice(5, 7)) -
    Number(from.slice(5, 7)) +
    1
  );
}

/** Valor atual de uma medida, da mesma fonte das telas (dívidas, painel, custos fixos). */
export function metricValue(w: World, metric: S['GoalMetric']): number {
  switch (metric) {
    case 'TOTAL_DEBT':
      return cents(debtOverviewView(w, 6).total);
    case 'CARD_DEBT':
      return cents(debtOverviewView(w, 6).parts.cards);
    case 'PEOPLE_DEBT':
      return cents(debtOverviewView(w, 6).parts.people);
    case 'OTHER_DEBT':
      return cents(debtOverviewView(w, 6).parts.other);
    case 'ACCOUNTS_BALANCE':
      return cents(dashboardView(w).balances.inAccounts);
    case 'AVAILABLE_BALANCE':
      return cents(dashboardView(w).balances.available);
    default:
      return cents(recurrenceSummary(w).fixedCosts);
  }
}

export function goalView(w: World, g: GoalDef): S['Goal'] {
  const isMetric = g.metric !== undefined;
  const saved = g.reservations.reduce((s, r) => s + r.cents, 0);
  const current = isMetric ? metricValue(w, g.metric!) : saved;
  const baseline = g.baseline ?? 0;
  const decrease = isMetric && g.target < baseline;

  // Atingida e progresso (0..1, monotônico).
  const reached = isMetric
    ? decrease
      ? current <= g.target
      : current >= g.target
    : saved >= g.target;
  let progress: string;
  let remaining: number;
  if (isMetric) {
    const span = Math.abs(baseline - g.target);
    const done = decrease ? baseline - current : current - baseline;
    const clamped = Math.min(Math.max(done, 0), span);
    progress = reached ? '1.0000' : ratio(Math.min(clamped, span - 1), span);
    remaining = reached ? 0 : Math.abs(current - g.target);
  } else {
    progress = ratio(saved, g.target);
    remaining = Math.max(g.target - saved, 0);
  }

  // Plano automático: linha reta do ponto de partida ao alvo até o mês do prazo.
  const thisMonth = w.today.slice(0, 7);
  const monthsLeft = g.deadline
    ? Math.max(monthsInclusive(thisMonth, g.deadline.slice(0, 7)), 0)
    : null;
  const hasPace = g.deadline !== null && monthsLeft !== null && monthsLeft > 0;
  const requiredPace = hasPace ? (reached ? 0 : Math.ceil(remaining / monthsLeft!)) : null;

  // Consistência: esperado no fim de cada mês x instantâneo; só meses fechados contam.
  const start = g.startMonth ?? null;
  const total = start && g.deadline ? monthsInclusive(start, g.deadline.slice(0, 7)) : 0;
  const expectedAt = (index: number): number =>
    Math.round(baseline + ((g.target - baseline) * (index + 1)) / Math.max(total, 1));
  const consistency: S['GoalConsistencyMonth'][] = [];
  if (isMetric && start && total > 0) {
    const count = monthsInclusive(start, thisMonth);
    for (let i = 0; i < count; i++) {
      const month = addMonthsKey(start, i);
      const closed = month < thisMonth;
      const actual = closed ? (g.history?.[i] ?? null) : current;
      const expected = expectedAt(i);
      const met =
        !closed || actual === null ? null : decrease ? actual <= expected : actual >= expected;
      consistency.push({
        month,
        expected: money(expected),
        actual: actual === null ? null : money(actual),
        met,
        closed,
      });
    }
  }
  const closedMonths = consistency.filter((m) => m.closed && m.met !== null);
  let streak = 0;
  for (let i = consistency.length - 1; i >= 0; i--) {
    const m = consistency[i]!;
    if (!m.closed) continue;
    if (m.met !== true) break;
    streak++;
  }
  const consistencyRate =
    closedMonths.length === 0
      ? null
      : ratio(closedMonths.filter((m) => m.met === true).length, closedMonths.length);

  const lastClosedIndex = consistency.length - 2;
  const expectedLastClosed =
    lastClosedIndex >= 0 ? cents(consistency[lastClosedIndex]!.expected) : null;
  const onTrack = !hasPace
    ? null
    : reached ||
      (expectedLastClosed === null
        ? true
        : decrease
          ? current <= expectedLastClosed
          : current >= expectedLastClosed);
  const gap =
    !hasPace || expectedLastClosed === null
      ? hasPace
        ? money(0)
        : null
      : money(decrease ? expectedLastClosed - current : current - expectedLastClosed);
  const nextMilestone = !hasPace
    ? null
    : isMetric
      ? money(expectedAt(Math.max(consistency.length - 1, 0)))
      : money(saved + (requiredPace ?? 0));

  const actions = (g.actions ?? []).map((a) => ({
    id: a.id,
    title: a.title,
    frequency: a.frequency,
    doneIn: [...a.doneIn],
    createdAt: ts(w.today),
  }));

  const planned = (g.planNote ?? '') !== '' || actions.length > 0;
  const stage: S['GoalStage'] = reached
    ? 'ACHIEVED'
    : !g.deadline
      ? 'FANTASY'
      : hasPace && planned
        ? streak >= 2
          ? 'CONSISTENT'
          : 'STRATEGY'
        : 'OBJECTIVE';

  const monthlyNeeded = !isMetric && g.deadline ? money(requiredPace ?? 0) : null;
  return {
    id: g.id,
    kind: isMetric ? 'METRIC' : 'SAVINGS',
    name: g.name,
    target: money(g.target),
    current: money(current),
    progress,
    remaining: money(remaining),
    status: reached ? 'ACHIEVED' : 'ACTIVE',
    deadline: g.deadline,
    priority: g.priority,
    description: g.description,
    monthlyNeeded,
    uncovered: false,
    reservations: [...g.reservations]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((r) => ({
        id: r.id,
        account: accRef(w, r.accountId)!,
        amount: money(r.cents),
        date: r.date,
        note: r.note,
        createdAt: ts(r.date),
      })),
    baselineSet: false,
    baseline: isMetric ? money(baseline) : null,
    baselineAt: isMetric ? ts(`${g.startMonth}-01`) : null,
    grewSinceBaseline: false,
    metric: g.metric ?? null,
    direction: isMetric ? (decrease ? 'DECREASE' : 'INCREASE') : null,
    reached,
    metricAsOf: isMetric ? w.today : null,
    stage,
    requiredPace: requiredPace === null ? null : money(requiredPace),
    monthsLeft,
    nextMilestone,
    onTrack,
    gap,
    planNote: g.planNote ?? null,
    actions,
    consistency,
    streak,
    consistencyRate,
    version: 0,
    createdAt: ts(g.reservations[0]?.date ?? `${g.startMonth ?? w.today.slice(0, 7)}-01`),
    updatedAt: ts(g.reservations[0]?.date ?? w.today),
  };
}
