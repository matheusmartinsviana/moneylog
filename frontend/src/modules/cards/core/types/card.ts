import type { InvoiceSummary } from '~/modules/cards/core/types/invoice';
import type { Money } from '~/util/money';

export type CardStatus = 'ACTIVE' | 'ARCHIVED';

/** Moeda dos cartões: só BRL no MVP (S-2). */
export const CARD_CURRENCY = 'BRL';

/**
 * Cartão como a API devolve. `availableLimit`, `overLimit`, `creditBalance`, `usedRatio`,
 * `totalCommitted` e `committedFuture` vêm calculados (S-129): o front só exibe. Os dois "comprometidos"
 * são **disjuntos** e nunca se somam na tela (PR 01, regra 1). Nunca há número, CVV ou bandeira.
 */
export interface Card {
  readonly id: string;
  readonly name: string;
  readonly institution: string | null;
  /** `null` = limite ainda não definido: sem barra, sem percentual, sem "disponível" (nada se calcula no front). */
  readonly limit: Money | null;
  readonly availableLimit: Money | null;
  readonly overLimit: boolean;
  readonly creditBalance: Money;
  /** Razão 0..1 do limite usado, do backend, só para a largura da barra. */
  readonly usedRatio: number | null;
  readonly closingDay: number;
  readonly dueDay: number;
  readonly defaultPaymentAccountId: string | null;
  readonly status: CardStatus;
  readonly currentInvoice: InvoiceSummary | null;
  /** Fatura corrente + fechadas/atrasadas, ainda por pagar. */
  readonly totalCommitted: Money;
  /** Parcelas já assumidas que ainda não caíram numa fatura (faturas `FUTURE`). */
  readonly committedFuture: Money;
  /** `false` = o dia de fechamento é provisório (não confirmado por documento). */
  readonly closingConfirmed: boolean;
  readonly archivable: boolean;
  readonly version: number;
}

/** Criação (`POST /v1/cards`). `limit` é a string decimal digitada. */
export interface CardInput {
  readonly name: string;
  readonly institution: string | null;
  /** Decimal digitado; `null` = definir depois. */
  readonly limit: string | null;
  readonly closingDay: number;
  readonly dueDay: number;
  readonly defaultPaymentAccountId: string | null;
}

/**
 * Edição (`PUT /v1/cards/{id}`). Mudar `closingDay`/`dueDay` exige `confirmedEffectiveFrom`, o
 * `effectiveFromClosingDate` da prévia (T58); sem mudança de dia, vai `null`.
 */
export interface CardUpdate extends CardInput {
  readonly version: number;
  readonly confirmedEffectiveFrom: string | null;
}
