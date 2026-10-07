/** Endpoints de recorrências, num lugar só (FE 05). Contrato: tag Recurrences. */
export const RECURRENCES_ENDPOINTS = {
  collection: '/v1/recurrences',
  summary: '/v1/recurrences/summary',
  occurrences: '/v1/recurrences/occurrences',
  item: (id: string) => `/v1/recurrences/${encodeURIComponent(id)}`,
  end: (id: string) => `/v1/recurrences/${encodeURIComponent(id)}/end`,
  deactivate: (id: string) => `/v1/recurrences/${encodeURIComponent(id)}/deactivate`,
  realize: (id: string, date: string) =>
    `/v1/recurrences/${encodeURIComponent(id)}/occurrences/${encodeURIComponent(date)}/realize`,
  skip: (id: string, date: string) =>
    `/v1/recurrences/${encodeURIComponent(id)}/occurrences/${encodeURIComponent(date)}/skip`,
} as const;

/** Header obrigatório de `realize` (mesmo contrato de `POST /v1/transactions`, S-72). */
export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
