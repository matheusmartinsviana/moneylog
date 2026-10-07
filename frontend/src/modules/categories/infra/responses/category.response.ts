import type { components } from '~/util/api/schema.gen';

type Schemas = components['schemas'];

/** Respostas e corpos de categorias = schemas gerados do contrato (S-66). */
export type CategoryResponse = Schemas['Category'];
export type CategoryCreateRequest = Schemas['CategoryInput'];
export type CategoryUpdateRequest = Schemas['CategoryUpdate'];
