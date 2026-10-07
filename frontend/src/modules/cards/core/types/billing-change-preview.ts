/** Prévia da mudança de fechamento/vencimento (S-128, T58): tudo calculado pelo backend. */
export interface BillingChangePreview {
  /** Fechamento (no calendário atual) da primeira fatura afetada: vai ao `PUT` como `confirmedEffectiveFrom`. */
  readonly effectiveFromClosingDate: string;
  /** Essa mesma fatura no calendário novo. */
  readonly firstNewInvoice: { readonly closingDate: string; readonly dueDate: string };
  readonly movedInstallments: number;
  readonly movedCredits: number;
  /** A mudança vale da fatura seguinte à corrente (S-42). */
  readonly notice: 'FROM_NEXT_INVOICE';
}

/** Os dias (1..31) cuja mudança a prévia avalia. */
export interface BillingDays {
  readonly closingDay: number;
  readonly dueDay: number;
}
