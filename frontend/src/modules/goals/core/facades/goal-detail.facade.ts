import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  catchError,
  concatMap,
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
import type { Goal, GoalActionInput } from '~/modules/goals/core/types/goal';
import { Problem, problemOf } from '~/util/api/problem';

export type GoalDetailState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly goal: Goal };

type GoalAction = 'archive' | 'unarchive' | 'baseline';

/** Escritas do plano declarado; o `done$` do plano avisa a página para o aviso de sucesso. */
export type GoalPlanChange = 'note' | 'add' | 'update' | 'remove' | 'check-in';

/** O código que o backend devolve quando a meta já está no estado pedido (`baseline` pode repetir). */
const ALREADY_DONE: Readonly<Partial<Record<GoalAction, string>>> = {
  archive: 'GOAL_ALREADY_ARCHIVED',
  unarchive: 'GOAL_NOT_ARCHIVED',
};

/**
 * Facade do detalhe da meta: carrega pelo id (o `switchMap` cancela a anterior), arquiva e desarquiva
 * (`exhaustMap`, a meta da resposta vira o estado) e recebe a meta devolvida por uma reserva (`apply`).
 * Nada é calculado aqui: reservas, `current` e `progress` vêm do backend. Escopo de componente.
 */
@Injectable()
export class GoalDetailFacade {
  private readonly gateway = inject(GoalsGateway);
  private readonly loads = new Subject<string>();
  private readonly actions = new Subject<{ kind: GoalAction; id: string }>();
  /** Plano declarado: em fila (`concatMap`), porque a ordem dos check-ins e edições importa. */
  private readonly planCommands = new Subject<{
    kind: GoalPlanChange;
    run: () => Observable<Goal>;
  }>();
  private readonly planDoneEvents = new Subject<GoalPlanChange>();
  private readonly planBusyState = signal(false);
  private readonly planProblemState = signal<Problem | null>(null);
  private readonly doneEvents = new Subject<{ kind: GoalAction; goal: Goal }>();
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
  /** Há uma escrita do plano (nota, ação ou check-in) em andamento. */
  readonly planBusy = this.planBusyState.asReadonly();
  /** Falha da última escrita do plano (`GOAL_ACTION_LIMIT`, `GOAL_CHECKIN_PERIOD_INVALID`...). */
  readonly planProblem = this.planProblemState.asReadonly();
  readonly planDone$ = this.planDoneEvents.asObservable();
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
          const call =
            kind === 'archive'
              ? this.gateway.archive(id)
              : kind === 'unarchive'
                ? this.gateway.unarchive(id)
                : this.gateway.baseline(id);
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
              if (ALREADY_DONE[kind] !== undefined && problem.code === ALREADY_DONE[kind]) {
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

    this.planCommands
      .pipe(
        concatMap(({ kind, run }) => {
          this.planBusyState.set(true);
          this.planProblemState.set(null);
          return run().pipe(
            tap((goal) => {
              this.apply(goal);
              this.planDoneEvents.next(kind);
            }),
            map(() => null),
            // Falha: o servidor é a fonte da verdade; relê a meta (a ação pode ter mudado em outro lugar)
            // e mostra o motivo.
            catchError((error: unknown) => {
              const problem = problemOf(error);
              const id = this.goal()?.id;
              if (id === undefined) return of(problem);
              return this.gateway.get(id).pipe(
                tap((goal) => this.apply(goal)),
                map(() => problem),
                catchError(() => of(problem)),
              );
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((problem) => {
        this.planBusyState.set(false);
        this.planProblemState.set(problem);
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

  /** "Cadastrei tudo" (ou re-ancorar): o servidor fixa o total atual; a meta da resposta vira o estado. */
  baseline(id: string): void {
    this.actions.next({ kind: 'baseline', id });
  }

  /** A meta devolvida pelo backend (reserva, arquivar...) vira o estado: nada é chutado. */
  apply(goal: Goal): void {
    this.current.set({ status: 'ready', goal });
  }

  /**
   * Salva o texto do plano. O `PUT` apaga o que não vai, então reenvia os valores atuais da meta
   * (nome, alvo, prazo, prioridade, descrição) e troca só o `planNote`.
   */
  savePlanNote(note: string): void {
    const goal = this.goal();
    if (!goal) return;
    this.planCommands.next({
      kind: 'note',
      run: () =>
        this.gateway.update(goal.id, {
          kind: goal.kind,
          name: goal.name ?? '',
          target: goal.kind === 'METRIC' || goal.kind === 'SAVINGS' ? goal.target.amount : '',
          deadline: goal.deadline,
          priority: goal.priority,
          description: goal.description,
          planNote: note,
          version: goal.version,
        }),
    });
  }

  addAction(input: GoalActionInput): void {
    const id = this.goal()?.id;
    if (id !== undefined) {
      this.planCommands.next({ kind: 'add', run: () => this.gateway.addAction(id, input) });
    }
  }

  updateAction(actionId: string, input: GoalActionInput): void {
    const id = this.goal()?.id;
    if (id !== undefined) {
      this.planCommands.next({
        kind: 'update',
        run: () => this.gateway.updateAction(id, actionId, input),
      });
    }
  }

  removeAction(actionId: string): void {
    const id = this.goal()?.id;
    if (id !== undefined) {
      this.planCommands.next({
        kind: 'remove',
        run: () => this.gateway.deleteAction(id, actionId),
      });
    }
  }

  /** Marca (`done`) ou desmarca o período de uma ação; idempotente no servidor. */
  checkIn(actionId: string, period: string, done: boolean): void {
    const id = this.goal()?.id;
    if (id !== undefined) {
      this.planCommands.next({
        kind: 'check-in',
        run: () => this.gateway.checkIn(id, actionId, period, done),
      });
    }
  }

  clearPlanProblem(): void {
    this.planProblemState.set(null);
  }

  clearProblem(): void {
    this.problemState.set(null);
  }
}
