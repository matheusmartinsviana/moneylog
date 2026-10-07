import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  catchError,
  distinctUntilChanged,
  map,
  of,
  startWith,
  Observable,
  Subject,
  switchMap,
  timer,
} from 'rxjs';

import { SEARCH_DEBOUNCE_MS } from '~/modules/transactions/core/facades/transactions-list.facade';
import { TransactionsGateway } from '~/modules/transactions/core/interfaces/transactions.gateway';
import {
  defaultFilters,
  firstDayMonthsBefore,
  monthBounds,
} from '~/modules/transactions/core/types/list-filters';
import type { Transaction } from '~/modules/transactions/core/types/transaction';
import { todayIso } from '~/util/date';
import { cleanSearchTerm } from '~/util/search-term';

/** Meses para trás (além do corrente) em que a despesa original é procurada. */
export const ORIGIN_SEARCH_MONTHS = 3;
export const ORIGIN_SEARCH_PAGE_SIZE = 10;

type SearchState =
  | { readonly status: 'idle' }
  | { readonly status: 'searching' }
  | { readonly status: 'done'; readonly items: readonly Transaction[] };

/**
 * Busca da despesa original de um reembolso (T41): despesas **ativas** do período (os últimos meses),
 * por descrição, com 300 ms de espera e `switchMap` (a busca anterior é cancelada). Texto vazio limpa
 * os resultados sem pedir nada; falha vira "sem resultados" (a busca é opcional). Escopo de componente.
 */
@Injectable()
export class RefundOriginSearchFacade {
  private readonly gateway = inject(TransactionsGateway);
  private readonly terms = new Subject<string>();
  private readonly current = signal<SearchState>({ status: 'idle' });

  /** `null` enquanto não há busca (nada digitado); lista (talvez vazia) depois dela. */
  readonly results = computed<readonly Transaction[] | null>(() => {
    const state = this.current();
    return state.status === 'done' ? state.items : null;
  });
  readonly searching = computed(() => this.current().status === 'searching');

  constructor() {
    this.terms
      .pipe(
        map((term) => cleanSearchTerm(term).trim()),
        distinctUntilChanged(),
        // Texto vazio cancela a busca em andamento na hora; o resto espera a digitação parar.
        switchMap((term) =>
          term === ''
            ? of<SearchState>({ status: 'idle' })
            : timer(SEARCH_DEBOUNCE_MS).pipe(switchMap(() => this.run(term))),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.current.set(state));
  }

  /** Texto digitado no campo de busca. */
  search(term: string): void {
    this.terms.next(term);
  }

  private run(term: string): Observable<SearchState> {
    const today = todayIso();
    const filters = {
      ...defaultFilters(today),
      type: 'EXPENSE' as const,
      q: term,
      from: firstDayMonthsBefore(today, ORIGIN_SEARCH_MONTHS),
      to: monthBounds(today).to,
    };
    return this.gateway.list(filters, 1, ORIGIN_SEARCH_PAGE_SIZE).pipe(
      map((slice): SearchState => ({ status: 'done', items: slice.items })),
      startWith<SearchState>({ status: 'searching' }),
      catchError(() => of<SearchState>({ status: 'done', items: [] })),
    );
  }
}
