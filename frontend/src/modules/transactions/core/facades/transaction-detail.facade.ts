import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, exhaustMap, map, of, startWith, Subject, switchMap, tap } from 'rxjs';

import { TransactionsEvents } from '~/modules/transactions/core/facades/transactions-events';
import { TransactionsGateway } from '~/modules/transactions/core/interfaces/transactions.gateway';
import type { Transaction } from '~/modules/transactions/core/types/transaction';
import { Problem, problemOf } from '~/util/api/problem';

export type DetailState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'notFound' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly transaction: Transaction };

/**
 * Facade do detalhe (e do estorno). O estorno envia o motivo, **substitui a movimentação pela
 * resposta** (`status: VOIDED`) e avisa a lista (`TransactionsEvents`) para recarregar lista e
 * totais do backend. Nada de recalcular `impact` aqui. Para a compra no cartão, expõe também a razão
 * tipada do bloqueio (`voidBlockedBy`) e a ação alternativa "cancelar parcelas restantes" (T57, T63 CA2),
 * que também substitui a compra pela resposta (parcelas `CANCELED`, `impact` novo). Escopo de componente.
 */
@Injectable()
export class TransactionDetailFacade {
  private readonly gateway = inject(TransactionsGateway);
  private readonly events = inject(TransactionsEvents);
  private readonly loads = new Subject<string>();
  private readonly voids = new Subject<{ id: string; reason: string }>();
  private readonly voidedEvents = new Subject<Transaction>();
  private readonly current = signal<DetailState>({ status: 'idle' });
  private readonly voidingState = signal(false);
  private readonly voidProblemState = signal<Problem | null>(null);
  private readonly cancels = new Subject<{ id: string; reason: string }>();
  private readonly canceledEvents = new Subject<Transaction>();
  private readonly cancelingState = signal(false);
  private readonly cancelProblemState = signal<Problem | null>(null);

  readonly state = this.current.asReadonly();
  readonly transaction = computed(() => {
    const state = this.current();
    return state.status === 'ready' ? state.transaction : null;
  });
  /** Emite a movimentação devolvida quando o estorno dá certo. */
  readonly voided$ = this.voidedEvents.asObservable();
  readonly voiding = this.voidingState.asReadonly();
  /** Falha do último estorno (ex.: `TRANSACTION_HAS_ACTIVE_REFUNDS`, `ACCOUNT_ARCHIVED`). */
  readonly voidProblem = this.voidProblemState.asReadonly();
  /** Emite a compra devolvida quando o cancelamento das parcelas restantes dá certo. */
  readonly canceled$ = this.canceledEvents.asObservable();
  readonly canceling = this.cancelingState.asReadonly();
  /** Falha do último cancelamento (`CARD_NO_INSTALLMENTS_TO_CANCEL`, `TRANSACTION_NOT_CANCELABLE`...). */
  readonly cancelProblem = this.cancelProblemState.asReadonly();

  /** Por que a movimentação não pode ser estornada, quando o backend diz (S-88, S-89, S-122). */
  readonly voidBlockedBy = computed(() => this.transaction()?.voidBlockedBy ?? null);
  /**
   * "Cancelar parcelas restantes" é o caminho quando o estorno está bloqueado por fatura fechada: só
   * numa compra no cartão ativa. A recusa final (nenhuma parcela cancelável) é do backend.
   */
  readonly canCancelInstallments = computed(() => {
    const tx = this.transaction();
    return (
      tx !== null &&
      tx.type === 'CARD_PURCHASE' &&
      tx.status === 'ACTIVE' &&
      tx.voidBlockedBy === 'TRANSACTION_IN_CLOSED_INVOICE'
    );
  });

  constructor() {
    this.loads
      .pipe(
        switchMap((id) =>
          this.gateway.get(id).pipe(
            map((transaction): DetailState => ({ status: 'ready', transaction })),
            startWith<DetailState>({ status: 'loading' }),
            catchError((error: unknown) => {
              const problem = problemOf(error);
              return of<DetailState>(
                problem.status === 404 ? { status: 'notFound' } : { status: 'error', problem },
              );
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.current.set(state));

    this.voids
      .pipe(
        exhaustMap(({ id, reason }) => {
          this.voidingState.set(true);
          this.voidProblemState.set(null);
          return this.gateway.void(id, reason.trim()).pipe(
            tap((transaction) => {
              this.current.set({ status: 'ready', transaction });
              this.voidedEvents.next(transaction);
              this.events.notifyChanged();
            }),
            map(() => null),
            catchError((error: unknown) => of(problemOf(error))),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((problem) => {
        this.voidingState.set(false);
        this.voidProblemState.set(problem);
      });

    this.cancels
      .pipe(
        exhaustMap(({ id, reason }) => {
          this.cancelingState.set(true);
          this.cancelProblemState.set(null);
          return this.gateway.cancelInstallments(id, reason.trim()).pipe(
            tap((transaction) => {
              this.current.set({ status: 'ready', transaction });
              this.canceledEvents.next(transaction);
              this.events.notifyChanged();
            }),
            map(() => null),
            catchError((error: unknown) => of(problemOf(error))),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((problem) => {
        this.cancelingState.set(false);
        this.cancelProblemState.set(problem);
      });
  }

  load(id: string): void {
    this.loads.next(id);
  }

  /** Estorna com o motivo (obrigatório). O resultado vem em `transaction()` e `voidProblem()`. */
  voidTransaction(id: string, reason: string): void {
    this.voids.next({ id, reason });
  }

  /** Cancela as parcelas restantes da compra, com o motivo (obrigatório). */
  cancelInstallments(id: string, reason: string): void {
    this.cancels.next({ id, reason });
  }
}
