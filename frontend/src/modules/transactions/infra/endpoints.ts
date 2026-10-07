/** Endpoints de movimentações, num lugar só (FE 05). Contrato: tags Transactions e Entries. */
export const TRANSACTIONS_ENDPOINTS = {
  collection: '/v1/transactions',
  item: (id: string) => `/v1/transactions/${encodeURIComponent(id)}`,
  void: (id: string) => `/v1/transactions/${encodeURIComponent(id)}/void`,
  cancelInstallments: (id: string) =>
    `/v1/transactions/${encodeURIComponent(id)}/cancel-installments`,
  entries: '/v1/entries',
} as const;

/** Header obrigatório do `POST /v1/transactions` (S-72). */
export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
