import type { Money } from '~/util/money';

/** Moeda das dívidas: só BRL no MVP (S-2). Os valores exibidos usam a moeda do dado. */
export const DEBT_OVERVIEW_CURRENCY = 'BRL';

export const DEBT_OVERVIEW_MONTHS = [6, 12, 24] as const;
export type DebtOverviewMonths = (typeof DEBT_OVERVIEW_MONTHS)[number];

/** Compra parcelada com parcelas ainda não pagas e não canceladas (tudo calculado pelo backend). */
export interface DebtPlan {
  readonly purchaseId: string;
  readonly description: string | null;
  /** Cadastrada já em andamento (`source = ONGOING`). */
  readonly ongoing: boolean;
  readonly installmentAmount: Money;
  readonly totalInstallments: number;
  readonly remainingInstallments: number;
  readonly nextInstallmentNumber: number;
  readonly remaining: Money;
  /** `YYYY-MM-DD`. */
  readonly nextDueDate: string;
  readonly lastDueDate: string;
}

export interface DebtCardItem {
  readonly card: { readonly id: string; readonly name: string };
  readonly total: Money;
  readonly invoiced: Money;
  readonly future: Money;
  readonly otherCharges: Money;
  readonly adjustment: Money;
  readonly plans: readonly DebtPlan[];
}

/** Dívida com pessoa ou com credor livre (`person` nulo). */
export interface DebtLine {
  readonly debtId: string;
  readonly person: { readonly id: string; readonly name: string } | null;
  /** Nome da pessoa ou do credor livre. */
  readonly creditorName: string;
  readonly description: string | null;
  readonly outstanding: Money;
  readonly expectedDate: string | null;
  readonly overdue: boolean;
}

export interface DebtGroup {
  readonly total: Money;
  readonly items: readonly DebtLine[];
}

export interface SchedulePoint {
  /** `YYYY-MM`. */
  readonly competence: string;
  readonly cards: Money;
  readonly people: Money;
  readonly other: Money;
  readonly total: Money;
  readonly remainingAfter: Money;
}

/**
 * Compromisso acompanhado na visão de dívidas: **fora do `total`** (sem dupla contagem). Saldo e progresso
 * só existem no projeto de longo prazo; no empréstimo de terceiro são nulos e a tela não os inventa.
 */
export interface TrackedItem {
  readonly id: string;
  readonly kind: 'TRACKED_THIRD_PARTY' | 'LONG_TERM_PROJECT';
  readonly name: string;
  readonly counterparty: string | null;
  readonly total: Money | null;
  readonly paid: Money | null;
  readonly nominalBalance: Money | null;
  readonly progress: string | null;
  readonly installmentsTotal: number | null;
  readonly installmentsPaid: number | null;
  readonly remainingInstallments: number | null;
  readonly nextDueDate: string | null;
  readonly directPending: Money | null;
}

export interface TrackedOverview {
  readonly items: readonly TrackedItem[];
  /** Pendente de pagamento direto por mês de vencimento (curva à parte do cronograma de dívidas). */
  readonly scheduleByMonth: readonly { readonly competence: string; readonly amount: Money }[];
}

export type PayoffReason = 'UNDATED_DEBTS' | 'BEYOND_HORIZON';
export type IncomeSource = 'RECURRING_ESTIMATE' | 'LAST_FULL_MONTH' | 'NONE';

/**
 * Visão total de dívidas como a API devolve (`GET /v1/debts/overview`). **Nada é calculado no front**:
 * total, partes, razões, cronograma e meta vêm prontos; a tela só formata.
 */
export interface DebtOverview {
  readonly asOf: string;
  readonly total: Money;
  readonly parts: { readonly cards: Money; readonly people: Money; readonly other: Money };
  readonly cards: {
    readonly total: Money;
    readonly invoiced: Money;
    readonly future: Money;
    readonly items: readonly DebtCardItem[];
  };
  readonly people: DebtGroup;
  readonly other: DebtGroup;
  /** O que devem ao usuário: informativo, fora do total. */
  readonly receivablesInfo: Money;
  /** Há cartão/dívida cadastrados; sem isso, total 0 é "nada cadastrado", não "sem dívidas". */
  readonly hasRecords: boolean;
  /** Custo fixo mensal estimado: nunca soma no total. */
  readonly fixedCosts: { readonly monthly: Money; readonly estimate: boolean };
  readonly income: { readonly monthly: Money | null; readonly source: IncomeSource };
  readonly liquidity: { readonly inAccounts: Money; readonly available: Money };
  readonly comparison: {
    /** Razão do backend (4 casas); nula sem renda. */
    readonly debtToIncome: string | null;
    readonly fixedCostToIncome: string | null;
    readonly debtMinusInAccounts: Money;
    readonly reason: 'NO_INCOME' | null;
  };
  readonly schedule: {
    readonly months: number;
    readonly points: readonly SchedulePoint[];
    readonly overdue: Money;
    readonly undated: Money;
    readonly beyondHorizon: Money;
    /** `YYYY-MM` ou nulo (com `payoffReason`). */
    readonly payoffCompetence: string | null;
    readonly payoffReason: PayoffReason | null;
  };
  readonly payoffGoal: {
    readonly goalId: string;
    readonly baselineSet: boolean;
    readonly progress: string;
    readonly remaining: Money;
  } | null;
  /** Compromissos acompanhados: bloco separado, fora do total de dívidas. */
  readonly tracked: TrackedOverview;
}

/** Compra parcelada em andamento. `installmentAmount` é a string decimal digitada. */
export interface OngoingInstallmentsInput {
  readonly description: string;
  readonly installmentAmount: string;
  readonly totalInstallments: number;
  /** Quantas faltam pagar, a próxima inclusive ("3 de 10" = 8). */
  readonly remainingInstallments: number;
  /** Data dentro do ciclo da fatura da próxima parcela; ausente = hoje. */
  readonly firstInvoiceDate: string | null;
}

/** Prévia do servidor: o que passa a ser devido (o front não soma as parcelas). */
export interface OngoingPreview {
  readonly remainingInstallments: number;
  readonly installmentAmount: Money;
  readonly remaining: Money;
  readonly firstDueDate: string;
  readonly lastDueDate: string;
}
