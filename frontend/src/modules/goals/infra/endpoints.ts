/** Endpoints de metas, num lugar só (FE 05). Contrato: tag Goals. */
export const GOALS_ENDPOINTS = {
  collection: '/v1/goals',
  item: (id: string) => `/v1/goals/${encodeURIComponent(id)}`,
  reservations: (id: string) => `/v1/goals/${encodeURIComponent(id)}/reservations`,
  baseline: (id: string) => `/v1/goals/${encodeURIComponent(id)}/baseline`,
  archive: (id: string) => `/v1/goals/${encodeURIComponent(id)}/archive`,
  unarchive: (id: string) => `/v1/goals/${encodeURIComponent(id)}/unarchive`,
} as const;

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
