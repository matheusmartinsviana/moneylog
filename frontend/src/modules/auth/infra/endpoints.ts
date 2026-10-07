/** Endpoints de autenticação, num lugar só (FE 05). Contrato: `contracts/openapi.yaml`, tag Auth. */
export const AUTH_ENDPOINTS = {
  login: '/v1/auth/login',
  refresh: '/v1/auth/refresh',
  logout: '/v1/auth/logout',
} as const;
