import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { MoneyComponent } from '~/app/common/components/money/money.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { InvoiceStatusComponent } from '~/app/features/cards/components/invoice-status/invoice-status.component';
import type { InvoiceSummary } from '~/modules/cards/core/types/invoice';
import { formatCompetenceShort, formatIsoDate } from '~/util/date';

/**
 * Uma fatura na lista do cartão (T65 CA2, presentational): referência, período, fechamento,
 * vencimento, situação (chip com texto) e o `outstanding` do backend. Com `hasLateEntries`, mostra o
 * indicador "inclui lançamento tardio" **com a explicação visível** (nada essencial fica só em tooltip).
 */
@Component({
  selector: 'li[app-invoice-summary-row]',
  imports: [RouterLink, MoneyComponent, InvoiceStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'row', '[attr.data-cy]': "'invoice-row-' + invoice().id" },
  template: `
    @let i = invoice();
    <div class="row__main">
      <a
        class="row__name"
        [routerLink]="['/cards', i.cardId, 'invoices', i.id]"
        [attr.aria-label]="openLabel()"
        [attr.data-cy]="'invoice-open-' + i.id"
      >
        {{ reference() }}
      </a>
      <app-invoice-status [status]="i.status" />
    </div>
    <p class="row__dates" [attr.data-cy]="'invoice-dates-' + i.id">
      <span>{{ period() }}</span>
      <span>{{ closing() }}</span>
      <span>{{ due() }}</span>
    </p>
    <p class="row__outstanding">
      <span class="row__label">{{ t().cards.detail.invoiceRow.outstanding }}</span>
      <span class="row__amount" [attr.data-cy]="'invoice-outstanding-' + i.id">
        <app-money [value]="i.outstanding" />
      </span>
    </p>
    @if (i.hasLateEntries) {
      <p class="row__late" [attr.data-cy]="'invoice-late-' + i.id">
        <strong>{{ t().cards.detail.invoiceRow.lateEntry }}.</strong>
        {{ t().cards.detail.invoiceRow.lateEntryHint }}
      </p>
    }
  `,
  styles: `
    :host(.row) {
      display: grid;
      gap: var(--space-2);
      padding: var(--space-4);
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-card);
      background-color: var(--color-surface);
      list-style: none;
    }

    .row__main {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
    }

    .row__name {
      color: var(--color-text);
      font-weight: var(--weight-semibold);
      text-decoration: none;
    }

    .row__dates {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1) var(--space-3);
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .row__outstanding {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-3);
    }

    .row__label {
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .row__amount {
      font-weight: var(--weight-semibold);
    }

    .row__late {
      color: var(--color-warning);
      font-size: var(--text-xs);
    }
  `,
})
export class InvoiceSummaryRowComponent {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly invoice = input.required<InvoiceSummary>();

  private readonly locale = computed(() => HTML_LANG[this.i18n.language()]);
  protected readonly reference = computed(() =>
    interpolate(this.t().cards.detail.invoiceRow.reference, {
      month: formatCompetenceShort(this.invoice().referenceMonth, this.locale()),
    }),
  );
  protected readonly openLabel = computed(() =>
    interpolate(this.t().cards.detail.invoiceRow.open, {
      month: formatCompetenceShort(this.invoice().referenceMonth, this.locale()),
    }),
  );
  protected readonly period = computed(() =>
    interpolate(this.t().cards.detail.invoiceRow.period, {
      from: formatIsoDate(this.invoice().periodStart, this.locale()),
      to: formatIsoDate(this.invoice().closingDate, this.locale()),
    }),
  );
  protected readonly closing = computed(() =>
    interpolate(this.t().cards.detail.invoiceRow.closing, {
      date: formatIsoDate(this.invoice().closingDate, this.locale()),
    }),
  );
  protected readonly due = computed(() =>
    interpolate(this.t().cards.detail.invoiceRow.due, {
      date: formatIsoDate(this.invoice().dueDate, this.locale()),
    }),
  );
}
