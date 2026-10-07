import { Provider } from '@angular/core';
import { Observable, of } from 'rxjs';

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
  InvoiceItem,
  InvoicePaymentInput,
  InvoiceSummary,
  PaymentPreview,
} from '~/modules/cards/core/types/invoice';
import type {
  PurchasePreview,
  PurchasePreviewRequest,
} from '~/modules/cards/core/types/purchase-preview';
import { brl } from '~/testing/accounts-testing';
import type { Slice } from '~/util/api/slice';

export function anInvoiceSummary(overrides: Partial<InvoiceSummary> = {}): InvoiceSummary {
  return {
    id: 'inv-1',
    cardId: 'card-1',
    referenceMonth: '2026-11',
    periodStart: '2026-09-25',
    closingDate: '2026-10-25',
    dueDate: '2026-11-05',
    status: 'OPEN',
    total: brl('1283.00'),
    carryIn: brl('0.00'),
    paid: brl('0.00'),
    outstanding: brl('1283.00'),
    creditCarry: brl('0.00'),
    hasLateEntries: false,
    ...overrides,
  };
}

export function anInvoiceItem(overrides: Partial<InvoiceItem> = {}): InvoiceItem {
  return {
    kind: 'INSTALLMENT',
    transactionId: 'tx-1',
    description: 'Notebook',
    number: 1,
    totalInstallments: 6,
    amount: brl('200.00'),
    date: '2026-10-10',
    lateEntry: false,
    ...overrides,
  };
}

export function anInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    ...anInvoiceSummary(),
    items: [anInvoiceItem()],
    payments: [],
    ...overrides,
  };
}

/** O cenário padrão do plano: cartão Roxinho, limite 10.000,00, 1.283,00 na fatura e 1.000,00 futuros. */
export function aCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    name: 'Roxinho',
    institution: 'Nubank',
    limit: brl('10000.00'),
    availableLimit: brl('7717.00'),
    overLimit: false,
    creditBalance: brl('0.00'),
    usedRatio: 0.2283,
    closingDay: 25,
    dueDay: 5,
    defaultPaymentAccountId: 'acc-1',
    status: 'ACTIVE',
    currentInvoice: anInvoiceSummary(),
    totalCommitted: brl('1283.00'),
    committedFuture: brl('1000.00'),
    archivable: false,
    version: 2,
    ...overrides,
  };
}

export function aPurchasePreview(overrides: Partial<PurchasePreview> = {}): PurchasePreview {
  const invoice = {
    id: 'inv-1',
    referenceMonth: '2026-11',
    closingDate: '2026-10-25',
    dueDate: '2026-11-05',
    status: 'OPEN' as const,
  };
  return {
    installments: [
      {
        number: 1,
        total: 2,
        amount: brl('600.01'),
        competence: '2026-10',
        invoice,
        lateEntry: false,
      },
      {
        number: 2,
        total: 2,
        amount: brl('599.99'),
        competence: '2026-11',
        invoice: { ...invoice, id: 'inv-2', referenceMonth: '2026-12', dueDate: '2026-12-05' },
        lateEntry: false,
      },
    ],
    total: brl('1200.00'),
    availableLimitAfter: brl('6517.00'),
    overLimit: false,
    warnings: [],
    ...overrides,
  };
}

export function aBillingPreview(
  overrides: Partial<BillingChangePreview> = {},
): BillingChangePreview {
  return {
    effectiveFromClosingDate: '2026-11-25',
    firstNewInvoice: { closingDate: '2026-11-10', dueDate: '2026-11-20' },
    movedInstallments: 5,
    movedCredits: 0,
    notice: 'FROM_NEXT_INVOICE',
    ...overrides,
  };
}

export function aPaymentPreview(overrides: Partial<PaymentPreview> = {}): PaymentPreview {
  return {
    kind: 'PARTIAL',
    outstandingAfter: brl('783.00'),
    creditCarryAfter: brl('0.00'),
    ...overrides,
  };
}

/** Porta falsa de cartões: guarda as chamadas e devolve o que o teste configurar. */
export class CardsGatewayStub extends CardsGateway {
  cards: Card[] = [];
  invoices: InvoiceSummary[] = [];
  readonly queries: CardsQuery[] = [];
  readonly invoiceQueries: InvoicesQuery[] = [];
  readonly calls: string[] = [];
  readonly purchaseRequests: { cardId: string; request: PurchasePreviewRequest }[] = [];
  readonly paymentCalls: { invoiceId: string; input: InvoicePaymentInput; key: string }[] = [];
  readonly paymentPreviewCalls: { invoiceId: string; amount: string }[] = [];
  readonly billingPreviewCalls: { cardId: string; closingDay: number; dueDay: number }[] = [];
  readonly updates: CardUpdate[] = [];
  /** Resultado das escritas de cartão (`create`, `update`, `archive`, `unarchive`). */
  next: Observable<Card> | null = null;
  getResult: Observable<Card> | null = null;
  listError: Observable<never> | null = null;
  invoicesResult: Observable<Slice<InvoiceSummary>> | null = null;
  future$: Observable<FutureInstallments> | null = null;
  purchasePreview$: Observable<PurchasePreview> | null = null;
  billingPreview$: Observable<BillingChangePreview> | null = null;
  invoice$: Observable<Invoice> | null = null;
  paymentPreview$: Observable<PaymentPreview> | null = null;
  pay$: Observable<Invoice> | null = null;

  list(query: CardsQuery): Observable<Slice<Card>> {
    this.queries.push(query);
    if (this.listError) return this.listError;
    const filtered = this.cards.filter((c) => !query.status || c.status === query.status);
    const start = (query.page - 1) * query.pageSize;
    const items = filtered.slice(start, start + query.pageSize);
    return of({ items, hasNext: start + query.pageSize < filtered.length });
  }

  get(id: string): Observable<Card> {
    this.calls.push(`get:${id}`);
    return this.getResult ?? of(this.cards.find((c) => c.id === id) ?? aCard({ id }));
  }

  create(input: CardInput): Observable<Card> {
    this.calls.push(`create:${input.name}`);
    return this.next ?? of(aCard({ name: input.name }));
  }

  update(id: string, input: CardUpdate): Observable<Card> {
    this.calls.push(`update:${id}:${input.version}`);
    this.updates.push(input);
    return this.next ?? of(aCard({ id, name: input.name, version: input.version + 1 }));
  }

  archive(id: string): Observable<Card> {
    this.calls.push(`archive:${id}`);
    return this.next ?? of(aCard({ id, status: 'ARCHIVED' }));
  }

  unarchive(id: string): Observable<Card> {
    this.calls.push(`unarchive:${id}`);
    return this.next ?? of(aCard({ id, status: 'ACTIVE' }));
  }

  listInvoices(cardId: string, query: InvoicesQuery): Observable<Slice<InvoiceSummary>> {
    this.calls.push(`invoices:${cardId}`);
    this.invoiceQueries.push(query);
    if (this.invoicesResult) return this.invoicesResult;
    const start = (query.page - 1) * query.pageSize;
    const items = this.invoices.slice(start, start + query.pageSize);
    return of({ items, hasNext: start + query.pageSize < this.invoices.length });
  }

  futureInstallments(cardId: string): Observable<FutureInstallments> {
    this.calls.push(`future:${cardId}`);
    return this.future$ ?? of({ total: brl('0.00'), byInvoice: [] });
  }

  previewPurchase(cardId: string, request: PurchasePreviewRequest): Observable<PurchasePreview> {
    this.purchaseRequests.push({ cardId, request });
    return this.purchasePreview$ ?? of(aPurchasePreview());
  }

  previewBillingChange(
    cardId: string,
    closingDay: number,
    dueDay: number,
  ): Observable<BillingChangePreview> {
    this.billingPreviewCalls.push({ cardId, closingDay, dueDay });
    return this.billingPreview$ ?? of(aBillingPreview());
  }

  getInvoice(id: string): Observable<Invoice> {
    this.calls.push(`invoice:${id}`);
    return this.invoice$ ?? of(anInvoice({ id }));
  }

  previewPayment(invoiceId: string, amount: string): Observable<PaymentPreview> {
    this.paymentPreviewCalls.push({ invoiceId, amount });
    return this.paymentPreview$ ?? of(aPaymentPreview());
  }

  payInvoice(
    invoiceId: string,
    input: InvoicePaymentInput,
    idempotencyKey: string,
  ): Observable<Invoice> {
    this.paymentCalls.push({ invoiceId, input, key: idempotencyKey });
    return (
      this.pay$ ??
      of(
        anInvoice({
          id: invoiceId,
          paid: brl(input.amount),
          payments: [
            {
              transactionId: 'pay-1',
              accountId: input.accountId,
              amount: brl(input.amount),
              date: input.date,
            },
          ],
        }),
      )
    );
  }
}

export function provideCardsStub(stub: CardsGatewayStub = new CardsGatewayStub()): Provider[] {
  return [{ provide: CardsGateway, useValue: stub }];
}
