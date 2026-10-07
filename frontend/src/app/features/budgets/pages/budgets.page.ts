import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { EmptyStateComponent } from '~/app/common/components/empty-state/empty-state.component';
import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { I18nService } from '~/app/common/i18n/i18n.service';

/**
 * Orçamentos (T208, D3 = "em breve"): não existe domínio de orçamentos, então a página só diz isso. Nenhum
 * número, nenhuma barra e nenhuma ação que finja funcionar; o consumo por categoria já está no Início.
 */
@Component({
  selector: 'app-budgets-page',
  imports: [PageLayoutComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-layout [heading]="t().nav.budgets">
      <app-empty-state
        [heading]="t().emptyState.budgets.title"
        [description]="t().emptyState.budgets.description"
        illustration="grid"
      />
    </app-page-layout>
  `,
})
export class BudgetsPage {
  protected readonly t = inject(I18nService).t;
}
