import type { Projection, ProjectionTrend } from '~/modules/projections/core/types/projection';
import type {
  ProjectionResponse,
  ProjectionTrendResponse,
} from '~/modules/projections/infra/responses/projection.response';
import type { Money } from '~/util/money';

/** Resposta → tipos do core. Só copia campos: nenhum valor é somado nem convertido para `number`. */
const money = (value: { amount: string; currency: string }): Money => ({
  amount: value.amount,
  currency: value.currency,
});

function toTrend(response: ProjectionTrendResponse): ProjectionTrend {
  return {
    available: response.available,
    estimate: response.estimate,
    reason: response.reason,
    monthlyAverage: response.monthlyAverage ? money(response.monthlyAverage) : null,
    basedOn: [...response.basedOn],
    series: response.series.map((point) => ({
      competence: point.competence,
      estimatedSpending: money(point.estimatedSpending),
      balance: money(point.balance),
    })),
  };
}

export function toProjection(response: ProjectionResponse): Projection {
  return {
    // Sempre uma projeção, nunca uma certeza: a UI não depende do campo vir `true`.
    isProjection: true,
    horizon: response.horizon,
    asOf: response.asOf,
    startingBalance: money(response.startingBalance),
    series: response.series.map((point) => ({
      competence: point.competence,
      periodEnd: point.periodEnd,
      inflows: money(point.inflows),
      outflows: money(point.outflows),
      balance: money(point.balance),
    })),
    assumptions: [...response.assumptions],
    goals: {
      reserved: money(response.goals.reserved),
      items: response.goals.items.map((item) => ({
        goalId: item.goalId,
        name: item.name,
        current: money(item.current),
        target: money(item.target),
      })),
    },
    trend: response.trend ? toTrend(response.trend) : null,
  };
}
