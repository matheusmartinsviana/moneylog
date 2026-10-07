import type { BillingChangePreview } from '~/modules/cards/core/types/billing-change-preview';
import type { Card, CardInput, CardUpdate } from '~/modules/cards/core/types/card';
import type {
  FutureInstallments,
  Invoice,
  InvoiceItem,
  InvoicePaymentInput,
  InvoiceRef,
  InvoiceSummary,
  PaymentPreview,
} from '~/modules/cards/core/types/invoice';
import type {
  PurchasePreview,
  PurchasePreviewRequest,
} from '~/modules/cards/core/types/purchase-preview';
import type {
  BillingChangePreviewResponse,
  CardCreateRequest,
  CardResponse,
  CardUpdateRequest,
  FutureInstallmentsResponse,
  InvoiceItemResponse,
  InvoicePaymentRequest,
  InvoiceRefResponse,
  InvoiceResponse,
  InvoiceSummaryResponse,
  PaymentPreviewResponse,
  PurchasePreviewRequestBody,
  PurchasePreviewResponse,
} from '~/modules/cards/infra/responses/card.response';
import type { Money } from '~/util/money';

/**
 * Resposta → tipos do core. Só copia campos: nenhum valor é somado, subtraído, arredondado nem
 * convertido para `number` (arquitetura §1). `usedRatio` é a única razão numérica e vem pronta.
 */
const money = (value: { amount: string; currency: string }): Money => ({
  amount: value.amount,
  currency: value.currency,
});

export function toInvoiceSummary(response: InvoiceSummaryResponse): InvoiceSummary {
  return {
    id: response.id,
    cardId: response.cardId,
    referenceMonth: response.referenceMonth,
    periodStart: response.periodStart,
    closingDate: response.closingDate,
    dueDate: response.dueDate,
    status: response.status,
    total: money(response.total),
    carryIn: money(response.carryIn),
    paid: money(response.paid),
    outstanding: money(response.outstanding),
    creditCarry: money(response.creditCarry),
    hasLateEntries: response.hasLateEntries,
  };
}

export function toInvoiceItem(response: InvoiceItemResponse): InvoiceItem {
  return {
    kind: response.kind,
    transactionId: response.transactionId,
    description: response.description,
    number: response.number,
    totalInstallments: response.totalInstallments,
    amount: money(response.amount),
    date: response.date,
    lateEntry: response.lateEntry,
  };
}

export function toInvoice(response: InvoiceResponse): Invoice {
  return {
    ...toInvoiceSummary(response),
    items: response.items.map(toInvoiceItem),
    payments: response.payments.map((payment) => ({
      transactionId: payment.transactionId,
      accountId: payment.accountId,
      amount: money(payment.amount),
      date: payment.date,
    })),
  };
}

export function toInvoiceRef(response: InvoiceRefResponse): InvoiceRef {
  return {
    id: response.id,
    referenceMonth: response.referenceMonth,
    closingDate: response.closingDate,
    dueDate: response.dueDate,
    status: response.status,
  };
}

export function toCard(response: CardResponse): Card {
  return {
    id: response.id,
    name: response.name,
    institution: response.institution,
    limit: money(response.limit),
    availableLimit: money(response.availableLimit),
    overLimit: response.overLimit,
    creditBalance: money(response.creditBalance),
    usedRatio: response.usedRatio,
    closingDay: response.closingDay,
    dueDay: response.dueDay,
    defaultPaymentAccountId: response.defaultPaymentAccountId,
    status: response.status,
    currentInvoice: response.currentInvoice ? toInvoiceSummary(response.currentInvoice) : null,
    totalCommitted: money(response.totalCommitted),
    committedFuture: money(response.committedFuture),
    archivable: response.archivable,
    version: response.version,
  };
}

export function toFutureInstallments(response: FutureInstallmentsResponse): FutureInstallments {
  return {
    total: money(response.total),
    byInvoice: response.byInvoice.map((invoice) => ({
      invoiceId: invoice.invoiceId,
      referenceMonth: invoice.referenceMonth,
      dueDate: invoice.dueDate,
      amount: money(invoice.amount),
      items: invoice.items.map(toInvoiceItem),
    })),
  };
}

export function toPurchasePreview(response: PurchasePreviewResponse): PurchasePreview {
  return {
    installments: response.installments.map((installment) => ({
      number: installment.number,
      total: installment.total,
      amount: money(installment.amount),
      competence: installment.competence,
      invoice: toInvoiceRef(installment.invoice),
      lateEntry: installment.lateEntry,
    })),
    total: money(response.total),
    availableLimitAfter: money(response.availableLimitAfter),
    overLimit: response.overLimit,
    warnings: [...response.warnings],
  };
}

export function toBillingChangePreview(
  response: BillingChangePreviewResponse,
): BillingChangePreview {
  return {
    effectiveFromClosingDate: response.effectiveFromClosingDate,
    firstNewInvoice: {
      closingDate: response.firstNewInvoice.closingDate,
      dueDate: response.firstNewInvoice.dueDate,
    },
    movedInstallments: response.movedInstallments,
    movedCredits: response.movedCredits,
    notice: response.notice,
  };
}

export function toPaymentPreview(response: PaymentPreviewResponse): PaymentPreview {
  return {
    kind: response.kind,
    outstandingAfter: money(response.outstandingAfter),
    creditCarryAfter: money(response.creditCarryAfter),
  };
}

const BRL = 'BRL' as const;

export function toCreateRequest(input: CardInput): CardCreateRequest {
  const institution = input.institution?.trim() ?? '';
  return {
    name: input.name,
    institution: institution === '' ? null : institution,
    limit: { amount: input.limit, currency: BRL },
    closingDay: input.closingDay,
    dueDay: input.dueDay,
    defaultPaymentAccountId: input.defaultPaymentAccountId,
  };
}

export function toUpdateRequest(input: CardUpdate): CardUpdateRequest {
  return {
    ...toCreateRequest(input),
    confirmedEffectiveFrom: input.confirmedEffectiveFrom,
    version: input.version,
  };
}

export function toPurchasePreviewBody(request: PurchasePreviewRequest): PurchasePreviewRequestBody {
  return { amount: request.amount, installments: request.installments, date: request.date };
}

export function toPaymentBody(input: InvoicePaymentInput): InvoicePaymentRequest {
  return { accountId: input.accountId, amount: input.amount, date: input.date };
}
