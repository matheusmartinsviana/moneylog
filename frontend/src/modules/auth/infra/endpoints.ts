/** Endpoints de autenticação, num lugar só (FE 05). Contrato: `contracts/openapi.yaml`, tag Auth. */
export const AUTH_ENDPOINTS = {
  status: '/v1/auth/status',
  setupPassword: '/v1/auth/setup-password',
  login: '/v1/auth/login',
  refresh: '/v1/auth/refresh',
  logout: '/v1/auth/logout',
} as const;
