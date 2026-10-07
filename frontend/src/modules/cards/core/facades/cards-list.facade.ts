import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  catchError,
  EMPTY,
  expand,
  map,
  Observable,
  of,
  reduce,
  startWith,
  Subject,
  switchMap,
  tap,
} from 'rxjs';

import { CardsGateway } from '~/modules/cards/core/interfaces/cards.gateway';
import type { Card, CardStatus } from '~/modules/cards/core/types/card';
import { LEDGER_GATE } from '~/util/api/ledger-gate';
import { Problem, problemOf } from '~/util/api/problem';
import { MAX_PAGE_SIZE } from '~/util/api/slice';

export type CardsListState =
  | { readonly status: 'loading' }
  | { readonly status: 'empty' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly data: readonly Card[] };

const LOADING: CardsListState = { status: 'loading' };

/**
 * Facade de negócio da lista de cartões (FE 01). Expõe `loading`/`empty`/`error`/`data` por signals e
 * repassa o que a API devolveu: limites, fatura atual e os dois "comprometido" chegam como vieram
 * (nenhuma soma no front). Depois de arquivar/desarquivar, usa o recurso da resposta. `loadAll` pagina
 * até `hasNext = false` (S-126, como S-91). Escopo de componente.
 */
@Injectable()
export class CardsListFacade {
  private readonly gateway = inject(CardsGateway);
  /** No Início o saldo (derivado do razão) entra na fila de leituras, depois do dashboard (R13). */
  private readonly gate = inject(LEDGER_GATE, { optional: true });
  private readonly loads = new Subject<CardStatus | undefined>();
  private readonly current = signal<CardsListState>(LOADING);
  private filter: CardStatus | undefined;

  readonly state = this.current.asReadonly();
  readonly loading = computed(() => this.current().status === 'loading');
  readonly empty = computed(() => this.current().status === 'empty');
  readonly error = computed(() => {
    const state = this.current();
    return state.status === 'error' ? state.problem : null;
  });
  readonly data = computed(() => {
    const state = this.current();
    return state.status === 'ready' ? state.data : null;
  });

  constructor() {
    this.loads
      .pipe(
        // switchMap: trocar de aba (ativos × arquivados) descarta a carga anterior.
        switchMap((status) =>
          this.gated(this.loadAll(status)).pipe(
            map((data): CardsListState =>
              data.length === 0 ? { status: 'empty' } : { status: 'ready', data },
            ),
            startWith(LOADING),
            catchError((error: unknown) =>
              of<CardsListState>({ status: 'error', problem: problemOf(error) }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.current.set(state));
  }

  private gated<T>(source: Observable<T>): Observable<T> {
    return this.gate ? this.gate.run(source, 6) : source;
  }

  /** Carrega (ou recarrega, no "tentar de novo") os cartões do filtro; sem filtro, os ativos. */
  load(status: CardStatus = 'ACTIVE'): void {
    this.filter = status;
    this.loads.next(status);
  }

  /** Todos os cartões do filtro, pedindo `pageSize=50` e paginando até o fim: o 11º não pode sumir. */
  loadAll(status: CardStatus = 'ACTIVE'): Observable<readonly Card[]> {
    const page = (n: number) => this.gateway.list({ status, page: n, pageSize: MAX_PAGE_SIZE });
    return page(1).pipe(
      expand((slice, index) => (slice.hasNext ? page(index + 2) : EMPTY)),
      reduce((all: readonly Card[], slice) => [...all, ...slice.items], [] as readonly Card[]),
    );
  }

  archive(id: string): Observable<Card> {
    return this.gateway.archive(id).pipe(tap((card) => this.replace(card)));
  }

  unarchive(id: string): Observable<Card> {
    return this.gateway.unarchive(id).pipe(tap((card) => this.replace(card)));
  }

  /** Troca o cartão pelo recurso da resposta; sai da lista se deixou de casar com o filtro. */
  private replace(card: Card): void {
    const state = this.current();
    if (state.status !== 'ready') return;
    const data = state.data
      .map((item) => (item.id === card.id ? card : item))
      .filter((item) => this.filter === undefined || item.status === this.filter);
    this.current.set(data.length === 0 ? { status: 'empty' } : { status: 'ready', data });
  }
}
