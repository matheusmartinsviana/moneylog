import type { InvoiceRef } from '~/modules/cards/core/types/invoice';
import type { Money } from '~/util/money';

export const PURCHASE_MAX_INSTALLMENTS = 36;

/** O que o formulário envia para a prévia: valor total digitado, parcelas e data da compra. */
export interface PurchasePreviewRequest {
  readonly amount: string;
  readonly installments: number;
  readonly date: string;
}

export interface PurchasePreviewInstallment {
  readonly number: number;
  readonly total: number;
  readonly amount: Money;
  /** Competência `YYYY-MM`. */
  readonly competence: string;
  readonly invoice: InvoiceRef;
  readonly lateEntry: boolean;
}

export type PurchaseWarning = 'LATE_ENTRY' | 'OVER_LIMIT' | 'FUTURE_DATE';

/**
 * Prévia da compra (S-124): parcelas, fatura alvo e limite depois, **calculados pelo backend** no mesmo
 * caminho do salvar. O front nunca divide valor em parcelas nem escolhe fatura.
 */
export interface PurchasePreview {
  readonly installments: readonly PurchasePreviewInstallment[];
  readonly total: Money;
  readonly availableLimitAfter: Money;
  readonly overLimit: boolean;
  readonly warnings: readonly PurchaseWarning[];
}
