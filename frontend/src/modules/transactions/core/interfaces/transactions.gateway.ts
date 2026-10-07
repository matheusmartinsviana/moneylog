import { Observable } from 'rxjs';

import type { DebtEntry, Entry, EntryTotals } from '~/modules/transactions/core/types/entry';
import type { ListFilters } from '~/modules/transactions/core/types/list-filters';
import type { Transaction, TransactionTotals } from '~/modules/transactions/core/types/transaction';
import type { TransactionInput } from '~/modules/transactions/core/types/transaction-input';
import type { Slice } from '~/util/api/slice';

export type TransactionSlice = Slice<Transaction> & { readonly totals: TransactionTotals };
export type EntrySlice = Slice<Entry> & {
  readonly totals: EntryTotals;
  /** Consumo de dívidas sem movimentação (Etapa 4); fora da paginação e já dentro de `totals`. */
  readonly debtItems?: readonly DebtEntry[];
};

/**
 * Porta de movimentações (FE 01). As implementações falham com `ProblemError`
 * (`VERSION_CONFLICT`, `ACCOUNT_ARCHIVED`, `REFUND_EXCEEDS_ORIGINAL`...), com `fieldErrors` no 400.
 */
export abstract class TransactionsGateway {
  /** Visão registros: página + `totals` do filtro inteiro (calculados pelo backend). */
  abstract list(filters: ListFilters, page: number, pageSize: number): Observable<TransactionSlice>;

  /** Visão por competência: página + `totals` do filtro inteiro. */
  abstract listEntries(
    filters: ListFilters,
    page: number,
    pageSize: number,
  ): Observable<EntrySlice>;

  abstract get(id: string): Observable<Transaction>;

  /** `Idempotency-Key` obrigatório: uma por tentativa de envio (S-72, S-87). */
  abstract create(input: TransactionInput, idempotencyKey: string): Observable<Transaction>;

  abstract update(id: string, input: TransactionInput, version: number): Observable<Transaction>;

  abstract void(id: string, reason: string): Observable<Transaction>;

  /** Cancela as parcelas restantes de uma compra no cartão (T57); devolve a compra atualizada. */
  abstract cancelInstallments(id: string, reason: string): Observable<Transaction>;
}
