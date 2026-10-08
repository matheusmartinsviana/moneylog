/** Endpoints de compromissos acompanhados. Contrato: tag Commitments (2.14.0). */
export const COMMITMENT_ENDPOINTS = {
  collection: '/v1/commitments',
  byId: (id: string) => `/v1/commitments/${encodeURIComponent(id)}`,
  pay: (id: string, position: number) =>
    `/v1/commitments/${encodeURIComponent(id)}/schedule/${position}/pay`,
  progress: (id: string) => `/v1/commitments/${encodeURIComponent(id)}/progress`,
} as const;
