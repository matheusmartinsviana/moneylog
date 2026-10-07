import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, Subject, switchMap } from 'rxjs';

import { DebtOverviewGateway } from '~/modules/debt-overview/core/interfaces/debt-overview.gateway';
import type { DebtOverview } from '~/modules/debt-overview/core/types/debt-overview';
import { Problem, problemOf } from '~/util/api/problem';

export type DebtOverviewState =
  | { readonly status: 'loading' }
  /** Nada cadastrado (`hasRecords = false`): não é "livre de dívidas". */
  | { readonly status: 'empty'; readonly data: DebtOverview }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly data: DebtOverview };

const DEFAULT_MONTHS = 12;

/**
 * Facade da visão total de dívidas: o horizonte (`months`) vai na requisição e mudar o horizonte ou
 * recarregar **cancela** a anterior (`switchMap`). Nada é calculado aqui: o estado é o que o backend
 * devolveu. Escopo de componente.
 */
@Injectable()
export class DebtOverviewFacade {
  private readonly gateway = inject(DebtOverviewGateway);
  private readonly loads = new Subject<number>();
  private readonly current = signal<DebtOverviewState>({ status: 'loading' });
  private readonly monthsState = signal(DEFAULT_MONTHS);

  readonly state = this.current.asReadonly();
  readonly months = this.monthsState.asReadonly();
  readonly data = computed(() => {
    const state = this.current();
    return state.status === 'ready' || state.status === 'empty' ? state.data : null;
  });
  readonly error = computed(() => {
    const state = this.current();
    return state.status === 'error' ? state.problem : null;
  });

  constructor() {
    this.loads
      .pipe(
        switchMap((months) =>
          this.gateway.get(months).pipe(
            map((data): DebtOverviewState => ({
              status: data.hasRecords ? 'ready' : 'empty',
              data,
            })),
            startWith<DebtOverviewState>({ status: 'loading' }),
            catchError((error: unknown) =>
              of<DebtOverviewState>({ status: 'error', problem: problemOf(error) }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.current.set(state));
  }

  load(months: number = this.monthsState()): void {
    this.monthsState.set(months);
    this.loads.next(months);
  }
}
