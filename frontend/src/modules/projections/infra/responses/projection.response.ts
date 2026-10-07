import type { components } from '~/util/api/schema.gen';

type Schemas = components['schemas'];

/** Resposta da projeção = schema gerado do contrato (S-66). */
export type ProjectionResponse = Schemas['Projection'];
export type ProjectionTrendResponse = Schemas['ProjectionTrend'];
