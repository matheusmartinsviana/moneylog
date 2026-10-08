import { inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, exhaustMap, map, of, Subject, tap } from 'rxjs';

import { CardsGateway } from '~/modules/cards/core/interfaces/cards.gateway';
import type { Card } from '~/modules/cards/core/types/card';
import { Problem, problemOf } from '~/util/api/problem';

/**
 * Confirmar o fechamento do cartão (`POST /v1/cards/{id}/closing-confirmation`). Não muda calendário nem
 * faturas: só tira a marca de "provisório". `exhaustMap` (clique duplo = uma requisição); devolve o cartão
 * da resposta e, em `409`, quem usa recarrega do backend. Escopo de componente.
 */
@Injectable()
export class CardClosingFacade {
  private readonly gateway = inject(CardsGateway);
  private readonly commands = new Subject<{ id: string; version: number }>();
  private readonly doneEvents = new Subject<Card>();
  private readonly savingState = signal(false);
  private readonly problemState = signal<Problem | null>(null);

  readonly saving = this.savingState.asReadonly();
  readonly problem = this.problemState.asReadonly();
  /** Emite o cartão devolvido pela API. */
  readonly confirmed$ = this.doneEvents.asObservable();

  constructor() {
    this.commands
      .pipe(
        exhaustMap(({ id, version }) => {
          this.savingState.set(true);
          this.problemState.set(null);
          return this.gateway.setClosingConfirmation(id, true, version).pipe(
            tap((card) => this.doneEvents.next(card)),
            map(() => null),
            catchError((error: unknown) => of(problemOf(error))),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((problem) => {
        this.savingState.set(false);
        this.problemState.set(problem);
      });
  }

  confirm(id: string, version: number): void {
    this.commands.next({ id, version });
  }
}
