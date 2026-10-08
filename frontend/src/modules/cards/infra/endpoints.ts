/** Endpoints de cartões e faturas, num lugar só (FE 05). Contrato: tags Cards e Invoices. */
export const CARDS_ENDPOINTS = {
  collection: '/v1/cards',
  item: (id: string) => `/v1/cards/${encodeURIComponent(id)}`,
  archive: (id: string) => `/v1/cards/${encodeURIComponent(id)}/archive`,
  closingConfirmation: (id: string) => `/v1/cards/${encodeURIComponent(id)}/closing-confirmation`,
  unarchive: (id: string) => `/v1/cards/${encodeURIComponent(id)}/unarchive`,
  invoices: (id: string) => `/v1/cards/${encodeURIComponent(id)}/invoices`,
  futureInstallments: (id: string) => `/v1/cards/${encodeURIComponent(id)}/future-installments`,
  purchasePreview: (id: string) => `/v1/cards/${encodeURIComponent(id)}/purchase-preview`,
  billingChangePreview: (id: string) =>
    `/v1/cards/${encodeURIComponent(id)}/billing-change-preview`,
} as const;

export const INVOICES_ENDPOINTS = {
  item: (id: string) => `/v1/invoices/${encodeURIComponent(id)}`,
  paymentPreview: (id: string) => `/v1/invoices/${encodeURIComponent(id)}/payment-preview`,
  payments: (id: string) => `/v1/invoices/${encodeURIComponent(id)}/payments`,
} as const;

/** Header obrigatório do pagamento de fatura (S-72). */
export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
