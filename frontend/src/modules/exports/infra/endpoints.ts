/** Endpoints de exportação (FE 05). Contrato: tag Exports. */
export const EXPORTS_ENDPOINTS = {
  transactionsCsv: '/v1/exports/transactions.csv',
  backup: '/v1/exports/backup',
} as const;
