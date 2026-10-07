import type { Account } from '~/modules/accounts/core/types/account';
import type { AccountInput, AccountUpdate } from '~/modules/accounts/core/types/account-input';
import { ACCOUNT_CURRENCY } from '~/modules/accounts/core/types/account-input';
import type {
  AccountCreateRequest,
  AccountResponse,
  AccountUpdateRequest,
} from '~/modules/accounts/infra/responses/account.response';

/**
 * Resposta → tipo do core. Só copia campos: `currentBalance`, `openingEditable` e `archivable`
 * chegam como a API calculou (nada é somado nem recalculado no front).
 */
export function toAccount(response: AccountResponse): Account {
  return {
    id: response.id,
    name: response.name,
    type: response.type,
    liquidity: response.liquidity,
    institution: response.institution,
    openingBalance: {
      amount: response.openingBalance.amount,
      currency: response.openingBalance.currency,
    },
    openingDate: response.openingDate,
    currentBalance: {
      amount: response.currentBalance.amount,
      currency: response.currentBalance.currency,
    },
    status: response.status,
    openingEditable: response.openingEditable,
    archivable: response.archivable,
    reservedAmount: response.reservedAmount
      ? { amount: response.reservedAmount.amount, currency: response.reservedAmount.currency }
      : { amount: '0.00', currency: response.currentBalance.currency },
    uncovered: response.uncovered ?? false,
    version: response.version,
  };
}

export function toCreateRequest(input: AccountInput): AccountCreateRequest {
  return {
    name: input.name,
    type: input.type,
    institution: input.institution,
    ...(input.openingBalance !== undefined
      ? { openingBalance: { amount: input.openingBalance, currency: ACCOUNT_CURRENCY } }
      : {}),
    ...(input.openingDate !== undefined ? { openingDate: input.openingDate } : {}),
  };
}

/** Só leva os campos de abertura quando a tela os enviou (`openingEditable = true`). */
export function toUpdateRequest(input: AccountUpdate): AccountUpdateRequest {
  return {
    name: input.name,
    institution: input.institution,
    version: input.version,
    ...(input.type !== undefined ? { type: input.type } : {}),
    ...(input.openingBalance !== undefined
      ? { openingBalance: { amount: input.openingBalance, currency: ACCOUNT_CURRENCY } }
      : {}),
    ...(input.openingDate !== undefined ? { openingDate: input.openingDate } : {}),
  };
}
