import type {
  AdjustmentKind,
  InstallmentStatus,
  InvoiceStatus,
  PaymentMethod,
  TransactionDirection,
  TransactionSource,
  TransactionStatus,
  TransactionType,
  VoidBlockedBy,
} from '~/modules/transactions/core/types/transaction-enums';
import type { TransactionInput } from '~/modules/transactions/core/types/transaction-input';
import type { DebtSummary } from '~/util/debt';
import type { Money } from '~/util/money';

export interface Ref {
  readonly id: string;
  readonly name: string;
}

/** Parcela de uma compra no cartão, como a API devolve (na ordem 1..N). `amount` é o da parcela. */
export interface Installment {
  readonly number: number;
  readonly total: number;
  readonly amount: Money;
  /** Competência `YYYY-MM`. */
  readonly competence: string;
  readonly invoiceId: string;
  /** Referência (mês do vencimento) da fatura da parcela, `YYYY-MM`. */
  readonly invoiceReferenceMonth: string;
  readonly invoiceDueDate: string;
  readonly status: InstallmentStatus;
  readonly lateEntry: boolean;
}

/** Fatura do crédito no cartão e do pagamento de fatura. */
export interface TransactionInvoiceRef {
  readonly id: string;
  readonly referenceMonth: string;
  readonly closingDate: string;
  readonly dueDate: string;
  readonly status: InvoiceStatus;
}

export interface ConsumptionImpact {
  /** Competência `YYYY-MM`. */
  readonly competence: string;
  readonly amount: Money;
}

/** Efeito nas quatro lentes (D1 §1), calculado pelo backend. */
export interface Impact {
  readonly cash: Money;
  readonly consumption: readonly ConsumptionImpact[];
  readonly netWorth: Money;
  readonly commitment: Money;
}

/**
 * Movimentação como a API devolve (nomes genéricos `account`/`counterpartAccount`, S-90). Traz
 * `voidReason`, `voidedAt` e `voidBlockedBy`. `formValue` é o valor inicial do formulário de edição,
 * montado pelo mapper da infra a partir do mapa de S-90 (`null` se o tipo não é editável nesta
 * etapa). Nenhum valor é calculado no front.
 */
export interface Transaction {
  readonly id: string;
  readonly type: TransactionType;
  readonly status: TransactionStatus;
  readonly amount: Money;
  /** `YYYY-MM-DD`. */
  readonly date: string;
  readonly description: string;
  readonly notes: string | null;
  readonly category: Ref | null;
  /** Cartão das movimentações de cartão (compra, crédito, pagamento de fatura); `null` nas demais. */
  readonly card: Ref | null;
  readonly account: Ref | null;
  readonly counterpartAccount: Ref | null;
  readonly method: PaymentMethod | null;
  readonly direction: TransactionDirection | null;
  readonly adjustmentKind: AdjustmentKind | null;
  readonly reason: string | null;
  readonly refundOf: { readonly id: string; readonly description: string } | null;
  /** Parcelas da compra no cartão (vazio nos demais tipos). */
  readonly installments: readonly Installment[];
  /** Fatura do crédito no cartão e do pagamento de fatura. */
  readonly invoice: TransactionInvoiceRef | null;
  /**
   * A dívida das movimentações de dívida (`LOAN_GIVEN`/captação: a que nasceu; `MONEY_RECEIVED` de
   * devolução e `DEBT_PAYMENT`: a quitada); `null` nas demais.
   */
  readonly debt: DebtSummary | null;
  /** As dívidas que nasceram das partes de uma `EXPENSE` dividida (uma por parte); vazio nas demais. */
  readonly shares: readonly DebtSummary[];
  /** Recorrência de origem (`source: RECURRENCE`) e a data da ocorrência realizada. */
  /**
   * Competência da renda (`YYYY-MM`, ADR-017): só em receita, quando o dinheiro caiu em um mês e a renda é de
   * outro. `null` = o mês de `date`. Vem do backend; o front não decide.
   */
  readonly incomeCompetence: string | null;
  readonly recurrenceId: string | null;
  readonly occurrenceDate: string | null;
  readonly impact: Impact;
  readonly editable: boolean;
  readonly voidable: boolean;
  readonly voidBlockedBy: VoidBlockedBy | null;
  readonly voidReason: string | null;
  /** Instante ISO-8601 UTC. */
  readonly voidedAt: string | null;
  readonly source: TransactionSource;
  readonly version: number;
  readonly formValue: TransactionInput | null;
}

/** Totais do filtro inteiro (não da página), calculados pelo backend (S-79, S-80). */
export interface TransactionTotals {
  /** Movimentações **ativas** que casam com o filtro. */
  readonly count: number;
  readonly cashFlow: { readonly in: Money; readonly out: Money; readonly net: Money };
}
