import type { Money } from '~/util/money';

/**
 * Espelho de `DashboardSummary` (docs/arquitetura/arquitetura.md §4.4, versão ajustada em 2026-10-03).
 * Todos os valores vêm calculados pelo backend: o front só exibe (arquitetura §1, S-21, S-23, S-8).
 * A infra mapeia a partir dos tipos gerados do contrato (S-66).
 */
export interface DashboardSummary {
  /** Data de referência `YYYY-MM-DD`, no fuso do usuário. */
  readonly asOf: string;
  readonly isProjection: boolean;
  /** Existe ao menos uma conta, ativa ou arquivada (S-61): `false` mostra o estado vazio do Início. */
  readonly hasAccounts: boolean;
  readonly balances: DashboardBalances;
  readonly committed: CommittedHorizons;
  readonly projected: ProjectedHorizons;
  readonly month: MonthSummary;
  readonly netWorth: NetWorth;
}

export interface DashboardBalances {
  readonly inAccounts: Money;
  readonly investments: Money;
  /** `inAccounts − committed.d30 − reserved` (S-21), calculado no backend. */
  readonly available: Money;
  readonly reserved: Money;
  /** Repete `committed.d30` para o card de saldo. */
  readonly committed30d: Money;
  /**
   * Variação de `inAccounts` desde o último dia do mês anterior (contrato 2.6.0), toda calculada no backend.
   * `null` quando o backend a omite (projeção ou sem contas): então não há chip.
   */
  readonly inAccountsChange: InAccountsChange | null;
}

export interface InAccountsChange {
  /** `inAccounts` no fim do mês anterior. */
  readonly previous: Money;
  /** `inAccounts` de hoje − `previous`; pode ser negativo. */
  readonly amount: Money;
  /** Razão decimal (`0.0840`); `null` com `previous` = 0 (sem base). */
  readonly percent: string | null;
  /** Último dia do mês anterior (`YYYY-MM-DD`). */
  readonly since: string;
}

/** Saídas previstas acumuladas até cada horizonte (vencidos entram em todos). */
export interface CommittedHorizons {
  readonly d7: Money;
  readonly d30: Money;
  readonly d60: Money;
  readonly d90: Money;
  readonly m6: Money;
  readonly m12: Money;
}

/** Sempre rotulado como projeção (PR 00 §19). */
export interface ProjectedHorizons {
  readonly d30: Money;
  readonly d90: Money;
  readonly m6: Money;
  readonly m12: Money;
}

export const PAYMENT_METHODS = ['DEBIT', 'PIX', 'CASH', 'BOLETO', 'TRANSFER', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface ExpensesPaid {
  readonly total: Money;
  readonly byMethod: Readonly<Record<PaymentMethod, Money>>;
}

export interface CashFlow {
  readonly in: Money;
  readonly out: Money;
  readonly net: Money;
}

export interface MonthSummary {
  /** Competência `YYYY-MM`. */
  readonly competence: string;
  readonly income: Money;
  readonly expensesPaid: ExpensesPaid;
  readonly credit: Money;
  /** Valor positivo; reduz o consumo na competência do reembolso (S-10). */
  readonly refunds: Money;
  /** `expensesPaid.total + credit − refunds + debtConsumption`, calculado no backend. */
  readonly consumption: Money;
  /**
   * Consumo de dívida `PAYABLE` sem movimentação com categoria ("um amigo pagou meu jantar", S-137): já
   * está em `consumption`. `null` quando o backend não o devolve (campo opcional, Etapa 4).
   */
  readonly debtConsumption: Money | null;
  readonly cashFlow: CashFlow;
  readonly investedNet: Money;
  readonly lent: Money;
  readonly received: Money;
  /** `income − consumption` (S-23), calculado no backend. */
  readonly net: Money;
}

export interface NetWorth {
  readonly accounts: Money;
  readonly receivables: Money;
  /** Pode ser positivo quando há crédito no cartão. */
  readonly cardLiabilities: Money;
  readonly payables: Money;
  readonly total: Money;
  /** Informativo: parcelas futuras do cartão, **fora** de `total` (S-8). */
  readonly cardFutureInstallments: Money;
}
