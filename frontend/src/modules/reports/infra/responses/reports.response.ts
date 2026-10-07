import type { components } from '~/util/api/schema.gen';

/**
 * Respostas brutas dos relatórios = schemas gerados de `contracts/openapi.yaml` (S-66, contrato 2.6.0). Ficam
 * na infra: a facade de requisições mapeia para os tipos do core.
 */
type Schemas = components['schemas'];

export type IncomeExpenseSeriesResponse = Schemas['IncomeExpenseSeries'];
export type SpendingByCategoryResponse = Schemas['SpendingByCategory'];
