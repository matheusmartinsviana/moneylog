import type { Money } from '~/util/money';

/** Moeda: só BRL no MVP (S-2). Os valores exibidos usam a moeda do dado. */
export const THIRD_PARTY_CURRENCY = 'BRL';

/**
 * Um lançamento a receber: empréstimo concedido (`DEBT`), despesa marcada como de terceiro (`EXPENSE`) ou
 * recebimento já refletido no saldo, de origem a confirmar (`RECEIPT`, sem movimento de conta).
 */
export interface ThirdPartyItem {
  readonly source: 'DEBT' | 'EXPENSE' | 'RECEIPT';
  /** Id da dívida (`DEBT`) ou da movimentação marcada (`EXPENSE`). */
  readonly refId: string;
  readonly description: string | null;
  readonly date: string;
  readonly expectedDate: string | null;
  readonly owed: Money;
  readonly received: Money;
  readonly pending: Money;
  /** Estado do backend (texto do contrato, sem enum). */
  readonly status: string;
}

export interface ThirdPartyPerson {
  readonly personId: string;
  readonly name: string;
  readonly owed: Money;
  readonly received: Money;
  readonly pending: Money;
  readonly items: readonly ThirdPartyItem[];
}

/**
 * Gasto bruto x terceiros x líquido do mês, **como o servidor devolve** (nada é recalculado aqui).
 * `grossConsumption` = bruto antes dos reembolsos; `personalNet` = bruto − reembolsos.
 */
export interface ThirdPartyMonth {
  /** `YYYY-MM`. */
  readonly competence: string;
  readonly grossConsumption: Money;
  readonly refunds: Money;
  readonly personalNet: Money;
  readonly thirdPartyConsumption: Money;
  readonly thirdPartyReimbursed: Money;
  readonly thirdPartyPending: Money;
}

/** `GET /v1/debts/third-party-receivables`: separado de patrimônio, renda e despesas pessoais. */
export interface ThirdPartyReceivables {
  readonly asOf: string;
  readonly owed: Money;
  readonly received: Money;
  readonly pending: Money;
  readonly people: readonly ThirdPartyPerson[];
  readonly month: ThirdPartyMonth;
}

/**
 * Recebimento de terceiro **sem movimento de conta** (`POST /v1/third-party-receipts`): o dinheiro já
 * está no saldo observado; nunca é renda nem consumo.
 */
export interface ThirdPartyReceipt {
  readonly id: string;
  readonly personId: string;
  readonly transactionId: string | null;
  readonly amount: Money;
  readonly receivedOn: string | null;
  readonly note: string | null;
}

export interface ThirdPartyReceiptInput {
  readonly personId: string;
  /** Despesa marcada da mesma pessoa; `null` = sem vínculo ("origem a confirmar"). */
  readonly transactionId: string | null;
  /** Decimal digitado. */
  readonly amount: string;
  readonly receivedOn: string | null;
  readonly note: string | null;
}

/** A marca de uma despesa como de terceiro (`POST /v1/third-party-expenses`). */
export interface ThirdPartyExpense {
  readonly id: string;
  readonly transactionId: string;
  readonly personId: string;
  readonly note: string | null;
}

export interface ThirdPartyExpenseInput {
  readonly transactionId: string;
  readonly personId: string;
  readonly note: string | null;
}
