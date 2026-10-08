import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, exhaustMap, map, of, Subject, switchMap, tap } from 'rxjs';

import { ThirdPartiesGateway } from '~/modules/third-parties/core/interfaces/third-parties.gateway';
import type {
  ThirdPartyExpense,
  ThirdPartyExpenseInput,
  ThirdPartyItem,
} from '~/modules/third-parties/core/types/third-party';
import { IdempotencyTracker } from '~/util/api/idempotency-key';
import { Problem, problemOf } from '~/util/api/problem';

/** A marca de uma movimentação: quem é o responsável e o quanto já foi reembolsado (do backend). */
export interface ThirdPartyLink {
  readonly person: { readonly id: string; readonly name: string };
  readonly item: ThirdPartyItem;
}

export type ThirdPartyLookup =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'done'; readonly link: ThirdPartyLink | null }
  /** Não deu para saber: a tela não afirma nem nega a marca. */
  | { readonly status: 'unknown' };

/**
 * Marcar uma compra ou despesa como de terceiro e saber se ela já está marcada. A marca **não muda o
 * lançamento** (continua consumo bruto até o reembolso); quem diz se há marca, a pessoa e o reembolso
 * recebido é o `third-party-receivables` do backend, relido depois de marcar (a resposta do `POST` só
 * traz a pessoa). `exhaustMap` no marcar; `Idempotency-Key` por tentativa. Escopo de componente.
 */
@Injectable()
export class ThirdPartyExpenseFacade {
  private readonly gateway = inject(ThirdPartiesGateway);
  private readonly lookups = new Subject<string>();
  private readonly marks = new Subject<ThirdPartyExpenseInput>();
  private readonly markedEvents = new Subject<ThirdPartyExpense>();
  private readonly lookupState = signal<ThirdPartyLookup>({ status: 'idle' });
  private readonly savingState = signal(false);
  private readonly problemState = signal<Problem | null>(null);
  private readonly keys = new IdempotencyTracker<ThirdPartyExpenseInput>();
  private lastId: string | null = null;

  readonly lookup = this.lookupState.asReadonly();
  readonly link = computed(() => {
    const state = this.lookupState();
    return state.status === 'done' ? state.link : null;
  });
  readonly saving = this.savingState.asReadonly();
  readonly problem = this.problemState.asReadonly();
  readonly marked$ = this.markedEvents.asObservable();

  constructor() {
    this.lookups
      .pipe(
        tap(() => this.lookupState.set({ status: 'loading' })),
        switchMap((transactionId) =>
          this.gateway.receivables(null).pipe(
            map((data): ThirdPartyLookup => {
              for (const person of data.people) {
                const item = person.items.find(
                  (entry) => entry.source === 'EXPENSE' && entry.refId === transactionId,
                );
                if (item) {
                  return {
                    status: 'done',
                    link: { person: { id: person.personId, name: person.name }, item },
                  };
                }
              }
              return { status: 'done', link: null };
            }),
            catchError(() => of<ThirdPartyLookup>({ status: 'unknown' })),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.lookupState.set(state));

    this.marks
      .pipe(
        exhaustMap((input) => {
          this.savingState.set(true);
          this.problemState.set(null);
          return this.gateway.mark(input, this.keys.begin(input)).pipe(
            tap((expense) => {
              this.keys.succeeded();
              this.markedEvents.next(expense);
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
        // Já estava marcada em outro aparelho: relê para a tela mostrar a marca real.
        if (problem?.code === 'THIRD_PARTY_EXPENSE_ALREADY_MARKED' && this.lastId !== null) {
          this.lookups.next(this.lastId);
        }
      });
  }

  /** Procura a marca da movimentação (uma só consulta por abertura). */
  find(transactionId: string): void {
    this.lastId = transactionId;
    this.lookups.next(transactionId);
  }

  mark(input: ThirdPartyExpenseInput): void {
    this.lastId = input.transactionId;
    this.marks.next(input);
  }

  clearProblem(): void {
    this.problemState.set(null);
  }
}
