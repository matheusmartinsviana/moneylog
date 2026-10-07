import type { SearchResultsResponse } from '~/modules/search/infra/responses/search.response';

/** Ambiente mock (S-67): nenhum resultado. Mesmo formato bruto da API; sem dado de demonstração. */
export function emptySearchResults(q: string): SearchResultsResponse {
  return {
    q,
    transactions: [],
    accounts: [],
    categories: [],
    cards: [],
    notes: [],
    truncated: [],
  };
}
