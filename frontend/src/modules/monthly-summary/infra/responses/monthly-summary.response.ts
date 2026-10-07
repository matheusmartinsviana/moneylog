import type { components } from '~/util/api/schema.gen';

type Schemas = components['schemas'];

/** Resposta do resumo mensal = schema gerado do contrato (S-66). */
export type MonthlySummaryResponse = Schemas['MonthlySummary'];
export type SummaryDeltaResponse = Schemas['SummaryDelta'];
export type SummaryTotalsResponse = Schemas['SummaryTotals'];
