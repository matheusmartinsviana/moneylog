import type { DebtSliceResponse } from '~/modules/debts/infra/responses/debt.response';

/** Ambiente mock (S-67): nenhuma dívida cadastrada. Mesmo formato bruto da API. */
export const EMPTY_DEBTS: DebtSliceResponse = { items: [], hasNext: false };
