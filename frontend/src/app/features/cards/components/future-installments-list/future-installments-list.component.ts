import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { MoneyComponent } from '~/app/common/components/money/money.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import type { FutureInstallments } from '~/modules/cards/core/types/invoice';
import { formatCompetenceShort, formatIsoDate } from '~/util/date';

/**
 * Parcelas futuras do cartão (T65 CA3, presentational): uma seção por fatura `FUTURE` com os itens
 * ("Notebook 2/6 · R$ 200,00") e o `total` do backend ("Total em parcelas futuras"). O valor de cada
 * fatura e o total são os que o backend somou; nada é recalculado aqui.
 */
@Component({
  selector: 'app-future-installments-list',
  imports: [RouterLink, MoneyComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="total" data-cy="future-total">
      <span>{{ t().cards.detail.futureTotal }}</span>
      <strong><app-money [value]="future().total" /></strong>
    </p>
    @for (group of groups(); track group.invoiceId) {
      <section class="group" [attr.data-cy]="'future-invoice-' + group.invoiceId">
        <h3 class="group__title">
          <span>{{ group.heading }}</span>
          <span class="group__amount" [attr.data-cy]="'future-invoice-amount-' + group.invoiceId">
            <app-money [value]="group.amount" />
          </span>
        </h3>
        <ul class="items">
          @for (item of group.items; track item.transactionId) {
            <li class="item" data-cy="future-item">
              <a
                class="item__link"
                [routerLink]="['/transactions', item.transactionId]"
                [attr.data-cy]="'future-item-open-' + item.transactionId"
              >
                {{ item.description }}
                @if (item.number !== null) {
                  <span class="num">{{ item.number }}/{{ item.totalInstallments }}</span>
                }
              </a>
              <app-money [value]="item.amount" />
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-4);
    }

    .total {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-3);
    }

    .group {
      display: grid;
      gap: var(--space-2);
      padding: var(--space-4);
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-card);
      background-color: var(--color-surface);
    }

    .group__title {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-3);
      font-size: var(--text-md);
      font-weight: var(--weight-semibold);
    }

    .items {
      display: grid;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .item {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-2) 0;
      border-bottom: var(--border-width) solid var(--color-border);
    }

    .item:last-child {
      border-bottom: 0;
    }

    .item__link {
      color: var(--color-text);
      overflow-wrap: anywhere;
      text-decoration: none;
    }
  `,
})
export class FutureInstallmentsListComponent {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly future = input.required<FutureInstallments>();

  protected readonly groups = computed(() => {
    const locale = HTML_LANG[this.i18n.language()];
    const copy = this.t().cards.purchase.preview;
    return this.future().byInvoice.map((invoice) => ({
      ...invoice,
      heading: interpolate(copy.invoice, {
        month: formatCompetenceShort(invoice.referenceMonth, locale),
        date: formatIsoDate(invoice.dueDate, locale),
      }),
    }));
  });
}
