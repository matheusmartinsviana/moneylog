import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';

import { GoalsGateway, GoalsQuery } from '~/modules/goals/core/interfaces/goals.gateway';
import type {
  Goal,
  GoalInput,
  GoalUpdate,
  ReservationInput,
} from '~/modules/goals/core/types/goal';
import { GOALS_ENDPOINTS, IDEMPOTENCY_HEADER } from '~/modules/goals/infra/endpoints';
import {
  toCreateRequest,
  toGoal,
  toReservationRequest,
  toUpdateRequest,
} from '~/modules/goals/infra/facades/goals-response.mapper';
import type {
  GoalResponse,
  GoalSliceResponse,
} from '~/modules/goals/infra/responses/goal.response';
import { EMPTY_GOALS, newMockGoal } from '~/modules/goals/mock-data/empty-goals';
import { Problem, ProblemError, toProblem } from '~/util/api/problem';
import type { Slice } from '~/util/api/slice';
import { API_MOCKS } from '~/util/api-mocks';

/** Falha de rede/HTTP → `ProblemError` tipado (o core nunca vê `HttpErrorResponse`). */
function fail(error: unknown): Observable<never> {
  return throwError(() => new ProblemError(toProblem(error)));
}

/** Ambiente mock: o "banco" está vazio, então qualquer meta pedida por id não existe. */
function notFound(): Observable<never> {
  const problem: Problem = {
    status: 404,
    code: 'GOAL_NOT_FOUND',
    fieldErrors: [],
    traceId: null,
    retryAfterSeconds: null,
  };
  return throwError(() => new ProblemError(problem));
}

/**
 * Facade de requisições de metas (FE 05): o único lugar com HTTP do módulo. Com `API_MOCKS` ligado,
 * responde com `mock-data` vazio e não faz requisição; desligado, chama `/v1/goals`.
 */
@Injectable({ providedIn: 'root' })
export class GoalsRequestsFacade extends GoalsGateway {
  private readonly http = inject(HttpClient);
  private readonly useMocks = inject(API_MOCKS);

  list(query: GoalsQuery): Observable<Slice<Goal>> {
    if (this.useMocks) return of(this.toSlice(EMPTY_GOALS));
    let params = new HttpParams().set('page', query.page).set('pageSize', query.pageSize);
    if (query.status) params = params.set('status', query.status);
    return this.http.get<GoalSliceResponse>(GOALS_ENDPOINTS.collection, { params }).pipe(
      map((slice) => this.toSlice(slice)),
      catchError(fail),
    );
  }

  get(id: string): Observable<Goal> {
    if (this.useMocks) return notFound();
    return this.http
      .get<GoalResponse>(GOALS_ENDPOINTS.item(id))
      .pipe(map(toGoal), catchError(fail));
  }

  create(input: GoalInput, idempotencyKey: string): Observable<Goal> {
    if (this.useMocks) return of(toGoal(newMockGoal(idempotencyKey, toCreateRequest(input))));
    return this.http
      .post<GoalResponse>(GOALS_ENDPOINTS.collection, toCreateRequest(input), {
        headers: new HttpHeaders().set(IDEMPOTENCY_HEADER, idempotencyKey),
      })
      .pipe(map(toGoal), catchError(fail));
  }

  update(id: string, input: GoalUpdate): Observable<Goal> {
    if (this.useMocks) return notFound();
    return this.http
      .put<GoalResponse>(GOALS_ENDPOINTS.item(id), toUpdateRequest(input))
      .pipe(map(toGoal), catchError(fail));
  }

  reserve(id: string, input: ReservationInput, idempotencyKey: string): Observable<Goal> {
    if (this.useMocks) return notFound();
    return this.http
      .post<GoalResponse>(GOALS_ENDPOINTS.reservations(id), toReservationRequest(input), {
        headers: new HttpHeaders().set(IDEMPOTENCY_HEADER, idempotencyKey),
      })
      .pipe(map(toGoal), catchError(fail));
  }

  archive(id: string): Observable<Goal> {
    if (this.useMocks) return notFound();
    return this.http
      .post<GoalResponse>(GOALS_ENDPOINTS.archive(id), null)
      .pipe(map(toGoal), catchError(fail));
  }

  unarchive(id: string): Observable<Goal> {
    if (this.useMocks) return notFound();
    return this.http
      .post<GoalResponse>(GOALS_ENDPOINTS.unarchive(id), null)
      .pipe(map(toGoal), catchError(fail));
  }

  private toSlice(slice: GoalSliceResponse): Slice<Goal> {
    return { items: slice.items.map(toGoal), hasNext: slice.hasNext };
  }
}
