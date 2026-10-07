import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, Subject, switchMap } from 'rxjs';

import { TransactionsGateway } from '~/modules/transactions/core/interfaces/transactions.gateway';
import { defaultFilters } from '~/modules/transactions/core/types/list-filters';
import type { Transaction } from '~/modules/transactions/core/types/transaction';
import { Problem, problemOf } from '~/util/api/problem';

/** Quantas movimentações o Início mostra em "Recentes" (T206). */
export const RECENT_PAGE_SIZE = 5;

export type RecentTransactionsState =
  | { readonly status: 'loading' }
  | { readonly status: 'empty' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly data: readonly Transaction[] };

/**
 * Facade das movimentações recentes do Início (T206): as 5 mais novas **até `asOf`** (a data do backend), só
 * `ACTIVE`, sem filtro de período inferior. O `to=asOf` impede que movimentação agendada para o futuro (S-258)
 * apareça como "recente". Reaproveita a porta e a ordem da lista (`date desc, createdAt desc`); nada é
 * somado ou reordenado no front. Escopo de componente.
 */
@Injectable()
export class RecentTransactionsFacade {
  private readonly gateway = inject(TransactionsGateway);
  private readonly loads = new Subject<string>();
  private readonly current = signal<RecentTransactionsState>({ status: 'loading' });
  private asOf: string | null = null;

  readonly state = this.current.asReadonly();
  readonly data = computed(() => {
    const state = this.current();
    return state.status === 'ready' ? state.data : null;
  });

  constructor() {
    this.loads
      .pipe(
        switchMap((asOf) =>
          this.gateway
            .list({ ...defaultFilters(asOf), from: null, to: asOf }, 1, RECENT_PAGE_SIZE)
            .pipe(
              map((slice): RecentTransactionsState =>
                slice.items.length === 0
                  ? { status: 'empty' }
                  : { status: 'ready', data: slice.items },
              ),
              startWith<RecentTransactionsState>({ status: 'loading' }),
              catchError((error: unknown) =>
                of<RecentTransactionsState>({ status: 'error', problem: problemOf(error) }),
              ),
            ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.current.set(state));
  }

  /** `asOf` = a data de referência do dashboard (`YYYY-MM-DD`), vinda do backend. */
  load(asOf: string): void {
    this.asOf = asOf;
    this.loads.next(asOf);
  }

  retry(): void {
    if (this.asOf !== null) this.loads.next(this.asOf);
  }
}
