import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, Subject, switchMap } from 'rxjs';

import { ReportsGateway } from '~/modules/reports/core/interfaces/reports.gateway';
import type { IncomeExpenseSeries, ReportPeriod } from '~/modules/reports/core/types/reports';
import { LEDGER_GATE } from '~/util/api/ledger-gate';
import { Problem, problemOf } from '~/util/api/problem';

export type SpendingOverviewState =
  | { readonly status: 'loading' }
  | { readonly status: 'empty'; readonly data: IncomeExpenseSeries }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly data: IncomeExpenseSeries };

/** Prioridade da leitura no `LedgerGate` do Início (depois do dashboard e do resumo; R13). */
const PRIORITY = 20;

/**
 * Facade do "Spending overview" (T204): pede a série do período ao backend e expõe os estados do cartão.
 * Trocar o período **cancela** a requisição anterior (`switchMap`), então só a última resposta vence e nenhum
 * estado antigo pisca; `retry()` repete o período atual. Passa pelo `LedgerGate` quando a página o fornece
 * (no máximo 2 leituras do razão em voo). Nenhum valor é somado, comparado ou arredondado aqui: `empty` é
 * "o backend não devolveu nenhum balde". Escopo de componente.
 */
@Injectable()
export class SpendingOverviewFacade {
  private readonly gateway = inject(ReportsGateway);
  private readonly gate = inject(LEDGER_GATE, { optional: true });
  private readonly loads = new Subject<ReportPeriod>();
  private readonly current = signal<SpendingOverviewState>({ status: 'loading' });
  private readonly periodState = signal<ReportPeriod>('D30');

  readonly state = this.current.asReadonly();
  /** O período mostrado (ou pedido, enquanto carrega). */
  readonly period = this.periodState.asReadonly();
  readonly data = computed(() => {
    const state = this.current();
    return state.status === 'ready' || state.status === 'empty' ? state.data : null;
  });
  readonly error = computed(() => {
    const state = this.current();
    return state.status === 'error' ? state.problem : null;
  });

  constructor() {
    this.loads
      .pipe(
        switchMap((period) => {
          const source = this.gateway.incomeExpenses(period);
          return (this.gate ? this.gate.run(source, PRIORITY) : source).pipe(
            map((data): SpendingOverviewState =>
              data.points.length === 0 ? { status: 'empty', data } : { status: 'ready', data },
            ),
            startWith<SpendingOverviewState>({ status: 'loading' }),
            catchError((error: unknown) =>
              of<SpendingOverviewState>({ status: 'error', problem: problemOf(error) }),
            ),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.current.set(state));
  }

  /** Carrega (ou troca) o período. */
  load(period: ReportPeriod): void {
    this.periodState.set(period);
    this.loads.next(period);
  }

  /** "Tentar de novo": repete o período atual. */
  retry(): void {
    this.loads.next(this.periodState());
  }
}
