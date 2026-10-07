import type { components } from '~/util/api/schema.gen';

type Schemas = components['schemas'];

/** Respostas e corpos de pessoas = schemas gerados do contrato (S-66). */
export type PersonResponse = Schemas['Person'];
export type PersonDetailResponse = Schemas['PersonDetail'];
export type PersonSliceResponse = Schemas['PersonSlice'];
export type PersonCreateRequest = Schemas['PersonInput'];
export type PersonUpdateRequest = Schemas['PersonUpdate'];
