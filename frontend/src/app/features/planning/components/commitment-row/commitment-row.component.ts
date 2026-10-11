import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { MoneyComponent } from '~/app/common/components/money/money.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import type { Commitment } from '~/modules/commitments/core/types/commitment';
import { formatIsoDate } from '~/util/date';
import { formatRatio } from '~/util/ratio';

/**
 * Um compromisso acompanhado na lista (presentational). Tudo vem do backend: no empréstimo de terceiro
 * só o informado (parcelas pagas/total, valor pago), **sem saldo**; no projeto, pago, saldo nominal e
 * progresso. Nada é somado aqui.
 */
@Component({
  selector: 'li[app-commitment-row]',
  imports: [RouterLink, MoneyComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'row row-card', '[attr.data-cy]': "'commitment-row-' + commitment().id" },
  template: `
    @let c = commitment();
    <div class="row__main">
      <a
        class="row__title stretched-link"
        [routerLink]="['/planning/commitments', c.id]"
        [attr.aria-label]="openLabel()"
        [attr.data-cy]="'commitment-open-' + c.id"
      >
        {{ c.name }}
      </a>
      <p class="row__meta">
        <span class="status" [attr.data-cy]="'commitment-kind-' + c.id">{{
          t().commitments.kinds[c.kind]
        }}</span>
        @if (c.counterparty; as name) {
          <span>{{ counterparty(name) }}</span>
        }
      </p>
    </div>
    <div class="row__values">
      @if (c.kind === 'TRACKED_THIRD_PARTY') {
        @if (installments(); as text) {
          <p [attr.data-cy]="'commitment-installments-' + c.id">{{ text }}</p>
        }
        @if (c.paid; as paid) {
          <p class="row__meta">
            <span>{{ t().commitments.row.paid }}</span>
            <app-money [value]="paid" />
          </p>
        }
        <p class="row__meta" [attr.data-cy]="'commitment-unknown-' + c.id">
          {{ t().commitments.row.balanceUnknown }}
        </p>
      } @else {
        @if (c.nominalBalance; as balance) {
          <p class="row__amount" [attr.data-cy]="'commitment-balance-' + c.id">
            <span class="row__meta">{{ t().commitments.row.balance }}</span>
            <app-money [value]="balance" />
          </p>
        }
        @if (progress(); as text) {
          <p class="row__meta" [attr.data-cy]="'commitment-progress-' + c.id">{{ text }}</p>
        }
      }
    </div>
    <div class="row__when">
      @if (nextDue(); as text) {
        <p [attr.data-cy]="'commitment-next-' + c.id">{{ text }}</p>
      }
    </div>
  `,
  styles: `
    :host {
      position: relative; /* contém o link esticado (cartão inteiro clicável) */
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4);
      list-style: none;
    }

    .row__main,
    .row__values,
    .row__when {
      display: grid;
      gap: var(--space-1);
      min-width: 0;
      align-content: start;
    }

    .row__title {
      color: var(--color-text);
      font-weight: var(--weight-semibold);
      overflow-wrap: anywhere;
      text-decoration: none;
    }

    .row__meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .row__values p,
    .row__when p {
      margin: 0;
    }

    .row__amount {
      display: grid;
      font-weight: var(--weight-semibold);
    }

    @media (width >= 768px) {
      :host {
        grid-template-columns: minmax(0, 2fr) minmax(0, 1.5fr) minmax(0, 1fr);
        align-items: start;
      }
    }
  `,
})
export class CommitmentRowComponent {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  private readonly locale = computed(() => HTML_LANG[this.i18n.language()]);

  readonly commitment = input.required<Commitment>();

  protected readonly openLabel = computed(() =>
    interpolate(this.t().commitments.row.open, { name: this.commitment().name }),
  );
  protected readonly installments = computed(() => {
    const c = this.commitment();
    return c.installmentsTotal === null
      ? null
      : interpolate(this.t().commitments.row.installments, {
          paid: String(c.installmentsPaid ?? 0),
          total: String(c.installmentsTotal),
        });
  });
  protected readonly progress = computed(() => {
    const value = this.commitment().progress;
    return value === null
      ? null
      : interpolate(this.t().commitments.row.progress, {
          percent: formatRatio(value, this.locale()),
        });
  });
  protected readonly nextDue = computed(() => {
    const date = this.commitment().nextDueDate;
    return date === null
      ? null
      : interpolate(this.t().commitments.row.nextDue, {
          date: formatIsoDate(date, this.locale(), 'long'),
        });
  });

  protected counterparty(name: string): string {
    return interpolate(this.t().commitments.row.counterparty, { name });
  }
}
