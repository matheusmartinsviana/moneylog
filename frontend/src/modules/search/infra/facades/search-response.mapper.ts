import type { SearchResults } from '~/modules/search/core/types/search';
import type { SearchResultsResponse } from '~/modules/search/infra/responses/search.response';

/** Resposta → tipo do core. Só copia campos: nenhum valor é somado e o `snippet` segue texto puro. */
export function toSearchResults(response: SearchResultsResponse): SearchResults {
  return {
    q: response.q,
    transactions: response.transactions.map((item) => ({
      id: item.id,
      description: item.description,
      date: item.date,
      amount: { amount: item.amount.amount, currency: item.amount.currency },
      type: item.type,
      category: item.category ? { id: item.category.id, name: item.category.name } : null,
      account: item.account ? { id: item.account.id, name: item.account.name } : null,
    })),
    accounts: response.accounts.map((item) => ({
      id: item.id,
      name: item.name,
      institution: item.institution,
      type: item.type,
      status: item.status,
    })),
    categories: response.categories.map((item) => ({
      id: item.id,
      name: item.name,
      kind: item.kind,
      archived: item.archived,
    })),
    cards: response.cards.map((item) => ({
      id: item.id,
      name: item.name,
      institution: item.institution,
      status: item.status,
    })),
    notes: response.notes.map((item) => ({
      id: item.id,
      title: item.title,
      path: item.path,
      snippet: item.snippet,
    })),
    truncated: response.truncated,
  };
}
