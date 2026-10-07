import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  catchError,
  EMPTY,
  exhaustMap,
  expand,
  map,
  Observable,
  of,
  reduce,
  startWith,
  Subject,
  switchMap,
  tap,
} from 'rxjs';

import { RecurrencesGateway } from '~/modules/recurrences/core/interfaces/recurrences.gateway';
import type { Recurrence, RecurrenceSummary } from '~/modules/recurrences/core/types/recurrence';
import { Problem, problemOf } from '~/util/api/problem';
import { MAX_PAGE_SIZE } from '~/util/api/slice';

export type RecurrencesListState =
  | { readonly status: 'loading' }
  | { readonly status: 'empty' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly data: readonly Recurrence[] };

export type SummaryState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly data: RecurrenceSummary };

type RowAction =
  | { readonly kind: 'deactivate'; readonly id: string }
  | { readonly kind: 'end'; readonly id: string; readonly endDate: string | null };

const LOADING = { status: 'loading' } as const;

/**
 * Facade da lista de recorrências (FE 01) e do resumo "custo fixo mensal" / "receita recorrente mensal"
 * (estimativa, S-146): ambos vêm do backend, sem soma no front. O resumo tem estado próprio (uma falha
 * nele não esconde a lista). Encerrar e desativar usam `exhaustMap`, substituem a recorrência pela
 * resposta e recarregam o resumo do backend (uma recorrência desativada deixa de contar). Escopo de componente.
 */
@Injectable()
export class RecurrencesListFacade {
  private readonly gateway = inject(RecurrencesGateway);
  private readonly loads = new Subject<void>();
  private readonly summaryLoads = new Subject<void>();
  private readonly actions = new Subject<RowAction>();
  private readonly doneEvents = new Subject<{
    readonly action: RowAction['kind'];
    readonly recurrence: Recurrence;
  }>();
  private readonly current = signal<RecurrencesListState>(LOADING);
  private readonly summaryState = signal<SummaryState>(LOADING);
  private readonly busyState = signal(false);
  private readonly problemState = signal<Problem | null>(null);

  readonly state = this.current.asReadonly();
  readonly summary = this.summaryState.asReadonly();
  readonly data = computed(() => {
    const state = this.current();
    return state.status === 'ready' ? state.data : null;
  });
  readonly error = computed(() => {
    const state = this.current();
    return state.status === 'error' ? state.problem : null;
  });
  /** Encerrar/desativar em andamento. */
  readonly busy = this.busyState.asReadonly();
  /** Falha da última ação de linha (`RECURRENCE_INVALID`...). */
  readonly problem = this.problemState.asReadonly();
  /** Emite a recorrência devolvida pela API quando encerrar ou desativar dá certo. */
  readonly done$ = this.doneEvents.asObservable();

  constructor() {
    this.loads
      .pipe(
        switchMap(() =>
          this.loadAll().pipe(
            map((data): RecurrencesListState =>
              data.length === 0 ? { status: 'empty' } : { status: 'ready', data },
            ),
            startWith<RecurrencesListState>(LOADING),
            catchError((error: unknown) =>
              of<RecurrencesListState>({ status: 'error', problem: problemOf(error) }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.current.set(state));

    this.summaryLoads
      .pipe(
        switchMap(() =>
          this.gateway.summary().pipe(
            map((data): SummaryState => ({ status: 'ready', data })),
            startWith<SummaryState>(LOADING),
            catchError((error: unknown) =>
              of<SummaryState>({ status: 'error', problem: problemOf(error) }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.summaryState.set(state));

    this.actions
      .pipe(
        exhaustMap((action) => {
          this.busyState.set(true);
          this.problemState.set(null);
          const call =
            action.kind === 'deactivate'
              ? this.gateway.deactivate(action.id)
              : this.gateway.end(action.id, action.endDate);
          return call.pipe(
            tap((recurrence) => {
              this.replace(recurrence);
              this.doneEvents.next({ action: action.kind, recurrence });
              // O custo fixo muda quando a recorrência deixa de contar: o backend recalcula.
              this.summaryLoads.next();
            }),
            map(() => null),
            catchError((error: unknown) => of(problemOf(error))),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((problem) => {
        this.busyState.set(false);
        this.problemState.set(problem);
      });
  }

  /** Carrega (ou recarrega, no "tentar de novo") a lista e o resumo. */
  load(): void {
    this.loads.next();
    this.summaryLoads.next();
  }

  loadSummary(): void {
    this.summaryLoads.next();
  }

  /** Todas as recorrências (ativas e desativadas), paginando até o fim (como S-91). */
  loadAll(): Observable<readonly Recurrence[]> {
    const page = (n: number) => this.gateway.list({ page: n, pageSize: MAX_PAGE_SIZE });
    return page(1).pipe(
      expand((slice, index) => (slice.hasNext ? page(index + 2) : EMPTY)),
      reduce(
        (all: readonly Recurrence[], slice) => [...all, ...slice.items],
        [] as readonly Recurrence[],
      ),
    );
  }

  deactivate(id: string): void {
    this.actions.next({ kind: 'deactivate', id });
  }

  /** Encerra numa data (`null` = hoje, definida pelo backend). */
  end(id: string, endDate: string | null): void {
    this.actions.next({ kind: 'end', id, endDate });
  }

  clearProblem(): void {
    this.problemState.set(null);
  }

  private replace(recurrence: Recurrence): void {
    const state = this.current();
    if (state.status !== 'ready') return;
    this.current.set({
      status: 'ready',
      data: state.data.map((item) => (item.id === recurrence.id ? recurrence : item)),
    });
  }
}
