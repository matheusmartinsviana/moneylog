import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, exhaustMap, map, of, Subject, tap } from 'rxjs';

import { DebtsGateway } from '~/modules/debts/core/interfaces/debts.gateway';
import type { Debt, DebtInput } from '~/modules/debts/core/types/debt';
import { IdempotencyTracker, isAmbiguousFailure } from '~/util/api/idempotency-key';
import { Problem, problemOf } from '~/util/api/problem';

/**
 * Facade do formulário "Nova dívida" (sem movimentação, não mexe no saldo das contas). `exhaustMap`:
 * clique duplo = uma requisição. Devolve **a dívida da resposta**. `POST /v1/debts` leva
 * `Idempotency-Key`: uma por tentativa, **reutilizada** depois de uma falha ambígua (rede, 5xx,
 * `CONFLICT`) no "tentar de novo" e ao reenviar o mesmo corpo; corpo diferente gera chave nova
 * (S-237). Escopo de componente.
 */
@Injectable()
export class DebtFormFacade {
  private readonly gateway = inject(DebtsGateway);
  private readonly saves = new Subject<DebtInput>();
  private readonly savedEvents = new Subject<Debt>();
  private readonly savingState = signal(false);
  private readonly problemState = signal<Problem | null>(null);
  private readonly keys = new IdempotencyTracker<DebtInput>();
  private last: DebtInput | null = null;

  readonly saving = this.savingState.asReadonly();
  readonly problem = this.problemState.asReadonly();
  /** A última falha deixa o "tentar de novo" (mesma chave) seguro e útil? */
  readonly canRetry = computed(() => isAmbiguousFailure(this.problemState()));
  /** Emite a dívida devolvida pela API quando o salvar dá certo. */
  readonly saved$ = this.savedEvents.asObservable();

  constructor() {
    this.saves
      .pipe(
        exhaustMap((input) => {
          this.savingState.set(true);
          this.problemState.set(null);
          return this.gateway.create(input, this.keys.begin(input)).pipe(
            tap((debt) => {
              this.last = null;
              this.keys.succeeded();
              this.savedEvents.next(debt);
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
  }

  save(input: DebtInput): void {
    this.last = input;
    this.saves.next(input);
  }

  /** Falha de rede/5xx: reenvia o mesmo corpo. */
  retry(): void {
    if (this.last) this.saves.next(this.last);
  }

  dismissProblem(): void {
    this.problemState.set(null);
  }
}
