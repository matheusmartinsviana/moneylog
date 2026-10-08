import type { components } from '~/util/api/schema.gen';

type Schemas = components['schemas'];

/** Respostas e corpos = schemas gerados do contrato (S-66). */
export type CommitmentResponse = Schemas['Commitment'];
export type CommitmentSliceResponse = Schemas['CommitmentSlice'];
export type CommitmentRequest = Schemas['CommitmentInput'];
export type CommitmentPayRequest = Schemas['CommitmentPayInput'];
export type CommitmentProgressRequest = Schemas['CommitmentProgressInput'];
