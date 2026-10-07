import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { MoneyComponent } from '~/app/common/components/money/money.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import type { InvoiceItem } from '~/modules/cards/core/types/invoice';
import { formatIsoDate } from '~/util/date';

/**
 * Itens da fatura (T66, presentational): parcelas ("Notebook 1/6") e créditos, ordenados por data, cada um
 * levando ao detalhe da movimentação. `lateEntry` mostra o rótulo "lançamento tardio" com a explicação
 * **visível** (não só em tooltip). `amount` é sempre positivo no backend: o crédito aparece com o
 * rótulo "Crédito" e o sinal `−`, só como apresentação. Lista em todas as larguras (cabe em 375 px).
 */
@Component({
  selector: 'app-invoice-items-table',
  imports: [RouterLink, MoneyComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="items" data-cy="invoice-items">
      @for (item of sorted(); track item.transactionId + ':' + (item.number ?? 'c')) {
        <li
          class="item"
          [attr.data-cy]="'invoice-item-' + item.transactionId + '-' + (item.number ?? 'credit')"
        >
          <div class="item__main">
            <a
              class="item__link"
              [routerLink]="['/transactions', item.transactionId]"
              [attr.aria-label]="openLabel(item)"
              [attr.data-cy]="'invoice-item-open-' + item.transactionId"
            >
              {{ item.description }}
              @if (item.number !== null) {
                <span class="num">{{ item.number }}/{{ item.totalInstallments }}</span>
              }
            </a>
            <span class="item__meta">
              {{ date(item) }}
              @if (item.kind === 'CREDIT') {
                ·
                <span class="item__tag" data-cy="invoice-item-credit">{{
                  t().cards.invoice.credit
                }}</span>
              }
            </span>
            @if (item.lateEntry) {
              <span class="item__late" data-cy="invoice-item-late">
                <strong>{{ t().cards.invoice.lateEntry }}.</strong>
                {{ t().cards.invoice.lateEntryHint }}
              </span>
            }
          </div>
          <span class="item__amount" [class.is-credit]="item.kind === 'CREDIT'">
            @if (item.kind === 'CREDIT') {
              <span aria-hidden="true">−</span>
            }
            <app-money [value]="item.amount" />
          </span>
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
    }

    .items {
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
      padding: var(--space-3) 0;
      border-bottom: var(--border-width) solid var(--color-border);
    }

    .item:last-child {
      border-bottom: 0;
    }

    .item__main {
      display: grid;
      gap: var(--space-1);
      min-width: 0;
    }

    .item__link {
      color: var(--color-text);
      font-weight: var(--weight-medium);
      overflow-wrap: anywhere;
      text-decoration: none;
    }

    .item__meta {
      color: var(--color-text-muted);
      font-size: var(--text-xs);
    }

    .item__tag {
      color: var(--color-positive);
      font-weight: var(--weight-medium);
    }

    .item__late {
      color: var(--color-warning);
      font-size: var(--text-xs);
    }

    .item__amount {
      font-weight: var(--weight-semibold);
      white-space: nowrap;
    }

    .item__amount.is-credit {
      color: var(--color-positive);
    }
  `,
})
export class InvoiceItemsTableComponent {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly items = input.required<readonly InvoiceItem[]>();

  /** Ordem por data (e a original dentro do mesmo dia): só apresentação, `sort` é estável. */
  protected readonly sorted = computed(() =>
    [...this.items()].sort((a, b) => a.date.localeCompare(b.date)),
  );

  protected date(item: InvoiceItem): string {
    return formatIsoDate(item.date, HTML_LANG[this.i18n.language()]);
  }

  protected openLabel(item: InvoiceItem): string {
    const parcel = item.number !== null ? ` ${item.number}/${item.totalInstallments}` : '';
    return interpolate(this.t().cards.invoice.openItem, {
      description: `${item.description}${parcel}`,
    });
  }
}
