import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { problemMessage } from '~/app/common/i18n/problem-message';
import type { BillingChangePreview } from '~/modules/cards/core/types/billing-change-preview';
import type { Problem } from '~/util/api/problem';
import { formatIsoDate } from '~/util/date';

/**
 * Efeito da mudança de fechamento/vencimento (T69, presentational): mostra a primeira fatura afetada e
 * quantas parcelas e créditos mudam de fatura **como o backend devolveu** (S-128), e deixa claro que a
 * fatura atual e as fechadas não mudam (S-42). Avisa quando a prévia ficou velha (`409
 * CARD_BILLING_CHANGE_STALE`) e quando não foi possível calculá-la (com "tentar de novo").
 */
@Component({
  selector: 'app-billing-change-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="notice" role="status" aria-live="polite" data-cy="billing-change">
      <h2 class="notice__title">{{ t().cards.billingChange.title }}</h2>
      @if (stale()) {
        <p class="notice__warning" data-cy="billing-change-stale">
          {{ t().cards.billingChange.stale }}
        </p>
      }
      @if (loading()) {
        <p data-cy="billing-change-loading">{{ t().cards.billingChange.loading }}</p>
      } @else if (problem(); as failure) {
        <p class="notice__warning" role="alert" data-cy="billing-change-error">
          {{ errorText() }}
        </p>
        <button type="button" class="button" data-cy="billing-change-retry" (click)="retry.emit()">
          {{ t().cards.pay.retry }}
        </button>
      } @else if (preview(); as data) {
        <p data-cy="billing-change-first-invoice">{{ firstInvoice() }}</p>
        <p data-cy="billing-change-keep">{{ t().cards.billingChange.keep }}</p>
        <p data-cy="billing-change-moved">{{ moved() }}</p>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    .notice {
      display: grid;
      gap: var(--space-2);
      padding: var(--space-4);
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-card);
      background-color: var(--color-surface-muted);
      font-size: var(--text-sm);
    }

    .notice__title {
      font-size: var(--text-sm);
      font-weight: var(--weight-semibold);
    }

    .notice__warning {
      color: var(--color-warning);
      font-weight: var(--weight-medium);
    }
  `,
})
export class BillingChangeNoticeComponent {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly preview = input<BillingChangePreview | null>(null);
  readonly loading = input(false);
  readonly problem = input<Problem | null>(null);
  /** A confirmação foi recusada porque a prévia ficou velha (`CARD_BILLING_CHANGE_STALE`). */
  readonly stale = input(false);
  /** "Tentar de novo" quando a prévia falhou: quem usa pede a prévia outra vez. */
  readonly retry = output<void>();

  private readonly locale = computed(() => HTML_LANG[this.i18n.language()]);
  protected readonly errorText = computed(() => {
    const problem = this.problem();
    return problem && problem.status !== 0 && problem.status < 500
      ? problemMessage(problem, this.t().errors)
      : this.t().cards.billingChange.error;
  });
  protected readonly firstInvoice = computed(() => {
    const preview = this.preview();
    if (!preview) return '';
    return interpolate(this.t().cards.billingChange.firstInvoice, {
      closing: formatIsoDate(preview.firstNewInvoice.closingDate, this.locale()),
      due: formatIsoDate(preview.firstNewInvoice.dueDate, this.locale()),
    });
  });
  protected readonly moved = computed(() => {
    const preview = this.preview();
    if (!preview) return '';
    const copy = this.t().cards.billingChange;
    return preview.movedInstallments === 0 && preview.movedCredits === 0
      ? copy.movedNone
      : interpolate(copy.moved, {
          installments: String(preview.movedInstallments),
          credits: String(preview.movedCredits),
        });
  });
}
