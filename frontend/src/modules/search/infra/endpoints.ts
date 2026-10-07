/** Endpoint da busca global (FE 05). Contrato 2.6.0: tag Search. */
export const SEARCH_ENDPOINTS = {
  /** `?q=` (2 a 100 caracteres) e `limit` por grupo (1 a 8, padrão 5). */
  search: '/v1/search',
} as const;
