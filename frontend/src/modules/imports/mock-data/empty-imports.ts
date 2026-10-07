import type { ImportBatchSliceResponse } from '~/modules/imports/infra/responses/import.response';

/** Ambiente mock (S-67): nenhum lote de importação. Mesmo formato bruto da API. */
export const EMPTY_IMPORTS: ImportBatchSliceResponse = { items: [], hasNext: false };
