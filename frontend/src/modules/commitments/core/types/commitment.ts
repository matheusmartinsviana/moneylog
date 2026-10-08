import type { Money } from '~/util/money';

/** Moeda: só BRL no MVP (S-2). */
export const COMMITMENT_CURRENCY = 'BRL';

/** Empréstimo no nome de terceiro (só o informado) ou projeto de longo prazo (cronograma completo). */
export type CommitmentKind = 'TRACKED_THIRD_PARTY' | 'LONG_TERM_PROJECT';
export const COMMITMENT_KINDS = [
  'TRACKED_THIRD_PARTY',
  'LONG_TERM_PROJECT',
] as const satisfies readonly CommitmentKind[];

export type CommitmentItemType = 'DOWN_PAYMENT' | 'INSTALLMENT' | 'EXTRAORDINARY' | 'FINANCING';
export const COMMITMENT_ITEM_TYPES = [
  'DOWN_PAYMENT',
  'INSTALLMENT',
  'EXTRAORDINARY',
  'FINANCING',
] as const satisfies readonly CommitmentItemType[];

export interface CommitmentItem {
  readonly position: number;
  readonly label: string;
  readonly type: CommitmentItemType;
  readonly dueDate: string | null;
  readonly amount: Money;
  readonly paid: boolean;
  readonly paidOn: string | null;
}

export interface CommitmentMonth {
  /** `YYYY-MM`. */
  readonly competence: string;
  readonly amount: Money;
}

/**
 * Compromisso acompanhado como a API devolve. **Tudo derivado vem do backend** (pago, saldo nominal,
 * progresso, pendentes). No empréstimo de terceiro, `total`, `nominalBalance` e `progress` são nulos: o
 * saldo restante não é conhecido nem estimado, e a tela não o mostra.
 */
export interface Commitment {
  readonly id: string;
  readonly kind: CommitmentKind;
  readonly name: string;
  readonly counterparty: string | null;
  readonly notes: string | null;
  readonly total: Money | null;
  readonly paid: Money | null;
  readonly nominalBalance: Money | null;
  /** Razão pago ÷ total com 4 casas (`0.0227`). */
  readonly progress: string | null;
  readonly installmentsTotal: number | null;
  readonly installmentsPaid: number | null;
  readonly remainingInstallments: number | null;
  readonly nextDueDate: string | null;
  readonly directPending: Money | null;
  readonly financingPending: Money | null;
  readonly pendingByMonth: readonly CommitmentMonth[];
  readonly schedule: readonly CommitmentItem[];
  readonly version: number;
}

export interface CommitmentItemInput {
  readonly label: string;
  readonly type: CommitmentItemType;
  readonly dueDate: string | null;
  /** String decimal digitada. */
  readonly amount: string;
  readonly paid: boolean;
  readonly paidOn: string | null;
}

/** Cadastro: o tipo escolhe quais campos valem (empréstimo: parcelas; projeto: cronograma). */
export interface CommitmentInput {
  readonly kind: CommitmentKind;
  readonly name: string;
  readonly counterparty: string | null;
  readonly notes: string | null;
  readonly installmentsTotal: number | null;
  readonly installmentsPaid: number | null;
  readonly paidAmount: string | null;
  readonly nextDueDate: string | null;
  readonly schedule: readonly CommitmentItemInput[] | null;
}

export interface CommitmentProgressInput {
  readonly installmentsPaid: number;
  readonly paidAmount: string | null;
  readonly nextDueDate: string | null;
  readonly notes: string | null;
  readonly version: number;
}
