import type { Money } from '~/util/money';

/**
 * Tipos dos relatórios do contrato 2.6.0 (plano docs/planos/2026-10-10-redesign-workspace.md, 5.1 e 5.2).
 * Dinheiro e razões são strings do backend: o front só formata e posiciona; nunca soma, divide nem compara
 * valores.
 */

/** Janela da série: relativa ao dia do usuário (o do `asOf` do dashboard); o front não faz aritmética de datas. */
export type ReportPeriod = 'D7' | 'D30' | 'M3' | 'M12';
export const REPORT_PERIODS: readonly ReportPeriod[] = ['D7', 'D30', 'M3', 'M12'];

export type ReportGranularity = 'DAY' | 'WEEK' | 'MONTH';

/** Um balde da série. `expenses` pode ser negativo (dia só com reembolso). */
export interface IncomeExpensePoint {
  /** `YYYY-MM-DD`. */
  readonly periodStart: string;
  /** `YYYY-MM-DD`. */
  readonly periodEnd: string;
  /** O balde de hoje (e o mês corrente) ainda não terminou. */
  readonly partial: boolean;
  readonly income: Money;
  readonly expenses: Money;
  /** "Resultado do período" (receita menos consumo): não é saldo nem fluxo de caixa. */
  readonly net: Money;
}

/** `GET /v1/reports/income-expenses?period=` (5.1). */
export interface IncomeExpenseSeries {
  readonly period: ReportPeriod;
  /** `YYYY-MM-DD`. */
  readonly from: string;
  /** `YYYY-MM-DD`. */
  readonly to: string;
  readonly basis: 'DATE' | 'COMPETENCE';
  readonly granularity: ReportGranularity;
  readonly points: readonly IncomeExpensePoint[];
  readonly totals: { readonly income: Money; readonly expenses: Money; readonly net: Money };
}

export interface CategoryRef {
  readonly id: string;
  readonly name: string;
}

export interface SpendingCategoryItem {
  readonly category: CategoryRef;
  readonly amount: Money;
  /** Razão decimal (`0.2007`) sobre `base`; `null` quando `base` ≤ 0. Quem arredonda é o backend. */
  readonly share: string | null;
}

export interface SpendingOther {
  readonly amount: Money;
  readonly share: string | null;
  /** Quantas categorias foram agrupadas em "Outras". */
  readonly categories: number;
}

/** `GET /v1/reports/spending-by-category?month=&limit=` (5.2). */
export interface SpendingByCategory {
  readonly basis: 'COMPETENCE';
  readonly from: string;
  readonly to: string;
  /** Consumo líquido do mês (cabeçalho). */
  readonly total: Money;
  /** Soma das categorias com valor líquido positivo: a base dos `share`. O front não subtrai nem soma. */
  readonly base: Money;
  readonly items: readonly SpendingCategoryItem[];
  readonly other: SpendingOther | null;
}
