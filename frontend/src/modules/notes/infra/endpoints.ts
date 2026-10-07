/** Endpoints do vault, num lugar só (FE 05). Contrato: tags Notes e Vault. */
export const NOTES_ENDPOINTS = {
  collection: '/v1/notes',
  tags: '/v1/notes/tags',
  trash: '/v1/notes/trash',
  item: (id: string) => `/v1/notes/${encodeURIComponent(id)}`,
  move: (id: string) => `/v1/notes/${encodeURIComponent(id)}/move`,
  trashNote: (id: string) => `/v1/notes/${encodeURIComponent(id)}/trash`,
  restore: (id: string) => `/v1/notes/${encodeURIComponent(id)}/restore`,
  backlinks: (id: string) => `/v1/notes/${encodeURIComponent(id)}/backlinks`,
  links: (id: string) => `/v1/notes/${encodeURIComponent(id)}/links`,
  linked: '/v1/links',
  vaultExport: '/v1/vault/export',
  vaultImport: '/v1/vault/import',
} as const;

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
