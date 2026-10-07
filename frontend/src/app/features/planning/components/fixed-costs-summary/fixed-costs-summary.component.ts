import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';

import { MoneyComponent } from '~/app/common/components/money/money.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import type { SummaryState } from '~/modules/recurrences/core/facades/recurrences-list.facade';

/**
 * "Custo fixo mensal" e "Receita recorrente mensal": os dois valores vêm do backend (`summary`) e são
 * **sempre rotulados como estimativa** (S-146), com a nota que diz como são calculados. Presentational: o
 * estado (carregando, erro, pronto) é de quem usa.
 */
@Component({
  selector: 'app-fixed-costs-summary',
  imports: [MoneyComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="summary surface"
      aria-labelledby="fixed-costs-title"
      data-cy="recurrence-summary"
    >
      <h2 id="fixed-costs-title" class="summary__title">
        {{ t().recurrences.summary.title }}
        <span class="summary__tag" data-cy="recurrence-summary-estimate">
          {{ t().recurrences.summary.estimate }}
        </span>
      </h2>
      @switch (state().status) {
        @case ('loading') {
          <p role="status" data-cy="recurrence-summary-loading">
            {{ t().recurrences.summary.loading }}
          </p>
        }
        @case ('error') {
          <p role="alert" data-cy="recurrence-summary-error">{{ t().recurrences.summary.error }}</p>
          <button
            type="button"
            class="button"
            data-cy="recurrence-summary-retry"
            (click)="retry.emit()"
          >
            {{ t().recurrences.summary.retry }}
          </button>
        }
        @default {
          @if (data(); as summary) {
            <dl class="summary__figures">
              <div>
                <dt>{{ t().recurrences.summary.fixedCosts }}</dt>
                <dd data-cy="recurrence-fixed-costs"><app-money [value]="summary.fixedCosts" /></dd>
              </div>
              <div>
                <dt>{{ t().recurrences.summary.recurringIncome }}</dt>
                <dd data-cy="recurrence-recurring-income">
                  <app-money [value]="summary.recurringIncome" />
                </dd>
              </div>
            </dl>
            <p class="summary__note" data-cy="recurrence-summary-note">
              {{ t().recurrences.summary.note }}
            </p>
          }
        }
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    .summary {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-5);
    }

    .summary__title {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
      margin: 0;
      font-size: var(--text-md);
      font-weight: var(--weight-semibold);
    }

    .summary__tag {
      padding: 0 var(--space-2);
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-pill);
      color: var(--color-text-muted);
      font-size: var(--text-xs);
      font-weight: var(--weight-medium);
    }

    .summary__figures {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-5);
      margin: 0;
    }

    .summary__figures dt {
      color: var(--color-text-muted);
      font-size: var(--text-xs);
    }

    .summary__figures dd {
      margin: 0;
      font-size: var(--text-xl);
      font-weight: var(--weight-semibold);
    }

    .summary__note {
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }
  `,
})
export class FixedCostsSummaryComponent {
  protected readonly t = inject(I18nService).t;

  readonly state = input.required<SummaryState>();
  readonly retry = output<void>();

  protected data() {
    const state = this.state();
    return state.status === 'ready' ? state.data : null;
  }
}
