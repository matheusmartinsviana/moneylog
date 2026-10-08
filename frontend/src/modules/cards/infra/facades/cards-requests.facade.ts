import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';

import {
  CardsGateway,
  CardsQuery,
  InvoicesQuery,
} from '~/modules/cards/core/interfaces/cards.gateway';
import type { BillingChangePreview } from '~/modules/cards/core/types/billing-change-preview';
import type { Card, CardInput, CardUpdate } from '~/modules/cards/core/types/card';
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
import {
  CARDS_ENDPOINTS,
  IDEMPOTENCY_HEADER,
  INVOICES_ENDPOINTS,
} from '~/modules/cards/infra/endpoints';
import {
  toBillingChangePreview,
  toCard,
  toCreateRequest,
  toFutureInstallments,
  toInvoice,
  toInvoiceSummary,
  toPaymentBody,
  toPaymentPreview,
  toPurchasePreview,
  toPurchasePreviewBody,
  toUpdateRequest,
} from '~/modules/cards/infra/facades/cards-response.mapper';
import type {
  BillingChangePreviewResponse,
  CardResponse,
  CardSliceResponse,
  FutureInstallmentsResponse,
  InvoiceResponse,
  InvoiceSliceResponse,
  PaymentPreviewResponse,
  PurchasePreviewResponse,
} from '~/modules/cards/infra/responses/card.response';
import { EMPTY_CARDS, EMPTY_INVOICES } from '~/modules/cards/mock-data/empty-cards';
import { Problem, ProblemError, toProblem } from '~/util/api/problem';
import type { Slice } from '~/util/api/slice';
import { API_MOCKS, mockResponse } from '~/util/api-mocks';

/** Falha de rede/HTTP → `ProblemError` tipado (o core nunca vê `HttpErrorResponse`). */
function fail(error: unknown): Observable<never> {
  return throwError(() => new ProblemError(toProblem(error)));
}

/** Ambiente mock: o "banco" está vazio, então qualquer cartão ou fatura pedido por id não existe. */
function notFound(code: 'CARD_NOT_FOUND' | 'INVOICE_NOT_FOUND'): Observable<never> {
  const problem: Problem = {
    status: 404,
    code,
    fieldErrors: [],
    traceId: null,
    retryAfterSeconds: null,
  };
  return throwError(() => new ProblemError(problem));
}

/**
 * Facade de requisições de cartões e faturas (FE 05): o único lugar com HTTP do módulo. Com
 * `API_MOCKS` ligado, responde com `mock-data` vazio e não faz requisição; desligado, chama `/v1`.
 */
@Injectable({ providedIn: 'root' })
export class CardsRequestsFacade extends CardsGateway {
  private readonly http = inject(HttpClient);
  private readonly useMocks = inject(API_MOCKS);

  list(query: CardsQuery): Observable<Slice<Card>> {
    if (this.useMocks) {
      return of(this.toSlice(mockResponse(CARDS_ENDPOINTS.collection, EMPTY_CARDS)));
    }
    let params = new HttpParams().set('page', query.page).set('pageSize', query.pageSize);
    if (query.status) params = params.set('status', query.status);
    return this.http.get<CardSliceResponse>(CARDS_ENDPOINTS.collection, { params }).pipe(
      map((slice) => this.toSlice(slice)),
      catchError(fail),
    );
  }

  get(id: string): Observable<Card> {
    if (this.useMocks) return notFound('CARD_NOT_FOUND');
    return this.http
      .get<CardResponse>(CARDS_ENDPOINTS.item(id))
      .pipe(map(toCard), catchError(fail));
  }

  create(input: CardInput): Observable<Card> {
    if (this.useMocks) {
      // Sem persistência no mock: devolve o cartão como o backend o devolveria.
      const body = toCreateRequest(input);
      return of(
        toCard({
          id: '00000000-0000-4000-8000-0000000000c1',
          name: body.name,
          institution: body.institution ?? null,
          limit: body.limit ?? null,
          availableLimit: body.limit ?? null,
          overLimit: false,
          creditBalance: { amount: '0.00', currency: 'BRL' },
          usedRatio: body.limit ? 0 : null,
          closingDay: body.closingDay,
          dueDay: body.dueDay,
          defaultPaymentAccountId: body.defaultPaymentAccountId ?? null,
          status: 'ACTIVE',
          currentInvoice: null,
          totalCommitted: { amount: '0.00', currency: 'BRL' },
          committedFuture: { amount: '0.00', currency: 'BRL' },
          closingConfirmed: true,
          archivable: true,
          version: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        }),
      );
    }
    return this.http
      .post<CardResponse>(CARDS_ENDPOINTS.collection, toCreateRequest(input))
      .pipe(map(toCard), catchError(fail));
  }

  update(id: string, input: CardUpdate): Observable<Card> {
    if (this.useMocks) return notFound('CARD_NOT_FOUND');
    return this.http
      .put<CardResponse>(CARDS_ENDPOINTS.item(id), toUpdateRequest(input))
      .pipe(map(toCard), catchError(fail));
  }

  archive(id: string): Observable<Card> {
    return this.action(CARDS_ENDPOINTS.archive(id));
  }

  unarchive(id: string): Observable<Card> {
    return this.action(CARDS_ENDPOINTS.unarchive(id));
  }

  setClosingConfirmation(id: string, confirmed: boolean, version: number): Observable<Card> {
    if (this.useMocks) return notFound('CARD_NOT_FOUND');
    return this.http
      .post<CardResponse>(CARDS_ENDPOINTS.closingConfirmation(id), { confirmed, version })
      .pipe(map(toCard), catchError(fail));
  }

  listInvoices(cardId: string, query: InvoicesQuery): Observable<Slice<InvoiceSummary>> {
    if (this.useMocks) return of(this.toInvoiceSlice(EMPTY_INVOICES));
    let params = new HttpParams().set('page', query.page).set('pageSize', query.pageSize);
    if (query.from) params = params.set('from', query.from);
    if (query.to) params = params.set('to', query.to);
    return this.http.get<InvoiceSliceResponse>(CARDS_ENDPOINTS.invoices(cardId), { params }).pipe(
      map((slice) => this.toInvoiceSlice(slice)),
      catchError(fail),
    );
  }

  futureInstallments(cardId: string): Observable<FutureInstallments> {
    if (this.useMocks) return notFound('CARD_NOT_FOUND');
    return this.http
      .get<FutureInstallmentsResponse>(CARDS_ENDPOINTS.futureInstallments(cardId))
      .pipe(map(toFutureInstallments), catchError(fail));
  }

  previewPurchase(cardId: string, request: PurchasePreviewRequest): Observable<PurchasePreview> {
    if (this.useMocks) return notFound('CARD_NOT_FOUND');
    return this.http
      .post<PurchasePreviewResponse>(
        CARDS_ENDPOINTS.purchasePreview(cardId),
        toPurchasePreviewBody(request),
      )
      .pipe(map(toPurchasePreview), catchError(fail));
  }

  previewBillingChange(
    cardId: string,
    closingDay: number,
    dueDay: number,
  ): Observable<BillingChangePreview> {
    if (this.useMocks) return notFound('CARD_NOT_FOUND');
    const params = new HttpParams().set('closingDay', closingDay).set('dueDay', dueDay);
    return this.http
      .get<BillingChangePreviewResponse>(CARDS_ENDPOINTS.billingChangePreview(cardId), { params })
      .pipe(map(toBillingChangePreview), catchError(fail));
  }

  getInvoice(id: string): Observable<Invoice> {
    if (this.useMocks) return notFound('INVOICE_NOT_FOUND');
    return this.http
      .get<InvoiceResponse>(INVOICES_ENDPOINTS.item(id))
      .pipe(map(toInvoice), catchError(fail));
  }

  previewPayment(invoiceId: string, amount: string): Observable<PaymentPreview> {
    if (this.useMocks) return notFound('INVOICE_NOT_FOUND');
    const params = new HttpParams().set('amount', amount);
    return this.http
      .get<PaymentPreviewResponse>(INVOICES_ENDPOINTS.paymentPreview(invoiceId), { params })
      .pipe(map(toPaymentPreview), catchError(fail));
  }

  payInvoice(
    invoiceId: string,
    input: InvoicePaymentInput,
    idempotencyKey: string,
  ): Observable<Invoice> {
    if (this.useMocks) return notFound('INVOICE_NOT_FOUND');
    return this.http
      .post<InvoiceResponse>(INVOICES_ENDPOINTS.payments(invoiceId), toPaymentBody(input), {
        headers: new HttpHeaders().set(IDEMPOTENCY_HEADER, idempotencyKey),
      })
      .pipe(map(toInvoice), catchError(fail));
  }

  private action(url: string): Observable<Card> {
    if (this.useMocks) return notFound('CARD_NOT_FOUND');
    return this.http.post<CardResponse>(url, null).pipe(map(toCard), catchError(fail));
  }

  private toSlice(slice: CardSliceResponse): Slice<Card> {
    return { items: slice.items.map(toCard), hasNext: slice.hasNext };
  }

  private toInvoiceSlice(slice: InvoiceSliceResponse): Slice<InvoiceSummary> {
    return { items: slice.items.map(toInvoiceSummary), hasNext: slice.hasNext };
  }
}
