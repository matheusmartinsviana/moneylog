import { inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  catchError,
  exhaustMap,
  map,
  Observable,
  of,
  startWith,
  Subject,
  switchMap,
  tap,
} from 'rxjs';

import { GoalsGateway } from '~/modules/goals/core/interfaces/goals.gateway';
import type { Goal, GoalInput, GoalUpdate } from '~/modules/goals/core/types/goal';
import { IdempotencyTracker } from '~/util/api/idempotency-key';
import { Problem, problemOf } from '~/util/api/problem';

export type SaveGoal =
  | { readonly kind: 'create'; readonly input: GoalInput }
  | { readonly kind: 'update'; readonly id: string; readonly input: GoalUpdate };

export type GoalLoadState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly goal: Goal };

/**
 * Facade do formulário de meta (criar e editar). `exhaustMap` no salvar (clique duplo = uma requisição) e
 * **a meta da resposta** é o novo estado. A criação leva `Idempotency-Key` (uma por tentativa, reutilizada
 * no "Salvar" da mesma entrada depois de falha ambígua). Falhas chegam tipadas (`code` + `fieldErrors`,
 * `GOAL_ARCHIVED`, `VERSION_CONFLICT`). Escopo de componente.
 */
@Injectable()
export class GoalFormFacade {
  private readonly gateway = inject(GoalsGateway);
  private readonly saves = new Subject<SaveGoal>();
  private readonly loads = new Subject<string>();
  private readonly savedEvents = new Subject<Goal>();
  private readonly savingState = signal(false);
  private readonly problemState = signal<Problem | null>(null);
  private readonly loadState = signal<GoalLoadState>({ status: 'idle' });
  private readonly loaded = signal<Goal | null>(null);
  private readonly keys = new IdempotencyTracker<GoalInput>();

  readonly saving = this.savingState.asReadonly();
  readonly problem = this.problemState.asReadonly();
  readonly loadStatus = this.loadState.asReadonly();
  /** A meta carregada; durante uma recarga (ex.: depois de um 409) continua a anterior. */
  readonly goal = this.loaded.asReadonly();
  readonly saved$ = this.savedEvents.asObservable();

  constructor() {
    this.saves
      .pipe(
        exhaustMap((command) => {
          this.savingState.set(true);
          this.problemState.set(null);
          return this.send(command).pipe(
            tap((goal) => {
              this.keys.succeeded();
              this.savedEvents.next(goal);
            }),
            map(() => null),
            catchError((error: unknown) => of(problemOf(error))),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((problem) => {
        this.savingState.set(false);
        if (problem !== null) this.keys.failed(problem);
        this.problemState.set(problem);
      });

    this.loads
      .pipe(
        switchMap((id) =>
          this.gateway.get(id).pipe(
            map((goal): GoalLoadState => ({ status: 'ready', goal })),
            startWith<GoalLoadState>({ status: 'loading' }),
            catchError((error: unknown) =>
              of<GoalLoadState>({ status: 'error', problem: problemOf(error) }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => {
        this.loadState.set(state);
        if (state.status === 'ready') this.loaded.set(state.goal);
        else if (state.status === 'error') this.loaded.set(null);
      });
  }

  load(id: string): void {
    this.loads.next(id);
  }

  dismissProblem(): void {
    this.problemState.set(null);
  }

  save(command: SaveGoal): void {
    this.saves.next(command);
  }

  private send(command: SaveGoal): Observable<Goal> {
    return command.kind === 'create'
      ? this.gateway.create(command.input, this.keys.begin(command.input))
      : this.gateway.update(command.id, command.input);
  }
}
