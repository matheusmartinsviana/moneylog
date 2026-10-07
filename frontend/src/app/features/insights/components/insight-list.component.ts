import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { EmptyStateComponent } from '~/app/common/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { insightLines } from '~/app/features/ai/insight-text';
import type { InsightsState } from '~/modules/ai/core/facades/insights.facade';

/** Lista dos insights calculados do mês, com os estados de carregando, vazio, erro e pronto. Presentational. */
@Component({
  selector: 'app-insight-list',
  imports: [RouterLink, EmptyStateComponent, ErrorStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state().status) {
      @case ('loading') {
        <p role="status" data-cy="insights-loading">{{ t().ai.insights.loading }}</p>
      }
      @case ('error') {
        <app-error-state [problem]="problem()" (retry)="retry.emit()" />
      }
      @case ('ready') {
        @if (lines().length > 0) {
          <ul class="il" data-cy="insights-list">
            @for (line of lines(); track line.id) {
              <li class="il__item">
                <p>{{ line.text }}</p>
                <p class="il__muted">
                  {{ t().ai.insights.source }}
                  @if (line.categoryId) {
                    ·
                    <a
                      class="il__link"
                      routerLink="/transactions"
                      [queryParams]="{ categoryId: line.categoryId }"
                      data-cy="insight-spending-link"
                      >{{ t().ai.insights.viewSpending }}</a
                    >
                  }
                </p>
              </li>
            }
          </ul>
        } @else {
          <p data-cy="insights-empty">{{ t().ai.insights.empty }}</p>
        }
      }
      @default {
        <app-empty-state
          [heading]="t().ai.insights.empty"
          [description]="t().ai.insights.emptyHint"
          illustration="grid"
        />
      }
    }
  `,
  styles: `
    .il {
      display: grid;
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .il__item {
      display: grid;
      gap: var(--space-1);
      padding: var(--space-3) var(--space-4);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-control);
    }

    .il__muted {
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .il__link {
      color: var(--color-accent);
    }
  `,
})
export class InsightListComponent {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly state = input.required<InsightsState>();
  readonly retry = output<void>();

  protected readonly problem = computed(() => {
    const s = this.state();
    return s.status === 'error' ? s.problem : null;
  });
  protected readonly lines = computed(() => {
    const s = this.state();
    return s.status === 'ready'
      ? insightLines(s.items, this.t().ai.insights, HTML_LANG[this.i18n.language()])
      : [];
  });
}
