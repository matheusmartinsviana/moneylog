import type { AccountSliceResponse } from '~/modules/accounts/infra/responses/account.response';

/** Ambiente mock (S-67): o usuário ainda não tem conta nenhuma. Mesmo formato bruto da API. */
export const EMPTY_ACCOUNTS: AccountSliceResponse = { items: [], hasNext: false };
