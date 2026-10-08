import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, EMPTY, expand, map, of, reduce, startWith, Subject, switchMap } from 'rxjs';

import { CommitmentsGateway } from '~/modules/commitments/core/interfaces/commitments.gateway';
import type { Commitment } from '~/modules/commitments/core/types/commitment';
import { Problem, problemOf } from '~/util/api/problem';
import { MAX_PAGE_SIZE } from '~/util/api/slice';

export type CommitmentsListState =
  | { readonly status: 'loading' }
  | { readonly status: 'empty' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly data: readonly Commitment[] };

/** Segurança contra laço: no máximo 10 páginas de 50 compromissos. */
const MAX_PAGES = 10;

/** Facade da lista de compromissos acompanhados (ordem do backend). Recarregar cancela a anterior. */
@Injectable()
export class CommitmentsListFacade {
  private readonly gateway = inject(CommitmentsGateway);
  private readonly loads = new Subject<void>();
  private readonly current = signal<CommitmentsListState>({ status: 'loading' });

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
        switchMap(() =>
          this.gateway.list({ page: 1, pageSize: MAX_PAGE_SIZE }).pipe(
            expand((slice, index) =>
              slice.hasNext && index + 1 < MAX_PAGES
                ? this.gateway.list({ page: index + 2, pageSize: MAX_PAGE_SIZE })
                : EMPTY,
            ),
            reduce((all, slice) => [...all, ...slice.items], [] as readonly Commitment[]),
            map((items): CommitmentsListState =>
              items.length === 0 ? { status: 'empty' } : { status: 'ready', data: items },
            ),
            startWith<CommitmentsListState>({ status: 'loading' }),
            catchError((error: unknown) =>
              of<CommitmentsListState>({ status: 'error', problem: problemOf(error) }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.current.set(state));
  }

  load(): void {
    this.loads.next();
  }
}
