import type { Money } from '~/util/money';

export const INVOICE_STATUSES = ['FUTURE', 'OPEN', 'CLOSED', 'OVERDUE', 'PAID'] as const;
/** Derivado pelo backend na leitura (S-37): o front só mostra. */
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/**
 * Fatura sem itens (lista do cartão e `Card.currentInvoice`). Todos os valores são os do backend:
 * `total`, `carryIn`, `paid`, `outstanding` e `creditCarry` nunca são recalculados no front.
 */
export interface InvoiceSummary {
  readonly id: string;
  readonly cardId: string;
  /** Competência de referência `YYYY-MM` (o mês do vencimento). */
  readonly referenceMonth: string;
  /** Fechamento anterior (inclusive), `YYYY-MM-DD`. */
  readonly periodStart: string;
  readonly closingDate: string;
  readonly dueDate: string;
  readonly status: InvoiceStatus;
  readonly total: Money;
  readonly carryIn: Money;
  readonly paid: Money;
  readonly outstanding: Money;
  readonly creditCarry: Money;
  readonly hasLateEntries: boolean;
}

export type InvoiceItemKind = 'INSTALLMENT' | 'CREDIT';

/** Item ativo de uma fatura (parcela ou crédito). `amount` é sempre positivo; o sinal vem do `kind`. */
export interface InvoiceItem {
  readonly kind: InvoiceItemKind;
  readonly transactionId: string;
  readonly description: string;
  /** Número da parcela; `null` no crédito. */
  readonly number: number | null;
  readonly totalInstallments: number | null;
  readonly amount: Money;
  readonly date: string;
  readonly lateEntry: boolean;
}

export interface InvoicePayment {
  /** A movimentação `INVOICE_PAYMENT` (estorna-se por ela). */
  readonly transactionId: string;
  readonly accountId: string;
  readonly amount: Money;
  readonly date: string;
}

export interface Invoice extends InvoiceSummary {
  readonly items: readonly InvoiceItem[];
  readonly payments: readonly InvoicePayment[];
}

/** Referência curta a uma fatura (compra, prévia, movimentação). */
export interface InvoiceRef {
  readonly id: string;
  readonly referenceMonth: string;
  readonly closingDate: string;
  readonly dueDate: string;
  readonly status: InvoiceStatus;
}

export interface FutureInstallmentsInvoice {
  readonly invoiceId: string;
  readonly referenceMonth: string;
  readonly dueDate: string;
  /** Soma das parcelas desta fatura, feita pelo backend. */
  readonly amount: Money;
  readonly items: readonly InvoiceItem[];
}

export interface FutureInstallments {
  /** Mesmo valor de `Card.committedFuture`. */
  readonly total: Money;
  readonly byInvoice: readonly FutureInstallmentsInvoice[];
}

/** Corpo do pagamento (`POST /v1/invoices/{id}/payments`); `amount` é a string decimal digitada. */
export interface InvoicePaymentInput {
  readonly accountId: string;
  readonly amount: string;
  readonly date: string;
}

export type PaymentKind = 'FULL' | 'PARTIAL' | 'OVERPAY' | 'PREPAY';

/** Prévia do pagamento: o que o backend diria sem gravar (S-136). O front não subtrai. */
export interface PaymentPreview {
  readonly kind: PaymentKind;
  readonly outstandingAfter: Money;
  readonly creditCarryAfter: Money;
}
