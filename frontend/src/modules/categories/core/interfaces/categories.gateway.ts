import { Observable } from 'rxjs';

import type {
  Category,
  CategoryInput,
  CategoryKind,
  CategoryRename,
} from '~/modules/categories/core/types/category';

export interface CategoriesQuery {
  readonly kind?: CategoryKind;
  readonly includeArchived: boolean;
}

/**
 * Porta de categorias (FE 01). Lista curta, sem paginação. As implementações falham com
 * `ProblemError` (`CATEGORY_NAME_TAKEN`, `VERSION_CONFLICT`...).
 */
export abstract class CategoriesGateway {
  abstract list(query: CategoriesQuery): Observable<readonly Category[]>;
  abstract create(input: CategoryInput): Observable<Category>;
  abstract rename(id: string, input: CategoryRename): Observable<Category>;
  abstract archive(id: string): Observable<Category>;
  abstract unarchive(id: string): Observable<Category>;
}
