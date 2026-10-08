import type { ThirdPartyReceivablesResponse } from '~/modules/third-parties/infra/responses/third-party.response';

/** Ambiente mock (S-67): nada a receber. Mesmo formato bruto da API. */
export function emptyReceivables(month: string | null): ThirdPartyReceivablesResponse {
  const zero = { amount: '0.00', currency: 'BRL' as const };
  return {
    asOf: '1970-01-01',
    owed: zero,
    received: zero,
    pending: zero,
    people: [],
    month: {
      competence: month ?? '1970-01',
      grossConsumption: zero,
      refunds: zero,
      personalNet: zero,
      thirdPartyConsumption: zero,
      thirdPartyReimbursed: zero,
      thirdPartyPending: zero,
    },
  };
}
