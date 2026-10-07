import type { components } from '~/util/api/schema.gen';

type Schemas = components['schemas'];

export type ImportBatchResponse = Schemas['ImportBatch'];
export type ImportBatchSliceResponse = Schemas['ImportBatchSlice'];
export type ImportLineResponse = Schemas['ImportLine'];
export type ImportLineSliceResponse = Schemas['ImportLineSlice'];
export type ImportLinePatchRequest = Schemas['ImportLinePatch'];
export type ImportBulkInputRequest = Schemas['ImportBulkInput'];
export type ImportBulkResultResponse = Schemas['ImportBulkResult'];
export type ImportAppliedResponse = Schemas['ImportApplied'];
export type ImportUndoRequest = Schemas['ImportUndoInput'];
export type ImportUndoneResponse = Schemas['ImportUndone'];
export type ImportMappingResponse = Schemas['ImportMapping'];
