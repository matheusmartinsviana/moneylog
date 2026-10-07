import type { components } from '~/util/api/schema.gen';

type Schemas = components['schemas'];

/** Respostas e corpos de contas = schemas gerados do contrato (S-66). */
export type AccountResponse = Schemas['Account'];
export type AccountSliceResponse = Schemas['AccountSlice'];
export type AccountCreateRequest = Schemas['AccountInput'];
export type AccountUpdateRequest = Schemas['AccountUpdate'];
