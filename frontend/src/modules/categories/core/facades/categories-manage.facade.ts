import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, map, Observable, of, startWith, Subject, switchMap, tap } from 'rxjs';

import { CategoriesFacade } from '~/modules/categories/core/facades/categories.facade';
import type {
  Category,
  CategoryInput,
  CategoryKind,
  CategoryRename,
} from '~/modules/categories/core/types/category';
import { Problem, problemOf } from '~/util/api/problem';

export type CategoriesManageState =
  | { readonly status: 'loading' }
  | { readonly status: 'empty' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly data: readonly Category[] };

const LOADING: CategoriesManageState = { status: 'loading' };

/**
 * Estado da tela Configurações → Categorias (aba Despesa/Receita, ativas e arquivadas). Lê pela
 * `CategoriesFacade` (com cache) e, depois de cada mutação, atualiza a lista **a partir do recurso da
 * resposta**, sem chutar. Escopo de componente.
 */
@Injectable()
export class CategoriesManageFacade {
  private readonly categories = inject(CategoriesFacade);
  private readonly loads = new Subject<CategoryKind>();
  private readonly current = signal<CategoriesManageState>(LOADING);
  private kind: CategoryKind = 'EXPENSE';

  readonly state = this.current.asReadonly();
  readonly loading = computed(() => this.current().status === 'loading');
  readonly error = computed(() => {
    const state = this.current();
    return state.status === 'error' ? state.problem : null;
  });
  readonly data = computed(() => {
    const state = this.current();
    return state.status === 'ready' ? state.data : [];
  });
  readonly active = computed(() => this.data().filter((category) => !category.archived));
  readonly archived = computed(() => this.data().filter((category) => category.archived));

  constructor() {
    this.loads
      .pipe(
        switchMap((kind) =>
          this.categories.list(kind, true).pipe(
            map((data): CategoriesManageState =>
              data.length === 0 ? { status: 'empty' } : { status: 'ready', data },
            ),
            startWith(LOADING),
            catchError((error: unknown) =>
              of<CategoriesManageState>({ status: 'error', problem: problemOf(error) }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.current.set(state));
  }

  load(kind: CategoryKind): void {
    this.kind = kind;
    this.loads.next(kind);
  }

  create(name: string): Observable<Category> {
    const input: CategoryInput = { name, kind: this.kind };
    return this.categories.create(input).pipe(tap((category) => this.upsert(category)));
  }

  rename(category: Category, name: string): Observable<Category> {
    const input: CategoryRename = { name, version: category.version };
    return this.categories.rename(category.id, input).pipe(tap((saved) => this.upsert(saved)));
  }

  archive(id: string): Observable<Category> {
    return this.categories.archive(id).pipe(tap((saved) => this.upsert(saved)));
  }

  unarchive(id: string): Observable<Category> {
    return this.categories.unarchive(id).pipe(tap((saved) => this.upsert(saved)));
  }

  /** Coloca o recurso da resposta na lista (substitui pelo `id` ou acrescenta) e mantém a ordem por nome. */
  private upsert(category: Category): void {
    if (category.kind !== this.kind) return;
    const state = this.current();
    const base = state.status === 'ready' ? state.data : [];
    const exists = base.some((item) => item.id === category.id);
    const next = exists
      ? base.map((item) => (item.id === category.id ? category : item))
      : [...base, category];
    const sorted = [...next].sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }),
    );
    this.current.set({ status: 'ready', data: sorted });
  }
}
