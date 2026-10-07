import { inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  catchError,
  exhaustMap,
  map,
  Observable,
  of,
  startWith,
  Subject,
  switchMap,
  tap,
} from 'rxjs';

import { CardsGateway } from '~/modules/cards/core/interfaces/cards.gateway';
import type { Card, CardInput, CardUpdate } from '~/modules/cards/core/types/card';
import { Problem, problemOf } from '~/util/api/problem';

export type SaveCard =
  | { readonly kind: 'create'; readonly input: CardInput }
  | { readonly kind: 'update'; readonly id: string; readonly input: CardUpdate };

export type CardLoadState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly card: Card };

/**
 * Facade do formulário de cartão (criar e editar). O salvar usa `exhaustMap` (clique duplo = uma
 * requisição) e devolve **o recurso da resposta**: nada de chutar o estado (FE 05). Falhas chegam
 * tipadas (`code` + `fieldErrors`) em `problem`, para a tela traduzir e marcar os campos. Nunca recebe
 * número de cartão, CVV ou bandeira: o contrato não os tem. Escopo de componente.
 */
@Injectable()
export class CardFormFacade {
  private readonly gateway = inject(CardsGateway);
  private readonly saves = new Subject<SaveCard>();
  private readonly loads = new Subject<string>();
  private readonly savedEvents = new Subject<Card>();
  private readonly savingState = signal(false);
  private readonly problemState = signal<Problem | null>(null);
  private readonly loadState = signal<CardLoadState>({ status: 'idle' });
  private readonly loaded = signal<Card | null>(null);

  readonly saving = this.savingState.asReadonly();
  /** Última falha do salvar (limpa quando um novo envio começa). */
  readonly problem = this.problemState.asReadonly();
  readonly loadStatus = this.loadState.asReadonly();
  /** O cartão carregado; durante uma recarga (ex.: depois de um 409) continua o anterior. */
  readonly card = this.loaded.asReadonly();
  /** Emite o cartão devolvido pela API quando o salvar dá certo. */
  readonly saved$ = this.savedEvents.asObservable();

  constructor() {
    this.saves
      .pipe(
        exhaustMap((command) => {
          this.savingState.set(true);
          this.problemState.set(null);
          return this.send(command).pipe(
            tap((card) => this.savedEvents.next(card)),
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

    this.loads
      .pipe(
        switchMap((id) =>
          this.gateway.get(id).pipe(
            map((card): CardLoadState => ({ status: 'ready', card })),
            startWith<CardLoadState>({ status: 'loading' }),
            catchError((error: unknown) =>
              of<CardLoadState>({ status: 'error', problem: problemOf(error) }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => {
        this.loadState.set(state);
        if (state.status === 'ready') this.loaded.set(state.card);
        else if (state.status === 'error') this.loaded.set(null);
      });
  }

  /** Carrega o cartão para edição (também recarrega depois de um `409 VERSION_CONFLICT`). */
  load(id: string): void {
    this.loads.next(id);
  }

  save(command: SaveCard): void {
    this.saves.next(command);
  }

  private send(command: SaveCard): Observable<Card> {
    return command.kind === 'create'
      ? this.gateway.create(command.input)
      : this.gateway.update(command.id, command.input);
  }
}
