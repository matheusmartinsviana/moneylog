/** Endpoints de contas, num lugar só (FE 05). Contrato: `contracts/openapi.yaml`, tag Accounts. */
export const ACCOUNTS_ENDPOINTS = {
  collection: '/v1/accounts',
  item: (id: string) => `/v1/accounts/${encodeURIComponent(id)}`,
  archive: (id: string) => `/v1/accounts/${encodeURIComponent(id)}/archive`,
  unarchive: (id: string) => `/v1/accounts/${encodeURIComponent(id)}/unarchive`,
} as const;
