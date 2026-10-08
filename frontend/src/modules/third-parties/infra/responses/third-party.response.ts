import type { components } from '~/util/api/schema.gen';

type Schemas = components['schemas'];

/** Respostas e corpos = schemas gerados do contrato (S-66). */
export type ThirdPartyReceivablesResponse = Schemas['ThirdPartyReceivables'];
export type ThirdPartyExpenseResponse = Schemas['ThirdPartyExpense'];
export type ThirdPartyExpenseRequest = Schemas['ThirdPartyExpenseInput'];
