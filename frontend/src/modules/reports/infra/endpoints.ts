/** Endpoints dos relatórios do Início, num lugar só (FE 05). Contrato 2.6.0: tag Reports. */
export const REPORTS_ENDPOINTS = {
  /** `?period=D7|D30|M3|M12` (obrigatório). */
  incomeExpenses: '/v1/reports/income-expenses',
  /** `?month=AAAA-MM&limit=1..10`. */
  spendingByCategory: '/v1/reports/spending-by-category',
} as const;
