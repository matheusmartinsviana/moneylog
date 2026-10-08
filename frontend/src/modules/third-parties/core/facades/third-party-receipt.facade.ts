import { inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, exhaustMap, map, of, Subject, tap } from 'rxjs';

import { ThirdPartiesGateway } from '~/modules/third-parties/core/interfaces/third-parties.gateway';
import type {
  ThirdPartyReceipt,
  ThirdPartyReceiptInput,
} from '~/modules/third-parties/core/types/third-party';
import { IdempotencyTracker } from '~/util/api/idempotency-key';
import { Problem, problemOf } from '~/util/api/problem';

/**
 * Recebimentos de terceiros **sem movimento de conta**: registrar (`exhaustMap` + `Idempotency-Key` por
 * tentativa) e remover (correção de vínculo). Nada toca conta, renda ou consumo; depois de cada ação, quem
 * usa relê o `third-party-receivables` do backend (o front não ajusta números). Escopo de componente.
 */
@Injectable()
export class ThirdPartyReceiptFacade {
  private readonly gateway = inject(ThirdPartiesGateway);
  private readonly records = new Subject<ThirdPartyReceiptInput>();
  private readonly removals = new Subject<string>();
  private readonly recordedEvents = new Subject<ThirdPartyReceipt>();
  private readonly removedEvents = new Subject<string>();
  private readonly savingState = signal(false);
  private readonly removingState = signal(false);
  private readonly problemState = signal<Problem | null>(null);
  private readonly keys = new IdempotencyTracker<ThirdPartyReceiptInput>();

  readonly saving = this.savingState.asReadonly();
  readonly removing = this.removingState.asReadonly();
  readonly problem = this.problemState.asReadonly();
  readonly recorded$ = this.recordedEvents.asObservable();
  /** Emite o id removido. */
  readonly removed$ = this.removedEvents.asObservable();

  constructor() {
    this.records
      .pipe(
        exhaustMap((input) => {
          this.savingState.set(true);
          this.problemState.set(null);
          return this.gateway.recordReceipt(input, this.keys.begin(input)).pipe(
            tap((receipt) => {
              this.keys.succeeded();
              this.recordedEvents.next(receipt);
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

    this.removals
      .pipe(
        exhaustMap((id) => {
          this.removingState.set(true);
          this.problemState.set(null);
          return this.gateway.deleteReceipt(id).pipe(
            tap(() => this.removedEvents.next(id)),
            map(() => null),
            catchError((error: unknown) => of(problemOf(error))),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((problem) => {
        this.removingState.set(false);
        this.problemState.set(problem);
      });
  }

  record(input: ThirdPartyReceiptInput): void {
    this.records.next(input);
  }

  remove(id: string): void {
    this.removals.next(id);
  }

  clearProblem(): void {
    this.problemState.set(null);
  }
}
