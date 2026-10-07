import type {
  AdjustmentDirection,
  AdjustmentKind,
  InvestmentDirection,
  PaymentMethod,
} from '~/modules/transactions/core/types/transaction-enums';

/** Campos comuns. `amount` é a string decimal (`"18.50"`) do começo ao fim: nunca `number`. */
interface BaseInput {
  readonly amount: string;
  /** `YYYY-MM-DD`. */
  readonly date: string;
  /** Opcional: vazio não vai no corpo (o servidor guarda nulo). */
  readonly description: string;
  readonly notes: string | null;
}

/**
 * Dívida que nasce junto com a movimentação (S-40, S-137): o principal é o valor da movimentação (ou da
 * parte) e a data é a dela. A pessoa já existe (a nova pessoa é criada antes, S-138).
 */
export interface NewDebtInput {
  readonly personId: string;
  /** `YYYY-MM-DD`; sem ela a dívida fica "sem data" e fora dos horizontes (S-145). */
  readonly expectedDate: string | null;
  readonly description: string | null;
}

/**
 * Parte de uma despesa dividida: `amount` é o que a pessoa deve (string decimal digitada). O front não
 * calcula nada: nem a parte do usuário, nem os centavos que sobram. Σ das partes < valor, quem valida é o
 * backend (`SHARES_EXCEED_AMOUNT`).
 */
export interface ExpenseShareInput {
  readonly amount: string;
  readonly newDebt: NewDebtInput;
}

export interface ExpenseInput extends BaseInput {
  readonly type: 'EXPENSE';
  readonly accountId: string;
  /** Vazio = omitido: o servidor usa "Outros". */
  readonly categoryId: string;
  /** Omitido = o servidor usa `OTHER`. */
  readonly method?: PaymentMethod;
  /** Divisão da despesa (só na criação): cada parte vira uma dívida `RECEIVABLE` (S-137). */
  readonly shares?: readonly ExpenseShareInput[];
}

/** Dinheiro emprestado: `ACCOUNT −X / RECEIVABLE +X`, sem despesa. Cria a dívida (`newDebt`). */
export interface LoanGivenInput extends BaseInput {
  readonly type: 'LOAN_GIVEN';
  readonly accountId: string;
  readonly newDebt: NewDebtInput;
}

/**
 * Dinheiro recebido (nunca receita): devolução de uma dívida (`debtId`) **ou** captação (`newDebt`, cria
 * uma `PAYABLE`). Exatamente um dos dois.
 */
export interface MoneyReceivedInput extends BaseInput {
  readonly type: 'MONEY_RECEIVED';
  readonly accountId: string;
  readonly debtId: string | null;
  readonly newDebt: NewDebtInput | null;
}

/** Pagamento de uma dívida `PAYABLE`: `PAYABLE +X / ACCOUNT −X`, sem despesa. */
export interface DebtPaymentInput extends BaseInput {
  readonly type: 'DEBT_PAYMENT';
  readonly accountId: string;
  readonly debtId: string;
}

export interface IncomeInput extends BaseInput {
  readonly type: 'INCOME';
  readonly accountId: string;
  /** Vazio = omitido: o servidor usa "Outras receitas". */
  readonly categoryId: string;
  /** Omitido = o servidor usa `OTHER`. */
  readonly method?: PaymentMethod;
}

export interface TransferInput extends BaseInput {
  readonly type: 'TRANSFER';
  readonly fromAccountId: string;
  readonly toAccountId: string;
}

export interface InvestmentInput extends BaseInput {
  readonly type: 'INVESTMENT';
  readonly cashAccountId: string;
  readonly investmentAccountId: string;
  readonly direction: InvestmentDirection;
}

export interface AdjustmentInput extends BaseInput {
  readonly type: 'ADJUSTMENT';
  readonly accountId: string;
  readonly direction: AdjustmentDirection;
  readonly kind: AdjustmentKind;
  readonly reason: string;
}

/** Reembolso em conta (`accountId`) **ou** crédito no cartão (`cardId`): nunca os dois (T56, T70 CA4). */
export interface RefundInput extends BaseInput {
  readonly type: 'REFUND';
  readonly accountId: string | null;
  readonly cardId: string | null;
  readonly categoryId: string;
  readonly refundOfTransactionId: string | null;
}

/**
 * Compra no cartão (S-134). `amount` é o valor **total**; `installments` de 1 a 36 (à vista = 1). Não
 * leva conta: o dinheiro só sai quando a fatura é paga. Na edição só `description`, `categoryId` e
 * `notes` mudam (S-121); o resto segue o da compra.
 */
export interface CardPurchaseInput extends BaseInput {
  readonly type: 'CARD_PURCHASE';
  readonly cardId: string;
  readonly categoryId: string;
  readonly installments: number;
}

/** Entrada de criação e de edição (a edição leva também a `version`, fora deste tipo). */
export type TransactionInput =
  | ExpenseInput
  | IncomeInput
  | TransferInput
  | InvestmentInput
  | AdjustmentInput
  | RefundInput
  | CardPurchaseInput
  | LoanGivenInput
  | MoneyReceivedInput
  | DebtPaymentInput;
