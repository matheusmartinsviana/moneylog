import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';

import { MonthlySummaryGateway } from '~/modules/monthly-summary/core/interfaces/monthly-summary.gateway';
import type { MonthlySummary } from '~/modules/monthly-summary/core/types/monthly-summary';
import { SUMMARY_ENDPOINTS } from '~/modules/monthly-summary/infra/endpoints';
import { toMonthlySummary } from '~/modules/monthly-summary/infra/facades/monthly-summary-response.mapper';
import type { MonthlySummaryResponse } from '~/modules/monthly-summary/infra/responses/monthly-summary.response';
import { emptySummary } from '~/modules/monthly-summary/mock-data/empty-summary';
import { ProblemError, toProblem } from '~/util/api/problem';
import { API_MOCKS, mockResponse } from '~/util/api-mocks';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Facade de requisições do resumo mensal (FE 05): o único lugar com HTTP do módulo. Com `API_MOCKS` ligado,
 * devolve o mês vazio e não faz requisição.
 */
@Injectable({ providedIn: 'root' })
export class MonthlySummaryRequestsFacade extends MonthlySummaryGateway {
  private readonly http = inject(HttpClient);
  private readonly useMocks = inject(API_MOCKS);

  get(month: string): Observable<MonthlySummary> {
    if (this.useMocks) {
      return MONTH.test(month)
        ? of(toMonthlySummary(mockResponse(SUMMARY_ENDPOINTS.month(month), emptySummary(month))))
        : throwError(
            () =>
              new ProblemError({
                status: 400,
                code: 'SUMMARY_MONTH_INVALID',
                fieldErrors: [],
                traceId: null,
                retryAfterSeconds: null,
              }),
          );
    }
    return this.http.get<MonthlySummaryResponse>(SUMMARY_ENDPOINTS.month(month)).pipe(
      map(toMonthlySummary),
      catchError((error: unknown) => throwError(() => new ProblemError(toProblem(error)))),
    );
  }
}
