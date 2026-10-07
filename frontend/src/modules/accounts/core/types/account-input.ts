import type { AccountType } from '~/modules/accounts/core/types/account';

/** Criação (`POST /v1/accounts`). `openingBalance` é a string decimal (`"0.00"`, pode ser negativa). */
export interface AccountInput {
  readonly name: string;
  readonly type: AccountType;
  readonly institution: string | null;
  /** Omitidos = o servidor usa saldo zero e a data de hoje. */
  readonly openingBalance?: string;
  readonly openingDate?: string;
}

/**
 * Edição (`PUT /v1/accounts/{id}`): `type`, `openingBalance` e `openingDate` só com
 * `openingEditable = true`; a tela não os envia quando estão travados.
 */
export interface AccountUpdate {
  readonly name: string;
  readonly institution: string | null;
  readonly type?: AccountType;
  readonly openingBalance?: string;
  readonly openingDate?: string;
  readonly version: number;
}

/** Moeda das contas: só BRL no MVP (S-2). */
export const ACCOUNT_CURRENCY = 'BRL';
