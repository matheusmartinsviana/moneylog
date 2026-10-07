import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';

import {
  EntrySlice,
  TransactionSlice,
  TransactionsGateway,
} from '~/modules/transactions/core/interfaces/transactions.gateway';
import type { ListFilters } from '~/modules/transactions/core/types/list-filters';
import type { Transaction } from '~/modules/transactions/core/types/transaction';
import type { TransactionInput } from '~/modules/transactions/core/types/transaction-input';
import { IDEMPOTENCY_HEADER, TRANSACTIONS_ENDPOINTS } from '~/modules/transactions/infra/endpoints';
import {
  toEntrySlice,
  toRequestBody,
  toTransaction,
  toTransactionSlice,
  toUpdateBody,
} from '~/modules/transactions/infra/facades/transactions-response.mapper';
import type {
  EntrySliceResponse,
  TransactionResponse,
  TransactionSliceResponse,
  VoidRequest,
  CancelInstallmentsRequest,
} from '~/modules/transactions/infra/responses/transaction.response';
import {
  EMPTY_ENTRY_SLICE,
  EMPTY_TRANSACTION_SLICE,
  mockCreatedTransaction,
} from '~/modules/transactions/mock-data/empty-transactions';
import { Problem, ProblemError, toProblem } from '~/util/api/problem';
import { API_MOCKS, mockResponse } from '~/util/api-mocks';
import { normalizeAmount } from '~/util/money-input';
import { cleanSearchTerm } from '~/util/search-term';

function fail(error: unknown): Observable<never> {
  return throwError(() => new ProblemError(toProblem(error)));
}

const NOT_FOUND: Problem = {
  status: 404,
  code: 'TRANSACTION_NOT_FOUND',
  fieldErrors: [],
  traceId: null,
  retryAfterSeconds: null,
};

/** Parâmetros da visão registros (só o que o contrato define para `GET /v1/transactions`). */
export function recordsParams(filters: ListFilters, page: number, pageSize: number): HttpParams {
  let params = new HttpParams();
  if (filters.from) params = params.set('from', filters.from);
  if (filters.to) params = params.set('to', filters.to);
  params = params.set('status', filters.status).set('page', page).set('pageSize', pageSize);
  if (filters.type) params = params.set('type', filters.type);
  if (filters.accountId) params = params.set('accountId', filters.accountId);
  if (filters.categoryId) params = params.set('categoryId', filters.categoryId);
  if (filters.method) params = params.set('method', filters.method);
  const q = cleanSearchTerm(filters.q).trim();
  if (q !== '') params = params.set('q', q);
  return params;
}

/** Parâmetros da visão por competência (`GET /v1/entries`). */
export function entriesParams(filters: ListFilters, page: number, pageSize: number): HttpParams {
  let params = new HttpParams()
    .set('competence', filters.competence)
    .set('lens', filters.lens)
    .set('page', page)
    .set('pageSize', pageSize);
  if (filters.accountId) params = params.set('accountId', filters.accountId);
  if (filters.categoryId) params = params.set('categoryId', filters.categoryId);
  if (filters.method) params = params.set('method', filters.method);
  return params;
}

/**
 * Facade de requisições de movimentações (FE 05): o único lugar com HTTP do módulo. Com `API_MOCKS`
 * ligado, responde com slices vazios e `totals` zerados, sem requisição.
 */
@Injectable({ providedIn: 'root' })
export class TransactionsRequestsFacade extends TransactionsGateway {
  private readonly http = inject(HttpClient);
  private readonly useMocks = inject(API_MOCKS);

  list(filters: ListFilters, page: number, pageSize: number): Observable<TransactionSlice> {
    if (this.useMocks) {
      return of(
        toTransactionSlice(
          mockResponse(TRANSACTIONS_ENDPOINTS.collection, EMPTY_TRANSACTION_SLICE),
        ),
      );
    }
    return this.http
      .get<TransactionSliceResponse>(TRANSACTIONS_ENDPOINTS.collection, {
        params: recordsParams(filters, page, pageSize),
      })
      .pipe(map(toTransactionSlice), catchError(fail));
  }

  listEntries(filters: ListFilters, page: number, pageSize: number): Observable<EntrySlice> {
    if (this.useMocks) return of(toEntrySlice(EMPTY_ENTRY_SLICE));
    return this.http
      .get<EntrySliceResponse>(TRANSACTIONS_ENDPOINTS.entries, {
        params: entriesParams(filters, page, pageSize),
      })
      .pipe(map(toEntrySlice), catchError(fail));
  }

  get(id: string): Observable<Transaction> {
    if (this.useMocks) return throwError(() => new ProblemError(NOT_FOUND));
    return this.http
      .get<TransactionResponse>(TRANSACTIONS_ENDPOINTS.item(id))
      .pipe(map(toTransaction), catchError(fail));
  }

  create(input: TransactionInput, idempotencyKey: string): Observable<Transaction> {
    if (this.useMocks) {
      // Sem persistência no mock: devolve a movimentação como o backend a devolveria.
      const normalized = normalizeAmount(input.amount, 'BRL');
      return of(
        toTransaction(
          mockCreatedTransaction({
            type: input.type,
            amount: { amount: normalized.ok ? normalized.value : input.amount, currency: 'BRL' },
            date: input.date,
            description: input.description,
            notes: input.notes && input.notes.trim() !== '' ? input.notes : null,
          }),
        ),
      );
    }
    return this.http
      .post<TransactionResponse>(TRANSACTIONS_ENDPOINTS.collection, toRequestBody(input), {
        headers: new HttpHeaders().set(IDEMPOTENCY_HEADER, idempotencyKey),
      })
      .pipe(map(toTransaction), catchError(fail));
  }

  update(id: string, input: TransactionInput, version: number): Observable<Transaction> {
    if (this.useMocks) return throwError(() => new ProblemError(NOT_FOUND));
    return this.http
      .put<TransactionResponse>(TRANSACTIONS_ENDPOINTS.item(id), toUpdateBody(input, version))
      .pipe(map(toTransaction), catchError(fail));
  }

  void(id: string, reason: string): Observable<Transaction> {
    if (this.useMocks) return throwError(() => new ProblemError(NOT_FOUND));
    const body: VoidRequest = { reason };
    return this.http
      .post<TransactionResponse>(TRANSACTIONS_ENDPOINTS.void(id), body)
      .pipe(map(toTransaction), catchError(fail));
  }

  cancelInstallments(id: string, reason: string): Observable<Transaction> {
    if (this.useMocks) return throwError(() => new ProblemError(NOT_FOUND));
    const body: CancelInstallmentsRequest = { reason };
    return this.http
      .post<TransactionResponse>(TRANSACTIONS_ENDPOINTS.cancelInstallments(id), body)
      .pipe(map(toTransaction), catchError(fail));
  }
}
