import type { Money } from '~/util/money';

export const ACCOUNT_TYPES = ['CHECKING', 'SAVINGS', 'WALLET', 'INVESTMENT'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** `CASH` (corrente, poupança, carteira) ou `INVESTMENT`: decide em que seletores a conta aparece. */
export type Liquidity = 'CASH' | 'INVESTMENT';
export type AccountStatus = 'ACTIVE' | 'ARCHIVED';

/**
 * Conta como a API devolve. `currentBalance`, `openingEditable` e `archivable` vêm calculados pelo
 * backend: o front só exibe e habilita/desabilita ações (S-62, S-79). Nunca soma saldos.
 */
export interface Account {
  readonly id: string;
  readonly name: string;
  readonly type: AccountType;
  readonly liquidity: Liquidity;
  readonly institution: string | null;
  readonly openingBalance: Money;
  /** `YYYY-MM-DD`. */
  readonly openingDate: string;
  readonly currentBalance: Money;
  readonly status: AccountStatus;
  /** Sem movimentação ativa: tipo, saldo inicial e data podem ser corrigidos. */
  readonly openingEditable: boolean;
  /** Ativa e com saldo zero em todas as datas. */
  readonly archivable: boolean;
  /** Σ reservas de metas nesta conta (Etapa 5, S-147): lógica, **não** muda `currentBalance`. */
  readonly reservedAmount: Money;
  /**
   * "Reserva descoberta" (S-148): o reservado passa do saldo. Só avisa; nunca bloqueia. Derivado no
   * backend (campo opcional na resposta: ausente = `false`).
   */
  readonly uncovered: boolean;
  readonly version: number;
}
