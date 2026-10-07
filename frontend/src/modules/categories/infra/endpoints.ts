/** Endpoints de categorias, num lugar só (FE 05). Contrato: `contracts/openapi.yaml`, tag Categories. */
export const CATEGORIES_ENDPOINTS = {
  collection: '/v1/categories',
  item: (id: string) => `/v1/categories/${encodeURIComponent(id)}`,
  archive: (id: string) => `/v1/categories/${encodeURIComponent(id)}/archive`,
  unarchive: (id: string) => `/v1/categories/${encodeURIComponent(id)}/unarchive`,
} as const;
