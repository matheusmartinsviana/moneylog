import type { components } from '~/util/api/schema.gen';

type Schemas = components['schemas'];

/** Respostas e corpos de dívidas = schemas gerados do contrato (S-66). */
/** `creditorName` (2.13.0) é opcional aqui: o mapper tolera backend antigo. */
export type DebtResponse = Omit<Schemas['Debt'], 'creditorName'> &
  Partial<Pick<Schemas['Debt'], 'creditorName'>>;
export type DebtSliceResponse = Schemas['DebtSlice'];
export type DebtCreateRequest = Schemas['DebtInput'];
export type DebtUpdateRequest = Schemas['DebtUpdate'];
export type DebtReasonRequest = Schemas['DebtReasonInput'];
