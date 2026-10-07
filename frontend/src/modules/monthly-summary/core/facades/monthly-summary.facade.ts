import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, Subject, switchMap } from 'rxjs';

import { MonthlySummaryGateway } from '~/modules/monthly-summary/core/interfaces/monthly-summary.gateway';
import type { MonthlySummary } from '~/modules/monthly-summary/core/types/monthly-summary';
import { LEDGER_GATE } from '~/util/api/ledger-gate';
import { Problem, problemOf } from '~/util/api/problem';

export type MonthlySummaryState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly data: MonthlySummary };

/** Leitura do razão logo depois do dashboard quando a página fornece o `LedgerGate` (Início, R13). */
const PRIORITY = 0;

/**
 * Facade do resumo mensal: pede o mês ao backend e expõe os estados da tela. Trocar de mês cancela a
 * requisição anterior (`switchMap`), então uma resposta atrasada nunca sobrescreve o mês atual. Nenhum valor
 * é calculado aqui. Escopo de componente.
 */
@Injectable()
export class MonthlySummaryFacade {
  private readonly gateway = inject(MonthlySummaryGateway);
  private readonly gate = inject(LEDGER_GATE, { optional: true });
  private readonly loads = new Subject<string>();
  private readonly current = signal<MonthlySummaryState>({ status: 'loading' });

  readonly state = this.current.asReadonly();
  readonly data = computed(() => {
    const state = this.current();
    return state.status === 'ready' ? state.data : null;
  });
  readonly error = computed(() => {
    const state = this.current();
    return state.status === 'error' ? state.problem : null;
  });

  constructor() {
    this.loads
      .pipe(
        switchMap((month) =>
          (this.gate
            ? this.gate.run(this.gateway.get(month), PRIORITY)
            : this.gateway.get(month)
          ).pipe(
            map((data): MonthlySummaryState => ({ status: 'ready', data })),
            startWith<MonthlySummaryState>({ status: 'loading' }),
            catchError((error: unknown) =>
              of<MonthlySummaryState>({ status: 'error', problem: problemOf(error) }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.current.set(state));
  }

  /** Carrega (ou recarrega) a competência `YYYY-MM`. */
  load(month: string): void {
    this.loads.next(month);
  }
}
