/** Os 11 tipos do domínio; só os em conta (`ACCOUNT_TRANSACTION_TYPES`) existem nesta etapa (S-58). */
export const TRANSACTION_TYPES = [
  'EXPENSE',
  'INCOME',
  'TRANSFER',
  'INVESTMENT',
  'ADJUSTMENT',
  'REFUND',
  'CARD_PURCHASE',
  'INVOICE_PAYMENT',
  'LOAN_GIVEN',
  'MONEY_RECEIVED',
  'DEBT_PAYMENT',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const ACCOUNT_TRANSACTION_TYPES = [
  'EXPENSE',
  'INCOME',
  'TRANSFER',
  'INVESTMENT',
  'ADJUSTMENT',
  'REFUND',
] as const satisfies readonly TransactionType[];
export type AccountTransactionType = (typeof ACCOUNT_TRANSACTION_TYPES)[number];

/** Meio de pagamento. Crédito não existe aqui: compra no cartão é outro tipo de movimentação. */
export const PAYMENT_METHODS = ['CASH', 'DEBIT', 'PIX', 'TRANSFER', 'BOLETO', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type TransactionStatus = 'ACTIVE' | 'VOIDED';
export type TransactionSource = 'MANUAL' | 'IMPORT' | 'RECURRENCE' | 'ONGOING';

export type AdjustmentDirection = 'INCREASE' | 'DECREASE';
export type InvestmentDirection = 'CONTRIBUTION' | 'REDEMPTION';
export type TransactionDirection = AdjustmentDirection | InvestmentDirection;
export type AdjustmentKind = 'CORRECTION' | 'YIELD';

/**
 * Por que a movimentação não pode ser estornada (S-88, S-89, S-122). `TRANSACTION_IN_CLOSED_INVOICE`:
 * compra ou crédito no cartão com parcela em fatura fechada; o caminho é cancelar as parcelas
 * restantes e registrar um reembolso no cartão.
 */
export type VoidBlockedBy =
  | 'ACCOUNT_ARCHIVED'
  | 'HAS_ACTIVE_REFUNDS'
  | 'TRANSACTION_IN_CLOSED_INVOICE'
  | 'DEBT_HAS_SETTLEMENTS'
  | 'DEBT_CLOSED';

/** Status de uma parcela (derivado da fatura; só `CANCELED` é gravado). */
export type InstallmentStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELED';

/** Status de uma fatura, como o backend o deriva (S-37). */
export type InvoiceStatus = 'FUTURE' | 'OPEN' | 'CLOSED' | 'OVERDUE' | 'PAID';
