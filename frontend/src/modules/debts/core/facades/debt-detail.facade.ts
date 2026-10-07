import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  catchError,
  EMPTY,
  exhaustMap,
  map,
  Observable,
  of,
  startWith,
  Subject,
  switchMap,
  tap,
} from 'rxjs';

import { DebtsGateway } from '~/modules/debts/core/interfaces/debts.gateway';
import type { Debt, DebtUpdate } from '~/modules/debts/core/types/debt';
import { Problem, problemOf } from '~/util/api/problem';

export type DebtDetailState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'notFound' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly debt: Debt };

export type DebtAction =
  | { readonly kind: 'cancel'; readonly id: string; readonly reason: string }
  | { readonly kind: 'void'; readonly id: string; readonly reason: string }
  | { readonly kind: 'update'; readonly id: string; readonly input: DebtUpdate };

interface Load {
  readonly id: string;
  readonly silent: boolean;
}

/**
 * Facade da tela da dívida (FE 01): a dívida com as quitações e as flags `cancelable`/`voidable`/
 * `voidBlockedBy` do backend. Perdoar, estornar o registro e editar usam `exhaustMap` (clique duplo =
 * uma requisição) e **substituem a dívida pela resposta** (nada de chutar o estado). Em falha
 * (`DEBT_HAS_SETTLEMENTS`, `DEBT_CLOSED`...) recarrega do backend sem piscar, porque o estado real
 * pode ter mudado. `refresh` recarrega depois de uma quitação feita noutro formulário. Escopo de componente.
 */
@Injectable()
export class DebtDetailFacade {
  private readonly gateway = inject(DebtsGateway);
  private readonly loads = new Subject<Load>();
  private readonly actions = new Subject<DebtAction>();
  private readonly doneEvents = new Subject<{ action: DebtAction['kind']; debt: Debt }>();
  private readonly current = signal<DebtDetailState>({ status: 'idle' });
  private readonly busyState = signal(false);
  private readonly refreshProblemState = signal<Problem | null>(null);
  private lastId: string | null = null;
  private readonly problemState = signal<Problem | null>(null);

  readonly state = this.current.asReadonly();
  /** Uma recarga silenciosa falhou: a tela continua com o último dado bom, mais este aviso. */
  readonly refreshProblem = this.refreshProblemState.asReadonly();
  readonly debt = computed(() => {
    const state = this.current();
    return state.status === 'ready' ? state.debt : null;
  });
  readonly busy = this.busyState.asReadonly();
  /** Falha da última ação (perdoar, estornar, editar). */
  readonly problem = this.problemState.asReadonly();
  /** Emite a dívida devolvida pela API quando a ação dá certo. */
  readonly done$ = this.doneEvents.asObservable();

  constructor() {
    this.loads
      .pipe(
        switchMap(({ id, silent }) =>
          this.gateway.get(id).pipe(
            map((debt): DebtDetailState => ({ status: 'ready', debt })),
            silent ? (source) => source : startWith<DebtDetailState>({ status: 'loading' }),
            catchError((error: unknown) => {
              const problem = problemOf(error);
              // Recarga em segundo plano que falha: a tela que já está pronta continua (com um aviso).
              if (silent && problem.status !== 404 && this.current().status === 'ready') {
                this.refreshProblemState.set(problem);
                return EMPTY;
              }
              return of<DebtDetailState>(
                problem.status === 404 ? { status: 'notFound' } : { status: 'error', problem },
              );
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => {
        this.refreshProblemState.set(null);
        this.current.set(state);
      });

    this.actions
      .pipe(
        exhaustMap((action) => {
          this.busyState.set(true);
          this.problemState.set(null);
          return this.send(action).pipe(
            tap((debt) => {
              this.current.set({ status: 'ready', debt });
              this.doneEvents.next({ action: action.kind, debt });
            }),
            map(() => null),
            catchError((error: unknown) => {
              // O estado real pode ter mudado (outra quitação, outro aparelho): recarrega do backend.
              this.refresh(action.id);
              return of(problemOf(error));
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
    this.lastId = id;
    this.loads.next({ id, silent: false });
  }

  /** Recarrega do backend sem voltar ao esqueleto (depois de quitar, estornar uma quitação, etc.). */
  refresh(id: string): void {
    this.lastId = id;
    this.loads.next({ id, silent: true });
  }

  /** "Tentar de novo" do aviso de recarga que falhou. */
  retryRefresh(): void {
    if (this.lastId !== null) this.loads.next({ id: this.lastId, silent: true });
  }

  /** Perdoa o saldo restante (motivo obrigatório; não pode ser desfeito). */
  cancel(id: string, reason: string): void {
    this.actions.next({ kind: 'cancel', id, reason });
  }

  /** Estorna o registro (só dívida sem movimentação e sem quitações). */
  void(id: string, reason: string): void {
    this.actions.next({ kind: 'void', id, reason });
  }

  update(id: string, input: DebtUpdate): void {
    this.actions.next({ kind: 'update', id, input });
  }

  clearProblem(): void {
    this.problemState.set(null);
  }

  private send(action: DebtAction): Observable<Debt> {
    switch (action.kind) {
      case 'cancel':
        return this.gateway.cancel(action.id, action.reason);
      case 'void':
        return this.gateway.void(action.id, action.reason);
      case 'update':
        return this.gateway.update(action.id, action.input);
    }
  }
}
