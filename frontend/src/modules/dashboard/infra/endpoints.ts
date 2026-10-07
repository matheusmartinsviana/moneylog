/** Endpoints usados pelo dashboard, num lugar só (FE 05). Contrato: arquitetura §4.1 e §4.4. */
export const DASHBOARD_ENDPOINTS = {
  /** `?asOf=YYYY-MM-DD` opcional; sem ele o backend usa "hoje" no fuso do usuário. */
  summary: '/v1/dashboard/summary',
  /** `?from&to` opcionais (janela padrão a confirmar com o backend). */
  upcoming: '/v1/dashboard/upcoming',
} as const;
