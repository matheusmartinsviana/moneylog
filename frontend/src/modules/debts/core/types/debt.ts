import type { DebtDirection, DebtStatus, PersonRef } from '~/util/debt';
import type { Money } from '~/util/money';

export type { DebtDirection, DebtStatus, PersonRef };

/** Moeda das dívidas: só BRL no MVP (S-2). */
export const DEBT_CURRENCY = 'BRL';

export type DebtOrigin = 'WITH_MOVEMENT' | 'WITHOUT_MOVEMENT';

/**
 * Por que o **registro** da dívida não pode ser estornado: quitação ativa, dívida encerrada ou
 * nascida de uma movimentação (o caminho é estornar a movimentação de origem).
 */
export type DebtVoidBlockedBy = 'DEBT_HAS_SETTLEMENTS' | 'DEBT_CLOSED' | 'HAS_ORIGIN_TRANSACTION';

/** Quitação: a movimentação real (`MONEY_RECEIVED` de devolução ou `DEBT_PAYMENT`). */
export interface DebtSettlement {
  readonly transactionId: string;
  readonly amount: Money;
  readonly date: string;
  /** `false` na quitação cuja movimentação foi estornada (fica no histórico). */
  readonly active: boolean;
}

/**
 * Dívida como a API devolve. `principal`, `settled`, `outstanding`, `status`, `overdue`, `cancelable`
 * e `voidable` vêm calculados pelo backend: o front só exibe e habilita as ações (S-41, S-141, S-145).
 */
export interface Debt {
  readonly id: string;
  readonly person: PersonRef;
  readonly direction: DebtDirection;
  readonly origin: DebtOrigin;
  readonly originTransactionId: string | null;
  readonly principal: Money;
  readonly settled: Money;
  readonly outstanding: Money;
  readonly status: DebtStatus;
  readonly date: string;
  readonly expectedDate: string | null;
  readonly overdue: boolean;
  readonly description: string | null;
  /** Categoria da dívida `PAYABLE` sem movimentação que nasceu de consumo (S-137). */
  readonly category: { readonly id: string; readonly name: string } | null;
  readonly closureDate: string | null;
  readonly closureReason: string | null;
  readonly settlements: readonly DebtSettlement[];
  readonly cancelable: boolean;
  readonly voidable: boolean;
  readonly voidBlockedBy: DebtVoidBlockedBy | null;
  readonly version: number;
}

/** Dívida sem movimentação (`POST /v1/debts`). `principal` é a string decimal digitada. */
export interface DebtInput {
  readonly personId: string;
  readonly direction: DebtDirection;
  readonly principal: string;
  readonly date: string;
  readonly expectedDate: string | null;
  readonly description: string;
  /** Só em `PAYABLE` ("gasto que alguém pagou por você", S-137). */
  readonly categoryId: string | null;
}

export interface DebtUpdate {
  readonly description: string;
  readonly expectedDate: string | null;
  readonly version: number;
}
