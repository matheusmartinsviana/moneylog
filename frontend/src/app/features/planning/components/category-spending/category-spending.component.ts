import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import {
  BarListComponent,
  type BarListItem,
} from '~/app/common/components/charts/bar-list.component';
import { MoneyComponent } from '~/app/common/components/money/money.component';
import { SectionContainerComponent } from '~/app/common/components/section-container/section-container.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import type { CategorySpendingState } from '~/modules/reports/core/facades/category-spending.facade';

/**
 * "Where your money goes" (DS 02, T205): as maiores categorias do mês, com `amount`, `share` e "Outras" **do
 * backend** (o front não normaliza os `share` nem subtrai nada) e o total do consumo no cabeçalho, igual ao
 * `month.consumption` do KPI de gasto. Cada categoria leva às movimentações dela na competência. Presentational.
 */
@Component({
  selector: 'app-category-spending',
  imports: [SectionContainerComponent, BarListComponent, MoneyComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-section-container
      [heading]="t().dashboard.categories.title"
      [description]="t().dashboard.categories.description"
    >
      @switch (state().status) {
        @case ('loading') {
          <div data-cy="home-categories-loading">
            <p class="visually-hidden" role="status">{{ t().dashboard.categories.loading }}</p>
            <div class="cs__skeleton" aria-hidden="true"></div>
          </div>
        }
        @case ('error') {
          <div class="cs__state" role="alert" data-cy="home-categories-error">
            <p>{{ t().dashboard.categories.error }}</p>
            <button
              type="button"
              class="button"
              data-cy="home-categories-retry"
              (click)="retry.emit()"
            >
              {{ t().dashboard.categories.retry }}
            </button>
          </div>
        }
        @case ('empty') {
          <p class="cs__state" data-cy="home-categories-empty">
            {{ t().dashboard.categories.empty }}
          </p>
        }
        @default {
          @if (view(); as data) {
            <p class="cs__total" data-cy="home-categories-total">
              <span class="cs__total-label">{{ t().dashboard.categories.total }}</span>
              <span class="cs__total-value"><app-money [value]="data.total" /></span>
            </p>
            <app-bar-list [items]="data.items" [other]="data.other" cy="home-categories" />
          }
        }
      }
    </app-section-container>
  `,
  styleUrl: './category-spending.component.css',
})
export class CategorySpendingComponent {
  protected readonly t = inject(I18nService).t;

  readonly state = input.required<CategorySpendingState>();
  /** Competência `YYYY-MM` do relatório (a mesma do KPI de gasto): vai para o filtro das movimentações. */
  readonly month = input.required<string>();
  readonly retry = output<void>();

  protected readonly view = computed(() => {
    const state = this.state();
    if (state.status !== 'ready') return null;
    const { data } = state;
    const openLabel = this.t().dashboard.categories.open;
    const month = this.month();
    const items = data.items.map<BarListItem>((item) => ({
      id: item.category.id,
      label: item.category.name,
      amount: item.amount,
      share: item.share,
      link: {
        commands: ['/transactions'],
        queryParams: { view: 'entries', competence: month, categoryId: item.category.id },
        label: interpolate(openLabel, { name: item.category.name }),
      },
    }));
    return { total: data.total, items, other: data.other };
  });
}
