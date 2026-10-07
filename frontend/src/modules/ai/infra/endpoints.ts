/** Endpoints de IA (Etapa 8). Contrato: tag AI. */
export const AI_ENDPOINTS = {
  status: '/v1/ai/status',
  previews: '/v1/ai/previews',
  analyses: '/v1/ai/analyses',
  analysis: (id: string) => `/v1/ai/analyses/${encodeURIComponent(id)}`,
  insights: '/v1/insights',
  settings: '/v1/settings/ai',
} as const;

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
