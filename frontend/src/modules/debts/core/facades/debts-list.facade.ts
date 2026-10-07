import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  catchError,
  EMPTY,
  expand,
  forkJoin,
  map,
  Observable,
  of,
  reduce,
  startWith,
  Subject,
  switchMap,
} from 'rxjs';

import { DebtsGateway, DebtsQuery } from '~/modules/debts/core/interfaces/debts.gateway';
import type { Debt } from '~/modules/debts/core/types/debt';
import { Problem, problemOf } from '~/util/api/problem';
import { MAX_PAGE_SIZE } from '~/util/api/slice';

/** Filtros da lista de dívidas (sem paginação: a facade pagina até o fim). */
export type DebtsFilter = Omit<DebtsQuery, 'page' | 'pageSize'>;

export type DebtsListState =
  | { readonly status: 'loading' }
  | { readonly status: 'empty' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly data: readonly Debt[] };

const LOADING: DebtsListState = { status: 'loading' };

/**
 * Facade da lista de dívidas (FE 01): repassa o que a API devolveu (`outstanding`, `status`, `overdue`),
 * sem somar nada. `loadAll` pagina até `hasNext = false` (como S-91): a dívida 51 não pode sumir do
 * seletor. Escopo de componente.
 */
@Injectable()
export class DebtsListFacade {
  private readonly gateway = inject(DebtsGateway);
  private readonly loads = new Subject<DebtsFilter>();
  private readonly current = signal<DebtsListState>(LOADING);

  readonly state = this.current.asReadonly();
  readonly data = computed(() => {
    const state = this.current();
    return state.status === 'ready' ? state.data : null;
  });
  readonly error = computed(() => {
    const state = this.current();
    return state.status === 'error' ? state.problem : null;
  });

  constructor() {
    this.loads
      .pipe(
        // switchMap: trocar o filtro descarta a carga anterior.
        switchMap((filter) =>
          this.loadAll(filter).pipe(
            map((data): DebtsListState =>
              data.length === 0 ? { status: 'empty' } : { status: 'ready', data },
            ),
            startWith(LOADING),
            catchError((error: unknown) =>
              of<DebtsListState>({ status: 'error', problem: problemOf(error) }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.current.set(state));
  }

  load(filter: DebtsFilter = {}): void {
    this.loads.next(filter);
  }

  loadAll(filter: DebtsFilter = {}): Observable<readonly Debt[]> {
    const page = (n: number) => this.gateway.list({ ...filter, page: n, pageSize: MAX_PAGE_SIZE });
    return page(1).pipe(
      expand((slice, index) => (slice.hasNext ? page(index + 2) : EMPTY)),
      reduce((all: readonly Debt[], slice) => [...all, ...slice.items], [] as readonly Debt[]),
    );
  }

  /**
   * As dívidas **em aberto** do filtro (`OPEN` e `PARTIALLY_SETTLED`): o filtro de status vai ao
   * backend (que aceita um valor por vez), então encerradas e quitadas nem trafegam. A ordem do
   * backend (`date desc`) é mantida dentro de cada status.
   */
  loadAllOpen(filter: Omit<DebtsFilter, 'status'> = {}): Observable<readonly Debt[]> {
    return forkJoin([
      this.loadAll({ ...filter, status: 'OPEN' }),
      this.loadAll({ ...filter, status: 'PARTIALLY_SETTLED' }),
    ]).pipe(map(([open, partial]) => [...open, ...partial]));
  }
}
