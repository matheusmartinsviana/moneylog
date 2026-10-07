import type { components } from '~/util/api/schema.gen';

type Schemas = components['schemas'];

/** Respostas e corpos de metas = schemas gerados do contrato (S-66). */
type GoalNewFields = 'kind' | 'baselineSet' | 'baseline' | 'baselineAt' | 'grewSinceBaseline';
/** Os campos da 2.13.0 são opcionais aqui: o mapper tolera backend antigo (padrão `SAVINGS`). */
export type GoalResponse = Omit<Schemas['Goal'], GoalNewFields> &
  Partial<Pick<Schemas['Goal'], GoalNewFields>>;
export type GoalSliceResponse = Schemas['GoalSlice'];
export type GoalReservationResponse = Schemas['GoalReservation'];
export type GoalCreateRequest = Schemas['GoalInput'];
export type GoalUpdateRequest = Schemas['GoalUpdate'];
export type GoalReservationRequest = Schemas['GoalReservationInput'];
