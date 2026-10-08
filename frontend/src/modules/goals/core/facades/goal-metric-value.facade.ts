import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, Subject, switchMap } from 'rxjs';

import { GoalsGateway } from '~/modules/goals/core/interfaces/goals.gateway';
import type { GoalMetric } from '~/modules/goals/core/types/goal';
import { Problem, problemOf } from '~/util/api/problem';
import type { Money } from '~/util/money';

export type GoalMetricValueState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly metric: GoalMetric; readonly value: Money };

/**
 * Valor atual da medida escolhida, para mostrar antes de criar a meta. Vem do servidor (a mesma fonte
 * das telas de dívidas, Início e custos fixos): nada é calculado aqui. Trocar a medida cancela a
 * leitura anterior (`switchMap`). Escopo de componente.
 */
@Injectable()
export class GoalMetricValueFacade {
  private readonly gateway = inject(GoalsGateway);
  private readonly requests = new Subject<GoalMetric | null>();
  private readonly current = signal<GoalMetricValueState>({ status: 'idle' });

  readonly state = this.current.asReadonly();
  readonly value = computed(() => {
    const state = this.current();
    return state.status === 'ready' ? state.value : null;
  });

  constructor() {
    this.requests
      .pipe(
        switchMap((metric) =>
          metric === null
            ? of<GoalMetricValueState>({ status: 'idle' })
            : this.gateway.metricValue(metric).pipe(
                map((value): GoalMetricValueState => ({ status: 'ready', metric, value })),
                startWith<GoalMetricValueState>({ status: 'loading' }),
                catchError((error: unknown) =>
                  of<GoalMetricValueState>({ status: 'error', problem: problemOf(error) }),
                ),
              ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.current.set(state));
  }

  /** Lê (ou relê, no "tentar de novo") o valor atual da medida; `null` limpa. */
  load(metric: GoalMetric | null): void {
    this.requests.next(metric);
  }
}
