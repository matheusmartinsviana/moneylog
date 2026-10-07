import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { AiStatusFacade } from '~/modules/ai/core/facades/ai-status.facade';

/**
 * Estado real da IA no servidor: desligada (com o que fazer, sem campo de chave) ou ligada, com provedor,
 * modelo, o que resta de uso e o disjuntor. A chave nunca passa por aqui. Smart (lê `AiStatusFacade`).
 */
@Component({
  selector: 'app-ai-status-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="st" data-cy="ai-status">
      @switch (status.state().status) {
        @case ('loading') {
          <p role="status" data-cy="ai-status-loading">{{ t().ai.status.loading }}</p>
        }
        @case ('error') {
          <p role="alert" data-cy="ai-status-error">{{ t().ai.status.error }}</p>
          <button type="button" class="button" data-cy="ai-status-retry" (click)="status.reload()">
            {{ t().ai.status.retry }}
          </button>
        }
        @case ('ready') {
          @if (status.data(); as data) {
            @if (data.enabled) {
              <p class="st__badge" data-cy="ai-status-on">{{ t().ai.status.on }}</p>
              <p data-cy="ai-status-provider">{{ providerLine() }}</p>
              <p class="st__muted num" data-cy="ai-status-remaining">{{ remaining() }}</p>
              @if (data.circuit === 'OPEN') {
                <p role="status" data-cy="ai-status-circuit">{{ t().ai.status.circuitOpen }}</p>
              }
            } @else {
              <p class="st__badge" data-cy="ai-status-off">
                {{ t().workspacePages.ai.notConfigured }}
              </p>
              <p>{{ t().workspacePages.ai.notConfiguredDescription }}</p>
              <p class="st__muted">{{ t().workspacePages.ai.worksWithout }}</p>
            }
          }
        }
      }
    </div>
  `,
  styles: `
    .st {
      display: grid;
      justify-items: start;
      gap: var(--space-2);
    }

    .st__badge {
      padding: 2px var(--space-3);
      border-radius: 999px;
      background-color: var(--color-surface-muted);
      font-size: var(--text-sm);
      font-weight: var(--weight-medium);
    }

    .st__muted {
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }
  `,
})
export class AiStatusCardComponent {
  protected readonly status = inject(AiStatusFacade);
  protected readonly t = inject(I18nService).t;

  protected readonly providerLine = computed(() => {
    const data = this.status.data();
    return interpolate(this.t().ai.status.providerLine, {
      provider: data?.provider ?? '',
      model: data?.model ?? '',
    });
  });
  protected readonly remaining = computed(() => {
    const data = this.status.data();
    return interpolate(this.t().ai.status.remaining, {
      calls: String(data?.dailyCallsRemaining ?? 0),
      tokens: String(data?.monthlyTokensRemaining ?? 0),
    });
  });
}
