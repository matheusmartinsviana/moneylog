import { addDays } from '~/demo/demo-dates';
import { commitments, dashboardView } from '~/demo/demo-views';
import { demoId, money, ratio, type S, type World } from '~/demo/demo-world';

/**
 * Etapa 7 no modo demonstração: lotes de importação (com linhas classificadas), notificações, lembretes,
 * configurações, push (desligado) e a mensagem diária, no formato do contrato. Aqui há aritmética porque este
 * arquivo simula o backend; no app real o front não soma nada. Só entra no build `demo`.
 */
type Line = S['ImportLine'];
type Batch = S['ImportBatch'];

const ts = (iso: string) => `${iso}T12:00:00Z`;

function countsOf(lines: Line[]): S['ImportCounts'] {
  const n = (status: Line['status']) => lines.filter((l) => l.status === status).length;
  return {
    total: lines.length,
    pending: n('PENDING'),
    accepted: n('ACCEPTED'),
    rejected: n('REJECTED'),
    duplicate: n('DUPLICATE'),
    possibleDuplicate: n('POSSIBLE_DUPLICATE'),
    requireDecision: lines.filter(
      (l) => (l.status === 'PENDING' && l.requiresDecision) || l.status === 'POSSIBLE_DUPLICATE',
    ).length,
  };
}

function cat(w: World, name: string): string {
  return w.categories.find((c) => c.name === name)?.id ?? w.categories[0]!.id;
}

function line(
  position: number,
  base: Pick<Line, 'date' | 'description' | 'direction'> & { cents: number },
  extra: Partial<Line> = {},
): Line {
  return {
    id: demoId('line', position),
    position,
    date: base.date,
    amount: money(base.cents),
    direction: base.direction,
    description: base.description,
    normalizedDescription: base.description.toLowerCase(),
    status: 'PENDING',
    flags: [],
    requiresDecision: false,
    matches: [],
    ...extra,
  };
}

interface DemoBatch {
  batch: Batch;
  lines: Line[];
}

export function importBatches(w: World): DemoBatch[] {
  const day = (n: number) => addDays(w.today, -n);
  const firstExpense = w.recs.find((r) => r.type === 'EXPENSE');
  const similarId = firstExpense?.id ?? demoId('tx', 1);
  const food = cat(w, 'Alimentação');
  const transport = cat(w, 'Transporte');
  const salary = cat(w, 'Salário');
  const health = cat(w, 'Saúde');
  const shopping = cat(w, 'Compras');

  const accountLines: Line[] = [
    line(
      1,
      { date: day(1), description: 'PADARIA SAO JORGE', direction: 'OUT', cents: 2_450 },
      {
        suggestion: { categoryId: food, method: 'DEBIT', confidence: 'HIGH' },
      },
    ),
    line(
      2,
      { date: day(2), description: 'UBER *TRIP', direction: 'OUT', cents: 1_890 },
      {
        suggestion: { categoryId: transport, method: 'DEBIT', confidence: 'MEDIUM' },
      },
    ),
    line(
      3,
      { date: day(3), description: 'SALARIO EMPRESA XYZ', direction: 'IN', cents: 520_000 },
      {
        suggestion: { categoryId: salary, method: 'TRANSFER', confidence: 'HIGH' },
      },
    ),
    line(
      4,
      { date: day(4), description: 'SUPERMERCADO BOM PRECO', direction: 'OUT', cents: 18_730 },
      {
        status: 'DUPLICATE',
        rejectReason: 'DUPLICATE',
        matches: [similarId],
      },
    ),
    line(
      5,
      { date: day(5), description: 'FARMACIA SAUDE', direction: 'OUT', cents: 6_420 },
      {
        status: 'POSSIBLE_DUPLICATE',
        requiresDecision: true,
        matches: [similarId],
        suggestion: { categoryId: health, method: 'DEBIT', confidence: 'HIGH' },
      },
    ),
    line(
      6,
      { date: day(6), description: 'PIX ENVIADO MARIA SILVA', direction: 'OUT', cents: 30_000 },
      {
        flags: ['POSSIBLE_TRANSFER'],
        requiresDecision: true,
      },
    ),
    line(
      7,
      {
        date: day(7),
        description: 'PAGAMENTO FATURA CARTAO ROXO',
        direction: 'OUT',
        cents: 142_300,
      },
      {
        status: 'REJECTED',
        flags: ['LOOKS_LIKE_INVOICE_PAYMENT'],
        rejectReason: 'LOOKS_LIKE_INVOICE_PAYMENT',
      },
    ),
    line(
      8,
      { date: day(8), description: 'RESTAURANTE DONA LUCIA', direction: 'OUT', cents: 8_900 },
      {
        status: 'ACCEPTED',
        categoryId: food,
        method: 'DEBIT',
      },
    ),
  ];
  const cardLines: Line[] = [
    line(
      11,
      { date: day(2), description: 'AMAZON MARKETPLACE', direction: 'OUT', cents: 12_990 },
      {
        suggestion: { categoryId: shopping, method: null, confidence: 'MEDIUM' },
      },
    ),
    line(
      12,
      { date: day(3), description: 'MERCADOLIVRE 3/6', direction: 'OUT', cents: 8_500 },
      {
        flags: ['LOOKS_LIKE_INSTALLMENT'],
        requiresDecision: true,
        suggestion: { categoryId: shopping, method: null, confidence: 'HIGH' },
      },
    ),
    line(
      13,
      { date: day(5), description: 'ESTORNO LOJA XYZ', direction: 'IN', cents: 4_000 },
      {
        status: 'REJECTED',
        flags: ['CARD_CREDIT_NOT_IMPORTED'],
        rejectReason: 'CARD_CREDIT_NOT_IMPORTED',
      },
    ),
    line(
      14,
      { date: day(6), description: 'SPOTIFY', direction: 'OUT', cents: 2_190 },
      {
        suggestion: { categoryId: cat(w, 'Assinaturas'), method: null, confidence: 'HIGH' },
      },
    ),
  ];
  const appliedLines: Line[] = [
    line(
      21,
      { date: day(40), description: 'CINEMA CENTRO', direction: 'OUT', cents: 5_400 },
      {
        status: 'ACCEPTED',
        categoryId: cat(w, 'Lazer'),
        method: 'DEBIT',
        transactionId: similarId,
      },
    ),
    line(
      22,
      { date: day(41), description: 'POSTO IPIRANGA', direction: 'OUT', cents: 21_000 },
      {
        status: 'ACCEPTED',
        categoryId: transport,
        method: 'DEBIT',
        transactionId: similarId,
      },
    ),
  ];

  const make = (
    n: number,
    kind: 'account' | 'card',
    status: Batch['status'],
    lines: Line[],
    createdDaysAgo: number,
  ): DemoBatch => ({
    lines,
    batch: {
      id: demoId('imp', n),
      accountId: kind === 'account' ? w.accounts[0]!.id : null,
      cardId: kind === 'card' ? w.card.id : null,
      format: kind === 'account' ? 'CSV' : 'OFX',
      status,
      warnings: [],
      skipped: [],
      counts: countsOf(lines),
      createdAt: ts(addDays(w.today, -createdDaysAgo)),
      appliedAt: status === 'APPLIED' ? ts(addDays(w.today, -createdDaysAgo)) : null,
      undoneAt: null,
      undoReason: null,
    },
  });
  return [
    make(1, 'account', 'PENDING_REVIEW', accountLines, 0),
    make(2, 'card', 'PENDING_REVIEW', cardLines, 1),
    make(3, 'account', 'APPLIED', appliedLines, 38),
  ];
}

// ---------- Notificações ----------

export function notificationList(w: World): S['Notification'][] {
  const invoice = w.invoices.find((i) => i.status !== 'PAID' && i.total - i.paid > 0);
  const receivable = w.debts.find((d) => d.direction === 'RECEIVABLE');
  const recurrence = w.recurrences[0];
  const goal = w.goals.find((g) => g.deadline !== null && !g.metric);
  const available = dailyMessage(w).params['available'] ?? '0.00';
  const committed7d = dailyMessage(w).params['committed7d'] ?? '0.00';
  const list: S['Notification'][] = [];
  let n = 0;
  const push = (item: Omit<S['Notification'], 'id' | 'bodyKey' | 'createdAt'>) => {
    n += 1;
    list.push({
      ...item,
      id: demoId('ntf', n),
      bodyKey: `${item.titleKey}.body`,
      createdAt: ts(item.onDate),
    });
  };
  if (invoice) {
    push({
      kind: 'INVOICE_DUE',
      titleKey: 'notification.invoice.due3',
      params: {
        name: w.card.name,
        amount: money(invoice.total - invoice.paid).amount,
        dueDate: invoice.dueDate,
        daysLate: '0',
      },
      ref: { type: 'CARD', id: w.card.id },
      onDate: w.today,
      dueOn: invoice.dueDate,
      readAt: null,
    });
  }
  if (receivable) {
    const person = w.people.find((p) => p.id === receivable.personId);
    push({
      kind: 'DEBT_COLLECT',
      titleKey: 'notification.debt.collect.due0',
      params: {
        name: person?.name ?? '',
        amount: money(receivable.principal).amount,
        dueDate: w.today,
        daysLate: '0',
      },
      ref: { type: 'DEBT', id: receivable.id },
      onDate: w.today,
      dueOn: w.today,
      readAt: null,
    });
  }
  if (recurrence) {
    push({
      kind: 'RECURRENCE_PENDING',
      titleKey: 'notification.recurrence.today',
      params: {
        name: recurrence.description,
        amount: money(recurrence.cents).amount,
        dueDate: w.today,
        daysLate: '0',
      },
      ref: { type: 'RECURRENCE', id: recurrence.id },
      onDate: addDays(w.today, -1),
      dueOn: addDays(w.today, -1),
      readAt: ts(addDays(w.today, -1)),
    });
  }
  if (goal) {
    const reserved = goal.reservations.reduce((s, r) => s + r.cents, 0);
    push({
      kind: 'GOAL_DEADLINE',
      titleKey: 'notification.goal.deadline30',
      params: {
        name: goal.name ?? '',
        deadline: goal.deadline ?? w.today,
        progress: ratio(reserved, goal.target),
      },
      ref: { type: 'GOAL', id: goal.id },
      onDate: addDays(w.today, -2),
      dueOn: goal.deadline,
      readAt: ts(addDays(w.today, -2)),
    });
  }
  push({
    kind: 'DAILY_SUMMARY',
    titleKey: 'daily.summary',
    params: { available, committed7d },
    ref: { type: 'USER', id: demoId('acc', 0) },
    onDate: addDays(w.today, -3),
    dueOn: null,
    readAt: ts(addDays(w.today, -3)),
  });
  return list;
}

export function dailyMessage(w: World): S['DailyMessage'] {
  const committed = commitments(w, addDays(w.today, 7))
    .filter((c) => c.dir === 'OUT')
    .reduce((sum, c) => sum + c.cents, 0);
  return {
    key: 'daily.summary',
    params: {
      available: dashboardView(w).balances.available.amount,
      committed7d: money(committed).amount,
    },
    source: 'STATIC',
    generatedAt: ts(w.today),
  };
}

export function reminderList(w: World, includeDone: boolean): S['Reminder'][] {
  const list: S['Reminder'][] = [
    {
      id: demoId('rem', 1),
      title: 'Revisar o orçamento do mês',
      remindOn: addDays(w.today, 2),
      remindAt: null,
      note: null,
      link: null,
      done: false,
      createdAt: ts(addDays(w.today, -5)),
    },
    {
      id: demoId('rem', 2),
      title: 'Conferir a fatura do cartão',
      remindOn: addDays(w.today, 5),
      remindAt: '08:30',
      note: 'Ver se as compras parceladas estão certas.',
      link: null,
      done: false,
      createdAt: ts(addDays(w.today, -4)),
    },
  ];
  if (includeDone) {
    list.push({
      id: demoId('rem', 3),
      title: 'Pagar o IPTU',
      remindOn: addDays(w.today, -3),
      remindAt: null,
      note: null,
      link: null,
      done: true,
      doneAt: ts(addDays(w.today, -3)),
      createdAt: ts(addDays(w.today, -10)),
    });
  }
  return list;
}

export function notificationSettings(): S['NotificationSettings'] {
  return {
    dailySummary: { enabled: true, time: '08:00', frequency: 'DAILY' },
    kinds: {},
    quietHours: { from: '22:00', to: '07:00' },
    push: { enabled: false },
    displayName: null,
    version: 1,
  };
}
