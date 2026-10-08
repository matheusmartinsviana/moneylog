import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { I18nService } from '~/app/common/i18n/i18n.service';

/** As telas de Planejamento (links, como as abas de Cartões): recorrências, pendentes, resumo, projeções. */
@Component({
  selector: 'app-planning-nav',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    /* Sete abas podem não caber numa linha de 375 px: quebram em vez de alargar a página. */
    .tabs {
      display: flex;
      flex-wrap: wrap;
      max-width: 100%;
    }
  `,
  template: `
    <nav class="tabs" [attr.aria-label]="t().recurrences.tabsLabel" data-cy="planning-tabs">
      <a
        class="tab"
        routerLink="/planning/recurrences"
        data-cy="planning-tab-recurrences"
        [attr.aria-current]="current() === 'recurrences' ? 'page' : null"
      >
        {{ t().recurrences.tabs.recurrences }}
      </a>
      <a
        class="tab"
        routerLink="/planning/occurrences"
        data-cy="planning-tab-pending"
        [attr.aria-current]="current() === 'pending' ? 'page' : null"
      >
        {{ t().recurrences.tabs.pending }}
      </a>
      <a
        class="tab"
        routerLink="/planning/summary"
        data-cy="planning-tab-summary"
        [attr.aria-current]="current() === 'summary' ? 'page' : null"
      >
        {{ t().recurrences.tabs.summary }}
      </a>
      <a
        class="tab"
        routerLink="/planning/projections"
        data-cy="planning-tab-projections"
        [attr.aria-current]="current() === 'projections' ? 'page' : null"
      >
        {{ t().recurrences.tabs.projections }}
      </a>
      <a
        class="tab"
        routerLink="/planning/debts"
        data-cy="planning-tab-debts"
        [attr.aria-current]="current() === 'debts' ? 'page' : null"
      >
        {{ t().recurrences.tabs.debts }}
      </a>
      <a
        class="tab"
        routerLink="/planning/third-parties"
        data-cy="planning-tab-third-parties"
        [attr.aria-current]="current() === 'thirdParties' ? 'page' : null"
      >
        {{ t().recurrences.tabs.thirdParties }}
      </a>
      <a
        class="tab"
        routerLink="/planning/commitments"
        data-cy="planning-tab-commitments"
        [attr.aria-current]="current() === 'commitments' ? 'page' : null"
      >
        {{ t().recurrences.tabs.commitments }}
      </a>
    </nav>
  `,
})
export class PlanningNavComponent {
  protected readonly t = inject(I18nService).t;
  readonly current = input.required<
    'recurrences' | 'pending' | 'summary' | 'projections' | 'debts' | 'thirdParties' | 'commitments'
  >();
}
