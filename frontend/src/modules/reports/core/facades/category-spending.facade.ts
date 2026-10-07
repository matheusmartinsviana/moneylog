import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, Subject, switchMap } from 'rxjs';

import { ReportsGateway } from '~/modules/reports/core/interfaces/reports.gateway';
import type { SpendingByCategory } from '~/modules/reports/core/types/reports';
import { LEDGER_GATE } from '~/util/api/ledger-gate';
import { Problem, problemOf } from '~/util/api/problem';

export type CategorySpendingState =
  | { readonly status: 'loading' }
  | { readonly status: 'empty'; readonly data: SpendingByCategory }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly data: SpendingByCategory };

/** Logo depois do resumo mensal e antes da série (R13). */
const PRIORITY = 10;
/** Quantas categorias o cartão mostra antes de "Outras" (T205). */
export const CATEGORY_LIMIT = 5;

/**
 * Facade do "Where your money goes" (T205): `share`, `base`, `total` e "Outras" vêm do backend e são repassados
 * como vieram (o front não normaliza os `share` nem subtrai nada). Cancela a leitura anterior ao pedir de
 * novo e passa pelo `LedgerGate`. `empty` = nenhuma categoria e nenhuma "Outras". Escopo de componente.
 */
@Injectable()
export class CategorySpendingFacade {
  private readonly gateway = inject(ReportsGateway);
  private readonly gate = inject(LEDGER_GATE, { optional: true });
  private readonly loads = new Subject<string>();
  private readonly current = signal<CategorySpendingState>({ status: 'loading' });
  private month: string | null = null;

  readonly state = this.current.asReadonly();
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
        switchMap((month) => {
          const source = this.gateway.spendingByCategory(month, CATEGORY_LIMIT);
          return (this.gate ? this.gate.run(source, PRIORITY) : source).pipe(
            map((data): CategorySpendingState =>
              data.items.length === 0 && data.other === null
                ? { status: 'empty', data }
                : { status: 'ready', data },
            ),
            startWith<CategorySpendingState>({ status: 'loading' }),
            catchError((error: unknown) =>
              of<CategorySpendingState>({ status: 'error', problem: problemOf(error) }),
            ),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.current.set(state));
  }

  /** Carrega a competência `YYYY-MM` (a do backend: `summary.month.competence`). */
  load(month: string): void {
    this.month = month;
    this.loads.next(month);
  }

  retry(): void {
    if (this.month !== null) this.loads.next(this.month);
  }
}
