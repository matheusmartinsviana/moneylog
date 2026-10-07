import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, exhaustMap, map, of, startWith, Subject, switchMap, tap } from 'rxjs';

import { GoalsGateway } from '~/modules/goals/core/interfaces/goals.gateway';
import type { Goal } from '~/modules/goals/core/types/goal';
import { Problem, problemOf } from '~/util/api/problem';

export type GoalDetailState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly goal: Goal };

/** O código que o backend devolve quando a meta já está no estado pedido. */
const ALREADY_DONE = {
  archive: 'GOAL_ALREADY_ARCHIVED',
  unarchive: 'GOAL_NOT_ARCHIVED',
} as const;

/**
 * Facade do detalhe da meta: carrega pelo id (o `switchMap` cancela a anterior), arquiva e desarquiva
 * (`exhaustMap`, a meta da resposta vira o estado) e recebe a meta devolvida por uma reserva (`apply`).
 * Nada é calculado aqui: reservas, `current` e `progress` vêm do backend. Escopo de componente.
 */
@Injectable()
export class GoalDetailFacade {
  private readonly gateway = inject(GoalsGateway);
  private readonly loads = new Subject<string>();
  private readonly actions = new Subject<{ kind: 'archive' | 'unarchive'; id: string }>();
  private readonly doneEvents = new Subject<{ kind: 'archive' | 'unarchive'; goal: Goal }>();
  private readonly current = signal<GoalDetailState>({ status: 'loading' });
  private readonly busyState = signal(false);
  private readonly problemState = signal<Problem | null>(null);

  readonly state = this.current.asReadonly();
  readonly goal = computed(() => {
    const state = this.current();
    return state.status === 'ready' ? state.goal : null;
  });
  readonly error = computed(() => {
    const state = this.current();
    return state.status === 'error' ? state.problem : null;
  });
  readonly busy = this.busyState.asReadonly();
  /** Falha do último arquivar/desarquivar. */
  readonly problem = this.problemState.asReadonly();
  readonly done$ = this.doneEvents.asObservable();

  constructor() {
    this.loads
      .pipe(
        switchMap((id) =>
          this.gateway.get(id).pipe(
            map((goal): GoalDetailState => ({ status: 'ready', goal })),
            startWith<GoalDetailState>({ status: 'loading' }),
            catchError((error: unknown) =>
              of<GoalDetailState>({ status: 'error', problem: problemOf(error) }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.current.set(state));

    this.actions
      .pipe(
        exhaustMap(({ kind, id }) => {
          this.busyState.set(true);
          this.problemState.set(null);
          const call = kind === 'archive' ? this.gateway.archive(id) : this.gateway.unarchive(id);
          return call.pipe(
            tap((goal) => {
              this.apply(goal);
              this.doneEvents.next({ kind, goal });
            }),
            map(() => null),
            catchError((error: unknown) => {
              const problem = problemOf(error);
              // Já está no estado pedido (um clique anterior deu certo e a resposta se perdeu): é sucesso
              // silencioso; só relê a meta, sem aviso nem falha (FE-S-172).
              if (problem.code === ALREADY_DONE[kind]) {
                return this.gateway.get(id).pipe(
                  tap((goal) => this.apply(goal)),
                  map(() => null),
                  catchError((reloadError: unknown) => of(problemOf(reloadError))),
                );
              }
              return of(problem);
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((problem) => {
        this.busyState.set(false);
        this.problemState.set(problem);
      });
  }

  load(id: string): void {
    this.loads.next(id);
  }

  archive(id: string): void {
    this.actions.next({ kind: 'archive', id });
  }

  unarchive(id: string): void {
    this.actions.next({ kind: 'unarchive', id });
  }

  /** A meta devolvida pelo backend (reserva, arquivar...) vira o estado: nada é chutado. */
  apply(goal: Goal): void {
    this.current.set({ status: 'ready', goal });
  }

  clearProblem(): void {
    this.problemState.set(null);
  }
}
