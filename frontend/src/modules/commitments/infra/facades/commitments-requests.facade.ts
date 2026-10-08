import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';

import {
  CommitmentsGateway,
  type CommitmentsQuery,
} from '~/modules/commitments/core/interfaces/commitments.gateway';
import type {
  Commitment,
  CommitmentInput,
  CommitmentProgressInput,
} from '~/modules/commitments/core/types/commitment';
import { COMMITMENT_ENDPOINTS } from '~/modules/commitments/infra/endpoints';
import {
  toCommitment,
  toCommitmentRequest,
  toProgressRequest,
} from '~/modules/commitments/infra/facades/commitments-response.mapper';
import type {
  CommitmentPayRequest,
  CommitmentResponse,
  CommitmentSliceResponse,
} from '~/modules/commitments/infra/responses/commitment.response';
import { emptyCommitments } from '~/modules/commitments/mock-data/empty-commitments';
import { ProblemError, toProblem } from '~/util/api/problem';
import type { Slice } from '~/util/api/slice';
import { API_MOCKS } from '~/util/api-mocks';

const IDEMPOTENCY_HEADER = 'Idempotency-Key';

function fail(error: unknown): Observable<never> {
  return throwError(() => new ProblemError(toProblem(error)));
}

function notFound(): Observable<never> {
  return throwError(
    () =>
      new ProblemError({
        status: 404,
        code: 'COMMITMENT_NOT_FOUND',
        fieldErrors: [],
        traceId: null,
        retryAfterSeconds: null,
      }),
  );
}

/** Facade de requisições de compromissos: o único lugar com HTTP do módulo. */
@Injectable({ providedIn: 'root' })
export class CommitmentsRequestsFacade extends CommitmentsGateway {
  private readonly http = inject(HttpClient);
  private readonly useMocks = inject(API_MOCKS);

  list(query: CommitmentsQuery): Observable<Slice<Commitment>> {
    if (this.useMocks) return of(this.toSlice(emptyCommitments()));
    const params = new HttpParams().set('page', query.page).set('pageSize', query.pageSize);
    return this.http.get<CommitmentSliceResponse>(COMMITMENT_ENDPOINTS.collection, { params }).pipe(
      map((slice) => this.toSlice(slice)),
      catchError(fail),
    );
  }

  get(id: string): Observable<Commitment> {
    if (this.useMocks) return notFound();
    return this.http
      .get<CommitmentResponse>(COMMITMENT_ENDPOINTS.byId(id))
      .pipe(map(toCommitment), catchError(fail));
  }

  create(input: CommitmentInput, idempotencyKey: string): Observable<Commitment> {
    if (this.useMocks) return notFound();
    return this.http
      .post<CommitmentResponse>(COMMITMENT_ENDPOINTS.collection, toCommitmentRequest(input), {
        headers: new HttpHeaders().set(IDEMPOTENCY_HEADER, idempotencyKey),
      })
      .pipe(map(toCommitment), catchError(fail));
  }

  payItem(id: string, position: number, paidOn: string, version: number): Observable<Commitment> {
    if (this.useMocks) return notFound();
    const body: CommitmentPayRequest = { paidOn, version };
    return this.http
      .post<CommitmentResponse>(COMMITMENT_ENDPOINTS.pay(id, position), body)
      .pipe(map(toCommitment), catchError(fail));
  }

  updateProgress(id: string, input: CommitmentProgressInput): Observable<Commitment> {
    if (this.useMocks) return notFound();
    return this.http
      .post<CommitmentResponse>(COMMITMENT_ENDPOINTS.progress(id), toProgressRequest(input))
      .pipe(map(toCommitment), catchError(fail));
  }

  private toSlice(slice: CommitmentSliceResponse): Slice<Commitment> {
    return { items: slice.items.map(toCommitment), hasNext: slice.hasNext };
  }
}
