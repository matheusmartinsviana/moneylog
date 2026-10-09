import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  catchError,
  EMPTY,
  expand,
  map,
  Observable,
  of,
  reduce,
  startWith,
  Subject,
  switchMap,
} from 'rxjs';

import { GoalsGateway } from '~/modules/goals/core/interfaces/goals.gateway';
import type { Goal, GoalStatus } from '~/modules/goals/core/types/goal';
import { Problem, problemOf } from '~/util/api/problem';
import { MAX_PAGE_SIZE } from '~/util/api/slice';

export type GoalsListState =
  | { readonly status: 'loading' }
  | { readonly status: 'empty' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly data: readonly Goal[] };

const LOADING: GoalsListState = { status: 'loading' };

/**
 * Facade da lista de metas: pede ao backend as metas de um status (a ordem é a dele: prioridade, prazo e
 * nome) e pagina até o fim. `current`, `progress`, `remaining` e `monthlyNeeded` chegam calculados; nada é
 * somado aqui. Pedir outro status cancela a requisição anterior (`switchMap`). Escopo de componente.
 */
@Injectable()
export class GoalsListFacade {
  private readonly gateway = inject(GoalsGateway);
  private readonly loads = new Subject<{
    readonly status: GoalStatus | undefined;
    readonly featured: boolean | undefined;
    readonly silent: boolean;
  }>();
  private readonly current = signal<GoalsListState>(LOADING);

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
        switchMap(({ status, featured, silent }) =>
          this.loadAll(status, featured).pipe(
            map((data): GoalsListState =>
              data.length === 0 ? { status: 'empty' } : { status: 'ready', data },
            ),
            // Recarga silenciosa: não passa por `loading` (a tela e a folha continuam montadas).
            startWith(...(silent ? [] : [LOADING])),
            catchError((error: unknown) => {
              const before = this.current();
              // Recarga silenciosa que falha: o último `ready` continua valendo (M5 da Etapa 4).
              if (silent && before.status === 'ready') return of(before);
              return of<GoalsListState>({ status: 'error', problem: problemOf(error) });
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.current.set(state));
  }

  /** Carrega (ou recarrega, no "tentar de novo") as metas de um status; sem status, todas. */
  load(status?: GoalStatus, featured?: boolean): void {
    this.loads.next({ status, featured, silent: false });
  }

  /**
   * Recarrega sem trocar `ready` por `loading` e sem trocar `ready` por erro se a rede falhar: quem já tem
   * dados (o Início com a folha de reserva aberta) não perde a tela. Sem dados anteriores, comporta-se como `load`.
   */
  reload(status?: GoalStatus, featured?: boolean): void {
    this.loads.next({ status, featured, silent: this.current().status === 'ready' });
  }

  /** Todas as metas do status, paginando até o fim (como S-91). */
  loadAll(status?: GoalStatus, featured?: boolean): Observable<readonly Goal[]> {
    const page = (n: number) =>
      this.gateway.list({
        ...(status ? { status } : {}),
        ...(featured === undefined ? {} : { featured }),
        page: n,
        pageSize: MAX_PAGE_SIZE,
      });
    return page(1).pipe(
      expand((slice, index) => (slice.hasNext ? page(index + 2) : EMPTY)),
      reduce((all: readonly Goal[], slice) => [...all, ...slice.items], [] as readonly Goal[]),
    );
  }
}
