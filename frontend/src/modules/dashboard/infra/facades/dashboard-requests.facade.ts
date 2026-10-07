import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';

import { DashboardGateway } from '~/modules/dashboard/core/interfaces/dashboard.gateway';
import { DashboardFailure } from '~/modules/dashboard/core/types/dashboard-failure';
import type { DashboardSummary } from '~/modules/dashboard/core/types/dashboard-summary';
import type { Upcoming } from '~/modules/dashboard/core/types/upcoming';
import { DASHBOARD_ENDPOINTS } from '~/modules/dashboard/infra/endpoints';
import {
  toDashboardSummary,
  toUpcoming,
} from '~/modules/dashboard/infra/facades/dashboard-response.mapper';
import type {
  DashboardSummaryResponse,
  UpcomingResponse,
} from '~/modules/dashboard/infra/responses/dashboard-summary.response';
import {
  EMPTY_DASHBOARD_SUMMARY,
  EMPTY_UPCOMING,
} from '~/modules/dashboard/mock-data/empty-dashboard';
import { API_MOCKS, mockResponse } from '~/util/api-mocks';

/** Traduz o erro técnico para o motivo que o core entende (403 → sem permissão). */
function toFailure(error: unknown): Observable<never> {
  const reason =
    error instanceof HttpErrorResponse && error.status === 403 ? 'forbidden' : 'unavailable';
  return throwError(() => new DashboardFailure(reason));
}

/**
 * Facade de requisições do dashboard (FE 05): o único lugar com HTTP do módulo. Implementa a porta
 * `DashboardGateway` e mapeia `*Response` → tipos do core.
 *
 * Com `API_MOCKS` ligado (Etapa 1), responde com `mock-data` e não sai nenhuma requisição.
 * Desligado, chama `/v1` (endpoints em `endpoints.ts`): caminho preparado para a Etapa 2.
 */
@Injectable({ providedIn: 'root' })
export class DashboardRequestsFacade extends DashboardGateway {
  private readonly http = inject(HttpClient);
  private readonly useMocks = inject(API_MOCKS);

  getSummary(): Observable<DashboardSummary> {
    const source: Observable<DashboardSummaryResponse> = this.useMocks
      ? of(mockResponse(DASHBOARD_ENDPOINTS.summary, EMPTY_DASHBOARD_SUMMARY))
      : this.http.get<DashboardSummaryResponse>(DASHBOARD_ENDPOINTS.summary);
    return source.pipe(map(toDashboardSummary), catchError(toFailure));
  }

  getUpcoming(): Observable<Upcoming> {
    const source: Observable<UpcomingResponse> = this.useMocks
      ? of(mockResponse(DASHBOARD_ENDPOINTS.upcoming, EMPTY_UPCOMING))
      : this.http.get<UpcomingResponse>(DASHBOARD_ENDPOINTS.upcoming);
    return source.pipe(map(toUpcoming), catchError(toFailure));
  }
}
