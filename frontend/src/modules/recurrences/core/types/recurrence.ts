import type { Money } from '~/util/money';

/** Moeda das recorrências: só BRL no MVP (S-2). */
export const RECURRENCE_CURRENCY = 'BRL';

/** `CARD_PURCHASE` só à vista (S-144). */
export type RecurrenceType = 'EXPENSE' | 'INCOME' | 'CARD_PURCHASE';
export const RECURRENCE_TYPES = [
  'EXPENSE',
  'INCOME',
  'CARD_PURCHASE',
] as const satisfies readonly RecurrenceType[];

export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM';
export const FREQUENCIES = [
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'YEARLY',
  'CUSTOM',
] as const satisfies readonly Frequency[];

export type IntervalUnit = 'DAYS' | 'WEEKS' | 'MONTHS';
export const INTERVAL_UNITS = [
  'DAYS',
  'WEEKS',
  'MONTHS',
] as const satisfies readonly IntervalUnit[];

/** Meios de pagamento de uma recorrência em conta (`CREDIT` não existe: cartão é outro tipo). */
export type RecurrenceMethod = 'CASH' | 'DEBIT' | 'PIX' | 'TRANSFER' | 'BOLETO' | 'OTHER';

export type OccurrenceStatus = 'PENDING' | 'REALIZED' | 'SKIPPED';

export interface Ref {
  readonly id: string;
  readonly name: string;
}

/**
 * Recorrência como a API devolve. `nextOccurrence` (a próxima **pendente**, inclui vencidas) e
 * `monthlyEstimate` (estimativa, S-146) vêm calculados pelo backend: o front só exibe.
 */
export interface Recurrence {
  readonly id: string;
  readonly type: RecurrenceType;
  readonly amount: Money;
  readonly description: string | null;
  readonly category: Ref;
  readonly account: Ref | null;
  readonly card: Ref | null;
  readonly method: RecurrenceMethod | null;
  readonly frequency: Frequency;
  /** 1 fora de `CUSTOM`. */
  readonly interval: number;
  readonly unit: IntervalUnit | null;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly maxOccurrences: number | null;
  readonly active: boolean;
  /** Só em receita: `1` = a renda de cada ocorrência pertence ao mês seguinte (ADR-017); `0` = o mês da data. */
  readonly incomeCompetenceOffsetMonths: 0 | 1;
  /**
   * Derivado pelo backend (S-235): sem ocorrência hoje nem depois (fim passado ou número de
   * ocorrências esgotado). Encerrada: `monthlyEstimate` 0,00 e fora do custo fixo. Só exibe.
   */
  readonly ended: boolean;
  readonly nextOccurrence: string | null;
  readonly monthlyEstimate: Money;
  readonly version: number;
}

/** Criação (`POST /v1/recurrences`). `amount` é a string decimal digitada. */
export interface RecurrenceInput {
  readonly type: RecurrenceType;
  readonly amount: string;
  readonly description: string;
  readonly categoryId: string;
  /** `EXPENSE`/`INCOME`: conta + meio de pagamento. */
  readonly accountId: string | null;
  readonly method: RecurrenceMethod | null;
  /** `CARD_PURCHASE`: cartão (à vista). */
  readonly cardId: string | null;
  readonly frequency: Frequency;
  /** Só em `CUSTOM`. */
  readonly interval: number | null;
  readonly unit: IntervalUnit | null;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly maxOccurrences: number | null;
  /** Só em receita (`0` padrão). */
  readonly incomeCompetenceOffsetMonths?: 0 | 1;
}

/** Edição: só os dados do modelo (S-139); frequência e início não mudam. */
export interface RecurrenceUpdate {
  readonly amount: string;
  readonly description: string;
  readonly categoryId: string;
  readonly accountId: string | null;
  readonly method: RecurrenceMethod | null;
  readonly cardId: string | null;
  readonly endDate: string | null;
  /** Só em receita; ausente mantém o atual no servidor. */
  readonly incomeCompetenceOffsetMonths?: 0 | 1;
  readonly version: number;
}

/** Custo fixo e receita recorrente mensais: **estimativa** (S-146), vindas do backend. */
export interface RecurrenceSummary {
  readonly fixedCosts: Money;
  readonly recurringIncome: Money;
  readonly estimate: true;
}

/** Ocorrência de uma recorrência (prevista, realizada ou pulada). */
export interface Occurrence {
  readonly recurrenceId: string;
  /** `YYYY-MM-DD`. */
  readonly date: string;
  readonly status: OccurrenceStatus;
  /** `PENDING` com data anterior a hoje (derivado no backend, S-20). */
  readonly overdue: boolean;
  readonly type: RecurrenceType;
  readonly direction: 'IN' | 'OUT';
  /** Valor do modelo (`PENDING`/`SKIPPED`) ou o da movimentação (`REALIZED`). */
  readonly amount: Money;
  readonly description: string | null;
  readonly categoryId: string;
  readonly accountId: string | null;
  readonly cardId: string | null;
  readonly transactionId: string | null;
}

/**
 * A movimentação que a realização criou (`201 Transaction`), só com o que a tela usa: o valor, a data e,
 * em compra no cartão, a fatura alvo escolhida pelo backend.
 */
export interface RealizedTransaction {
  readonly id: string;
  readonly description: string;
  readonly amount: Money;
  readonly date: string;
  readonly card: Ref | null;
  /** Fatura da 1ª parcela (compra no cartão): vem do backend. */
  readonly invoice: {
    readonly id: string;
    readonly referenceMonth: string;
    readonly dueDate: string;
  } | null;
}

/**
 * Conta e meio escolhidos ao confirmar uma ocorrência de recorrência "a definir" (2.14.0). Sem eles, o
 * backend recusa com `RECURRENCE_ACCOUNT_REQUIRED`.
 */
export interface RealizePayment {
  readonly accountId: string;
  readonly method: RecurrenceMethod;
}

/** Recorrência de conta ou receita sem conta definida (e que não é de cartão). */
export function isAccountToDefine(
  recurrence: Pick<Recurrence, 'type' | 'account' | 'card'>,
): boolean {
  return (
    recurrence.type !== 'CARD_PURCHASE' && recurrence.account === null && recurrence.card === null
  );
}
