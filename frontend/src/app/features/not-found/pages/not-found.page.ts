import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  EmptyStateAction,
  EmptyStateComponent,
} from '~/app/common/components/empty-state/empty-state.component';
import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { I18nService } from '~/app/common/i18n/i18n.service';

/** Rota desconhecida: explica e leva de volta ao Início. */
@Component({
  selector: 'app-not-found-page',
  imports: [PageLayoutComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-layout [heading]="t().notFound.pageTitle">
      <app-empty-state
        [heading]="t().notFound.title"
        [description]="t().notFound.description"
        [actions]="actions()"
        illustration="document"
      />
    </app-page-layout>
  `,
})
export class NotFoundPage {
  protected readonly t = inject(I18nService).t;

  protected readonly actions = computed<readonly EmptyStateAction[]>(() => [
    { id: 'go-home', label: this.t().notFound.goHome, available: true, primary: true, link: '/' },
  ]);
}
