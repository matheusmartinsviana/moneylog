import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';

import { ThirdPartiesGateway } from '~/modules/third-parties/core/interfaces/third-parties.gateway';
import type {
  ThirdPartyExpense,
  ThirdPartyExpenseInput,
  ThirdPartyReceipt,
  ThirdPartyReceiptInput,
  ThirdPartyReceivables,
} from '~/modules/third-parties/core/types/third-party';
import { THIRD_PARTY_ENDPOINTS } from '~/modules/third-parties/infra/endpoints';
import {
  toExpense,
  toExpenseRequest,
  toReceipt,
  toReceiptRequest,
  toReceivables,
} from '~/modules/third-parties/infra/facades/third-parties-response.mapper';
import type {
  ThirdPartyExpenseResponse,
  ThirdPartyReceiptResponse,
  ThirdPartyReceivablesResponse,
} from '~/modules/third-parties/infra/responses/third-party.response';
import { emptyReceivables } from '~/modules/third-parties/mock-data/empty-receivables';
import { ProblemError, toProblem } from '~/util/api/problem';
import { API_MOCKS } from '~/util/api-mocks';

const IDEMPOTENCY_HEADER = 'Idempotency-Key';

function fail(error: unknown): Observable<never> {
  return throwError(() => new ProblemError(toProblem(error)));
}

/** Facade de requisições de terceiros: o único lugar com HTTP do módulo. */
@Injectable({ providedIn: 'root' })
export class ThirdPartiesRequestsFacade extends ThirdPartiesGateway {
  private readonly http = inject(HttpClient);
  private readonly useMocks = inject(API_MOCKS);

  receivables(month: string | null): Observable<ThirdPartyReceivables> {
    if (this.useMocks) return of(toReceivables(emptyReceivables(month)));
    const params = month === null ? new HttpParams() : new HttpParams().set('month', month);
    return this.http
      .get<ThirdPartyReceivablesResponse>(THIRD_PARTY_ENDPOINTS.receivables, { params })
      .pipe(map(toReceivables), catchError(fail));
  }

  mark(input: ThirdPartyExpenseInput, idempotencyKey: string): Observable<ThirdPartyExpense> {
    if (this.useMocks) {
      return throwError(
        () =>
          new ProblemError({
            status: 404,
            code: 'TRANSACTION_NOT_FOUND',
            fieldErrors: [],
            traceId: null,
            retryAfterSeconds: null,
          }),
      );
    }
    return this.http
      .post<ThirdPartyExpenseResponse>(THIRD_PARTY_ENDPOINTS.expenses, toExpenseRequest(input), {
        headers: new HttpHeaders().set(IDEMPOTENCY_HEADER, idempotencyKey),
      })
      .pipe(map(toExpense), catchError(fail));
  }

  recordReceipt(
    input: ThirdPartyReceiptInput,
    idempotencyKey: string,
  ): Observable<ThirdPartyReceipt> {
    if (this.useMocks) return throwError(() => new ProblemError(mockNotFound('PERSON_NOT_FOUND')));
    return this.http
      .post<ThirdPartyReceiptResponse>(THIRD_PARTY_ENDPOINTS.receipts, toReceiptRequest(input), {
        headers: new HttpHeaders().set(IDEMPOTENCY_HEADER, idempotencyKey),
      })
      .pipe(map(toReceipt), catchError(fail));
  }

  deleteReceipt(id: string): Observable<void> {
    if (this.useMocks) return throwError(() => new ProblemError(mockNotFound('RECEIPT_NOT_FOUND')));
    return this.http.delete<void>(THIRD_PARTY_ENDPOINTS.receipt(id)).pipe(
      map(() => undefined),
      catchError(fail),
    );
  }
}

function mockNotFound(code: string) {
  return {
    status: 404,
    code,
    fieldErrors: [],
    traceId: null,
    retryAfterSeconds: null,
  };
}
