import type { Money } from '~/util/money';

/** `RECEIVABLE` = "me devem" (ativo); `PAYABLE` = "eu devo" (passivo). */
export type DebtDirection = 'RECEIVABLE' | 'PAYABLE';

/**
 * Status **derivado** pelo backend (S-41): `OPEN`, `PARTIALLY_SETTLED` e `SETTLED` vêm das quitações
 * ativas; `CANCELED` (perdão) e `VOIDED` (estorno) são o encerramento gravado.
 */
export type DebtStatus = 'OPEN' | 'PARTIALLY_SETTLED' | 'SETTLED' | 'CANCELED' | 'VOIDED';

/** Dívida ainda em aberto (a tela só decide o agrupamento, nenhum valor é calculado). */
export function isOpenStatus(status: DebtStatus): boolean {
  return status === 'OPEN' || status === 'PARTIALLY_SETTLED';
}

export interface PersonRef {
  readonly id: string;
  readonly name: string;
}

/**
 * Dívida resumida (dentro de `Transaction.debt`, `Transaction.shares` e `PersonDetail.debts`).
 * `principal`, `settled` e `outstanding` vêm calculados pelo backend (nunca somados no front).
 */
export interface DebtSummary {
  readonly id: string;
  readonly person: PersonRef;
  readonly direction: DebtDirection;
  readonly status: DebtStatus;
  readonly principal: Money;
  readonly settled: Money;
  readonly outstanding: Money;
  /** `YYYY-MM-DD`. */
  readonly date: string;
  readonly expectedDate: string | null;
  /** Derivado pelo backend (S-145): previsão anterior a hoje e saldo em aberto. */
  readonly overdue: boolean;
  readonly description: string | null;
}

/** Forma da dívida resumida na resposta da API (a infra passa o schema gerado, que a satisfaz). */
export interface DebtSummaryResponse {
  readonly id: string;
  readonly person: { readonly id: string; readonly name: string };
  readonly direction: DebtDirection;
  readonly status: DebtStatus;
  readonly principal: { readonly amount: string; readonly currency: string };
  readonly settled: { readonly amount: string; readonly currency: string };
  readonly outstanding: { readonly amount: string; readonly currency: string };
  readonly date: string;
  readonly expectedDate: string | null;
  readonly overdue: boolean;
  readonly description: string | null;
}

const money = (value: { amount: string; currency: string }): Money => ({
  amount: value.amount,
  currency: value.currency,
});

/** Resposta → tipo do core. Só copia campos. */
export function toDebtSummary(response: DebtSummaryResponse): DebtSummary {
  return {
    id: response.id,
    person: { id: response.person.id, name: response.person.name },
    direction: response.direction,
    status: response.status,
    principal: money(response.principal),
    settled: money(response.settled),
    outstanding: money(response.outstanding),
    date: response.date,
    expectedDate: response.expectedDate,
    overdue: response.overdue,
    description: response.description,
  };
}
