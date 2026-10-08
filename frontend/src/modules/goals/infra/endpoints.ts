/** Endpoints de metas, num lugar só (FE 05). Contrato: tag Goals. */
export const GOALS_ENDPOINTS = {
  collection: '/v1/goals',
  item: (id: string) => `/v1/goals/${encodeURIComponent(id)}`,
  reservations: (id: string) => `/v1/goals/${encodeURIComponent(id)}/reservations`,
  baseline: (id: string) => `/v1/goals/${encodeURIComponent(id)}/baseline`,
  actions: (id: string) => `/v1/goals/${encodeURIComponent(id)}/actions`,
  action: (id: string, actionId: string) =>
    `/v1/goals/${encodeURIComponent(id)}/actions/${encodeURIComponent(actionId)}`,
  checkIn: (id: string, actionId: string) =>
    `/v1/goals/${encodeURIComponent(id)}/actions/${encodeURIComponent(actionId)}/check-in`,
  archive: (id: string) => `/v1/goals/${encodeURIComponent(id)}/archive`,
  unarchive: (id: string) => `/v1/goals/${encodeURIComponent(id)}/unarchive`,
} as const;

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';

/** Fontes de leitura do valor atual de uma medida (ADR-016): as mesmas das telas de dívidas, Início e custos fixos. */
export const METRIC_SOURCES = {
  debts: '/v1/debts/overview',
  dashboard: '/v1/dashboard/summary',
  recurrences: '/v1/recurrences/summary',
} as const;
