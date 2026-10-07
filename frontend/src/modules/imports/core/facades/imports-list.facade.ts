import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, Subject, switchMap } from 'rxjs';

import { ImportsGateway } from '~/modules/imports/core/interfaces/imports.gateway';
import type { ImportBatch } from '~/modules/imports/core/types/import';
import { Problem, problemOf } from '~/util/api/problem';

export type ImportsListState =
  | { readonly status: 'loading' }
  | { readonly status: 'empty' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly data: readonly ImportBatch[] };

const LOADING: ImportsListState = { status: 'loading' };
const RECENT = 20;

/** Lotes de importação recentes (do mais novo ao mais antigo). Escopo de componente. */
@Injectable()
export class ImportsListFacade {
  private readonly gateway = inject(ImportsGateway);
  private readonly loads = new Subject<void>();
  private readonly current = signal<ImportsListState>(LOADING);

  readonly state = this.current.asReadonly();
  readonly error = computed(() => {
    const state = this.current();
    return state.status === 'error' ? state.problem : null;
  });

  constructor() {
    this.loads
      .pipe(
        switchMap(() =>
          this.gateway.list({ page: 1, pageSize: RECENT }).pipe(
            map((slice): ImportsListState =>
              slice.items.length === 0
                ? { status: 'empty' }
                : { status: 'ready', data: slice.items },
            ),
            startWith(LOADING),
            catchError((error: unknown) =>
              of<ImportsListState>({ status: 'error', problem: problemOf(error) }),
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
