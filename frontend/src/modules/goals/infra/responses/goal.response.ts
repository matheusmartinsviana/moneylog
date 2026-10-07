import type { components } from '~/util/api/schema.gen';

type Schemas = components['schemas'];

/** Respostas e corpos de metas = schemas gerados do contrato (S-66). */
export type GoalResponse = Schemas['Goal'];
export type GoalSliceResponse = Schemas['GoalSlice'];
export type GoalReservationResponse = Schemas['GoalReservation'];
export type GoalCreateRequest = Schemas['GoalInput'];
export type GoalUpdateRequest = Schemas['GoalUpdate'];
export type GoalReservationRequest = Schemas['GoalReservationInput'];
