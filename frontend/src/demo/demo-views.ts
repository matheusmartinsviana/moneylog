import { addDays, addMonths, addMonthsKey, dateIn, lastDayOf } from '~/demo/demo-dates';
import {
  balanceAt,
  debtOutstanding,
  demoId,
  money,
  ratio,
  reservedIn,
  type AccountDef,
  type ConsumptionEntry,
  type DebtDef,
  type GoalDef,
  type InvoiceDef,
  type NoteDef,
  type PersonDef,
  type Rec,
  type RecurrenceDef,
  type S,
  type World,
} from '~/demo/demo-world';

/** Respostas do modo demonstração no formato do contrato (`contracts/openapi.yaml`). Só no build `demo`. */

export function norm(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function paged<T>(
  items: T[],
  page: number,
  pageSize: number,
): { items: T[]; hasNext: boolean } {
  const start = (Math.max(page, 1) - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), hasNext: start + pageSize < items.length };
}

const ts = (iso: string) => `${iso}T12:00:00Z`;

// ---------- Cadastros ----------

export function accountView(w: World, a: AccountDef): S['Account'] {
  const reserved = reservedIn(w, a.id);
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    liquidity: a.type === 'INVESTMENT' ? 'INVESTMENT' : 'CASH',
    institution: a.institution,
    openingBalance: money(a.opening),
    openingDate: a.openingDate,
    currentBalance: money(balanceAt(w, a.id, w.today)),
    status: 'ACTIVE',
    openingEditable: false,
    archivable: false,
    ...(reserved > 0 ? { reservedAmount: money(reserved) } : {}),
    uncovered: false,
    version: 0,
    createdAt: ts(a.openingDate),
    updatedAt: ts(a.openingDate),
  };
}

export function categoryView(w: World): S['Category'][] {
  return w.categories.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    system: false,
    archived: false,
    version: 0,
  }));
}

const catRef = (w: World, id: string | null): S['CategoryRef'] | null => {
  const c = w.categories.find((x) => x.id === id);
  return c ? { id: c.id, name: c.name } : null;
};
const accRef = (w: World, id: string | null): S['AccountRef'] | null => {
  const a = w.accounts.find((x) => x.id === id);
  return a ? { id: a.id, name: a.name } : null;
};

// ---------- Cartão e faturas ----------

function invoiceCore(w: World, inv: InvoiceDef): S['InvoiceSummary'] {
  return {
    id: inv.id,
    cardId: inv.cardId,
    referenceMonth: inv.ref,
    periodStart: inv.periodStart,
    closingDate: inv.closingDate,
    dueDate: inv.dueDate,
    status: inv.status,
    total: money(inv.total),
    carryIn: money(0),
    paid: money(inv.paid),
    outstanding: money(inv.total - inv.paid),
    creditCarry: money(0),
    hasLateEntries: false,
  };
}

function invoiceItems(inv: InvoiceDef): S['InvoiceItem'][] {
  return inv.items.map(({ rec, inst }) => ({
    kind: 'INSTALLMENT',
    transactionId: rec.id,
    description: rec.description,
    number: inst.total > 1 ? inst.number : null,
    totalInstallments: inst.total > 1 ? inst.total : null,
    amount: money(inst.cents),
    date: rec.date,
    lateEntry: false,
  }));
}

export function invoiceView(w: World, inv: InvoiceDef): S['Invoice'] {
  const pay = inv.paymentRecId ? w.recs.find((r) => r.id === inv.paymentRecId) : undefined;
  return {
    ...invoiceCore(w, inv),
    items: invoiceItems(inv),
    payments: pay
      ? [
          {
            transactionId: pay.id,
            accountId: pay.accountId!,
            amount: money(pay.cents),
            date: pay.date,
          },
        ]
      : [],
  };
}

export function invoiceSummary(w: World, inv: InvoiceDef): S['InvoiceSummary'] {
  return invoiceCore(w, inv);
}

export function currentInvoice(w: World): InvoiceDef | undefined {
  return (
    w.invoices.find((i) => i.status === 'OPEN') ?? w.invoices.find((i) => i.status === 'CLOSED')
  );
}

export function cardView(w: World): S['Card'] {
  const c = w.card;
  const unpaid = w.invoices.filter((i) => i.status !== 'PAID');
  const committed = unpaid.reduce((s, i) => s + i.total - i.paid, 0);
  const current = currentInvoice(w);
  const future = unpaid.filter((i) => i.status === 'FUTURE').reduce((s, i) => s + i.total, 0);
  return {
    id: c.id,
    name: c.name,
    institution: c.institution,
    limit: money(c.limit),
    availableLimit: money(c.limit - committed),
    overLimit: committed > c.limit,
    creditBalance: money(0),
    usedRatio: Math.round((committed / c.limit) * 10_000) / 10_000,
    closingDay: c.closingDay,
    dueDay: c.dueDay,
    defaultPaymentAccountId: c.defaultAccountId,
    status: 'ACTIVE',
    currentInvoice: current ? invoiceCore(w, current) : null,
    totalCommitted: money(committed),
    committedFuture: money(future),
    closingConfirmed: true,
    archivable: false,
    version: 0,
    createdAt: ts(w.accounts[0]!.openingDate),
    updatedAt: ts(w.accounts[0]!.openingDate),
  };
}

export function futureInstallments(w: World): S['FutureInstallments'] {
  const cur = currentInvoice(w);
  const later = w.invoices.filter(
    (i) => i.status === 'FUTURE' || (cur && i.ref > cur.ref && i.status !== 'PAID'),
  );
  const unique = [...new Map(later.map((i) => [i.id, i])).values()];
  return {
    total: money(unique.reduce((s, i) => s + i.total, 0)),
    byInvoice: unique.map((i) => ({
      invoiceId: i.id,
      referenceMonth: i.ref,
      dueDate: i.dueDate,
      amount: money(i.total),
      items: invoiceItems(i),
    })),
  };
}

// ---------- Movimentações ----------

function installmentsOf(w: World, rec: Rec): S['Installment'][] {
  return w.installments
    .filter((i) => i.recId === rec.id)
    .map((i) => {
      const inv = w.invoices.find((v) => v.ref === i.invoiceRef)!;
      return {
        number: i.number,
        total: i.total,
        amount: money(i.cents),
        competence: i.competence,
        invoiceId: inv.id,
        invoiceReferenceMonth: inv.ref,
        invoiceDueDate: inv.dueDate,
        status: inv.status === 'PAID' ? 'PAID' : 'PENDING',
        lateEntry: false,
      };
    });
}

export function txView(w: World, rec: Rec): S['Transaction'] {
  const card = rec.cardId ? { id: w.card.id, name: w.card.name } : null;
  const insts = rec.type === 'CARD_PURCHASE' ? installmentsOf(w, rec) : [];
  const sign = (n: number) => money(n);
  let cash = 0;
  let net = 0;
  switch (rec.type) {
    case 'EXPENSE':
    case 'LOAN_GIVEN':
    case 'INVOICE_PAYMENT':
      cash = -rec.cents;
      net = rec.type === 'EXPENSE' ? -rec.cents : 0;
      break;
    case 'INCOME':
      cash = rec.cents;
      net = rec.cents;
      break;
    case 'MONEY_RECEIVED':
      cash = rec.cents;
      break;
    case 'INVESTMENT':
      cash = -rec.cents;
      break;
    case 'CARD_PURCHASE':
      net = -rec.cents;
      break;
    default:
      break;
  }
  const consumption =
    rec.type === 'EXPENSE'
      ? [{ competence: rec.date.slice(0, 7), amount: money(rec.cents) }]
      : insts.map((i) => ({ competence: i.competence, amount: i.amount }));
  const inv = rec.invoiceId ? w.invoices.find((i) => i.id === rec.invoiceId) : undefined;
  const debt = rec.debtId ? w.debts.find((d) => d.id === rec.debtId) : undefined;
  return {
    id: rec.id,
    type: rec.type,
    status: 'ACTIVE',
    amount: money(rec.cents),
    date: rec.date,
    description: rec.description,
    notes: rec.notes,
    category: catRef(w, rec.categoryId),
    card,
    account: accRef(w, rec.accountId),
    counterpartAccount: accRef(w, rec.counterId),
    method: rec.method,
    direction: rec.direction,
    adjustmentKind: null,
    reason: null,
    refundOf: null,
    installments: insts,
    ...(inv
      ? {
          invoice: {
            id: inv.id,
            referenceMonth: inv.ref,
            closingDate: inv.closingDate,
            dueDate: inv.dueDate,
            status: inv.status,
          },
        }
      : {}),
    ...(debt ? { debt: debtSummary(w, debt) } : {}),
    recurrenceId: rec.recurrenceId,
    occurrenceDate: rec.recurrenceId ? rec.date : null,
    impact: {
      cash: sign(cash),
      consumption,
      netWorth: sign(net),
      commitment: money(rec.type === 'CARD_PURCHASE' ? rec.cents : 0),
    },
    editable: rec.type !== 'INVOICE_PAYMENT',
    voidable: rec.type !== 'INVOICE_PAYMENT',
    voidBlockedBy: null,
    voidReason: null,
    voidedAt: null,
    source: rec.recurrenceId ? 'RECURRENCE' : 'MANUAL',
    version: 0,
    createdAt: ts(rec.date),
    updatedAt: ts(rec.date),
  };
}

export interface TxFilters {
  from?: string | null;
  to?: string | null;
  type?: string | null;
  accountId?: string | null;
  categoryId?: string | null;
  method?: string | null;
  q?: string | null;
}

export function listTransactions(
  w: World,
  f: TxFilters,
  page: number,
  pageSize: number,
): S['TransactionSlice'] {
  const q = f.q ? norm(f.q) : '';
  const filtered = w.recs
    .filter(
      (r) =>
        (!f.from || r.date >= f.from) &&
        (!f.to || r.date <= f.to) &&
        (!f.type || r.type === f.type) &&
        (!f.accountId || r.accountId === f.accountId || r.counterId === f.accountId) &&
        (!f.categoryId || r.categoryId === f.categoryId) &&
        (!f.method || r.method === f.method) &&
        (!q || norm(r.description).includes(q)),
    )
    .sort((a, b) => (a.date === b.date ? (a.id < b.id ? 1 : -1) : a.date < b.date ? 1 : -1));
  let inCents = 0;
  let outCents = 0;
  for (const r of filtered) {
    if (r.type === 'INCOME' || r.type === 'MONEY_RECEIVED') inCents += r.cents;
    if (r.type === 'EXPENSE' || r.type === 'LOAN_GIVEN' || r.type === 'INVOICE_PAYMENT')
      outCents += r.cents;
  }
  const slice = paged(filtered, page, pageSize);
  return {
    items: slice.items.map((r) => txView(w, r)),
    hasNext: slice.hasNext,
    totals: {
      count: filtered.length,
      cashFlow: { in: money(inCents), out: money(outCents), net: money(inCents - outCents) },
    },
  };
}

function entriesOf(w: World, lens: string, competence: string): ConsumptionEntry[] {
  if (lens === 'INCOME') return [];
  return w.consumption.filter((e) => e.competence === competence);
}

export function listEntries(
  w: World,
  f: {
    competence: string;
    lens: string;
    accountId?: string | null;
    categoryId?: string | null;
    method?: string | null;
  },
  page: number,
  pageSize: number,
): S['EntrySlice'] {
  const all = entriesOf(w, f.lens, f.competence)
    .filter(
      (e) =>
        (!f.accountId || e.rec.accountId === f.accountId) &&
        (!f.categoryId || e.categoryId === f.categoryId) &&
        (!f.method || e.rec.method === f.method),
    )
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const byCat = new Map<string, number>();
  for (const e of all) byCat.set(e.categoryId, (byCat.get(e.categoryId) ?? 0) + e.cents);
  const slice = paged(all, page, pageSize);
  return {
    items: slice.items.map((e) => ({
      transactionId: e.rec.id,
      transactionType: e.rec.type,
      date: e.date,
      competence: e.competence,
      description: e.rec.description,
      category: catRef(w, e.categoryId)!,
      installment: e.installment,
      via: e.via,
      method: e.rec.method,
      cardId: e.rec.cardId,
      accountId: e.rec.accountId,
      amount: money(e.cents),
    })),
    hasNext: slice.hasNext,
    totals: {
      total: money(all.reduce((s, e) => s + e.cents, 0)),
      byCategory: [...byCat.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id, c]) => ({ category: catRef(w, id)!, amount: money(c) })),
    },
  };
}

// ---------- Pessoas e dívidas ----------

function personRef(p: PersonDef): S['PersonRef'] {
  return { id: p.id, name: p.name };
}

function debtStatus(d: DebtDef): S['DebtStatus'] {
  const out = debtOutstanding(d);
  if (out <= 0) return 'SETTLED';
  return d.settlements.length > 0 ? 'PARTIALLY_SETTLED' : 'OPEN';
}

export function debtSummary(w: World, d: DebtDef): S['DebtSummary'] {
  const settled = d.settlements.reduce((s, x) => s + x.cents, 0);
  return {
    id: d.id,
    person: personRef(w.people.find((p) => p.id === d.personId)!),
    creditorName: null,
    direction: d.direction,
    status: debtStatus(d),
    principal: money(d.principal),
    settled: money(settled),
    outstanding: money(d.principal - settled),
    date: d.date,
    expectedDate: d.expectedDate,
    overdue: d.expectedDate !== null && d.expectedDate < w.today && debtOutstanding(d) > 0,
    description: d.description,
  };
}

export function debtView(w: World, d: DebtDef): S['Debt'] {
  const base = debtSummary(w, d);
  return {
    ...base,
    origin: d.origin,
    originTransactionId: d.originRecId,
    category: catRef(w, d.categoryId),
    closureDate: null,
    closureReason: null,
    settlements: d.settlements.map((s) => ({
      transactionId: s.recId ?? demoId('tx', 0),
      amount: money(s.cents),
      date: s.date,
      active: true,
    })),
    cancelable: true,
    voidable: false,
    voidBlockedBy: d.originRecId ? 'HAS_ORIGIN_TRANSACTION' : 'DEBT_HAS_SETTLEMENTS',
    version: 0,
    createdAt: ts(d.date),
    updatedAt: ts(d.date),
  };
}

export function personView(w: World, p: PersonDef): S['Person'] {
  const open = w.debts.filter((d) => d.personId === p.id && debtOutstanding(d) > 0);
  const net = open.reduce(
    (s, d) => s + (d.direction === 'RECEIVABLE' ? 1 : -1) * debtOutstanding(d),
    0,
  );
  const dates = open
    .map((d) => d.expectedDate)
    .filter((x): x is string => x !== null)
    .sort();
  return {
    id: p.id,
    name: p.name,
    notes: p.notes,
    archived: false,
    net: money(net),
    direction: net > 0 ? 'RECEIVABLE' : net < 0 ? 'PAYABLE' : 'NONE',
    openDebts: open.length,
    nextDueDate: dates[0] ?? null,
    version: 0,
    createdAt: ts(w.accounts[0]!.openingDate),
    updatedAt: ts(w.accounts[0]!.openingDate),
  };
}

export function personDetail(w: World, p: PersonDef): S['PersonDetail'] {
  return {
    ...personView(w, p),
    debts: w.debts.filter((d) => d.personId === p.id).map((d) => debtSummary(w, d)),
  };
}

// ---------- Recorrências ----------

export function nextDateOf(r: RecurrenceDef, after: string): string {
  let key = r.startDate.slice(0, 7);
  for (let i = 0; i < 600; i += 1) {
    const d = dateIn(key, r.day);
    if (d > after && d >= r.startDate) return d;
    key = addMonthsKey(key, 1);
  }
  return after;
}

export function occurrenceDates(r: RecurrenceDef, after: string, until: string): string[] {
  const out: string[] = [];
  let d = nextDateOf(r, after);
  while (d <= until && out.length < 36) {
    out.push(d);
    d = nextDateOf(r, d);
  }
  return out;
}

export function recurrenceView(w: World, r: RecurrenceDef): S['Recurrence'] {
  return {
    id: r.id,
    type: r.type,
    amount: money(r.cents),
    description: r.description,
    category: catRef(w, r.categoryId)!,
    account: accRef(w, r.accountId),
    card: null,
    method: r.method,
    frequency: 'MONTHLY',
    interval: 1,
    unit: null,
    startDate: r.startDate,
    endDate: null,
    maxOccurrences: null,
    active: true,
    ended: false,
    nextOccurrence: nextDateOf(r, w.today),
    monthlyEstimate: money(r.cents),
    version: 0,
    createdAt: ts(r.startDate),
    updatedAt: ts(r.startDate),
  };
}

export function recurrenceSummary(w: World): S['RecurrenceSummary'] {
  const sum = (t: string) =>
    w.recurrences.filter((r) => r.type === t).reduce((s, r) => s + r.cents, 0);
  return {
    fixedCosts: money(sum('EXPENSE')),
    recurringIncome: money(sum('INCOME')),
    estimate: true,
  };
}

export function listOccurrences(
  w: World,
  from: string | null,
  to: string | null,
  status: string | null,
): S['Occurrence'][] {
  const start = from ?? addDays(w.today, 0);
  const end = to ?? addDays(w.today, 60);
  if (status === 'REALIZED' || status === 'SKIPPED') return [];
  const items: S['Occurrence'][] = [];
  for (const r of w.recurrences) {
    for (const date of occurrenceDates(r, addDays(start, -1), end)) {
      items.push({
        recurrenceId: r.id,
        date,
        status: 'PENDING',
        overdue: false,
        type: r.type,
        direction: r.type === 'INCOME' ? 'IN' : 'OUT',
        amount: money(r.cents),
        description: r.description,
        categoryId: r.categoryId,
        accountId: r.accountId,
        cardId: null,
        transactionId: null,
      });
    }
  }
  return items.sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ---------- Metas ----------

export function goalView(w: World, g: GoalDef): S['Goal'] {
  const current = g.reservations.reduce((s, r) => s + r.cents, 0);
  const remaining = Math.max(g.target - current, 0);
  let monthly: S['Money'] | null = null;
  if (g.deadline) {
    const months = Math.max(
      1,
      (Number(g.deadline.slice(0, 4)) - Number(w.today.slice(0, 4))) * 12 +
        Number(g.deadline.slice(5, 7)) -
        Number(w.today.slice(5, 7)),
    );
    monthly = money(Math.ceil(remaining / months));
  }
  return {
    id: g.id,
    kind: 'SAVINGS',
    name: g.name,
    target: money(g.target),
    current: money(current),
    progress: ratio(current, g.target),
    remaining: money(remaining),
    status: current >= g.target ? 'ACHIEVED' : 'ACTIVE',
    deadline: g.deadline,
    priority: g.priority,
    description: g.description,
    monthlyNeeded: monthly,
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
    baseline: null,
    baselineAt: null,
    grewSinceBaseline: false,
    version: 0,
    createdAt: ts(g.reservations[0]?.date ?? w.today),
    updatedAt: ts(g.reservations[0]?.date ?? w.today),
  };
}

// ---------- Compromissos, painel e projeção ----------

interface Commit {
  date: string | null;
  cents: number;
  dir: 'IN' | 'OUT';
  item: S['UpcomingItem'];
}

export function commitments(w: World, until: string): Commit[] {
  const out: Commit[] = [];
  const bucketOf = (date: string): S['UpcomingItem']['bucket'] => {
    if (date < w.today) return 'OVERDUE';
    if (date === w.today) return 'TODAY';
    if (date === addDays(w.today, 1)) return 'TOMORROW';
    if (date <= addDays(w.today, 7)) return 'NEXT_7_DAYS';
    if (date <= addDays(w.today, 30)) return 'NEXT_30_DAYS';
    return 'LATER';
  };
  for (const inv of w.invoices) {
    if (inv.status === 'PAID' || inv.total - inv.paid <= 0 || inv.dueDate > until) continue;
    out.push({
      date: inv.dueDate,
      cents: inv.total - inv.paid,
      dir: 'OUT',
      item: {
        kind: inv.status === 'FUTURE' ? 'INVOICE_FORECAST' : 'INVOICE',
        bucket: bucketOf(inv.dueDate),
        dueDate: inv.dueDate,
        direction: 'OUT',
        amount: money(inv.total - inv.paid),
        label: w.card.name,
        refType: 'INVOICE',
        refId: inv.id,
        items: inv.items.map(({ rec, inst }) => ({
          kind: 'INSTALLMENT',
          label: rec.description,
          installment: { number: inst.number, total: inst.total },
          amount: money(inst.cents),
          informational: false,
        })),
      },
    });
  }
  for (const r of w.recurrences) {
    for (const date of occurrenceDates(r, w.today, until)) {
      const dir = r.type === 'INCOME' ? 'IN' : 'OUT';
      out.push({
        date,
        cents: r.cents,
        dir,
        item: {
          kind: 'RECURRENCE',
          bucket: bucketOf(date),
          dueDate: date,
          direction: dir,
          amount: money(r.cents),
          label: r.description,
          refType: 'RECURRENCE',
          refId: r.id,
          items: [],
        },
      });
    }
  }
  for (const d of w.debts) {
    const rest = debtOutstanding(d);
    if (rest <= 0 || !d.expectedDate || d.expectedDate > until) continue;
    const dir = d.direction === 'RECEIVABLE' ? 'IN' : 'OUT';
    const person = w.people.find((p) => p.id === d.personId)!;
    out.push({
      date: d.expectedDate,
      cents: rest,
      dir,
      item: {
        kind: dir === 'IN' ? 'DEBT_RECEIVABLE' : 'DEBT_PAYABLE',
        bucket: bucketOf(d.expectedDate),
        dueDate: d.expectedDate,
        direction: dir,
        amount: money(rest),
        label: person.name,
        refType: 'DEBT',
        refId: d.id,
        items: [],
      },
    });
  }
  return out.sort((a, b) => ((a.date ?? '') < (b.date ?? '') ? -1 : 1));
}

export function upcomingView(w: World): S['Upcoming'] {
  const list = commitments(w, addDays(w.today, 75));
  const sum = (dir: 'IN' | 'OUT') =>
    list.filter((c) => c.dir === dir).reduce((s, c) => s + c.cents, 0);
  return {
    items: list.map((c) => c.item),
    undated: [],
    totals: { out: money(sum('OUT')), in: money(sum('IN')) },
  };
}

const METHODS = ['DEBIT', 'PIX', 'CASH', 'BOLETO', 'TRANSFER', 'OTHER'] as const;

export function monthTotals(w: World, month: string) {
  const inMonth = w.recs.filter((r) => r.date.slice(0, 7) === month);
  const income = inMonth.filter((r) => r.type === 'INCOME').reduce((s, r) => s + r.cents, 0);
  const expenses = inMonth.filter((r) => r.type === 'EXPENSE');
  const paid = expenses.reduce((s, r) => s + r.cents, 0);
  const credit = w.consumption
    .filter((e) => e.via === 'CARD' && e.competence === month)
    .reduce((s, e) => s + e.cents, 0);
  const cashIn = inMonth
    .filter((r) => r.type === 'INCOME' || r.type === 'MONEY_RECEIVED')
    .reduce((s, r) => s + r.cents, 0);
  const cashOut = inMonth
    .filter((r) => r.type === 'EXPENSE' || r.type === 'LOAN_GIVEN' || r.type === 'INVOICE_PAYMENT')
    .reduce((s, r) => s + r.cents, 0);
  const invested = inMonth
    .filter((r) => r.type === 'INVESTMENT')
    .reduce((s, r) => s + (r.direction === 'REDEMPTION' ? -r.cents : r.cents), 0);
  const lent = inMonth.filter((r) => r.type === 'LOAN_GIVEN').reduce((s, r) => s + r.cents, 0);
  const received = inMonth
    .filter((r) => r.type === 'MONEY_RECEIVED')
    .reduce((s, r) => s + r.cents, 0);
  return {
    income,
    expenses,
    paid,
    credit,
    consumption: paid + credit,
    cashIn,
    cashOut,
    invested,
    lent,
    received,
  };
}

export function dashboardView(w: World): S['DashboardSummary'] {
  const cash = w.accounts.filter((a) => a.type !== 'INVESTMENT');
  const inAccounts = cash.reduce((s, a) => s + balanceAt(w, a.id, w.today), 0);
  const investments = w.accounts
    .filter((a) => a.type === 'INVESTMENT')
    .reduce((s, a) => s + balanceAt(w, a.id, w.today), 0);
  const reserved = w.accounts.reduce((s, a) => s + reservedIn(w, a.id), 0);
  const prevEnd = lastDayOf(addMonthsKey(w.month, -1));
  const previous = cash.reduce((s, a) => s + balanceAt(w, a.id, prevEnd), 0);
  const horizon = (days: number, months?: number) =>
    commitments(w, months ? addMonths(w.today, months) : addDays(w.today, days));
  const out = (list: Commit[]) =>
    list.filter((c) => c.dir === 'OUT').reduce((s, c) => s + c.cents, 0);
  const inn = (list: Commit[]) =>
    list.filter((c) => c.dir === 'IN').reduce((s, c) => s + c.cents, 0);
  const l7 = horizon(7);
  const l30 = horizon(30);
  const l60 = horizon(60);
  const l90 = horizon(90);
  const l6 = horizon(0, 6);
  const l12 = horizon(0, 12);
  const t = monthTotals(w, w.month);
  const byMethod = Object.fromEntries(
    METHODS.map((m) => [
      m,
      money(
        w.recs
          .filter((r) => r.type === 'EXPENSE' && r.date.slice(0, 7) === w.month && r.method === m)
          .reduce((s, r) => s + r.cents, 0),
      ),
    ]),
  ) as unknown as S['ExpensesByMethod'];
  const receivables = w.debts
    .filter((d) => d.direction === 'RECEIVABLE')
    .reduce((s, d) => s + debtOutstanding(d), 0);
  const payables = w.debts
    .filter((d) => d.direction === 'PAYABLE')
    .reduce((s, d) => s + debtOutstanding(d), 0);
  const cardOut = w.invoices
    .filter((i) => i.status !== 'PAID')
    .reduce((s, i) => s + i.total - i.paid, 0);
  const futureCard = w.invoices
    .filter((i) => i.status === 'FUTURE')
    .reduce((s, i) => s + i.total, 0);
  const projected = (list: Commit[]) => money(inAccounts + inn(list) - out(list));
  return {
    asOf: w.today,
    isProjection: false,
    hasAccounts: true,
    balances: {
      inAccounts: money(inAccounts),
      investments: money(investments),
      available: money(inAccounts - out(l30) - reserved),
      reserved: money(reserved),
      committed30d: money(out(l30)),
      inAccountsChange: {
        previous: money(previous),
        amount: money(inAccounts - previous),
        percent: previous === 0 ? null : ratio(inAccounts - previous, previous),
        since: prevEnd,
      },
    },
    committed: {
      d7: money(out(l7)),
      d30: money(out(l30)),
      d60: money(out(l60)),
      d90: money(out(l90)),
      m6: money(out(l6)),
      m12: money(out(l12)),
    },
    projected: { d30: projected(l30), d90: projected(l90), m6: projected(l6), m12: projected(l12) },
    month: {
      competence: w.month,
      income: money(t.income),
      expensesPaid: { total: money(t.paid), byMethod },
      credit: money(t.credit),
      refunds: money(0),
      consumption: money(t.consumption),
      cashFlow: { in: money(t.cashIn), out: money(t.cashOut), net: money(t.cashIn - t.cashOut) },
      investedNet: money(t.invested),
      lent: money(t.lent),
      received: money(t.received),
      net: money(t.income - t.consumption),
    },
    netWorth: {
      accounts: money(inAccounts + investments),
      receivables: money(receivables),
      cardLiabilities: money(cardOut),
      payables: money(payables),
      total: money(inAccounts + investments + receivables - cardOut - payables),
      cardFutureInstallments: money(futureCard),
    },
  };
}

export function projectionView(
  w: World,
  horizon: S['ProjectionHorizon'],
  includeTrend: boolean,
): S['Projection'] {
  const n = { D30: 1, D90: 3, M6: 6, M12: 12 }[horizon];
  const start = w.accounts
    .filter((a) => a.type !== 'INVESTMENT')
    .reduce((s, a) => s + balanceAt(w, a.id, w.today), 0);
  const all = commitments(w, addMonths(w.today, n));
  const series: S['ProjectionPoint'][] = [];
  let balance = start;
  let prevEnd = w.today;
  for (let i = 1; i <= n; i += 1) {
    const end = addMonths(w.today, i);
    const slice = all.filter((c) => c.date !== null && c.date > prevEnd && c.date <= end);
    const inflows = slice.filter((c) => c.dir === 'IN').reduce((s, c) => s + c.cents, 0);
    const outflows = slice.filter((c) => c.dir === 'OUT').reduce((s, c) => s + c.cents, 0);
    balance += inflows - outflows;
    series.push({
      competence: end.slice(0, 7),
      periodEnd: end,
      inflows: money(inflows),
      outflows: money(outflows),
      balance: money(balance),
    });
    prevEnd = end;
  }
  const lastThree = [1, 2, 3].map((k) => addMonthsKey(w.month, -k));
  const avg = Math.round(lastThree.reduce((s, m) => s + monthTotals(w, m).consumption, 0) / 3);
  const trend: S['ProjectionTrend'] = {
    available: true,
    estimate: true,
    reason: null,
    monthlyAverage: money(avg),
    basedOn: [...lastThree].reverse(),
    series: series.map((p, i) => ({
      competence: p.competence,
      estimatedSpending: money(avg),
      balance: money(Number(p.balance.amount.replace('.', '')) - avg * (i + 1)),
    })),
  };
  const reserved = w.accounts.reduce((s, a) => s + reservedIn(w, a.id), 0);
  return {
    isProjection: true,
    horizon,
    asOf: w.today,
    startingBalance: money(start),
    series,
    assumptions: [
      'ACTIVE_RECURRENCES',
      'REGISTERED_INVOICES_AND_INSTALLMENTS',
      'DEBTS_WITH_EXPECTED_DATE',
      'NO_NEW_SPENDING_TREND',
    ],
    goals: {
      reserved: money(reserved),
      items: w.goals.map((g) => ({
        goalId: g.id,
        name: g.name,
        current: money(g.reservations.reduce((s, r) => s + r.cents, 0)),
        target: money(g.target),
      })),
    },
    ...(includeTrend ? { trend } : {}),
  };
}

// ---------- Resumo mensal e relatórios ----------

function totalsOf(w: World, month: string): S['SummaryTotals'] {
  const t = monthTotals(w, month);
  const net = t.income - t.consumption;
  return {
    competence: month,
    income: money(t.income),
    expenses: money(t.consumption),
    investments: money(t.invested),
    net: money(net),
    savingsRate: t.income > 0 ? ratio(net, t.income) : null,
  };
}

export function summaryView(w: World, month: string): S['MonthlySummary'] {
  const t = monthTotals(w, month);
  const net = t.income - t.consumption;
  const prevKey = addMonthsKey(month, -1);
  const prev = monthTotals(w, prevKey);
  const prevNet = prev.income - prev.consumption;
  const delta = (cur: number, before: number): S['SummaryDelta'] => ({
    amount: money(cur - before),
    percent: before === 0 ? null : ratio(cur - before, Math.abs(before)),
  });
  const entries = w.consumption.filter((e) => e.competence === month);
  const byCat = new Map<string, number>();
  for (const e of entries) byCat.set(e.categoryId, (byCat.get(e.categoryId) ?? 0) + e.cents);
  const top = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0];
  const biggest = [...entries].sort((a, b) => b.cents - a.cents)[0];
  const cardOutstanding = w.invoices
    .filter((i) => i.status !== 'PAID')
    .reduce((s, i) => s + i.total - i.paid, 0);
  const savingsRate = t.income > 0 ? ratio(net, t.income) : null;
  const prevRate = prev.income > 0 ? ratio(prevNet, prev.income) : null;
  return {
    competence: month,
    partial: month === w.month,
    isProjection: month > w.month,
    income: money(t.income),
    expenses: money(t.consumption),
    investments: money(t.invested),
    net: money(net),
    savingsRate,
    largestCategory: top ? { category: catRef(w, top[0])!, amount: money(top[1]) } : null,
    largestExpense: biggest
      ? {
          transactionId: biggest.rec.id,
          debtId: null,
          description: biggest.rec.description,
          category: catRef(w, biggest.categoryId)!,
          date: biggest.date,
          amount: money(biggest.cents),
          installmentNumber: biggest.installment?.number ?? null,
          installmentTotal: biggest.installment?.total ?? null,
        }
      : null,
    card: { consumption: money(t.credit), outstanding: money(cardOutstanding) },
    futureInstallments: money(
      w.consumption
        .filter((e) => e.via === 'CARD' && e.competence > month)
        .reduce((s, e) => s + e.cents, 0),
    ),
    comparison: {
      previousMonth: totalsOf(w, prevKey),
      incomeDelta: delta(t.income, prev.income),
      expensesDelta: delta(t.consumption, prev.consumption),
      investmentsDelta: delta(t.invested, prev.invested),
      netDelta: delta(net, prevNet),
      savingsRateDelta:
        savingsRate !== null && prevRate !== null
          ? (Number(savingsRate) - Number(prevRate)).toFixed(4)
          : null,
    },
  };
}

function dayTotals(w: World, from: string, to: string): { income: number; expenses: number } {
  const income = w.recs
    .filter((r) => r.type === 'INCOME' && r.date >= from && r.date <= to)
    .reduce((s, r) => s + r.cents, 0);
  const expenses = w.consumption
    .filter((e) => e.date >= from && e.date <= to && e.date <= w.today)
    .reduce((s, e) => s + e.cents, 0);
  return { income, expenses };
}

export function incomeExpenses(w: World, period: S['ReportPeriod']): S['IncomeExpenseSeries'] {
  const ranges: { start: string; end: string; partial: boolean }[] = [];
  let granularity: S['IncomeExpenseSeries']['granularity'] = 'DAY';
  let from: string;
  let to = w.today;
  if (period === 'D7' || period === 'D30') {
    const size = period === 'D7' ? 7 : 30;
    for (let i = 0; i < size; i += 1) {
      const d = addDays(w.today, -(size - 1 - i));
      ranges.push({ start: d, end: d, partial: i === size - 1 });
    }
    from = ranges[0]!.start;
  } else if (period === 'M3') {
    granularity = 'WEEK';
    from = addMonths(w.today, -3);
    let start = from;
    while (start <= w.today) {
      const weekday = (new Date(`${start}T00:00:00Z`).getUTCDay() + 6) % 7;
      const end = addDays(start, 6 - weekday) > w.today ? w.today : addDays(start, 6 - weekday);
      ranges.push({ start, end, partial: end === w.today });
      start = addDays(end, 1);
    }
  } else {
    granularity = 'MONTH';
    for (let i = 11; i >= 0; i -= 1) {
      const key = addMonthsKey(w.month, -i);
      ranges.push({ start: `${key}-01`, end: lastDayOf(key), partial: i === 0 });
    }
    from = ranges[0]!.start;
    to = ranges[11]!.end;
  }
  if (granularity !== 'MONTH') to = w.today;
  let income = 0;
  let expenses = 0;
  const points = ranges.map((r) => {
    const t =
      granularity === 'MONTH'
        ? {
            income: monthTotals(w, r.start.slice(0, 7)).income,
            expenses: monthTotals(w, r.start.slice(0, 7)).consumption,
          }
        : dayTotals(w, r.start, r.end);
    income += t.income;
    expenses += t.expenses;
    return {
      periodStart: r.start,
      periodEnd: r.end,
      partial: r.partial,
      income: money(t.income),
      expenses: money(t.expenses),
      net: money(t.income - t.expenses),
    };
  });
  return {
    period,
    from,
    to,
    basis: granularity === 'MONTH' ? 'COMPETENCE' : 'DATE',
    granularity,
    points,
    totals: { income: money(income), expenses: money(expenses), net: money(income - expenses) },
  };
}

export function spendingByCategory(
  w: World,
  month: string,
  limit: number,
): S['SpendingByCategory'] {
  const byCat = new Map<string, number>();
  for (const e of w.consumption.filter((x) => x.competence === month))
    byCat.set(e.categoryId, (byCat.get(e.categoryId) ?? 0) + e.cents);
  const sorted = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const base = sorted.reduce((s, [, c]) => s + c, 0);
  const size = Math.min(Math.max(limit, 1), 10);
  const rest = sorted.slice(size);
  const restCents = rest.reduce((s, [, c]) => s + c, 0);
  return {
    basis: 'COMPETENCE',
    from: `${month}-01`,
    to: lastDayOf(month),
    total: money(base),
    base: money(base),
    items: sorted.slice(0, size).map(([id, c]) => ({
      category: catRef(w, id)!,
      amount: money(c),
      share: base > 0 ? ratio(c, base) : null,
    })),
    other:
      rest.length > 0
        ? { amount: money(restCents), share: ratio(restCents, base), categories: rest.length }
        : null,
  };
}

// ---------- Notas e busca ----------

function titleOf(n: NoteDef): string {
  const file = n.path.split('/').pop() ?? n.path;
  return file.replace(/\.md$/, '');
}

export function noteSummary(n: NoteDef): S['NoteSummary'] {
  const snippet = n.body.replace(/^#.*$/gm, '').replace(/\s+/g, ' ').trim().slice(0, 120);
  return {
    id: n.id,
    path: n.path,
    title: titleOf(n),
    tags: n.tags,
    snippet: snippet || null,
    updatedAt: n.updatedAt,
    trashedAt: null,
    version: 0,
  };
}

export function noteView(n: NoteDef): S['Note'] {
  return {
    id: n.id,
    path: n.path,
    title: titleOf(n),
    body: n.body,
    tags: n.tags,
    links: n.links,
    version: 0,
    trashedAt: null,
    createdAt: n.updatedAt,
    updatedAt: n.updatedAt,
  };
}

export function searchView(w: World, q: string): S['SearchResults'] {
  const t = norm(q);
  const limit = 5;
  const cut = <T>(items: T[]) => items.slice(0, limit);
  return {
    q,
    transactions: cut(
      w.recs
        .filter((r) => norm(r.description).includes(t))
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    ).map((r) => ({
      id: r.id,
      description: r.description,
      date: r.date,
      amount: money(r.cents),
      type: r.type,
      category: catRef(w, r.categoryId),
      account: accRef(w, r.accountId),
    })),
    accounts: cut(
      w.accounts.filter((a) => norm(`${a.name} ${a.institution ?? ''}`).includes(t)),
    ).map((a) => ({
      id: a.id,
      name: a.name,
      institution: a.institution,
      type: a.type,
      status: 'ACTIVE' as const,
    })),
    categories: cut(w.categories.filter((c) => norm(c.name).includes(t))).map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      archived: false,
    })),
    cards: norm(`${w.card.name} ${w.card.institution}`).includes(t)
      ? [
          {
            id: w.card.id,
            name: w.card.name,
            institution: w.card.institution,
            status: 'ACTIVE' as const,
          },
        ]
      : [],
    notes: cut(w.notes.filter((n) => norm(`${titleOf(n)} ${n.body}`).includes(t))).map((n) => ({
      id: n.id,
      title: titleOf(n),
      path: n.path,
      snippet: noteSummary(n).snippet ?? '',
    })),
    truncated: [],
  };
}
