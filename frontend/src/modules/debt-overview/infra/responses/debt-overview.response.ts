import type { components } from '~/util/api/schema.gen';

type Schemas = components['schemas'];

/** Respostas e corpos = schemas gerados do contrato (S-66). */
export type DebtOverviewResponse = Schemas['DebtOverview'];
export type OngoingInstallmentsRequest = Schemas['OngoingInstallmentsRequest'];
export type OngoingPreviewResponse = Schemas['OngoingPreview'];
export type OngoingTransactionResponse = Schemas['Transaction'];
