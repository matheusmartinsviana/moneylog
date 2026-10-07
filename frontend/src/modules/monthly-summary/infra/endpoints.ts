/** Endpoints do resumo mensal (FE 05). Contrato: tag Summaries. */
export const SUMMARY_ENDPOINTS = {
  month: (month: string) => `/v1/summaries/${encodeURIComponent(month)}`,
} as const;
