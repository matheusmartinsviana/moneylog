import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { DialogComponent } from '~/app/common/components/dialog/dialog.component';
import { DisclosureComponent } from '~/app/common/components/disclosure/disclosure.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { AiConsentFacade } from '~/modules/ai/core/facades/ai-consent.facade';
import type { AiRunnablePurpose } from '~/modules/ai/core/types/ai';
import { formatCompetence } from '~/util/date';

/**
 * Fluxo "prévia, consentimento, resultado" da IA (T149). Abre, pede a prévia ao backend e mostra **o conteúdo
 * exato** (`redactedPayload`) que seria enviado; só o botão "Enviar à IA" aprova. O resultado leva o rótulo
 * "Gerado por IA" e o aviso de revisão; se a IA não produziu texto (`fallback`), explica sem erro bloqueante e
 * leva aos insights calculados. A tela que usa controla `open`. Smart (fala com a facade do consentimento).
 */
@Component({
  selector: 'app-ai-ask-dialog',
  imports: [NgTemplateOutlet, DialogComponent, DisclosureComponent, RouterLink],
  providers: [AiConsentFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-dialog
      cy="ai-ask"
      [open]="open()"
      [heading]="heading()"
      [dismissable]="!consent.busy()"
      (closed)="close()"
    >
      @switch (state().step) {
        @case ('previewing') {
          <p role="status" data-cy="ai-ask-preparing">{{ t().ai.consent.preparing }}</p>
        }
        @case ('error') {
          <p role="alert" class="ask__error" data-cy="ai-ask-error">{{ errorText() }}</p>
          <div class="ask__actions">
            <button type="button" class="button" data-cy="ai-ask-close" (click)="close()">
              {{ t().ai.result.close }}
            </button>
            <button
              type="button"
              class="button button--primary"
              data-cy="ai-ask-redo"
              (click)="consent.redo()"
            >
              {{ t().ai.consent.redo }}
            </button>
          </div>
        }
        @case ('consent') {
          <ng-container [ngTemplateOutlet]="consentTpl" />
        }
        @case ('running') {
          <ng-container [ngTemplateOutlet]="consentTpl" />
        }
        @case ('done') {
          @if (analysis(); as done) {
            @if (done.result; as result) {
              <div class="ask__result" data-cy="ai-ask-result">
                <p class="ask__badge" data-cy="ai-ask-badge">{{ t().ai.result.badge }}</p>
                <p class="ask__text">{{ result.text }}</p>
                @if (result.caveat) {
                  <p class="ask__caveat" data-cy="ai-ask-caveat">
                    <strong>{{ t().ai.result.caveat }}:</strong> {{ result.caveat }}
                  </p>
                }
                <p class="ask__muted" data-cy="ai-ask-warning">{{ t().ai.result.warning }}</p>
                <p class="ask__muted">{{ t().ai.consent.review }}</p>
              </div>
            } @else {
              <div class="ask__result" data-cy="ai-ask-fallback">
                <p class="ask__title">{{ t().ai.result.fallbackTitle }}</p>
                <p>{{ fallbackReason() }}</p>
                <p class="ask__muted">{{ t().ai.result.fallbackBody }}</p>
                <a
                  class="button button--soft"
                  routerLink="/insights"
                  data-cy="ai-ask-fallback-insights"
                  (click)="close()"
                >
                  {{ t().ai.insights.viewAll }}
                </a>
              </div>
            }
          }
          <div class="ask__actions">
            <button
              type="button"
              class="button button--primary"
              data-cy="ai-ask-done"
              (click)="close()"
            >
              {{ t().ai.result.close }}
            </button>
          </div>
        }
      }
    </app-dialog>

    <ng-template #consentTpl>
      @if (preview(); as p) {
        <div class="ask__consent" data-cy="ai-ask-consent">
          <p>{{ t().ai.consent.intro }}</p>
          <dl class="ask__facts">
            <dt>{{ t().ai.consent.purpose }}</dt>
            <dd>{{ purposeLabel() }}</dd>
            @if (period(); as label) {
              <dt>{{ t().ai.consent.period }}</dt>
              <dd>{{ label }}</dd>
            }
            @for (count of counts(); track count.key) {
              <dt>{{ count.label }}</dt>
              <dd class="num">{{ count.value }}</dd>
            }
          </dl>
          <p class="ask__muted num">
            {{ tokensText() }}
          </p>
          <div data-cy="ai-ask-redactions">
            <p>
              <strong>{{ t().ai.consent.redactions }}</strong>
            </p>
            @if (redactions().length === 0) {
              <p class="ask__muted">{{ t().ai.consent.noRedactions }}</p>
            } @else {
              <ul class="ask__chips">
                @for (item of redactions(); track item) {
                  <li class="ask__chip">{{ item }}</li>
                }
              </ul>
            }
          </div>
          <app-disclosure
            [heading]="t().ai.consent.payload"
            fieldId="ai-ask-payload"
            [headingLevel]="3"
          >
            <pre class="ask__payload" tabindex="0" data-cy="ai-ask-payload-text">{{
              p.redactedPayload
            }}</pre>
          </app-disclosure>
          @if (consentProblem(); as message) {
            <p role="alert" class="ask__error" data-cy="ai-ask-send-error">{{ message }}</p>
          }
          <div class="ask__actions">
            <button
              type="button"
              class="button"
              data-cy="ai-ask-cancel"
              [disabled]="consent.busy()"
              (click)="close()"
            >
              {{ t().ai.consent.cancel }}
            </button>
            <button
              type="button"
              class="button button--primary"
              data-autofocus
              data-cy="ai-ask-send"
              [disabled]="consent.busy()"
              (click)="consent.approve()"
            >
              {{ consent.busy() ? t().ai.consent.sending : t().ai.consent.send }}
            </button>
          </div>
        </div>
      }
    </ng-template>
  `,
  styles: `
    .ask__consent,
    .ask__result {
      display: grid;
      gap: var(--space-3);
    }

    .ask__facts {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: var(--space-1) var(--space-4);
      font-size: var(--text-sm);
    }

    .ask__facts dd {
      color: var(--color-text-muted);
    }

    .ask__muted {
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .ask__title {
      font-weight: var(--weight-medium);
    }

    .ask__text {
      font-size: var(--text-md);
      line-height: var(--leading-normal);
      white-space: pre-wrap;
    }

    .ask__badge {
      width: fit-content;
      padding: 2px var(--space-3);
      border-radius: 999px;
      background-color: var(--color-surface-muted);
      font-size: var(--text-sm);
      font-weight: var(--weight-medium);
    }

    .ask__error {
      color: var(--color-danger);
    }

    .ask__chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .ask__chip {
      padding: 0 var(--space-3);
      border-radius: 999px;
      background-color: var(--color-surface-muted);
      font-size: var(--text-sm);
    }

    .ask__payload {
      max-height: 14rem;
      margin: 0;
      padding: var(--space-3);
      overflow: auto;
      border-radius: var(--radius-control);
      background-color: var(--color-surface-muted);
      font-family: var(--font-mono, ui-monospace, monospace);
      font-size: var(--text-xs, 0.75rem);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .ask__actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--space-2);
    }
  `,
})
export class AiAskDialogComponent {
  protected readonly consent = inject(AiConsentFacade);
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly open = input.required<boolean>();
  readonly purpose = input.required<AiRunnablePurpose>();
  /** Competência `AAAA-MM`; `null` = mês corrente do backend. */
  readonly month = input<string | null>(null);
  readonly closed = output<void>();

  protected readonly state = this.consent.state;
  protected readonly heading = computed(() => this.t().ai.consent.title);
  protected readonly preview = computed(() => {
    const s = this.state();
    return s.step === 'consent' || s.step === 'running' ? s.preview : null;
  });
  protected readonly analysis = computed(() => {
    const s = this.state();
    return s.step === 'done' ? s.analysis : null;
  });

  protected readonly purposeLabel = computed(() => {
    const p = this.preview();
    return p ? (this.t().ai.purposes[p.purpose] ?? p.purpose) : '';
  });
  protected readonly period = computed(() => {
    const p = this.preview()?.period;
    return p ? formatCompetence(p, HTML_LANG[this.i18n.language()]) : null;
  });
  protected readonly counts = computed(() => {
    const labels = this.t().ai.consent.countLabels;
    return Object.entries(this.preview()?.counts ?? {})
      .filter(([key]) => Object.hasOwn(labels, key))
      .map(([key, value]) => ({ key, label: labels[key] ?? key, value }));
  });
  protected readonly tokensText = computed(() =>
    interpolate(this.t().ai.consent.tokens, {
      tokens: String(this.preview()?.estimatedTokens ?? 0),
    }),
  );
  protected readonly redactions = computed(() => {
    const types = this.t().ai.consent.redactionTypes;
    return (this.preview()?.redactions ?? []).map((r) => (Object.hasOwn(types, r) ? types[r]! : r));
  });

  protected readonly errorText = computed(() => {
    const s = this.state();
    return s.step === 'error' ? problemMessage(s.problem, this.t().errors) : '';
  });
  protected readonly consentProblem = computed(() => {
    const s = this.state();
    return s.step === 'consent' && s.problem ? problemMessage(s.problem, this.t().errors) : null;
  });

  protected readonly fallbackReason = computed(() => {
    const copy = this.t().ai.result;
    switch (this.analysis()?.status) {
      case 'REJECTED_UNGROUNDED':
        return copy.ungrounded;
      case 'DENIED':
        return copy.denied;
      case 'BUDGET_EXCEEDED':
        return copy.budget;
      default:
        return copy.failed;
    }
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        const purpose = this.purpose();
        const month = this.month();
        const language = this.i18n.language();
        untracked(() => this.consent.start({ purpose, month, language }));
      } else {
        untracked(() => this.consent.reset());
      }
    });
  }

  protected close(): void {
    this.consent.reset();
    this.closed.emit();
  }
}
