/** Endpoints de importação (Etapa 7). Contrato: tag Imports. */
export const IMPORTS_ENDPOINTS = {
  collection: '/v1/imports',
  item: (id: string) => `/v1/imports/${encodeURIComponent(id)}`,
  lines: (id: string) => `/v1/imports/${encodeURIComponent(id)}/lines`,
  line: (id: string, lineId: string) =>
    `/v1/imports/${encodeURIComponent(id)}/lines/${encodeURIComponent(lineId)}`,
  bulk: (id: string) => `/v1/imports/${encodeURIComponent(id)}/lines:bulk`,
  apply: (id: string) => `/v1/imports/${encodeURIComponent(id)}/apply`,
  undo: (id: string) => `/v1/imports/${encodeURIComponent(id)}/undo`,
  mapping: (sourceId: string) => `/v1/import-mappings/${encodeURIComponent(sourceId)}`,
} as const;
export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
