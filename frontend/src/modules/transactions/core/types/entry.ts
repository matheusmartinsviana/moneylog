import type {
  PaymentMethod,
  TransactionType,
} from '~/modules/transactions/core/types/transaction-enums';
import type { Money } from '~/util/money';

export type EntryLens = 'CONSUMPTION' | 'INCOME';

/** Lançamento da visão "por competência": uma linha por lançamento do livro de despesa ou receita. */
export interface Entry {
  readonly transactionId: string;
  readonly transactionType: TransactionType;
  readonly date: string;
  /** `YYYY-MM`. */
  readonly competence: string;
  readonly description: string;
  readonly category: { readonly id: string; readonly name: string };
  readonly installment: { readonly number: number; readonly total: number } | null;
  readonly via: 'ACCOUNT' | 'CARD';
  readonly method: PaymentMethod | null;
  readonly cardId: string | null;
  readonly accountId: string | null;
  /** No sentido da lente (reembolso negativo em `CONSUMPTION`). */
  readonly amount: Money;
}

export interface CategoryAmount {
  readonly category: { readonly id: string; readonly name: string };
  readonly amount: Money;
}

/** Totais do filtro inteiro, calculados pelo backend (bate com `summary.month.*`, S-79). */
export interface EntryTotals {
  readonly total: Money;
  readonly byCategory: readonly CategoryAmount[];
}

/**
 * Linha de consumo que nasce de uma dívida `PAYABLE` sem movimentação com categoria ("um amigo pagou
 * meu jantar", S-137): não tem movimentação, tem a dívida. Já está em `totals` (a lista fecha com o
 * dashboard, S-79) e vem completa, sem paginar.
 */
export interface DebtEntry {
  readonly debtId: string;
  readonly date: string;
  /** `YYYY-MM`. */
  readonly competence: string;
  readonly description: string;
  readonly category: { readonly id: string; readonly name: string };
  readonly amount: Money;
}
