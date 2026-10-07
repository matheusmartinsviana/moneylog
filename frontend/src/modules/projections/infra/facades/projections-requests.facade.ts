import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';

import { ProjectionsGateway } from '~/modules/projections/core/interfaces/projections.gateway';
import type { Projection, ProjectionQuery } from '~/modules/projections/core/types/projection';
import { PROJECTIONS_ENDPOINTS } from '~/modules/projections/infra/endpoints';
import { toProjection } from '~/modules/projections/infra/facades/projection-response.mapper';
import type { ProjectionResponse } from '~/modules/projections/infra/responses/projection.response';
import { emptyProjection } from '~/modules/projections/mock-data/empty-projection';
import { ProblemError, toProblem } from '~/util/api/problem';
import { API_MOCKS } from '~/util/api-mocks';

/**
 * Facade de requisições de projeções (FE 05): o único lugar com HTTP do módulo. `horizon` e `includeTrend`
 * viram a query string; com `API_MOCKS` ligado devolve a série vazia, sem requisição.
 */
@Injectable({ providedIn: 'root' })
export class ProjectionsRequestsFacade extends ProjectionsGateway {
  private readonly http = inject(HttpClient);
  private readonly useMocks = inject(API_MOCKS);

  get(query: ProjectionQuery): Observable<Projection> {
    if (this.useMocks) return of(toProjection(emptyProjection(query.horizon)));
    const params = new HttpParams()
      .set('horizon', query.horizon)
      .set('includeTrend', query.includeTrend);
    return this.http.get<ProjectionResponse>(PROJECTIONS_ENDPOINTS.projection, { params }).pipe(
      map(toProjection),
      catchError((error: unknown) => throwError(() => new ProblemError(toProblem(error)))),
    );
  }
}
