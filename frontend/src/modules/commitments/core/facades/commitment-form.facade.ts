import { inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, exhaustMap, map, of, Subject, tap } from 'rxjs';

import { CommitmentsGateway } from '~/modules/commitments/core/interfaces/commitments.gateway';
import type { Commitment, CommitmentInput } from '~/modules/commitments/core/types/commitment';
import { IdempotencyTracker } from '~/util/api/idempotency-key';
import { Problem, problemOf } from '~/util/api/problem';

/**
 * Cadastro de compromisso. `exhaustMap` no salvar (clique duplo = uma requisição); a criação leva
 * `Idempotency-Key` (uma por tentativa, reutilizada depois de falha ambígua). O compromisso da resposta
 * sai em `saved$`. Falhas chegam tipadas (`COMMITMENT_INVALID` + `fieldErrors`). Escopo de componente.
 */
@Injectable()
export class CommitmentFormFacade {
  private readonly gateway = inject(CommitmentsGateway);
  private readonly saves = new Subject<CommitmentInput>();
  private readonly savedEvents = new Subject<Commitment>();
  private readonly savingState = signal(false);
  private readonly problemState = signal<Problem | null>(null);
  private readonly keys = new IdempotencyTracker<CommitmentInput>();

  readonly saving = this.savingState.asReadonly();
  readonly problem = this.problemState.asReadonly();
  readonly saved$ = this.savedEvents.asObservable();

  constructor() {
    this.saves
      .pipe(
        exhaustMap((input) => {
          this.savingState.set(true);
          this.problemState.set(null);
          return this.gateway.create(input, this.keys.begin(input)).pipe(
            tap((commitment) => {
              this.keys.succeeded();
              this.savedEvents.next(commitment);
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

  save(input: CommitmentInput): void {
    this.saves.next(input);
  }
}
