import { Observable } from 'rxjs';

import type { BillingChangePreview } from '~/modules/cards/core/types/billing-change-preview';
import type { Card, CardInput, CardStatus, CardUpdate } from '~/modules/cards/core/types/card';
import type {
  FutureInstallments,
  Invoice,
  InvoicePaymentInput,
  InvoiceSummary,
  PaymentPreview,
} from '~/modules/cards/core/types/invoice';
import type {
  PurchasePreview,
  PurchasePreviewRequest,
} from '~/modules/cards/core/types/purchase-preview';
import type { Slice } from '~/util/api/slice';

export interface CardsQuery {
  /** Sem `status`, o backend assume `ACTIVE` (S-126). */
  readonly status?: CardStatus;
  readonly page: number;
  readonly pageSize: number;
}

export interface InvoicesQuery {
  /** Primeiro fechamento (inclusive), `YYYY-MM-DD`. */
  readonly from?: string;
  readonly to?: string;
  readonly page: number;
  readonly pageSize: number;
}

/**
 * Porta de cartões e faturas (FE 01). As implementações falham com `ProblemError`
 * (`~/util/api/problem`), com o `code` do contrato (`CARD_HAS_PENDING_BALANCE`,
 * `CARD_BILLING_CHANGE_STALE`, `INVOICE_NOT_PAYABLE`, `VERSION_CONFLICT`...).
 */
export abstract class CardsGateway {
  abstract list(query: CardsQuery): Observable<Slice<Card>>;
  abstract get(id: string): Observable<Card>;
  abstract create(input: CardInput): Observable<Card>;
  abstract update(id: string, input: CardUpdate): Observable<Card>;
  abstract archive(id: string): Observable<Card>;
  abstract unarchive(id: string): Observable<Card>;
  /** Marca o fechamento como confirmado (ou não) por documento; devolve o cartão do backend. */
  abstract setClosingConfirmation(
    id: string,
    confirmed: boolean,
    version: number,
  ): Observable<Card>;

  abstract listInvoices(cardId: string, query: InvoicesQuery): Observable<Slice<InvoiceSummary>>;
  abstract futureInstallments(cardId: string): Observable<FutureInstallments>;

  /** Sem efeito colateral: o backend calcula parcelas, fatura alvo e limite (S-124). */
  abstract previewPurchase(
    cardId: string,
    request: PurchasePreviewRequest,
  ): Observable<PurchasePreview>;

  /** Sem efeito colateral (S-128). */
  abstract previewBillingChange(
    cardId: string,
    closingDay: number,
    dueDay: number,
  ): Observable<BillingChangePreview>;

  abstract getInvoice(id: string): Observable<Invoice>;

  /** Sem efeito colateral (S-136). `amount` é a string decimal digitada. */
  abstract previewPayment(invoiceId: string, amount: string): Observable<PaymentPreview>;

  /** `Idempotency-Key` obrigatório: uma por tentativa de envio (S-72). Devolve a fatura atualizada. */
  abstract payInvoice(
    invoiceId: string,
    input: InvoicePaymentInput,
    idempotencyKey: string,
  ): Observable<Invoice>;
}
