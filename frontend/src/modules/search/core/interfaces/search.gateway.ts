import { Observable } from 'rxjs';

import type { SearchResults } from '~/modules/search/core/types/search';

/**
 * Porta da busca global (`GET /v1/search`, contrato 2.6.0). Falha com `ProblemError`: `SEARCH_QUERY_INVALID`
 * (400), `TOO_MANY_ATTEMPTS` (429, `retryAfterSeconds`), 401 (o interceptor renova a sessão).
 */
export abstract class SearchGateway {
  /** `q` já limpo (2 a 100 caracteres, sem caractere de controle). */
  abstract search(q: string): Observable<SearchResults>;
}
