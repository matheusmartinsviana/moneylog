import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { MoneyComponent } from '~/app/common/components/money/money.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import type { Installment } from '~/modules/transactions/core/types/transaction';
import { formatCompetenceShort, formatIsoDate } from '~/util/date';

/**
 * Parcelas de uma compra no cartão (T70 CA2, presentational): número, situação (Pendente, Paga, Atrasada,
 * Cancelada, em texto), valor, a fatura (referência e vencimento, com link) e `lateEntry` com a explicação
 * visível. Os valores e a situação são os do backend; a parcela cancelada fica riscada e continua listada.
 */
@Component({
  selector: 'app-installments-list',
  imports: [RouterLink, MoneyComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="installments" aria-labelledby="installments-title" data-cy="installments">
      <h2 class="installments__title" id="installments-title">
        {{ t().transactions.detail.installments.title }}
      </h2>
      <ul class="list">
        @for (row of rows(); track row.installment.number) {
          <li
            class="item"
            [class.is-canceled]="row.installment.status === 'CANCELED'"
            [attr.data-cy]="'installment-' + row.installment.number"
          >
            <div class="item__main">
              <span class="item__number num"
                >{{ row.installment.number }}/{{ row.installment.total }}</span
              >
              <span class="item__status" [attr.data-status]="row.installment.status">{{
                row.status
              }}</span>
              @if (cardId(); as card) {
                <a
                  class="item__invoice"
                  [routerLink]="['/cards', card, 'invoices', row.installment.invoiceId]"
                  [attr.data-cy]="'installment-invoice-' + row.installment.number"
                >
                  {{ row.invoice }}
                </a>
              } @else {
                <span class="item__invoice">{{ row.invoice }}</span>
              }
              @if (row.installment.lateEntry) {
                <span
                  class="item__late"
                  [attr.data-cy]="'installment-late-' + row.installment.number"
                >
                  <strong>{{ t().transactions.detail.installments.lateEntry }}.</strong>
                  {{ t().transactions.detail.installments.lateEntryHint }}
                </span>
              }
            </div>
            <span class="item__amount"><app-money [value]="row.installment.amount" /></span>
          </li>
        }
      </ul>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    .installments {
      display: grid;
      gap: var(--space-2);
      padding: var(--space-4);
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-card);
      background-color: var(--color-surface-muted);
    }

    .installments__title {
      font-size: var(--text-sm);
      font-weight: var(--weight-semibold);
    }

    .list {
      display: grid;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .item {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-2) 0;
      border-bottom: var(--border-width) solid var(--color-border);
      font-size: var(--text-sm);
    }

    .item:last-child {
      border-bottom: 0;
    }

    .item__main {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--space-1) var(--space-3);
      min-width: 0;
    }

    .item__status {
      color: var(--color-text-muted);
      font-size: var(--text-xs);
      font-weight: var(--weight-medium);
    }

    .item__status[data-status='OVERDUE'] {
      color: var(--color-risk);
    }

    .item__status[data-status='PAID'] {
      color: var(--color-positive);
    }

    .item__invoice {
      color: var(--color-text-muted);
      font-size: var(--text-xs);
    }

    .item__late {
      flex-basis: 100%;
      color: var(--color-warning);
      font-size: var(--text-xs);
    }

    .item__amount {
      font-weight: var(--weight-medium);
      white-space: nowrap;
    }

    .item.is-canceled .item__number,
    .item.is-canceled .item__amount {
      color: var(--color-text-muted);
      text-decoration: line-through;
    }
  `,
})
export class InstallmentsListComponent {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly installments = input.required<readonly Installment[]>();
  /** O cartão da compra: liga cada parcela à tela da fatura dela. */
  readonly cardId = input<string | null>(null);

  protected readonly rows = computed(() => {
    const locale = HTML_LANG[this.i18n.language()];
    const copy = this.t();
    return this.installments().map((installment) => ({
      installment,
      status: copy.cards.installmentStatuses[installment.status],
      invoice: interpolate(copy.transactions.detail.installments.invoice, {
        month: formatCompetenceShort(installment.invoiceReferenceMonth, locale),
        date: formatIsoDate(installment.invoiceDueDate, locale),
      }),
    }));
  });
}
