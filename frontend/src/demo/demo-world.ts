import { addDays, addMonths, addMonthsKey, dateIn } from '~/demo/demo-dates';
import type { components } from '~/util/api/schema.gen';

/**
 * Mundo fictício do modo demonstração: contas, cartão, movimentações dos últimos seis meses, dívidas,
 * recorrências, metas e notas, **coerentes entre si**. Aqui há aritmética de centavos porque este arquivo
 * simula o backend; no app real o front não soma nada financeiro. Só entra no build `demo`.
 */
export type S = components['schemas'];

export function money(cents: number): S['Money'] {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  return {
    amount: `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`,
    currency: 'BRL',
  };
}

/** Razão com 4 casas (`HALF_UP`), como o backend devolveria. */
export function ratio(num: number, den: number): string {
  if (den === 0) return '0.0000';
  const sign = num < 0 !== den < 0 ? '-' : '';
  const n = Math.abs(num);
  const d = Math.abs(den);
  const scaled = Math.floor((n * 20_000 + d) / (2 * d));
  return `${sign}${Math.trunc(scaled / 10_000)}.${String(scaled % 10_000).padStart(4, '0')}`;
}

const KIND_CODE: Record<string, string> = {
  acc: '1',
  cat: '2',
  card: '3',
  inv: '4',
  tx: '5',
  person: '6',
  debt: '7',
  goal: '8',
  rec: '9',
  note: 'a',
  res: 'b',
  imp: 'c',
  line: 'd',
  ntf: 'e',
  rem: 'f',
  photo: '0',
};

export function demoId(kind: keyof typeof KIND_CODE, n: number): string {
  return `0000000${KIND_CODE[kind]}-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

export interface AccountDef {
  id: string;
  name: string;
  type: S['AccountType'];
  institution: string | null;
  opening: number;
  openingDate: string;
}

export interface CategoryDef {
  id: string;
  name: string;
  kind: S['CategoryKind'];
}

export interface Rec {
  id: string;
  type: S['TransactionType'];
  cents: number;
  date: string;
  description: string;
  categoryId: string | null;
  accountId: string | null;
  counterId: string | null;
  cardId: string | null;
  method: S['PaymentMethod'] | null;
  installments: number;
  direction: S['InvestmentDirection'] | null;
  debtId: string | null;
  invoiceId: string | null;
  recurrenceId: string | null;
  notes: string | null;
  /** Receita cuja renda pertence a outro mês (`YYYY-MM`, ADR-017); o caixa fica na data. */
  incomeCompetence?: string | null;
}

export interface InstallmentDef {
  recId: string;
  number: number;
  total: number;
  cents: number;
  /** Data de consumo da parcela (compra + n-1 meses). */
  date: string;
  competence: string;
  invoiceRef: string;
}

export interface InvoiceDef {
  id: string;
  cardId: string;
  ref: string;
  periodStart: string;
  closingDate: string;
  dueDate: string;
  status: S['InvoiceStatus'];
  total: number;
  paid: number;
  items: { rec: Rec; inst: InstallmentDef }[];
  paymentRecId: string | null;
}

export interface CardDef {
  id: string;
  name: string;
  institution: string;
  limit: number;
  closingDay: number;
  dueDay: number;
  defaultAccountId: string;
}

export interface PersonDef {
  id: string;
  name: string;
  notes: string | null;
}

export interface DebtDef {
  id: string;
  personId: string;
  direction: S['DebtDirection'];
  origin: S['DebtOrigin'];
  originRecId: string | null;
  principal: number;
  settlements: { recId: string | null; cents: number; date: string }[];
  date: string;
  expectedDate: string | null;
  description: string;
  categoryId: string | null;
}

export interface RecurrenceDef {
  id: string;
  type: S['RecurrenceType'];
  cents: number;
  description: string;
  categoryId: string;
  accountId: string;
  method: S['PaymentMethod'];
  day: number;
  startDate: string;
}

/** Ação do plano declarado de uma meta (demo). `doneIn`: períodos com check-in. */
export interface GoalActionDef {
  id: string;
  title: string;
  frequency: S['GoalActionFrequency'];
  doneIn: string[];
}

export interface GoalDef {
  id: string;
  /** Nulo em meta de medida sem nome (a tela mostra o rótulo gerado). */
  name: string | null;
  target: number;
  /** Meta de medida (`METRIC`): a medida, o valor de partida e o mês de criação. */
  metric?: S['GoalMetric'];
  baseline?: number;
  startMonth?: string;
  /** Valor da medida no fim de cada mês fechado desde `startMonth` (instantâneos). */
  history?: number[];
  planNote?: string | null;
  actions?: GoalActionDef[];
  /** Meta de sonho em destaque na Home (só uma). */
  featured?: boolean;
  /** Quantidade de fotos SINTÉTICAS (geradas por código em `demo-photos.ts`; nenhum binário versionado). */
  photos?: number;
  deadline: string | null;
  priority: S['GoalPriority'];
  description: string | null;
  reservations: {
    id: string;
    accountId: string;
    cents: number;
    date: string;
    note: string | null;
  }[];
}

export interface NoteDef {
  id: string;
  path: string;
  body: string;
  tags: string[];
  links: S['NoteLink'][];
  updatedAt: string;
}

export interface ConsumptionEntry {
  rec: Rec;
  date: string;
  competence: string;
  cents: number;
  categoryId: string;
  installment: { number: number; total: number } | null;
  via: 'ACCOUNT' | 'CARD';
}

export interface World {
  today: string;
  month: string;
  accounts: AccountDef[];
  categories: CategoryDef[];
  card: CardDef;
  recs: Rec[];
  installments: InstallmentDef[];
  invoices: InvoiceDef[];
  people: PersonDef[];
  debts: DebtDef[];
  recurrences: RecurrenceDef[];
  goals: GoalDef[];
  notes: NoteDef[];
  consumption: ConsumptionEntry[];
}

const CAT = {
  housing: 1,
  food: 2,
  transport: 3,
  leisure: 4,
  health: 5,
  subscriptions: 6,
  shopping: 7,
  salary: 8,
  freelance: 9,
  yields: 10,
} as const;

const ACC = { checking: 1, wallet: 2, savings: 3, invest: 4 } as const;

function vary(base: number, seed: number): number {
  return Math.round((base * (92 + ((seed * 37) % 17))) / 100 / 10) * 10;
}

export function buildWorld(today: string): World {
  const month = today.slice(0, 7);
  const openingDate = dateIn(addMonthsKey(month, -7), 1);

  const accounts: AccountDef[] = [
    {
      id: demoId('acc', ACC.checking),
      name: 'Conta corrente',
      type: 'CHECKING',
      institution: 'Nubank',
      opening: 300_000,
      openingDate,
    },
    {
      id: demoId('acc', ACC.wallet),
      name: 'Carteira',
      type: 'WALLET',
      institution: null,
      opening: 80_000,
      openingDate,
    },
    {
      id: demoId('acc', ACC.savings),
      name: 'Reserva',
      type: 'SAVINGS',
      institution: 'Itaú',
      opening: 1_400_000,
      openingDate,
    },
    {
      id: demoId('acc', ACC.invest),
      name: 'Investimentos',
      type: 'INVESTMENT',
      institution: 'XP',
      opening: 1_200_000,
      openingDate,
    },
  ];
  const catDefs: [number, string, S['CategoryKind']][] = [
    [CAT.housing, 'Moradia', 'EXPENSE'],
    [CAT.food, 'Alimentação', 'EXPENSE'],
    [CAT.transport, 'Transporte', 'EXPENSE'],
    [CAT.leisure, 'Lazer', 'EXPENSE'],
    [CAT.health, 'Saúde', 'EXPENSE'],
    [CAT.subscriptions, 'Assinaturas', 'EXPENSE'],
    [CAT.shopping, 'Compras', 'EXPENSE'],
    [CAT.salary, 'Salário', 'INCOME'],
    [CAT.freelance, 'Freelance', 'INCOME'],
    [CAT.yields, 'Rendimentos', 'INCOME'],
  ];
  const categories: CategoryDef[] = catDefs.map(([n, name, kind]) => ({
    id: demoId('cat', n),
    name,
    kind,
  }));
  const cat = (n: number) => demoId('cat', n);
  const checking = accounts[0]!.id;
  const savings = accounts[2]!.id;
  const invest = accounts[3]!.id;

  const card: CardDef = {
    id: demoId('card', 1),
    name: 'Cartão Roxo',
    institution: 'Nubank',
    limit: 800_000,
    closingDay: 25,
    dueDay: 5,
    defaultAccountId: checking,
  };

  const recs: Rec[] = [];
  let seq = 0;
  function add(partial: Partial<Rec> & Pick<Rec, 'type' | 'cents' | 'date' | 'description'>): Rec {
    seq += 1;
    const rec: Rec = {
      id: demoId('tx', seq),
      categoryId: null,
      accountId: null,
      counterId: null,
      cardId: null,
      method: null,
      installments: 1,
      direction: null,
      debtId: null,
      invoiceId: null,
      recurrenceId: null,
      notes: null,
      ...partial,
    };
    if (rec.date <= today) recs.push(rec);
    return rec;
  }

  const recurrences: RecurrenceDef[] = [
    {
      id: demoId('rec', 1),
      type: 'INCOME',
      cents: 750_000,
      description: 'Salário',
      categoryId: cat(CAT.salary),
      accountId: checking,
      method: 'TRANSFER',
      day: 5,
      startDate: dateIn(addMonthsKey(month, -5), 5),
    },
    {
      id: demoId('rec', 2),
      type: 'EXPENSE',
      cents: 180_000,
      description: 'Aluguel',
      categoryId: cat(CAT.housing),
      accountId: checking,
      method: 'BOLETO',
      day: 10,
      startDate: dateIn(addMonthsKey(month, -5), 10),
    },
    {
      id: demoId('rec', 3),
      type: 'EXPENSE',
      cents: 3_990,
      description: 'Streaming de vídeo',
      categoryId: cat(CAT.subscriptions),
      accountId: checking,
      method: 'DEBIT',
      day: 7,
      startDate: dateIn(addMonthsKey(month, -5), 7),
    },
    {
      id: demoId('rec', 4),
      type: 'EXPENSE',
      cents: 2_190,
      description: 'Streaming de música',
      categoryId: cat(CAT.subscriptions),
      accountId: checking,
      method: 'DEBIT',
      day: 7,
      startDate: dateIn(addMonthsKey(month, -5), 7),
    },
    {
      id: demoId('rec', 5),
      type: 'EXPENSE',
      cents: 10_990,
      description: 'Academia',
      categoryId: cat(CAT.health),
      accountId: checking,
      method: 'DEBIT',
      day: 2,
      startDate: dateIn(addMonthsKey(month, -5), 2),
    },
  ];

  for (let off = -5; off <= 0; off += 1) {
    const key = addMonthsKey(month, off);
    const s = off + 10;
    for (const r of recurrences) {
      add({
        type: r.type,
        cents: r.cents,
        date: dateIn(key, r.day),
        description: r.description,
        categoryId: r.categoryId,
        accountId: r.accountId,
        method: r.method,
        recurrenceId: r.id,
      });
    }
    if (off !== -3 && off !== 0) {
      add({
        type: 'INCOME',
        cents: vary(120_000, s),
        date: dateIn(key, 18),
        description: 'Projeto de design',
        categoryId: cat(CAT.freelance),
        accountId: checking,
        method: 'PIX',
        // Adiantamento (sintético): caiu neste mês, mas é a renda do mês seguinte.
        ...(off === -1 ? { incomeCompetence: addMonthsKey(key, 1) } : {}),
      });
    }
    add({
      type: 'EXPENSE',
      cents: vary(19_000, s + 1),
      date: dateIn(key, 12),
      description: 'Conta de energia',
      categoryId: cat(CAT.housing),
      accountId: checking,
      method: 'BOLETO',
    });
    (
      [
        [3, 32_000],
        [14, 41_000],
        [24, 28_500],
      ] as const
    ).forEach(([d, c], i) =>
      add({
        type: 'EXPENSE',
        cents: vary(c, s + i),
        date: dateIn(key, d),
        description: 'Supermercado',
        categoryId: cat(CAT.food),
        accountId: checking,
        method: 'DEBIT',
      }),
    );
    (
      [
        [8, 8_500, 'Jantar com amigos'],
        [20, 13_200, 'Restaurante'],
      ] as const
    ).forEach(([d, c, t], i) =>
      add({
        type: 'EXPENSE',
        cents: vary(c, s + i + 3),
        date: dateIn(key, d),
        description: t,
        categoryId: cat(CAT.food),
        accountId: checking,
        method: 'PIX',
      }),
    );
    (
      [
        [6, 2_800],
        [15, 3_400],
        [27, 4_100],
      ] as const
    ).forEach(([d, c], i) =>
      add({
        type: 'EXPENSE',
        cents: vary(c, s + i + 5),
        date: dateIn(key, d),
        description: 'Corrida de aplicativo',
        categoryId: cat(CAT.transport),
        accountId: checking,
        method: 'PIX',
      }),
    );
    add({
      type: 'EXPENSE',
      cents: vary(5_800, s + 7),
      date: dateIn(key, 22),
      description: 'Cinema',
      categoryId: cat(CAT.leisure),
      accountId: accounts[1]!.id,
      method: 'CASH',
    });
    if (off % 2 !== 0) {
      add({
        type: 'EXPENSE',
        cents: 6_450,
        date: dateIn(key, 17),
        description: 'Farmácia',
        categoryId: cat(CAT.health),
        accountId: checking,
        method: 'DEBIT',
      });
    }
    add({
      type: 'INVESTMENT',
      cents: 100_000,
      date: dateIn(key, 6),
      description: 'Aporte mensal',
      accountId: checking,
      counterId: invest,
      direction: 'CONTRIBUTION',
    });
    add({
      type: 'TRANSFER',
      cents: 30_000,
      date: dateIn(key, 6),
      description: 'Para a reserva',
      accountId: checking,
      counterId: savings,
    });
    // Compras no cartão (parceladas ou não).
    add({
      type: 'CARD_PURCHASE',
      cents: 60_000,
      date: dateIn(key, 9),
      description: 'Loja online',
      categoryId: cat(CAT.shopping),
      cardId: card.id,
      installments: 3,
    });
    add({
      type: 'CARD_PURCHASE',
      cents: 34_990,
      date: dateIn(key, 16),
      description: 'Tênis',
      categoryId: cat(CAT.shopping),
      cardId: card.id,
    });
    add({
      type: 'CARD_PURCHASE',
      cents: vary(18_000, s + 9),
      date: dateIn(key, 28),
      description: 'Marketplace',
      categoryId: cat(CAT.shopping),
      cardId: card.id,
    });
  }
  add({
    type: 'CARD_PURCHASE',
    cents: 480_000,
    date: dateIn(addMonthsKey(month, -3), 12),
    description: 'Notebook',
    categoryId: cat(CAT.shopping),
    cardId: card.id,
    installments: 12,
  });

  // Parcelas e faturas (fechamento dia 25, vencimento dia 5 do mês seguinte).
  const installments: InstallmentDef[] = [];
  for (const rec of recs.filter((r) => r.type === 'CARD_PURCHASE')) {
    const base = Math.floor(rec.cents / rec.installments);
    const first = rec.cents - base * (rec.installments - 1);
    const purchaseRef =
      Number(rec.date.slice(8, 10)) <= card.closingDay
        ? rec.date.slice(0, 7)
        : addMonthsKey(rec.date.slice(0, 7), 1);
    for (let n = 1; n <= rec.installments; n += 1) {
      const date = addMonths(rec.date, n - 1);
      installments.push({
        recId: rec.id,
        number: n,
        total: rec.installments,
        cents: n === 1 ? first : base,
        date,
        competence: date.slice(0, 7),
        invoiceRef: addMonthsKey(purchaseRef, n - 1),
      });
    }
  }
  const refs = [...new Set(installments.map((i) => i.invoiceRef))].sort();
  const invoices: InvoiceDef[] = refs.map((ref, idx) => {
    const closingDate = dateIn(ref, card.closingDay);
    const dueDate = dateIn(addMonthsKey(ref, 1), card.dueDay);
    const items = installments
      .filter((i) => i.invoiceRef === ref)
      .map((inst) => ({ rec: recs.find((r) => r.id === inst.recId)!, inst }));
    const total = items.reduce((sum, i) => sum + i.inst.cents, 0);
    const periodStart = addDays(dateIn(addMonthsKey(ref, -1), card.closingDay), 1);
    const settled = dueDate <= today;
    let status: S['InvoiceStatus'] = 'FUTURE';
    if (settled) status = 'PAID';
    else if (closingDate < today) status = 'CLOSED';
    else if (periodStart <= today) status = 'OPEN';
    let paymentRecId: string | null = null;
    if (settled && total > 0) {
      paymentRecId = add({
        type: 'INVOICE_PAYMENT',
        cents: total,
        date: dueDate,
        description: 'Pagamento de fatura',
        accountId: card.defaultAccountId,
        cardId: card.id,
        method: 'TRANSFER',
        invoiceId: demoId('inv', idx + 1),
      }).id;
    }
    return {
      id: demoId('inv', idx + 1),
      cardId: card.id,
      ref,
      periodStart,
      closingDate,
      dueDate,
      status,
      total,
      paid: settled ? total : 0,
      items,
      paymentRecId,
    };
  });

  // Pessoas e dívidas.
  const people: PersonDef[] = [
    { id: demoId('person', 1), name: 'Carlos', notes: 'Colega de trabalho' },
    { id: demoId('person', 2), name: 'Ana', notes: null },
  ];
  const loan = add({
    type: 'LOAN_GIVEN',
    cents: 40_000,
    date: addDays(today, -45),
    description: 'Empréstimo para o Carlos',
    accountId: checking,
    debtId: demoId('debt', 1),
  });
  const back = add({
    type: 'MONEY_RECEIVED',
    cents: 10_000,
    date: addDays(today, -20),
    description: 'Carlos devolveu parte',
    accountId: checking,
    debtId: demoId('debt', 1),
  });
  const debts: DebtDef[] = [
    {
      id: demoId('debt', 1),
      personId: people[0]!.id,
      direction: 'RECEIVABLE',
      origin: 'WITH_MOVEMENT',
      originRecId: loan.id,
      principal: 40_000,
      settlements: [{ recId: back.id, cents: 10_000, date: back.date }],
      date: loan.date,
      expectedDate: addDays(today, 20),
      description: 'Empréstimo para o Carlos',
      categoryId: null,
    },
    {
      id: demoId('debt', 2),
      personId: people[1]!.id,
      direction: 'PAYABLE',
      origin: 'WITHOUT_MOVEMENT',
      originRecId: null,
      principal: 25_000,
      settlements: [],
      date: addDays(today, -25),
      expectedDate: addDays(today, 12),
      description: 'Ingressos do show',
      categoryId: null,
    },
  ];

  const goals: GoalDef[] = [
    {
      id: demoId('goal', 1),
      name: 'Reserva de emergência',
      target: 1_500_000,
      deadline: null,
      priority: 'HIGH',
      description: 'Seis meses de custos fixos.',
      reservations: [
        {
          id: demoId('res', 1),
          accountId: savings,
          cents: 600_000,
          date: dateIn(addMonthsKey(month, -4), 3),
          note: 'Início da reserva',
        },
        {
          id: demoId('res', 2),
          accountId: savings,
          cents: 300_000,
          date: dateIn(addMonthsKey(month, -1), 8),
          note: null,
        },
      ],
    },
    {
      id: demoId('goal', 2),
      name: 'Viagem de fim de ano',
      target: 600_000,
      deadline: dateIn(addMonthsKey(month, 3), 15),
      priority: 'MEDIUM',
      description: null,
      reservations: [
        {
          id: demoId('res', 3),
          accountId: savings,
          cents: 180_000,
          date: dateIn(addMonthsKey(month, -2), 10),
          note: 'Primeira parte',
        },
      ],
    },
    {
      id: demoId('goal', 3),
      name: null,
      metric: 'TOTAL_DEBT',
      baseline: 1_200_000,
      startMonth: addMonthsKey(month, -3),
      history: [1_100_000, 1_050_000, 950_000],
      target: 400_000,
      deadline: dateIn(addMonthsKey(month, 6), 30),
      priority: 'HIGH',
      description: null,
      planNote: 'Pagar as parcelas em dia e usar o que sobrar do mês no financiamento da moto.',
      actions: [
        {
          id: demoId('act', 1),
          title: 'Pagar a fatura inteira no vencimento',
          frequency: 'MONTHLY',
          doneIn: [addMonthsKey(month, -2), addMonthsKey(month, -1)],
        },
        {
          id: demoId('act', 2),
          title: 'Revisar as dívidas',
          frequency: 'WEEKLY',
          doneIn: [],
        },
      ],
      reservations: [],
    },
    {
      id: demoId('goal', 4),
      name: 'Acertar com as pessoas',
      metric: 'PEOPLE_DEBT',
      baseline: 100_000,
      startMonth: addMonthsKey(month, -2),
      history: [80_000, 55_000],
      target: 60_000,
      deadline: dateIn(addMonthsKey(month, 2), 15),
      priority: 'MEDIUM',
      description: null,
      planNote: null,
      actions: [],
      reservations: [],
    },
    {
      id: demoId('goal', 5),
      name: 'Carro de exemplo',
      target: 1_000_000,
      deadline: dateIn(addMonthsKey(month, 14), 20),
      priority: 'MEDIUM',
      description: 'Meta de sonho de exemplo, com fotos sintéticas.',
      featured: true,
      photos: 3,
      reservations: [
        {
          id: demoId('res', 4),
          accountId: savings,
          cents: 250_000,
          date: dateIn(addMonthsKey(month, -1), 12),
          note: null,
        },
      ],
    },
    {
      id: demoId('goal', 6),
      name: 'Casa na praia de exemplo',
      target: 8_000_000,
      deadline: null,
      priority: 'LOW',
      description: null,
      photos: 2,
      reservations: [],
    },
  ];

  const stamp = `${addDays(today, -3)}T14:30:00Z`;
  const notes: NoteDef[] = [
    {
      id: demoId('note', 1),
      path: 'Planejamento/Reserva de emergência.md',
      tags: ['planejamento', 'reserva'],
      updatedAt: stamp,
      body: '# Reserva de emergência\n\nMeta: seis meses de custos fixos.\n\n- Aportar todo mês depois do salário\n- Revisar o valor a cada trimestre\n\n#planejamento #reserva\n',
      links: [
        {
          origin: 'EXPLICIT',
          type: 'GOAL',
          state: 'RESOLVED',
          text: null,
          alias: null,
          section: null,
          embed: false,
          target: {
            id: demoId('goal', 1),
            key: null,
            label: 'Reserva de emergência',
            status: 'ACTIVE',
          },
        },
      ],
    },
    {
      id: demoId('note', 2),
      path: 'Mensal/Revisão do mês.md',
      tags: ['revisao'],
      updatedAt: addDays(today, -1) + 'T09:00:00Z',
      body: '# Revisão do mês\n\n## O que foi bem\n\n- Gastos com mercado dentro do esperado\n- Aporte feito em dia\n\n## Para ajustar\n\n- Reduzir compras por impulso no cartão\n\n#revisao\n',
      links: [],
    },
    {
      id: demoId('note', 3),
      path: 'Ideias/Lista de compras grandes.md',
      tags: ['compras'],
      updatedAt: addDays(today, -9) + 'T18:10:00Z',
      body: '# Compras grandes\n\n1. Cadeira de escritório\n2. Monitor\n\nAntes de comprar, conferir a meta de viagem.\n\n#compras\n',
      links: [],
    },
  ];

  // Consumo (competência): gastos pagos na conta + parcelas do cartão.
  const consumption: ConsumptionEntry[] = [];
  for (const rec of recs) {
    if (rec.type === 'EXPENSE' && rec.categoryId) {
      consumption.push({
        rec,
        date: rec.date,
        competence: rec.date.slice(0, 7),
        cents: rec.cents,
        categoryId: rec.categoryId,
        installment: null,
        via: 'ACCOUNT',
      });
    }
  }
  for (const inst of installments) {
    const rec = recs.find((r) => r.id === inst.recId)!;
    consumption.push({
      rec,
      date: inst.date,
      competence: inst.competence,
      cents: inst.cents,
      categoryId: rec.categoryId!,
      installment: inst.total > 1 ? { number: inst.number, total: inst.total } : null,
      via: 'CARD',
    });
  }

  return {
    today,
    month,
    accounts,
    categories,
    card,
    recs,
    installments,
    invoices,
    people,
    debts,
    recurrences,
    goals,
    notes,
    consumption,
  };
}

/** Efeito de uma movimentação no saldo de uma conta (centavos). */
export function accountEffect(rec: Rec, accountId: string): number {
  const own = rec.accountId === accountId;
  switch (rec.type) {
    case 'INCOME':
    case 'MONEY_RECEIVED':
    case 'REFUND':
      return own ? rec.cents : 0;
    case 'EXPENSE':
    case 'LOAN_GIVEN':
    case 'INVOICE_PAYMENT':
    case 'DEBT_PAYMENT':
      return own ? -rec.cents : 0;
    case 'TRANSFER':
    case 'INVESTMENT':
      if (own) return -rec.cents;
      return rec.counterId === accountId ? rec.cents : 0;
    default:
      return 0;
  }
}

export function balanceAt(world: World, accountId: string, untilIso: string): number {
  const acc = world.accounts.find((a) => a.id === accountId)!;
  return world.recs.reduce(
    (sum, r) => (r.date <= untilIso ? sum + accountEffect(r, accountId) : sum),
    acc.opening,
  );
}

export function reservedIn(world: World, accountId: string): number {
  return world.goals.reduce(
    (sum, g) =>
      sum +
      g.reservations.filter((r) => r.accountId === accountId).reduce((s, r) => s + r.cents, 0),
    0,
  );
}

export function debtOutstanding(debt: DebtDef): number {
  return debt.principal - debt.settlements.reduce((s, x) => s + x.cents, 0);
}
