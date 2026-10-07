import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, concatMap, finalize, map, of, startWith, Subject, switchMap, tap } from 'rxjs';

import { UnreadCountFacade } from '~/modules/notifications/core/facades/unread-count.facade';
import { NotificationsGateway } from '~/modules/notifications/core/interfaces/notifications.gateway';
import type {
  AppNotification,
  NotificationKind,
} from '~/modules/notifications/core/types/notification';
import { Problem, problemOf } from '~/util/api/problem';
import { MAX_PAGE_SIZE } from '~/util/api/slice';

export interface CenterFilter {
  readonly status: 'UNREAD' | 'ALL';
  readonly kind: NotificationKind | null;
}

export type CenterState =
  | { readonly status: 'loading' }
  | { readonly status: 'empty' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly data: readonly AppNotification[] };

/**
 * Facade da central de notificações: lista paginada ("carregar mais"), filtro por tipo e leitura. Depois de
 * marcar como lida relê a lista e o contador do backend (nada é decidido no front). Escopo de componente.
 */
@Injectable()
export class NotificationsCenterFacade {
  private readonly gateway = inject(NotificationsGateway);
  private readonly unread = inject(UnreadCountFacade);
  private readonly loads = new Subject<CenterFilter>();
  private readonly reads = new Subject<string | 'ALL'>();
  private readonly current = signal<CenterState>({ status: 'loading' });
  private readonly filterState = signal<CenterFilter>({ status: 'ALL', kind: null });
  private readonly hasMoreState = signal(false);
  private readonly moreLoading = signal(false);
  private readonly staleState = signal(false);
  private readonly problemState = signal<Problem | null>(null);
  private page = 1;

  readonly state = this.current.asReadonly();
  readonly filter = this.filterState.asReadonly();
  readonly hasMore = this.hasMoreState.asReadonly();
  readonly loadingMore = this.moreLoading.asReadonly();
  /** A lista mostrada é a última carregada (a releitura falhou sem rede). */
  readonly stale = this.staleState.asReadonly();
  /** Falha de "marcar como lida" (a lista segue como estava). */
  readonly actionProblem = this.problemState.asReadonly();
  readonly error = computed(() => {
    const state = this.current();
    return state.status === 'error' ? state.problem : null;
  });

  constructor() {
    this.loads
      .pipe(
        switchMap((filter) => {
          this.page = 1;
          const previous = this.current();
          return this.gateway.list({ ...filter, page: 1, pageSize: MAX_PAGE_SIZE }).pipe(
            tap((slice) => {
              this.hasMoreState.set(slice.hasNext);
              this.staleState.set(false);
            }),
            map((slice): CenterState =>
              slice.items.length === 0
                ? { status: 'empty' }
                : { status: 'ready', data: slice.items },
            ),
            startWith<CenterState>({ status: 'loading' }),
            catchError((error: unknown) => {
              const problem = problemOf(error);
              // Sem rede e com uma lista já carregada: mostra a última lista, com aviso.
              if (problem.status === 0 && previous.status === 'ready') {
                this.staleState.set(true);
                return of<CenterState>(previous);
              }
              return of<CenterState>({ status: 'error', problem });
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.current.set(state));

    this.reads
      .pipe(
        concatMap((target) => {
          this.problemState.set(null);
          const call =
            target === 'ALL' ? this.gateway.markAllRead() : this.gateway.markRead(target);
          return call.pipe(
            catchError((error: unknown) => {
              this.problemState.set(problemOf(error));
              return of(undefined);
            }),
            tap(() => {
              this.unread.refresh();
              this.loads.next(this.filterState());
            }),
            map(() => null),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  load(filter: CenterFilter = this.filterState()): void {
    this.filterState.set(filter);
    this.loads.next(filter);
  }

  loadMore(): void {
    const state = this.current();
    if (state.status !== 'ready' || !this.hasMoreState() || this.moreLoading()) return;
    this.moreLoading.set(true);
    this.gateway
      .list({ ...this.filterState(), page: this.page + 1, pageSize: MAX_PAGE_SIZE })
      .pipe(finalize(() => this.moreLoading.set(false)))
      .subscribe({
        next: (slice) => {
          this.page += 1;
          this.hasMoreState.set(slice.hasNext);
          this.current.set({ status: 'ready', data: [...state.data, ...slice.items] });
        },
        error: (error: unknown) => this.problemState.set(problemOf(error)),
      });
  }

  markRead(id: string): void {
    this.reads.next(id);
  }

  markAllRead(): void {
    this.reads.next('ALL');
  }
}
