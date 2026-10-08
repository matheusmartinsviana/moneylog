import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, exhaustMap, map, of, Subject, tap } from 'rxjs';

import { RecurrencesGateway } from '~/modules/recurrences/core/interfaces/recurrences.gateway';
import type {
  RealizedTransaction,
  RealizePayment,
} from '~/modules/recurrences/core/types/recurrence';
import { newIdempotencyKey } from '~/util/api/idempotency-key';
import { Problem, problemOf } from '~/util/api/problem';

interface Attempt {
  readonly recurrenceId: string;
  readonly date: string;
  /** Valor digitado; `null` = o do modelo. */
  readonly amount: string | null;
  readonly payment: RealizePayment | null;
  readonly key: string;
}

/** Falha em que repetir o mesmo envio é seguro e útil: sem resposta (rede), erro do servidor ou `CONFLICT`. */
export function isRetryableRealize(problem: Problem | null): boolean {
  return (
    problem !== null &&
    (problem.status === 0 || problem.status >= 500 || problem.code === 'CONFLICT')
  );
}

/**
 * Facade de "Realizar ocorrência" (T88). A `Idempotency-Key` é gerada **por tentativa** e reutilizada no
 * `retry()` depois de uma falha ambígua (rede, 5xx, `409 CONFLICT`); um envio novo com os mesmos dados da
 * tentativa pendente reaproveita a chave (inclusive depois de fechar e reabrir a folha). `exhaustMap`:
 * clique duplo = uma requisição. A resposta (a movimentação criada, com a fatura alvo no cartão) é a
 * fonte da verdade e sai em `realized$`. Escopo de componente.
 */
@Injectable()
export class OccurrenceRealizeFacade {
  private readonly gateway = inject(RecurrencesGateway);
  private readonly attempts = new Subject<Attempt>();
  private readonly realizedEvents = new Subject<RealizedTransaction>();
  private readonly savingState = signal(false);
  private readonly problemState = signal<Problem | null>(null);
  private last: Attempt | null = null;

  readonly saving = this.savingState.asReadonly();
  readonly problem = this.problemState.asReadonly();
  readonly canRetry = computed(() => isRetryableRealize(this.problemState()));
  readonly realized$ = this.realizedEvents.asObservable();

  constructor() {
    this.attempts
      .pipe(
        exhaustMap((attempt) => {
          this.savingState.set(true);
          this.problemState.set(null);
          return this.gateway
            .realize(
              attempt.recurrenceId,
              attempt.date,
              attempt.amount,
              attempt.key,
              attempt.payment,
            )
            .pipe(
              tap((transaction) => {
                this.last = null;
                this.realizedEvents.next(transaction);
              }),
              map(() => null),
              catchError((error: unknown) => of(problemOf(error))),
            );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((problem) => {
        this.savingState.set(false);
        // Só uma falha ambígua deixa a tentativa pendente (o servidor pode ter gravado).
        if (!isRetryableRealize(problem)) this.last = null;
        this.problemState.set(problem);
      });
  }

  /** Novo envio; reaproveita a chave da tentativa pendente se os dados são os mesmos. */
  realize(
    recurrenceId: string,
    date: string,
    amount: string | null,
    payment: RealizePayment | null = null,
  ): void {
    const pending = this.last;
    const same =
      pending !== null &&
      pending.recurrenceId === recurrenceId &&
      pending.date === date &&
      pending.amount === amount &&
      pending.payment?.accountId === payment?.accountId &&
      pending.payment?.method === payment?.method;
    const attempt: Attempt = {
      recurrenceId,
      date,
      amount,
      payment,
      key: same ? pending.key : newIdempotencyKey(),
    };
    this.last = attempt;
    this.attempts.next(attempt);
  }

  /** "Tentar de novo": o mesmo comando com a **mesma** chave. */
  retry(): void {
    if (this.last) this.attempts.next(this.last);
  }

  /**
   * A folha (re)abriu para a ocorrência: uma falha ambígua da **mesma** ocorrência continua pendente (com
   * o aviso e o "tentar de novo"); qualquer outra é descartada.
   */
  reopen(recurrenceId: string, date: string): void {
    if (
      this.last?.recurrenceId === recurrenceId &&
      this.last.date === date &&
      isRetryableRealize(this.problemState())
    ) {
      return;
    }
    this.last = null;
    this.problemState.set(null);
  }
}
