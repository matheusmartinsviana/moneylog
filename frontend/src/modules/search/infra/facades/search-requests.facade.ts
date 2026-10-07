import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';

import { SearchGateway } from '~/modules/search/core/interfaces/search.gateway';
import type { SearchResults } from '~/modules/search/core/types/search';
import { SEARCH_ENDPOINTS } from '~/modules/search/infra/endpoints';
import { toSearchResults } from '~/modules/search/infra/facades/search-response.mapper';
import type { SearchResultsResponse } from '~/modules/search/infra/responses/search.response';
import { emptySearchResults } from '~/modules/search/mock-data/empty-search';
import { ProblemError, toProblem } from '~/util/api/problem';
import { API_MOCKS, mockResponse } from '~/util/api-mocks';

/**
 * Facade de requisições da busca global (FE 05): o único lugar com HTTP do módulo. Com `API_MOCKS` ligado
 * não sai requisição: responde sem resultados (ou o JSON que o E2E deixou em
 * `window.__MONEYLOG_MOCK_RESPONSES__['/v1/search']`).
 */
@Injectable({ providedIn: 'root' })
export class SearchRequestsFacade extends SearchGateway {
  private readonly http = inject(HttpClient);
  private readonly useMocks = inject(API_MOCKS);

  search(q: string): Observable<SearchResults> {
    const source: Observable<SearchResultsResponse> = this.useMocks
      ? of(mockResponse(SEARCH_ENDPOINTS.search, emptySearchResults(q)))
      : this.http.get<SearchResultsResponse>(SEARCH_ENDPOINTS.search, {
          params: new HttpParams().set('q', q),
        });
    return source.pipe(
      map(toSearchResults),
      catchError((error: unknown) => throwError(() => new ProblemError(toProblem(error)))),
    );
  }
}
