import type { components } from '~/util/api/schema.gen';

type Schemas = components['schemas'];

/** Respostas e corpos de cartões e faturas = schemas gerados do contrato (S-66). */
export type CardResponse = Schemas['Card'];
export type CardSliceResponse = Schemas['CardSlice'];
export type CardCreateRequest = Schemas['CardInput'];
export type CardUpdateRequest = Schemas['CardUpdate'];
export type InvoiceSummaryResponse = Schemas['InvoiceSummary'];
export type InvoiceResponse = Schemas['Invoice'];
export type InvoiceItemResponse = Schemas['InvoiceItem'];
export type InvoiceRefResponse = Schemas['InvoiceRef'];
export type InvoiceSliceResponse = Schemas['InvoiceSlice'];
export type FutureInstallmentsResponse = Schemas['FutureInstallments'];
export type PurchasePreviewRequestBody = Schemas['PurchasePreviewRequest'];
export type PurchasePreviewResponse = Schemas['PurchasePreview'];
export type BillingChangePreviewResponse = Schemas['BillingChangePreview'];
export type PaymentPreviewResponse = Schemas['PaymentPreview'];
export type InvoicePaymentRequest = Schemas['InvoicePaymentInput'];
