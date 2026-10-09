import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';

import { DisclosureComponent } from '~/app/common/components/disclosure/disclosure.component';
import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { SectionContainerComponent } from '~/app/common/components/section-container/section-container.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { AiActionsComponent } from '~/app/features/ai/components/ai-actions/ai-actions.component';
import { InsightListComponent } from '~/app/features/insights/components/insight-list.component';
import { InsightsFacade } from '~/modules/ai/core/facades/insights.facade';

/**
 * Insights do mês: sempre mostra os calculados pelos dados (valem sem IA) e, quando a IA está ligada, deixa
 * pedir um comentário depois de revisar o que seria enviado. Smart.
 */
@Component({
  selector: 'app-insights-page',
  imports: [
    DisclosureComponent,
    PageLayoutComponent,
    SectionContainerComponent,
    InsightListComponent,
    AiActionsComponent,
  ],
  providers: [InsightsFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-layout [heading]="t().nav.insights">
      <div class="ins" data-cy="insights-page">
        <app-section-container
          [heading]="t().ai.insights.title"
          [description]="t().ai.insights.source"
        >
          <app-insight-list [state]="insights.state()" (retry)="insights.retry()" />
        </app-section-container>
        <app-disclosure fieldId="insights-more" [heading]="t().brief.more" [headingLevel]="2">
          <div class="ins__more">
            <app-section-container [heading]="t().ai.actions.title">
              <app-ai-actions />
            </app-section-container>
          </div>
        </app-disclosure>
      </div>
    </app-page-layout>
  `,
  styles: `
    .ins__more {
      padding-top: var(--space-3);
    }

    .ins {
      display: grid;
      gap: var(--space-5);
      max-width: 44rem;
    }
  `,
})
export class InsightsPage implements OnInit {
  protected readonly insights = inject(InsightsFacade);
  protected readonly t = inject(I18nService).t;

  ngOnInit(): void {
    this.insights.load(null);
  }
}
