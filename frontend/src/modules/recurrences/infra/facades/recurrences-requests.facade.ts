import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';

import {
  OccurrencesQuery,
  RecurrencesGateway,
  RecurrencesQuery,
} from '~/modules/recurrences/core/interfaces/recurrences.gateway';
import type {
  Occurrence,
  RealizePayment,
  RealizedTransaction,
  Recurrence,
  RecurrenceInput,
  RecurrenceSummary,
  RecurrenceUpdate,
} from '~/modules/recurrences/core/types/recurrence';
import { IDEMPOTENCY_HEADER, RECURRENCES_ENDPOINTS } from '~/modules/recurrences/infra/endpoints';
import {
  toCreateRequest,
  toOccurrence,
  toRealized,
  toRecurrence,
  toSummary,
  toUpdateRequest,
} from '~/modules/recurrences/infra/facades/recurrences-response.mapper';
import type {
  OccurrenceResponse,
  OccurrenceSliceResponse,
  RealizedTransactionResponse,
  RealizeRequest,
  RecurrenceEndRequest,
  RecurrenceResponse,
  RecurrenceSliceResponse,
  RecurrenceSummaryResponse,
} from '~/modules/recurrences/infra/responses/recurrence.response';
import {
  EMPTY_OCCURRENCES,
  EMPTY_RECURRENCE_SUMMARY,
  EMPTY_RECURRENCES,
} from '~/modules/recurrences/mock-data/empty-recurrences';
import { Problem, ProblemError, toProblem } from '~/util/api/problem';
import type { OccurrenceSlice, Slice } from '~/util/api/slice';
import { API_MOCKS } from '~/util/api-mocks';

/** Falha de rede/HTTP → `ProblemError` tipado (o core nunca vê `HttpErrorResponse`). */
function fail(error: unknown): Observable<never> {
  return throwError(() => new ProblemError(toProblem(error)));
}

/** Ambiente mock: o "banco" está vazio, então qualquer recorrência pedida por id não existe. */
function notFound(): Observable<never> {
  const problem: Problem = {
    status: 404,
    code: 'RECURRENCE_NOT_FOUND',
    fieldErrors: [],
    traceId: null,
    retryAfterSeconds: null,
  };
  return throwError(() => new ProblemError(problem));
}

/**
 * Facade de requisições de recorrências (FE 05): o único lugar com HTTP do módulo. Com `API_MOCKS`
 * ligado, responde com `mock-data` vazio e não faz requisição; desligado, chama `/v1`.
 */
@Injectable({ providedIn: 'root' })
export class RecurrencesRequestsFacade extends RecurrencesGateway {
  private readonly http = inject(HttpClient);
  private readonly useMocks = inject(API_MOCKS);

  list(query: RecurrencesQuery): Observable<Slice<Recurrence>> {
    if (this.useMocks) return of(this.toSlice(EMPTY_RECURRENCES));
    let params = new HttpParams().set('page', query.page).set('pageSize', query.pageSize);
    if (query.active !== undefined) params = params.set('active', query.active);
    return this.http
      .get<RecurrenceSliceResponse>(RECURRENCES_ENDPOINTS.collection, { params })
      .pipe(
        map((slice) => this.toSlice(slice)),
        catchError(fail),
      );
  }

  get(id: string): Observable<Recurrence> {
    if (this.useMocks) return notFound();
    return this.http
      .get<RecurrenceResponse>(RECURRENCES_ENDPOINTS.item(id))
      .pipe(map(toRecurrence), catchError(fail));
  }

  create(input: RecurrenceInput, idempotencyKey: string): Observable<Recurrence> {
    if (this.useMocks) return notFound();
    return this.http
      .post<RecurrenceResponse>(RECURRENCES_ENDPOINTS.collection, toCreateRequest(input), {
        headers: new HttpHeaders().set(IDEMPOTENCY_HEADER, idempotencyKey),
      })
      .pipe(map(toRecurrence), catchError(fail));
  }

  update(id: string, input: RecurrenceUpdate): Observable<Recurrence> {
    if (this.useMocks) return notFound();
    return this.http
      .put<RecurrenceResponse>(RECURRENCES_ENDPOINTS.item(id), toUpdateRequest(input))
      .pipe(map(toRecurrence), catchError(fail));
  }

  end(id: string, endDate: string | null): Observable<Recurrence> {
    if (this.useMocks) return notFound();
    const body: RecurrenceEndRequest = endDate === null ? {} : { endDate };
    return this.http
      .post<RecurrenceResponse>(RECURRENCES_ENDPOINTS.end(id), body)
      .pipe(map(toRecurrence), catchError(fail));
  }

  deactivate(id: string): Observable<Recurrence> {
    if (this.useMocks) return notFound();
    return this.http
      .post<RecurrenceResponse>(RECURRENCES_ENDPOINTS.deactivate(id), null)
      .pipe(map(toRecurrence), catchError(fail));
  }

  summary(): Observable<RecurrenceSummary> {
    if (this.useMocks) return of(toSummary(EMPTY_RECURRENCE_SUMMARY));
    return this.http
      .get<RecurrenceSummaryResponse>(RECURRENCES_ENDPOINTS.summary)
      .pipe(map(toSummary), catchError(fail));
  }

  listOccurrences(query: OccurrencesQuery): Observable<OccurrenceSlice<Occurrence>> {
    if (this.useMocks) return of(this.toOccurrenceSlice(EMPTY_OCCURRENCES));
    let params = new HttpParams().set('page', query.page).set('pageSize', query.pageSize);
    if (query.from) params = params.set('from', query.from);
    if (query.to) params = params.set('to', query.to);
    if (query.status) params = params.set('status', query.status);
    return this.http
      .get<OccurrenceSliceResponse>(RECURRENCES_ENDPOINTS.occurrences, { params })
      .pipe(
        map((slice) => this.toOccurrenceSlice(slice)),
        catchError(fail),
      );
  }

  realize(
    recurrenceId: string,
    date: string,
    amount: string | null,
    idempotencyKey: string,
    payment: RealizePayment | null = null,
  ): Observable<RealizedTransaction> {
    if (this.useMocks) return notFound();
    const body: RealizeRequest = {
      ...(amount === null ? {} : { amount }),
      ...(payment ? { accountId: payment.accountId, method: payment.method } : {}),
    };
    return this.http
      .post<RealizedTransactionResponse>(RECURRENCES_ENDPOINTS.realize(recurrenceId, date), body, {
        headers: new HttpHeaders().set(IDEMPOTENCY_HEADER, idempotencyKey),
      })
      .pipe(map(toRealized), catchError(fail));
  }

  skip(recurrenceId: string, date: string): Observable<Occurrence> {
    if (this.useMocks) return notFound();
    return this.http
      .post<OccurrenceResponse>(RECURRENCES_ENDPOINTS.skip(recurrenceId, date), null)
      .pipe(map(toOccurrence), catchError(fail));
  }

  private toSlice(slice: RecurrenceSliceResponse): Slice<Recurrence> {
    return { items: slice.items.map(toRecurrence), hasNext: slice.hasNext };
  }

  private toOccurrenceSlice(slice: OccurrenceSliceResponse): OccurrenceSlice<Occurrence> {
    return {
      items: slice.items.map(toOccurrence),
      hasNext: slice.hasNext,
      overdueTruncated: slice.overdueTruncated ?? false,
    };
  }
}
