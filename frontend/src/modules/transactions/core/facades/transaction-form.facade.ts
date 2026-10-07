import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, exhaustMap, map, Observable, of, Subject, tap } from 'rxjs';

import { TransactionsEvents } from '~/modules/transactions/core/facades/transactions-events';
import { TransactionsGateway } from '~/modules/transactions/core/interfaces/transactions.gateway';
import type { Transaction } from '~/modules/transactions/core/types/transaction';
import type { TransactionInput } from '~/modules/transactions/core/types/transaction-input';
import { newIdempotencyKey } from '~/util/api/idempotency-key';
import { Problem, problemOf } from '~/util/api/problem';

export type SaveTransaction =
  | { readonly kind: 'create'; readonly input: TransactionInput }
  | {
      readonly kind: 'update';
      readonly id: string;
      readonly input: TransactionInput;
      readonly version: number;
    };

/** Um envio: o comando e a chave de idempotência dele (só na criação). */
interface Attempt {
  readonly command: SaveTransaction;
  readonly key: string | null;
}

/** Falha em que repetir o mesmo envio é seguro e útil: sem resposta (rede) ou erro do servidor. */
export function isRetryable(problem: Problem | null): boolean {
  return (
    problem !== null &&
    (problem.status === 0 || problem.status >= 500 || problem.code === 'CONFLICT')
  );
}

/**
 * Facade do formulário de movimentação (criar e editar). Regras:
 * - a `Idempotency-Key` é gerada **por tentativa de envio** (`submit`) e **reutilizada** no
 *   `retry()` depois de um erro de rede no mesmo envio; um envio novo gera chave nova (S-72, S-87);
 * - o salvar usa `exhaustMap` (clique duplo = uma requisição);
 * - a resposta do backend é o novo estado: emite a movimentação devolvida e avisa os que listam
 *   (`TransactionsEvents`) para recarregarem;
 * - falhas chegam tipadas (`code` + `fieldErrors`) para marcar os campos sem perder o digitado.
 *
 * Escopo de componente (`providers: [TransactionFormFacade]`).
 */
@Injectable()
export class TransactionFormFacade {
  private readonly gateway = inject(TransactionsGateway);
  private readonly events = inject(TransactionsEvents);
  private readonly attempts = new Subject<Attempt>();
  private readonly savedEvents = new Subject<Transaction>();
  private readonly savingState = signal(false);
  private readonly problemState = signal<Problem | null>(null);
  private last: Attempt | null = null;
  /** Envio de falha ambígua (o servidor pode ter gravado): sua chave é reaproveitada na mesma entrada. */
  private pending: Attempt | null = null;

  readonly saving = this.savingState.asReadonly();
  readonly problem = this.problemState.asReadonly();
  /** O último envio falhou de um jeito que o "tentar de novo" (mesma chave) resolve? */
  readonly canRetry = computed(() => isRetryable(this.problemState()));
  /** Emite a movimentação devolvida pela API quando o salvar dá certo. */
  readonly saved$ = this.savedEvents.asObservable();

  constructor() {
    this.attempts
      .pipe(
        exhaustMap((attempt) => {
          this.savingState.set(true);
          this.problemState.set(null);
          return this.send(attempt).pipe(
            tap((transaction) => {
              this.last = null;
              this.pending = null;
              this.savedEvents.next(transaction);
              this.events.notifyChanged();
            }),
            map(() => null),
            catchError((error: unknown) => of(problemOf(error))),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((problem) => {
        this.savingState.set(false);
        // Falha ambígua (rede, 5xx, CONFLICT): a tentativa fica pendente, o servidor pode ter gravado.
        this.pending = isRetryable(problem) ? this.last : null;
        this.problemState.set(problem);
      });
  }

  /**
   * Novo envio. A criação usa uma chave de idempotência nova, **exceto** quando a tentativa anterior
   * ficou pendente por falha ambígua (resposta perdida) e a entrada é a mesma: aí reaproveita a chave,
   * para o backend devolver a movimentação já gravada em vez de duplicá-la.
   */
  submit(command: SaveTransaction): void {
    const pending = this.pending;
    const reuse =
      command.kind === 'create' &&
      pending !== null &&
      pending.key !== null &&
      pending.command.kind === 'create' &&
      JSON.stringify(pending.command.input) === JSON.stringify(command.input);
    const attempt: Attempt = {
      command,
      key: command.kind === 'create' ? (reuse ? pending.key : newIdempotencyKey()) : null,
    };
    this.last = attempt;
    this.attempts.next(attempt);
  }

  /**
   * Descarta a falha e o envio pendente (ex.: o usuário trocou de modo no `/quick-add`). A chave da
   * tentativa ambígua continua guardada: se a mesma entrada for enviada de novo, vai com a mesma chave.
   */
  dismissProblem(): void {
    this.last = null;
    this.problemState.set(null);
  }

  /** "Tentar de novo" depois de um erro de rede: reenvia o mesmo comando com a **mesma** chave. */
  retry(): void {
    if (this.last) this.attempts.next(this.last);
  }

  private send({ command, key }: Attempt): Observable<Transaction> {
    return command.kind === 'create'
      ? this.gateway.create(command.input, key ?? newIdempotencyKey())
      : this.gateway.update(command.id, command.input, command.version);
  }
}
