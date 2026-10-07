import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, Subject, switchMap } from 'rxjs';

import { ProjectionsGateway } from '~/modules/projections/core/interfaces/projections.gateway';
import type { Projection, ProjectionQuery } from '~/modules/projections/core/types/projection';
import { Problem, problemOf } from '~/util/api/problem';

export type ProjectionState =
  | { readonly status: 'loading' }
  | { readonly status: 'empty' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly data: Projection };

/**
 * Facade das projeções: `horizon` e `includeTrend` vão para a requisição e mudar qualquer um **cancela** a
 * anterior (`switchMap`), então uma resposta atrasada de outro horizonte nunca aparece. Vazio = série sem
 * pontos (sem dados). Nada é calculado aqui. Escopo de componente.
 */
@Injectable()
export class ProjectionsFacade {
  private readonly gateway = inject(ProjectionsGateway);
  private readonly loads = new Subject<ProjectionQuery>();
  private readonly current = signal<ProjectionState>({ status: 'loading' });

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
        switchMap((query) =>
          this.gateway.get(query).pipe(
            map((data): ProjectionState =>
              data.series.length === 0 ? { status: 'empty' } : { status: 'ready', data },
            ),
            startWith<ProjectionState>({ status: 'loading' }),
            catchError((error: unknown) =>
              of<ProjectionState>({ status: 'error', problem: problemOf(error) }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.current.set(state));
  }

  load(query: ProjectionQuery): void {
    this.loads.next(query);
  }
}
