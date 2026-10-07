import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, Subject, switchMap } from 'rxjs';

import { AiGateway } from '~/modules/ai/core/interfaces/ai.gateway';
import type { Insight } from '~/modules/ai/core/types/ai';
import { Problem, problemOf } from '~/util/api/problem';

export type InsightsState =
  | { readonly status: 'loading' }
  | { readonly status: 'empty' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly items: readonly Insight[] };

/**
 * Insights determinísticos do mês (`GET /v1/insights`). Valem sem IA. Mudar o mês cancela o pedido anterior.
 * Escopo de componente.
 */
@Injectable()
export class InsightsFacade {
  private readonly gateway = inject(AiGateway);
  private readonly loads = new Subject<string | null>();
  private readonly current = signal<InsightsState>({ status: 'loading' });
  private last: string | null = null;

  readonly state = this.current.asReadonly();
  readonly items = computed(() => {
    const state = this.current();
    return state.status === 'ready' ? state.items : [];
  });

  constructor() {
    this.loads
      .pipe(
        switchMap((month) =>
          this.gateway.insights(month).pipe(
            map((slice): InsightsState =>
              slice.items.length === 0
                ? { status: 'empty' }
                : { status: 'ready', items: slice.items },
            ),
            startWith<InsightsState>({ status: 'loading' }),
            catchError((error: unknown) =>
              of<InsightsState>({ status: 'error', problem: problemOf(error) }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.current.set(state));
  }

  /** `null` = mês corrente do backend. */
  load(month: string | null): void {
    this.last = month;
    this.loads.next(month);
  }

  retry(): void {
    this.loads.next(this.last);
  }
}
