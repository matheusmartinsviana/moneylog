import type { components } from '~/util/api/schema.gen';

type Schemas = components['schemas'];

/** Respostas e corpos de dívidas = schemas gerados do contrato (S-66). */
export type DebtResponse = Schemas['Debt'];
export type DebtSliceResponse = Schemas['DebtSlice'];
export type DebtCreateRequest = Schemas['DebtInput'];
export type DebtUpdateRequest = Schemas['DebtUpdate'];
export type DebtReasonRequest = Schemas['DebtReasonInput'];
