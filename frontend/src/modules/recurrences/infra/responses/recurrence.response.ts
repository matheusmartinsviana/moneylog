import type { components } from '~/util/api/schema.gen';

type Schemas = components['schemas'];

/** Respostas e corpos de recorrências = schemas gerados do contrato (S-66). */
export type RecurrenceResponse = Schemas['Recurrence'];
export type RecurrenceSliceResponse = Schemas['RecurrenceSlice'];
export type RecurrenceSummaryResponse = Schemas['RecurrenceSummary'];
export type RecurrenceCreateRequest = Schemas['RecurrenceInput'];
export type RecurrenceUpdateRequest = Schemas['RecurrenceUpdate'];
export type RecurrenceEndRequest = Schemas['RecurrenceEndInput'];
export type OccurrenceResponse = Schemas['Occurrence'];
export type OccurrenceSliceResponse = Schemas['OccurrenceSlice'];
export type RealizeRequest = Schemas['RealizeOccurrenceInput'];
export type RealizedTransactionResponse = Schemas['Transaction'];
