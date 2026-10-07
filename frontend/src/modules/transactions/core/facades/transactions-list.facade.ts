import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  exhaustMap,
  map,
  Observable,
  of,
  startWith,
  Subject,
  switchMap,
  tap,
} from 'rxjs';

import { TransactionsEvents } from '~/modules/transactions/core/facades/transactions-events';
import { TransactionsGateway } from '~/modules/transactions/core/interfaces/transactions.gateway';
import type { DebtEntry, Entry, EntryTotals } from '~/modules/transactions/core/types/entry';
import {
  defaultFilters,
  filtersEqual,
  ListFilters,
} from '~/modules/transactions/core/types/list-filters';
import type { Transaction, TransactionTotals } from '~/modules/transactions/core/types/transaction';
import { Problem, problemOf } from '~/util/api/problem';
import { todayIso } from '~/util/date';
import { cleanSearchTerm } from '~/util/search-term';

/** Linhas por página (S-71). */
export const LIST_PAGE_SIZE = 50;
/** Espera entre a última tecla da busca e a requisição. */
export const SEARCH_DEBOUNCE_MS = 300;

/** O que a lista exibe. `totals` é sempre o da **última resposta**: nunca somado no front. */
export interface ListData {
  readonly view: ListFilters['view'];
  readonly records: readonly Transaction[];
  readonly entries: readonly Entry[];
  /** Consumo de dívidas sem movimentação (S-137): completo, fora da paginação e já dentro de `entryTotals`. */
  readonly debtItems: readonly DebtEntry[];
  readonly recordTotals: TransactionTotals | null;
  readonly entryTotals: EntryTotals | null;
  readonly hasNext: boolean;
  readonly page: number;
}

export type ListState =
  | { readonly status: 'loading' }
  | { readonly status: 'empty' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly data: ListData };

const LOADING: ListState = { status: 'loading' };

/**
 * Facade da lista de movimentações (duas visões, filtros, "carregar mais"). Regras (T35):
 * - os filtros são a fonte de verdade do que se vê; a tela os espelha na URL (`filtersToQuery`);
 * - trocar de filtro **cancela** a requisição anterior (`switchMap`) e a busca por texto espera
 *   300 ms (`debounceTime`) antes de pedir;
 * - "carregar mais" pede a página seguinte e **anexa** os itens; os `totals` exibidos são os da
 *   última resposta, nunca somados;
 * - criar, editar ou estornar (`TransactionsEvents`) recarrega do backend.
 *
 * Escopo de componente (`providers: [TransactionsListFacade]`).
 */
@Injectable()
export class TransactionsListFacade {
  private readonly gateway = inject(TransactionsGateway);
  private readonly events = inject(TransactionsEvents);
  private readonly reloads = new Subject<ListFilters>();
  private readonly mores = new Subject<void>();
  private readonly searches = new Subject<string>();
  private readonly current = signal<ListState>(LOADING);
  private readonly filterState = signal<ListFilters>(defaultFilters(todayIso()));
  private readonly loadingMoreState = signal(false);
  private readonly loadMoreFailedState = signal(false);
  private started = false;
  /** Muda a cada recarga: resposta de "carregar mais" de uma geração antiga é descartada. */
  private generation = 0;

  readonly filters = this.filterState.asReadonly();
  readonly state = this.current.asReadonly();
  readonly loading = computed(() => this.current().status === 'loading');
  readonly empty = computed(() => this.current().status === 'empty');
  readonly error = computed(() => {
    const state = this.current();
    return state.status === 'error' ? state.problem : null;
  });
  readonly data = computed(() => {
    const state = this.current();
    return state.status === 'ready' ? state.data : null;
  });
  readonly loadingMore = this.loadingMoreState.asReadonly();
  /** A última tentativa de "carregar mais" falhou (a lista já exibida continua). */
  readonly loadMoreFailed = this.loadMoreFailedState.asReadonly();

  constructor() {
    this.reloads
      .pipe(
        switchMap((filters) => {
          this.generation++;
          this.loadingMoreState.set(false);
          this.loadMoreFailedState.set(false);
          return this.fetchFirstPage(filters).pipe(
            startWith(LOADING),
            catchError((error: unknown) =>
              of<ListState>({ status: 'error', problem: problemOf(error) }),
            ),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.current.set(state));

    this.mores
      .pipe(
        exhaustMap(() => this.fetchNextPage()),
        takeUntilDestroyed(),
      )
      .subscribe();

    this.searches
      .pipe(debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((q) => this.patch({ q }));

    this.events.changes$.pipe(takeUntilDestroyed()).subscribe(() => this.reload());
  }

  /**
   * Aplica os filtros (vindos da URL ou de um controle) e recarrega. A primeira chamada sempre
   * carrega; as seguintes só quando algo mudou.
   */
  apply(filters: ListFilters): void {
    const changed = !filtersEqual(this.filterState(), filters, todayIso());
    this.filterState.set(filters);
    if (!this.started || changed) {
      this.started = true;
      this.reloads.next(filters);
    }
  }

  patch(changes: Partial<ListFilters>): void {
    this.apply({ ...this.filterState(), ...changes });
  }

  /** Volta aos padrões de S-71, mantendo a visão atual. */
  clearFilters(): void {
    this.apply({ ...defaultFilters(todayIso()), view: this.filterState().view });
  }

  /** Digitou na busca: espera 300 ms parado e então filtra (a requisição anterior é cancelada). */
  search(text: string): void {
    this.searches.next(cleanSearchTerm(text));
  }

  /** Recarrega do backend com os filtros atuais ("tentar de novo" e depois de uma mudança). */
  reload(): void {
    if (!this.started) return;
    this.reloads.next(this.filterState());
  }

  loadMore(): void {
    this.mores.next();
  }

  private fetchFirstPage(filters: ListFilters): Observable<ListState> {
    if (filters.view === 'entries') {
      return this.gateway.listEntries(filters, 1, LIST_PAGE_SIZE).pipe(
        map((slice): ListState =>
          slice.items.length === 0 && (slice.debtItems ?? []).length === 0
            ? { status: 'empty' }
            : {
                status: 'ready',
                data: {
                  view: 'entries',
                  records: [],
                  entries: slice.items,
                  debtItems: slice.debtItems ?? [],
                  recordTotals: null,
                  entryTotals: slice.totals,
                  hasNext: slice.hasNext,
                  page: 1,
                },
              },
        ),
      );
    }
    return this.gateway.list(filters, 1, LIST_PAGE_SIZE).pipe(
      map((slice): ListState =>
        slice.items.length === 0
          ? { status: 'empty' }
          : {
              status: 'ready',
              data: {
                view: 'records',
                records: slice.items,
                entries: [],
                debtItems: [],
                recordTotals: slice.totals,
                entryTotals: null,
                hasNext: slice.hasNext,
                page: 1,
              },
            },
      ),
    );
  }

  private fetchNextPage(): Observable<unknown> {
    const state = this.current();
    if (state.status !== 'ready' || !state.data.hasNext || this.loadingMoreState()) return of(null);
    const { data } = state;
    const filters = this.filterState();
    const generation = this.generation;
    const page = data.page + 1;
    this.loadingMoreState.set(true);
    this.loadMoreFailedState.set(false);

    const next: Observable<ListData> =
      data.view === 'entries'
        ? this.gateway.listEntries(filters, page, LIST_PAGE_SIZE).pipe(
            map((slice) => ({
              ...data,
              entries: [...data.entries, ...slice.items],
              entryTotals: slice.totals,
              hasNext: slice.hasNext,
              page,
            })),
          )
        : this.gateway.list(filters, page, LIST_PAGE_SIZE).pipe(
            map((slice) => ({
              ...data,
              records: [...data.records, ...slice.items],
              recordTotals: slice.totals,
              hasNext: slice.hasNext,
              page,
            })),
          );

    return next.pipe(
      tap((merged) => {
        if (generation === this.generation) this.current.set({ status: 'ready', data: merged });
      }),
      catchError(() => {
        if (generation === this.generation) this.loadMoreFailedState.set(true);
        return of(null);
      }),
      tap({
        finalize: () => {
          if (generation === this.generation) this.loadingMoreState.set(false);
        },
      }),
    );
  }
}
