import type { Money } from '~/util/money';

export interface Ref {
  readonly id: string;
  readonly name: string;
}

/** Diferença do mês em relação ao anterior, como o backend a calculou. `percent` é `null` com base 0. */
export interface SummaryDelta {
  /** Pode ser negativo; `0.00` quando iguais. */
  readonly amount: Money;
  /** Razão decimal em string (`0.6667`). Só se formata. */
  readonly percent: string | null;
}

export interface SummaryTotals {
  /** `YYYY-MM`. */
  readonly competence: string;
  readonly income: Money;
  readonly expenses: Money;
  readonly investments: Money;
  readonly net: Money;
  /** Taxa de poupança do mês (razão `0.9500`); `null` sem receitas; `null` também se o backend a omite. */
  readonly savingsRate: string | null;
}

export interface SummaryComparison {
  readonly previousMonth: SummaryTotals;
  readonly incomeDelta: SummaryDelta;
  readonly expensesDelta: SummaryDelta;
  readonly investmentsDelta: SummaryDelta;
  readonly netDelta: SummaryDelta;
  /**
   * Taxa de poupança do mês − a do anterior, **em pontos percentuais** (`-0.0333`), calculada no backend.
   * `null` se alguma das taxas é `null` (ou se o backend a omite). No mês parcial não é tendência.
   */
  readonly savingsRateDelta: string | null;
}

export interface LargestCategory {
  readonly category: Ref;
  readonly amount: Money;
}

/** O maior lançamento de consumo: a parcela, não a compra inteira. Vem de uma movimentação ou de uma dívida. */
export interface LargestExpense {
  readonly transactionId: string | null;
  readonly debtId: string | null;
  readonly description: string | null;
  readonly category: Ref;
  /** `YYYY-MM-DD`. */
  readonly date: string;
  readonly amount: Money;
  readonly installmentNumber: number | null;
  readonly installmentTotal: number | null;
}

/**
 * Resumo do mês (PR 00 §32, S-151): **tudo calculado pelo backend** pelo mesmo caminho do dashboard e da
 * lista. O front só exibe: nunca soma, subtrai nem divide. `investments` fica **fora** do consumo.
 */
export interface MonthlySummary {
  /** `YYYY-MM`. */
  readonly competence: string;
  /** Mês corrente ou futuro: ainda não terminou. */
  readonly partial: boolean;
  /** Mês futuro: só o que já existe (projeção). */
  readonly isProjection: boolean;
  readonly income: Money;
  /** Consumo (despesas + crédito − reembolsos). */
  readonly expenses: Money;
  readonly investments: Money;
  readonly net: Money;
  /** Razão decimal em string (`0.9167`); `null` sem receitas no mês. */
  readonly savingsRate: string | null;
  readonly largestCategory: LargestCategory | null;
  readonly largestExpense: LargestExpense | null;
  readonly card: { readonly consumption: Money; readonly outstanding: Money };
  readonly futureInstallments: Money;
  readonly comparison: SummaryComparison;
}
