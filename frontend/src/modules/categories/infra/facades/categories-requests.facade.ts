import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';

import {
  CategoriesGateway,
  CategoriesQuery,
} from '~/modules/categories/core/interfaces/categories.gateway';
import type {
  Category,
  CategoryInput,
  CategoryRename,
} from '~/modules/categories/core/types/category';
import { CATEGORIES_ENDPOINTS } from '~/modules/categories/infra/endpoints';
import { toCategory } from '~/modules/categories/infra/facades/category-response.mapper';
import type {
  CategoryCreateRequest,
  CategoryResponse,
  CategoryUpdateRequest,
} from '~/modules/categories/infra/responses/category.response';
import { EMPTY_CATEGORIES } from '~/modules/categories/mock-data/empty-categories';
import { Problem, ProblemError, toProblem } from '~/util/api/problem';
import { API_MOCKS } from '~/util/api-mocks';

function fail(error: unknown): Observable<never> {
  return throwError(() => new ProblemError(toProblem(error)));
}

const NOT_FOUND: Problem = {
  status: 404,
  code: 'CATEGORY_NOT_FOUND',
  fieldErrors: [],
  traceId: null,
  retryAfterSeconds: null,
};

/**
 * Facade de requisições de categorias (FE 05): o único lugar com HTTP do módulo. Com `API_MOCKS`
 * ligado, responde com lista vazia e não faz requisição.
 */
@Injectable({ providedIn: 'root' })
export class CategoriesRequestsFacade extends CategoriesGateway {
  private readonly http = inject(HttpClient);
  private readonly useMocks = inject(API_MOCKS);

  list(query: CategoriesQuery): Observable<readonly Category[]> {
    if (this.useMocks) return of(EMPTY_CATEGORIES.map(toCategory));
    let params = new HttpParams().set('includeArchived', query.includeArchived);
    if (query.kind) params = params.set('kind', query.kind);
    return this.http.get<CategoryResponse[]>(CATEGORIES_ENDPOINTS.collection, { params }).pipe(
      map((items) => items.map(toCategory)),
      catchError(fail),
    );
  }

  create(input: CategoryInput): Observable<Category> {
    if (this.useMocks) {
      return of(
        toCategory({
          id: '00000000-0000-4000-8000-000000000002',
          name: input.name,
          kind: input.kind,
          system: false,
          archived: false,
          version: 0,
        }),
      );
    }
    const body: CategoryCreateRequest = { name: input.name, kind: input.kind };
    return this.http
      .post<CategoryResponse>(CATEGORIES_ENDPOINTS.collection, body)
      .pipe(map(toCategory), catchError(fail));
  }

  rename(id: string, input: CategoryRename): Observable<Category> {
    if (this.useMocks) return throwError(() => new ProblemError(NOT_FOUND));
    const body: CategoryUpdateRequest = { name: input.name, version: input.version };
    return this.http
      .put<CategoryResponse>(CATEGORIES_ENDPOINTS.item(id), body)
      .pipe(map(toCategory), catchError(fail));
  }

  archive(id: string): Observable<Category> {
    return this.action(CATEGORIES_ENDPOINTS.archive(id));
  }

  unarchive(id: string): Observable<Category> {
    return this.action(CATEGORIES_ENDPOINTS.unarchive(id));
  }

  private action(url: string): Observable<Category> {
    if (this.useMocks) return throwError(() => new ProblemError(NOT_FOUND));
    return this.http.post<CategoryResponse>(url, null).pipe(map(toCategory), catchError(fail));
  }
}
