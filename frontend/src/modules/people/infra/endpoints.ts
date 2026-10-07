/** Endpoints de pessoas, num lugar só (FE 05). Contrato: tag People. */
export const PEOPLE_ENDPOINTS = {
  collection: '/v1/people',
  item: (id: string) => `/v1/people/${encodeURIComponent(id)}`,
  archive: (id: string) => `/v1/people/${encodeURIComponent(id)}/archive`,
  unarchive: (id: string) => `/v1/people/${encodeURIComponent(id)}/unarchive`,
} as const;
export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
