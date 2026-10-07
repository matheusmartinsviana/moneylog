import type { DebtSummary } from '~/util/debt';
import type { Money } from '~/util/money';

export type PersonStatus = 'ACTIVE' | 'ARCHIVED';

/** Sinal de `net` para a frase da tela ("João deve", "você deve"); `NONE` quando `net` é zero. */
export type PersonDirection = 'RECEIVABLE' | 'PAYABLE' | 'NONE';

/** Moeda das dívidas: só BRL no MVP (S-2). */
export const PERSON_CURRENCY = 'BRL';

/**
 * Pessoa como a API devolve. `net` (com sinal: positivo = me devem), `direction`, `openDebts` e
 * `nextDueDate` vêm calculados pelo backend (S-142): o front só escolhe a frase.
 */
export interface Person {
  readonly id: string;
  readonly name: string;
  readonly notes: string | null;
  readonly archived: boolean;
  readonly net: Money;
  readonly direction: PersonDirection;
  readonly openDebts: number;
  /** `YYYY-MM-DD`: menor previsão entre as dívidas em aberto; `null` se não há. */
  readonly nextDueDate: string | null;
  readonly version: number;
}

/** A pessoa + o histórico de dívidas (abertas e encerradas, da mais recente para a mais antiga). */
export interface PersonDetail extends Person {
  readonly debts: readonly DebtSummary[];
}

export interface PersonInput {
  readonly name: string;
  readonly notes: string | null;
}

export interface PersonUpdate extends PersonInput {
  readonly version: number;
}
