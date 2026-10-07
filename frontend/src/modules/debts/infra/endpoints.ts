/** Endpoints de dívidas, num lugar só (FE 05). Contrato: tag Debts. */
export const DEBTS_ENDPOINTS = {
  collection: '/v1/debts',
  item: (id: string) => `/v1/debts/${encodeURIComponent(id)}`,
  cancel: (id: string) => `/v1/debts/${encodeURIComponent(id)}/cancel`,
  void: (id: string) => `/v1/debts/${encodeURIComponent(id)}/void`,
} as const;
export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
