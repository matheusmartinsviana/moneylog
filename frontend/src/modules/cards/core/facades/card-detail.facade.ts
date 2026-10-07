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
} from 'rxjs';

import { CardsGateway } from '~/modules/cards/core/interfaces/cards.gateway';
import type { Card } from '~/modules/cards/core/types/card';
import type { FutureInstallments, InvoiceSummary } from '~/modules/cards/core/types/invoice';
import { Problem, problemOf } from '~/util/api/problem';
import { MAX_PAGE_SIZE } from '~/util/api/slice';

export type CardState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'notFound' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly card: Card };

export type PartState<T> =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly data: T };

interface Load {
  readonly id: string;
  readonly silent: boolean;
}

const IDLE = { status: 'idle' } as const;

/**
 * Facade da tela do cartão (T65): o cartão (limite, disponível, `totalCommitted` e `committedFuture`
 * **separados**, como o backend os calculou), as faturas (janela padrão de S-131, paginando até o fim)
 * e as parcelas futuras (`byInvoice` e `total` do backend). Cada parte tem o seu estado: uma falha nas
 * parcelas não esconde o cartão. `refresh` recarrega do backend sem piscar (depois de um pagamento).
 * Escopo de componente.
 */
@Injectable()
export class CardDetailFacade {
  private readonly gateway = inject(CardsGateway);
  private readonly cardLoads = new Subject<Load>();
  private readonly invoiceLoads = new Subject<Load>();
  private readonly futureLoads = new Subject<Load>();
  private readonly cardState = signal<CardState>(IDLE);
  private readonly invoicesState = signal<PartState<readonly InvoiceSummary[]>>(IDLE);
  private readonly futureState = signal<PartState<FutureInstallments>>(IDLE);
  private futureWanted = false;

  readonly state = this.cardState.asReadonly();
  readonly card = computed(() => {
    const state = this.cardState();
    return state.status === 'ready' ? state.card : null;
  });
  readonly invoices = this.invoicesState.asReadonly();
  readonly future = this.futureState.asReadonly();

  constructor() {
    this.cardLoads
      .pipe(
        switchMap(({ id, silent }) =>
          this.gateway.get(id).pipe(
            map((card): CardState => ({ status: 'ready', card })),
            // Recarga silenciosa: o cartão atual continua na tela até a resposta chegar.
            silent ? (source) => source : startWith<CardState>({ status: 'loading' }),
            catchError((error: unknown) => {
              const problem = problemOf(error);
              return of<CardState>(
                problem.status === 404 ? { status: 'notFound' } : { status: 'error', problem },
              );
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.cardState.set(state));

    this.invoiceLoads
      .pipe(
        switchMap(({ id, silent }) =>
          this.allInvoices(id).pipe(
            map((data): PartState<readonly InvoiceSummary[]> => ({ status: 'ready', data })),
            silent
              ? (source) => source
              : startWith<PartState<readonly InvoiceSummary[]>>({ status: 'loading' }),
            catchError((error: unknown) =>
              of<PartState<readonly InvoiceSummary[]>>({
                status: 'error',
                problem: problemOf(error),
              }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.invoicesState.set(state));

    this.futureLoads
      .pipe(
        switchMap(({ id, silent }) =>
          this.gateway.futureInstallments(id).pipe(
            map((data): PartState<FutureInstallments> => ({ status: 'ready', data })),
            silent
              ? (source) => source
              : startWith<PartState<FutureInstallments>>({ status: 'loading' }),
            catchError((error: unknown) =>
              of<PartState<FutureInstallments>>({ status: 'error', problem: problemOf(error) }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.futureState.set(state));
  }

  /** Abre o cartão: carrega o cartão e as faturas (a aba padrão). */
  load(id: string): void {
    this.futureWanted = false;
    this.futureState.set(IDLE);
    this.cardLoads.next({ id, silent: false });
    this.invoiceLoads.next({ id, silent: false });
  }

  /** Só o cartão (sem faturas nem parcelas): para telas que precisam do nome ou da conta padrão. */
  loadCard(id: string, silent = false): void {
    this.cardLoads.next({ id, silent });
  }

  /** Carrega as parcelas futuras (quando a aba abre ou no "tentar de novo"). */
  loadFuture(id: string): void {
    this.futureWanted = true;
    this.futureLoads.next({ id, silent: false });
  }

  /** Recarrega tudo do backend sem voltar ao esqueleto (ex.: depois de pagar uma fatura). */
  refresh(id: string): void {
    this.cardLoads.next({ id, silent: true });
    this.invoiceLoads.next({ id, silent: true });
    if (this.futureWanted) this.futureLoads.next({ id, silent: true });
  }

  /** Só as faturas (o "tentar de novo" da aba). */
  loadInvoices(id: string): void {
    this.invoiceLoads.next({ id, silent: false });
  }

  private allInvoices(cardId: string): Observable<readonly InvoiceSummary[]> {
    const page = (n: number) =>
      this.gateway.listInvoices(cardId, { page: n, pageSize: MAX_PAGE_SIZE });
    return page(1).pipe(
      expand((slice, index) => (slice.hasNext ? page(index + 2) : EMPTY)),
      reduce(
        (all: readonly InvoiceSummary[], slice) => [...all, ...slice.items],
        [] as readonly InvoiceSummary[],
      ),
    );
  }
}
