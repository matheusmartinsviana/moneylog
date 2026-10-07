import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';

import { I18nService } from '~/app/common/i18n/i18n.service';
import { AiAskDialogComponent } from '~/app/features/ai/components/ai-ask-dialog/ai-ask-dialog.component';
import { AiStatusFacade } from '~/modules/ai/core/facades/ai-status.facade';
import type { AiRunnablePurpose } from '~/modules/ai/core/types/ai';

/**
 * Pedidos de análise (resumo do mês e insights): habilitados só com a IA ligada e o provedor estável; sem isso
 * o botão fica desabilitado com a razão à vista. Cada pedido abre o diálogo de consentimento. Smart.
 */
@Component({
  selector: 'app-ai-actions',
  imports: [AiAskDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="act" data-cy="ai-actions">
      <p class="act__hint">{{ t().ai.actions.hint }}</p>
      <div class="act__buttons">
        <button
          type="button"
          class="button button--soft"
          data-cy="ai-action-summary"
          [disabled]="!status.enabled()"
          (click)="ask('MONTHLY_SUMMARY')"
        >
          {{ t().ai.actions.summary }}
        </button>
        <button
          type="button"
          class="button button--soft"
          data-cy="ai-action-insights"
          [disabled]="!status.enabled()"
          (click)="ask('INSIGHTS')"
        >
          {{ t().ai.actions.insights }}
        </button>
      </div>
      @if (!status.enabled()) {
        <p class="act__hint" data-cy="ai-actions-disabled">{{ t().ai.actions.disabled }}</p>
      }
    </div>
    <app-ai-ask-dialog
      [open]="purpose() !== null"
      [purpose]="purpose() ?? 'MONTHLY_SUMMARY'"
      (closed)="purpose.set(null)"
    />
  `,
  styles: `
    .act {
      display: grid;
      gap: var(--space-3);
    }

    .act__hint {
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .act__buttons {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
  `,
})
export class AiActionsComponent implements OnInit {
  protected readonly status = inject(AiStatusFacade);
  protected readonly t = inject(I18nService).t;
  protected readonly purpose = signal<AiRunnablePurpose | null>(null);

  ngOnInit(): void {
    this.status.ensureLoaded();
  }

  protected ask(purpose: AiRunnablePurpose): void {
    this.purpose.set(purpose);
  }
}
