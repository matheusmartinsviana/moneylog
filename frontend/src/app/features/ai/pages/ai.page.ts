import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';

import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { SectionContainerComponent } from '~/app/common/components/section-container/section-container.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { AiActionsComponent } from '~/app/features/ai/components/ai-actions/ai-actions.component';
import { AiHistoryComponent } from '~/app/features/ai/components/ai-history/ai-history.component';
import { AiSettingsCardComponent } from '~/app/features/ai/components/ai-settings-card/ai-settings-card.component';
import { AiStatusCardComponent } from '~/app/features/ai/components/ai-status-card/ai-status-card.component';
import { AiStatusFacade } from '~/modules/ai/core/facades/ai-status.facade';

/**
 * `/ai`: o estado **verdadeiro** da IA (`GET /v1/ai/status`), o pedido de análises com consentimento, o
 * histórico, a preferência da mensagem diária e a política de privacidade. **Nenhum campo de chave**: ela
 * só existe no ambiente do servidor e nunca passa por esta tela.
 */
@Component({
  selector: 'app-ai-page',
  imports: [
    RouterLink,
    PageLayoutComponent,
    SectionContainerComponent,
    AiStatusCardComponent,
    AiActionsComponent,
    AiHistoryComponent,
    AiSettingsCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-layout [heading]="t().nav.ai" [description]="t().workspacePages.ai.subtitle">
      <div class="ai" data-cy="ai-page">
        <app-section-container [heading]="t().workspacePages.ai.statusTitle">
          <app-ai-status-card />
        </app-section-container>

        <app-section-container [heading]="t().ai.actions.title">
          <app-ai-actions />
        </app-section-container>

        <app-section-container [heading]="t().ai.history.title">
          <app-ai-history />
        </app-section-container>

        <app-section-container [heading]="t().ai.settings.title">
          <app-ai-settings-card />
        </app-section-container>

        <app-section-container [heading]="t().workspacePages.ai.howTitle">
          <div class="ai__how" data-cy="ai-how">
            <p>{{ t().workspacePages.ai.howIntro }}</p>
            <dl class="ai__vars">
              <dt><code>AI_PROVIDER</code></dt>
              <dd>{{ t().workspacePages.ai.varProvider }}</dd>
              <dt><code>AI_API_KEY</code></dt>
              <dd>{{ t().workspacePages.ai.varKey }}</dd>
              <dt><code>AI_MODEL</code></dt>
              <dd>{{ t().workspacePages.ai.varModel }}</dd>
            </dl>
            <p class="ai__muted">{{ t().workspacePages.ai.howNote }}</p>
          </div>
        </app-section-container>

        <app-section-container [heading]="t().workspacePages.ai.privacyTitle">
          <p data-cy="ai-privacy">{{ t().workspacePages.ai.privacyText }}</p>
        </app-section-container>

        <a class="ai__link" routerLink="/settings" data-cy="ai-settings-link">{{
          t().nav.settings
        }}</a>
      </div>
    </app-page-layout>
  `,
  styles: `
    .ai {
      display: grid;
      gap: var(--space-5);
      max-width: 44rem;
    }

    .ai__how {
      display: grid;
      justify-items: start;
      gap: var(--space-2);
    }

    .ai__muted {
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .ai__vars {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: var(--space-1) var(--space-4);
      font-size: var(--text-sm);
    }

    .ai__vars dd {
      color: var(--color-text-muted);
    }

    .ai__link {
      width: fit-content;
      color: var(--color-accent);
      font-weight: var(--weight-medium);
      text-decoration: none;
    }

    .ai__link:hover {
      text-decoration: underline;
    }

    .ai__link:focus-visible {
      border-radius: 4px;
      outline: none;
      box-shadow: var(--focus-ring);
    }
  `,
})
export class AiPage implements OnInit {
  protected readonly t = inject(I18nService).t;
  private readonly status = inject(AiStatusFacade);

  ngOnInit(): void {
    this.status.reload();
  }
}
