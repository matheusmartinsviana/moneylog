import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';

import { EmptyStateComponent } from '~/app/common/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { AiHistoryFacade } from '~/modules/ai/core/facades/ai-history.facade';
import { formatInstant } from '~/util/date';

/**
 * Histórico de análises (o que foi pedido, quando e com qual provedor). O conteúdo enviado só aparece enquanto
 * não foi apagado pela retenção; depois, a tela diz quando foi apagado. Smart (fala com a facade).
 */
@Component({
  selector: 'app-ai-history',
  imports: [EmptyStateComponent, ErrorStateComponent],
  providers: [AiHistoryFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (history.state().status) {
      @case ('loading') {
        <p role="status" class="hist__muted" data-cy="ai-history-loading">
          {{ t().ai.history.loading }}
        </p>
      }
      @case ('error') {
        <app-error-state [problem]="problem()" (retry)="history.load()" />
      }
      @case ('empty') {
        <app-empty-state
          [heading]="t().ai.history.empty"
          [description]="t().ai.history.emptyHint"
          illustration="log"
        />
      }
      @case ('ready') {
        <ul class="hist" data-cy="ai-history">
          @for (item of items(); track item.id) {
            <li class="hist__row" [attr.data-cy]="'ai-history-row-' + item.id">
              <div class="hist__head">
                <span class="hist__title">{{ purposeLabel(item.purpose) }}</span>
                <span class="hist__status" data-cy="ai-history-status">{{
                  statusLabel(item.status)
                }}</span>
              </div>
              <p class="hist__muted num">
                {{ when(item.createdAt) }} · {{ item.provider }} {{ item.model }} ·
                {{ tokens(item.tokens.input, item.tokens.output) }}
              </p>
              @if (item.payloadAvailable) {
                <p>
                  <button
                    type="button"
                    class="button button--soft"
                    [attr.aria-expanded]="openId() === item.id"
                    [attr.data-cy]="'ai-history-payload-toggle-' + item.id"
                    (click)="toggle(item.id)"
                  >
                    {{
                      openId() === item.id ? t().ai.history.hidePayload : t().ai.history.viewPayload
                    }}
                  </button>
                </p>
                @if (openId() === item.id) {
                  @switch (history.payloads()[item.id]?.status) {
                    @case ('ready') {
                      <pre class="hist__payload" tabindex="0" data-cy="ai-history-payload">{{
                        history.payloads()[item.id]?.text
                      }}</pre>
                    }
                    @case ('error') {
                      <p role="alert" class="hist__muted">{{ t().ai.history.error }}</p>
                    }
                    @default {
                      <p role="status" class="hist__muted">{{ t().ai.history.loading }}</p>
                    }
                  }
                }
              } @else if (item.payloadPurgedAt) {
                <p class="hist__muted" data-cy="ai-history-purged">
                  {{ purged(item.payloadPurgedAt) }}
                </p>
              }
            </li>
          }
        </ul>
        @if (history.hasNext()) {
          <button
            type="button"
            class="button"
            data-cy="ai-history-more"
            [disabled]="history.loadingMore()"
            (click)="history.loadMore()"
          >
            {{ t().ai.history.loadMore }}
          </button>
        }
      }
    }
  `,
  styles: `
    .hist {
      display: grid;
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .hist__row {
      display: grid;
      gap: var(--space-1);
      padding: var(--space-3) var(--space-4);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-control);
    }

    .hist__head {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: var(--space-2);
    }

    .hist__title {
      font-weight: var(--weight-medium);
    }

    .hist__status {
      padding: 0 var(--space-2);
      border-radius: 999px;
      background-color: var(--color-surface-muted);
      font-size: var(--text-sm);
    }

    .hist__payload {
      max-height: 14rem;
      margin: 0;
      padding: var(--space-3);
      overflow: auto;
      border-radius: var(--radius-control);
      background-color: var(--color-surface-muted);
      font-family: var(--font-mono, ui-monospace, monospace);
      font-size: 0.75rem;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .hist__muted {
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }
  `,
})
export class AiHistoryComponent implements OnInit {
  protected readonly history = inject(AiHistoryFacade);
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  protected readonly openId = signal<string | null>(null);

  ngOnInit(): void {
    this.history.load();
  }

  protected items() {
    const s = this.history.state();
    return s.status === 'ready' ? s.items : [];
  }

  protected problem() {
    const s = this.history.state();
    return s.status === 'error' ? s.problem : null;
  }

  protected purposeLabel(purpose: string): string {
    const labels = this.t().ai.purposes;
    return Object.hasOwn(labels, purpose) ? labels[purpose]! : purpose;
  }

  protected statusLabel(status: string): string {
    const labels = this.t().ai.history.statuses;
    return Object.hasOwn(labels, status) ? labels[status]! : status;
  }

  protected when(value: string): string {
    return formatInstant(value, HTML_LANG[this.i18n.language()]);
  }

  protected tokens(input: number, output: number): string {
    return interpolate(this.t().ai.history.tokens, {
      input: String(input),
      output: String(output),
    });
  }

  protected purged(value: string): string {
    return interpolate(this.t().ai.history.purged, {
      date: formatInstant(value, HTML_LANG[this.i18n.language()]),
    });
  }

  protected toggle(id: string): void {
    const opening = this.openId() !== id;
    this.openId.set(opening ? id : null);
    if (opening) this.history.loadPayload(id);
  }
}
