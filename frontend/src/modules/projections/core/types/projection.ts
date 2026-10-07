import type { Money } from '~/util/money';

/** `D30` e `D90` = 30 e 90 dias; `M6` e `M12` = 6 e 12 meses (S-155). */
export type ProjectionHorizon = 'D30' | 'D90' | 'M6' | 'M12';
export const PROJECTION_HORIZONS = [
  'D30',
  'D90',
  'M6',
  'M12',
] as const satisfies readonly ProjectionHorizon[];

/** Horizonte padrão do backend. */
export const DEFAULT_HORIZON: ProjectionHorizon = 'M6';

export interface ProjectionQuery {
  readonly horizon: ProjectionHorizon;
  /** Tendência histórica opcional (estimativa separada da série base). Desligada por padrão (S-152). */
  readonly includeTrend: boolean;
}

/** Um mês da série. O 1º traz os vencidos e o resto do mês corrente; o último termina em `periodEnd`. */
export interface ProjectionPoint {
  /** `YYYY-MM`. */
  readonly competence: string;
  /** Último dia coberto pelo ponto (`YYYY-MM-DD`): o último ponto pode ser parcial. */
  readonly periodEnd: string;
  readonly inflows: Money;
  readonly outflows: Money;
  readonly balance: Money;
}

export interface ProjectionGoalInfo {
  readonly goalId: string;
  readonly name: string;
  readonly current: Money;
  readonly target: Money;
}

/** O que está reservado em metas: informativo, a reserva **não** é saída e não muda a série. */
export interface ProjectionGoals {
  readonly reserved: Money;
  readonly items: readonly ProjectionGoalInfo[];
}

export interface ProjectionTrendPoint {
  readonly competence: string;
  readonly estimatedSpending: Money;
  readonly balance: Money;
}

/** Tendência: **estimativa**, separada da série base. Sem 3 meses completos, `available = false`. */
export interface ProjectionTrend {
  readonly available: boolean;
  readonly estimate: boolean;
  /** `INSUFFICIENT_HISTORY` quando indisponível. */
  readonly reason: string | null;
  readonly monthlyAverage: Money | null;
  readonly basedOn: readonly string[];
  readonly series: readonly ProjectionTrendPoint[];
}

/**
 * Projeção determinística (S-152): **sempre uma projeção, nunca uma certeza** (`isProjection` é sempre
 * `true`). Tudo calculado pelo backend; `assumptions` são chaves traduzíveis (o conjunto pode crescer).
 */
export interface Projection {
  readonly isProjection: true;
  readonly horizon: ProjectionHorizon;
  /** `YYYY-MM-DD`. */
  readonly asOf: string;
  readonly startingBalance: Money;
  readonly series: readonly ProjectionPoint[];
  readonly assumptions: readonly string[];
  readonly goals: ProjectionGoals;
  readonly trend: ProjectionTrend | null;
}
