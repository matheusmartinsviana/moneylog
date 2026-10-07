import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, Subject, switchMap } from 'rxjs';

import { CardsGateway } from '~/modules/cards/core/interfaces/cards.gateway';
import type { Invoice } from '~/modules/cards/core/types/invoice';
import { Problem, problemOf } from '~/util/api/problem';

export type InvoiceState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'notFound' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly invoice: Invoice };

/**
 * Facade do detalhe da fatura (T66): itens (parcelas e créditos), pagamentos, `carryIn`, `creditCarry` e
 * `outstanding`, todos **como o backend os calculou**. `replace` troca a fatura pela resposta de um
 * pagamento (a fatura devolvida é a fonte da verdade). Escopo de componente.
 */
@Injectable()
export class InvoiceDetailFacade {
  private readonly gateway = inject(CardsGateway);
  private readonly loads = new Subject<{ id: string; silent: boolean }>();
  private readonly current = signal<InvoiceState>({ status: 'idle' });

  readonly state = this.current.asReadonly();
  readonly invoice = computed(() => {
    const state = this.current();
    return state.status === 'ready' ? state.invoice : null;
  });

  constructor() {
    this.loads
      .pipe(
        switchMap(({ id, silent }) =>
          this.gateway.getInvoice(id).pipe(
            map((invoice): InvoiceState => ({ status: 'ready', invoice })),
            silent ? (source) => source : startWith<InvoiceState>({ status: 'loading' }),
            catchError((error: unknown) => {
              const problem = problemOf(error);
              return of<InvoiceState>(
                problem.status === 404 ? { status: 'notFound' } : { status: 'error', problem },
              );
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.current.set(state));
  }

  load(id: string): void {
    this.loads.next({ id, silent: false });
  }

  /** Recarrega do backend sem piscar (ex.: depois de estornar um pagamento). */
  refresh(id: string): void {
    this.loads.next({ id, silent: true });
  }

  /** A fatura devolvida por um pagamento substitui a atual. */
  replace(invoice: Invoice): void {
    this.current.set({ status: 'ready', invoice });
  }
}
