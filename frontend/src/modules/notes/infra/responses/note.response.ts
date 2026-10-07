import type { components } from '~/util/api/schema.gen';

type Schemas = components['schemas'];

/** Respostas e corpos de notas = schemas gerados do contrato (S-66). */
export type NoteResponse = Schemas['Note'];
export type NoteLinkResponse = Schemas['NoteLink'];
export type NoteSummaryResponse = Schemas['NoteSummary'];
export type NoteSummarySliceResponse = Schemas['NoteSummarySlice'];
export type BacklinkResponse = Schemas['Backlink'];
export type BacklinkSliceResponse = Schemas['BacklinkSlice'];
export type NoteTagCountResponse = Schemas['NoteTagCount'];
export type NoteMovedResponse = Schemas['NoteMoved'];
export type ImportReportResponse = Schemas['ImportReport'];
export type NoteCreateRequest = Schemas['NoteInput'];
export type NoteUpdateRequest = Schemas['NoteUpdate'];
export type NoteMoveRequest = Schemas['NoteMove'];
export type NoteLinksRequest = Schemas['NoteLinksUpdate'];
export type NoteLinkInputRequest = Schemas['NoteLinkInput'];
