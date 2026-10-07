import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';

import { DebtsGateway, DebtsQuery } from '~/modules/debts/core/interfaces/debts.gateway';
import type { Debt, DebtInput, DebtUpdate } from '~/modules/debts/core/types/debt';
import { DEBTS_ENDPOINTS, IDEMPOTENCY_HEADER } from '~/modules/debts/infra/endpoints';
import {
  toCreateRequest,
  toDebt,
  toUpdateRequest,
} from '~/modules/debts/infra/facades/debts-response.mapper';
import type {
  DebtReasonRequest,
  DebtResponse,
  DebtSliceResponse,
} from '~/modules/debts/infra/responses/debt.response';
import { EMPTY_DEBTS } from '~/modules/debts/mock-data/empty-debts';
import { Problem, ProblemError, toProblem } from '~/util/api/problem';
import type { Slice } from '~/util/api/slice';
import { API_MOCKS } from '~/util/api-mocks';

/** Falha de rede/HTTP → `ProblemError` tipado (o core nunca vê `HttpErrorResponse`). */
function fail(error: unknown): Observable<never> {
  return throwError(() => new ProblemError(toProblem(error)));
}

/** Ambiente mock: o "banco" está vazio, então qualquer dívida pedida por id não existe. */
function notFound(): Observable<never> {
  const problem: Problem = {
    status: 404,
    code: 'DEBT_NOT_FOUND',
    fieldErrors: [],
    traceId: null,
    retryAfterSeconds: null,
  };
  return throwError(() => new ProblemError(problem));
}

/**
 * Facade de requisições de dívidas (FE 05): o único lugar com HTTP do módulo. Com `API_MOCKS` ligado,
 * responde com `mock-data` vazio e não faz requisição; desligado, chama `/v1`.
 */
@Injectable({ providedIn: 'root' })
export class DebtsRequestsFacade extends DebtsGateway {
  private readonly http = inject(HttpClient);
  private readonly useMocks = inject(API_MOCKS);

  list(query: DebtsQuery): Observable<Slice<Debt>> {
    if (this.useMocks) return of(this.toSlice(EMPTY_DEBTS));
    let params = new HttpParams().set('page', query.page).set('pageSize', query.pageSize);
    if (query.direction) params = params.set('direction', query.direction);
    if (query.status) params = params.set('status', query.status);
    if (query.personId) params = params.set('personId', query.personId);
    if (query.overdue !== undefined) params = params.set('overdue', query.overdue);
    return this.http.get<DebtSliceResponse>(DEBTS_ENDPOINTS.collection, { params }).pipe(
      map((slice) => this.toSlice(slice)),
      catchError(fail),
    );
  }

  get(id: string): Observable<Debt> {
    if (this.useMocks) return notFound();
    return this.http
      .get<DebtResponse>(DEBTS_ENDPOINTS.item(id))
      .pipe(map(toDebt), catchError(fail));
  }

  create(input: DebtInput, idempotencyKey: string): Observable<Debt> {
    if (this.useMocks) return notFound();
    return this.http
      .post<DebtResponse>(DEBTS_ENDPOINTS.collection, toCreateRequest(input), {
        headers: new HttpHeaders().set(IDEMPOTENCY_HEADER, idempotencyKey),
      })
      .pipe(map(toDebt), catchError(fail));
  }

  update(id: string, input: DebtUpdate): Observable<Debt> {
    if (this.useMocks) return notFound();
    return this.http
      .put<DebtResponse>(DEBTS_ENDPOINTS.item(id), toUpdateRequest(input))
      .pipe(map(toDebt), catchError(fail));
  }

  cancel(id: string, reason: string): Observable<Debt> {
    return this.withReason(DEBTS_ENDPOINTS.cancel(id), reason);
  }

  void(id: string, reason: string): Observable<Debt> {
    return this.withReason(DEBTS_ENDPOINTS.void(id), reason);
  }

  private withReason(url: string, reason: string): Observable<Debt> {
    if (this.useMocks) return notFound();
    const body: DebtReasonRequest = { reason: reason.trim() };
    return this.http.post<DebtResponse>(url, body).pipe(map(toDebt), catchError(fail));
  }

  private toSlice(slice: DebtSliceResponse): Slice<Debt> {
    return { items: slice.items.map(toDebt), hasNext: slice.hasNext };
  }
}
