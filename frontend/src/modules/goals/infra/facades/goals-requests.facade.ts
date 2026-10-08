import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';

import { GoalsGateway, GoalsQuery } from '~/modules/goals/core/interfaces/goals.gateway';
import type {
  Goal,
  GoalActionInput,
  GoalMetric,
  GoalInput,
  GoalUpdate,
  ReservationInput,
} from '~/modules/goals/core/types/goal';
import {
  GOALS_ENDPOINTS,
  IDEMPOTENCY_HEADER,
  METRIC_SOURCES,
} from '~/modules/goals/infra/endpoints';
import {
  toActionRequest,
  toCreateRequest,
  toGoal,
  toReservationRequest,
  toUpdateRequest,
} from '~/modules/goals/infra/facades/goals-response.mapper';
import type {
  GoalResponse,
  GoalSliceResponse,
  MetricDashboardResponse,
  MetricDebtOverviewResponse,
  MetricRecurrenceSummaryResponse,
} from '~/modules/goals/infra/responses/goal.response';
import { EMPTY_GOALS, newMockGoal } from '~/modules/goals/mock-data/empty-goals';
import { Problem, ProblemError, toProblem } from '~/util/api/problem';
import type { Slice } from '~/util/api/slice';
import { API_MOCKS } from '~/util/api-mocks';
import type { Money } from '~/util/money';

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

  baseline(id: string): Observable<Goal> {
    if (this.useMocks) return notFound();
    return this.http
      .post<GoalResponse>(GOALS_ENDPOINTS.baseline(id), null)
      .pipe(map(toGoal), catchError(fail));
  }

  addAction(id: string, input: GoalActionInput): Observable<Goal> {
    if (this.useMocks) return notFound();
    return this.http
      .post<GoalResponse>(GOALS_ENDPOINTS.actions(id), toActionRequest(input))
      .pipe(map(toGoal), catchError(fail));
  }

  updateAction(id: string, actionId: string, input: GoalActionInput): Observable<Goal> {
    if (this.useMocks) return notFound();
    return this.http
      .put<GoalResponse>(GOALS_ENDPOINTS.action(id, actionId), toActionRequest(input))
      .pipe(map(toGoal), catchError(fail));
  }

  deleteAction(id: string, actionId: string): Observable<Goal> {
    if (this.useMocks) return notFound();
    return this.http
      .delete<GoalResponse>(GOALS_ENDPOINTS.action(id, actionId))
      .pipe(map(toGoal), catchError(fail));
  }

  checkIn(id: string, actionId: string, period: string, done: boolean): Observable<Goal> {
    if (this.useMocks) return notFound();
    return this.http
      .post<GoalResponse>(GOALS_ENDPOINTS.checkIn(id, actionId), { period, done })
      .pipe(map(toGoal), catchError(fail));
  }

  metricValue(metric: GoalMetric): Observable<Money> {
    if (this.useMocks) return of({ amount: '0.00', currency: 'BRL' });
    switch (metric) {
      case 'ACCOUNTS_BALANCE':
      case 'AVAILABLE_BALANCE':
        return this.http.get<MetricDashboardResponse>(METRIC_SOURCES.dashboard).pipe(
          map((summary) =>
            metric === 'ACCOUNTS_BALANCE'
              ? summary.balances.inAccounts
              : summary.balances.available,
          ),
          catchError(fail),
        );
      case 'FIXED_COSTS_MONTHLY':
        return this.http.get<MetricRecurrenceSummaryResponse>(METRIC_SOURCES.recurrences).pipe(
          map((summary) => summary.fixedCosts),
          catchError(fail),
        );
      default:
        return this.http
          .get<MetricDebtOverviewResponse>(METRIC_SOURCES.debts, {
            params: new HttpParams().set('months', 6),
          })
          .pipe(
            map((overview) =>
              metric === 'CARD_DEBT'
                ? overview.parts.cards
                : metric === 'PEOPLE_DEBT'
                  ? overview.parts.people
                  : metric === 'OTHER_DEBT'
                    ? overview.parts.other
                    : overview.total,
            ),
            catchError(fail),
          );
    }
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
