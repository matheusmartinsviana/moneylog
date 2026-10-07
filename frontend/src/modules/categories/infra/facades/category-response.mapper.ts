import type { Category } from '~/modules/categories/core/types/category';
import type { CategoryResponse } from '~/modules/categories/infra/responses/category.response';

export function toCategory(response: CategoryResponse): Category {
  return {
    id: response.id,
    name: response.name,
    kind: response.kind,
    system: response.system,
    archived: response.archived,
    version: response.version,
  };
}
