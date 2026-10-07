import { Provider } from '@angular/core';
import { Observable, of } from 'rxjs';

import {
  CategoriesGateway,
  CategoriesQuery,
} from '~/modules/categories/core/interfaces/categories.gateway';
import type {
  Category,
  CategoryInput,
  CategoryRename,
} from '~/modules/categories/core/types/category';

export function aCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-1',
    name: 'Alimentação',
    kind: 'EXPENSE',
    system: true,
    archived: false,
    version: 0,
    ...overrides,
  };
}

/** Porta falsa de categorias: guarda as chamadas e devolve o que o teste configurar. */
export class CategoriesGatewayStub extends CategoriesGateway {
  categories: Category[] = [];
  readonly queries: CategoriesQuery[] = [];
  readonly calls: string[] = [];
  next: Observable<Category> | null = null;
  listResult: Observable<readonly Category[]> | null = null;

  list(query: CategoriesQuery): Observable<readonly Category[]> {
    this.queries.push(query);
    return (
      this.listResult ??
      of(
        this.categories.filter(
          (c) => (!query.kind || c.kind === query.kind) && (query.includeArchived || !c.archived),
        ),
      )
    );
  }

  create(input: CategoryInput): Observable<Category> {
    this.calls.push(`create:${input.name}:${input.kind}`);
    return (
      this.next ?? of(aCategory({ id: 'new', name: input.name, kind: input.kind, system: false }))
    );
  }

  rename(id: string, input: CategoryRename): Observable<Category> {
    this.calls.push(`rename:${id}:${input.name}:${input.version}`);
    return this.next ?? of(aCategory({ id, name: input.name, version: input.version + 1 }));
  }

  archive(id: string): Observable<Category> {
    this.calls.push(`archive:${id}`);
    return this.next ?? of(aCategory({ id, archived: true }));
  }

  unarchive(id: string): Observable<Category> {
    this.calls.push(`unarchive:${id}`);
    return this.next ?? of(aCategory({ id, archived: false }));
  }
}

export function provideCategoriesStub(
  stub: CategoriesGatewayStub = new CategoriesGatewayStub(),
): Provider[] {
  return [{ provide: CategoriesGateway, useValue: stub }];
}
