import type {
  GoalCreateRequest,
  GoalResponse,
  GoalSliceResponse,
} from '~/modules/goals/infra/responses/goal.response';

/** Ambiente mock (S-67): nenhuma meta cadastrada. Mesmo formato bruto da API. */
export const EMPTY_GOALS: GoalSliceResponse = { items: [], hasNext: false };

/**
 * Ambiente mock: a meta que "nasceu" de uma criação (sem persistir: o "banco" continua vazio, então abrir a
 * meta depois dá "não encontrada"). Valores zerados, como a API devolve numa meta nova (`current` 0,00).
 */
export function newMockGoal(id: string, body: GoalCreateRequest): GoalResponse {
  const zero = { amount: '0.00', currency: 'BRL' as const };
  return {
    id,
    kind: body.kind ?? 'SAVINGS',
    name: body.name ?? (body.kind === 'METRIC' ? null : 'Quitar todas as dívidas'),
    target: { amount: body.target ?? '0.00', currency: 'BRL' },
    current: zero,
    progress: '0.0000',
    remaining: { amount: body.target ?? '0.00', currency: 'BRL' },
    status: 'ACTIVE',
    deadline: body.deadline ?? null,
    priority: body.priority ?? 'MEDIUM',
    description: body.description ?? null,
    monthlyNeeded: null,
    uncovered: false,
    reservations: [],
    baselineSet: false,
    baseline: null,
    baselineAt: null,
    grewSinceBaseline: false,
    metric: body.metric ?? null,
    direction: null,
    reached: false,
    metricAsOf: null,
    stage: body.deadline ? 'OBJECTIVE' : 'FANTASY',
    requiredPace: null,
    monthsLeft: null,
    nextMilestone: null,
    onTrack: null,
    gap: null,
    planNote: null,
    actions: [],
    consistency: [],
    streak: 0,
    consistencyRate: null,
    version: 1,
    createdAt: '1970-01-01T00:00:00Z',
    updatedAt: '1970-01-01T00:00:00Z',
  };
}
