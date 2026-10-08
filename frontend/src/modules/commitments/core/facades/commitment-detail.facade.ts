import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  catchError,
  concatMap,
  map,
  Observable,
  of,
  startWith,
  Subject,
  switchMap,
  tap,
} from 'rxjs';

import { CommitmentsGateway } from '~/modules/commitments/core/interfaces/commitments.gateway';
import type {
  Commitment,
  CommitmentProgressInput,
} from '~/modules/commitments/core/types/commitment';
import { Problem, problemOf } from '~/util/api/problem';

export type CommitmentDetailState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'notFound' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly commitment: Commitment };

type Command =
  | { readonly kind: 'pay'; readonly position: number; readonly paidOn: string }
  | { readonly kind: 'progress'; readonly input: Omit<CommitmentProgressInput, 'version'> };

/** Falhas em que o que a tela mostra ficou velho: recarrega do backend em vez de chutar o estado. */
const STALE_CODES: ReadonlySet<string> = new Set([
  'VERSION_CONFLICT',
  'COMMITMENT_SCHEDULE_ITEM_ALREADY_PAID',
]);

/**
 * Detalhe do compromisso: cronograma, "marcar parcela paga" e "atualizar progresso". A resposta do
 * backend (o compromisso inteiro, com pago/saldo/progresso recalculados lá) é o novo estado; o front não
 * soma nada. `concatMap` (as ações seguem a ordem, cada uma com a versão da anterior); em conflito de
 * versão ou item já pago, relê o compromisso. Escopo de componente.
 */
@Injectable()
export class CommitmentDetailFacade {
  private readonly gateway = inject(CommitmentsGateway);
  private readonly loads = new Subject<string>();
  private readonly commands = new Subject<Command>();
  private readonly current = signal<CommitmentDetailState>({ status: 'idle' });
  private readonly busyState = signal(false);
  private readonly problemState = signal<Problem | null>(null);
  private readonly changedEvents = new Subject<Commitment>();
  private currentId: string | null = null;

  readonly state = this.current.asReadonly();
  readonly commitment = computed(() => {
    const state = this.current();
    return state.status === 'ready' ? state.commitment : null;
  });
  readonly loadProblem = computed(() => {
    const state = this.current();
    return state.status === 'error' ? state.problem : null;
  });
  /** Uma ação em andamento (marcar paga, atualizar progresso). */
  readonly busy = this.busyState.asReadonly();
  readonly problem = this.problemState.asReadonly();
  readonly changed$ = this.changedEvents.asObservable();

  constructor() {
    this.loads
      .pipe(
        switchMap((id) =>
          this.gateway.get(id).pipe(
            map((commitment): CommitmentDetailState => ({ status: 'ready', commitment })),
            startWith<CommitmentDetailState>({ status: 'loading' }),
            catchError((error: unknown) => {
              const problem = problemOf(error);
              return of<CommitmentDetailState>(
                problem.status === 404 ? { status: 'notFound' } : { status: 'error', problem },
              );
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.current.set(state));

    this.commands
      .pipe(
        concatMap((command) => {
          const commitment = this.commitment();
          if (!commitment) return of(null);
          this.busyState.set(true);
          this.problemState.set(null);
          return this.send(commitment, command).pipe(
            tap((updated) => {
              this.current.set({ status: 'ready', commitment: updated });
              this.changedEvents.next(updated);
            }),
            map(() => null),
            catchError((error: unknown) => of(problemOf(error))),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((problem) => {
        this.busyState.set(false);
        this.problemState.set(problem);
        if (problem && STALE_CODES.has(problem.code) && this.currentId !== null) {
          this.loads.next(this.currentId);
        }
      });
  }

  load(id: string): void {
    this.currentId = id;
    this.loads.next(id);
  }

  payItem(position: number, paidOn: string): void {
    this.commands.next({ kind: 'pay', position, paidOn });
  }

  updateProgress(input: Omit<CommitmentProgressInput, 'version'>): void {
    this.commands.next({ kind: 'progress', input });
  }

  clearProblem(): void {
    this.problemState.set(null);
  }

  private send(commitment: Commitment, command: Command): Observable<Commitment> {
    return command.kind === 'pay'
      ? this.gateway.payItem(commitment.id, command.position, command.paidOn, commitment.version)
      : this.gateway.updateProgress(commitment.id, {
          ...command.input,
          version: commitment.version,
        });
  }
}
