import type { components } from '~/util/api/schema.gen';

/**
 * Respostas brutas do backend = os schemas gerados de `contracts/openapi.yaml` (S-66). Ficam na
 * infra e não vazam para `src/app` (T19 CA5): a facade de requisições mapeia para os tipos do
 * `core`. Mudou o contrato, o `typecheck` quebra no mapper.
 */
type Schemas = components['schemas'];

export type MoneyResponse = Schemas['Money'];
export type DashboardSummaryResponse = Schemas['DashboardSummary'];
export type UpcomingResponse = Schemas['Upcoming'];
export type UpcomingItemResponse = Schemas['UpcomingItem'];
export type UpcomingInstallmentResponse = Schemas['UpcomingChild'];
