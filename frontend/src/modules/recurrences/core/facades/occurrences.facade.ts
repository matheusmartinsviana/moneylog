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
import type { Occurrence } from '~/modules/recurrences/core/types/recurrence';
import { Problem, problemOf } from '~/util/api/problem';
import { MAX_PAGE_SIZE } from '~/util/api/slice';

export type OccurrencesState =
  | { readonly status: 'loading' }
  | { readonly status: 'empty' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly data: readonly Occurrence[] };

const LOADING: OccurrencesState = { status: 'loading' };

interface Page {
  readonly data: readonly Occurrence[];
  readonly truncated: boolean;
}

/** Códigos em que a ocorrência já não está mais pendente: a lista é recarregada do backend. */
const STALE_CODES: ReadonlySet<string> = new Set([
  'RECURRENCE_OCCURRENCE_ALREADY_REALIZED',
  'RECURRENCE_OCCURRENCE_SKIPPED',
  'RECURRENCE_NOT_AN_OCCURRENCE',
  // Recorrência desativada ou encerrada em outro aparelho: a ocorrência já não está mais na agenda.
  'RECURRENCE_INACTIVE',
  'RECURRENCE_ENDED',
]);

/**
 * Facade das ocorrências pendentes (vencidas e próximas, S-20): pede `status = PENDING` **sem** `from`
 * (o backend começa no início da agenda, então as vencidas vêm) e `to` padrão do backend. `overdue` vem
 * pronto por ocorrência. "Pular" usa `exhaustMap`, confirma pela resposta e tira a ocorrência da lista;
 * se o backend diz que ela já não está pendente, recarrega. `reload` serve depois de realizar. Escopo de componente.
 */
@Injectable()
export class OccurrencesFacade {
  private readonly gateway = inject(RecurrencesGateway);
  private readonly loads = new Subject<boolean>();
  private readonly skips = new Subject<{ recurrenceId: string; date: string }>();
  private readonly skippedEvents = new Subject<Occurrence>();
  private readonly current = signal<OccurrencesState>(LOADING);
  private readonly skippingState = signal(false);
  private readonly problemState = signal<Problem | null>(null);
  private readonly truncatedState = signal(false);

  readonly state = this.current.asReadonly();
  readonly data = computed(() => {
    const state = this.current();
    return state.status === 'ready' ? state.data : null;
  });
  readonly error = computed(() => {
    const state = this.current();
    return state.status === 'error' ? state.problem : null;
  });
  /** O backend limitou as vencidas às 500 mais recentes (S-240): só avisa, nada é calculado. */
  readonly overdueTruncated = this.truncatedState.asReadonly();
  readonly skipping = this.skippingState.asReadonly();
  /** Falha do último "pular". */
  readonly problem = this.problemState.asReadonly();
  readonly skipped$ = this.skippedEvents.asObservable();

  constructor() {
    this.loads
      .pipe(
        switchMap((silent) =>
          this.loadAll().pipe(
            tap(({ truncated }) => this.truncatedState.set(truncated)),
            map(({ data }): OccurrencesState =>
              data.length === 0 ? { status: 'empty' } : { status: 'ready', data },
            ),
            silent ? (source) => source : startWith(LOADING),
            catchError((error: unknown) =>
              of<OccurrencesState>({ status: 'error', problem: problemOf(error) }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.current.set(state));

    this.skips
      .pipe(
        exhaustMap(({ recurrenceId, date }) => {
          this.skippingState.set(true);
          this.problemState.set(null);
          return this.gateway.skip(recurrenceId, date).pipe(
            tap((occurrence) => {
              this.remove(recurrenceId, date);
              this.skippedEvents.next(occurrence);
            }),
            map(() => null),
            catchError((error: unknown) => {
              const problem = problemOf(error);
              if (STALE_CODES.has(problem.code)) this.reload();
              return of(problem);
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((problem) => {
        this.skippingState.set(false);
        this.problemState.set(problem);
      });
  }

  load(): void {
    this.loads.next(false);
  }

  /** Recarrega do backend sem voltar ao esqueleto. */
  reload(): void {
    this.loads.next(true);
  }

  skip(recurrenceId: string, date: string): void {
    this.skips.next({ recurrenceId, date });
  }

  clearProblem(): void {
    this.problemState.set(null);
  }

  private loadAll(): Observable<Page> {
    const page = (n: number) =>
      this.gateway.listOccurrences({ status: 'PENDING', page: n, pageSize: MAX_PAGE_SIZE });
    return page(1).pipe(
      expand((slice, index) => (slice.hasNext ? page(index + 2) : EMPTY)),
      reduce(
        (all: Page, slice) => ({
          data: [...all.data, ...slice.items],
          truncated: all.truncated || slice.overdueTruncated,
        }),
        { data: [], truncated: false } as Page,
      ),
    );
  }

  private remove(recurrenceId: string, date: string): void {
    const state = this.current();
    if (state.status !== 'ready') return;
    const data = state.data.filter(
      (item) => !(item.recurrenceId === recurrenceId && item.date === date),
    );
    this.current.set(data.length === 0 ? { status: 'empty' } : { status: 'ready', data });
  }
}
