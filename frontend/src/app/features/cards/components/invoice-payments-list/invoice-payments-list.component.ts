import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { MoneyComponent } from '~/app/common/components/money/money.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import type { Account } from '~/modules/accounts/core/types/account';
import type { InvoicePayment } from '~/modules/cards/core/types/invoice';
import { formatIsoDate } from '~/util/date';

/**
 * Pagamentos da fatura (T66 CA3, presentational): data, conta e valor de cada `payments[]`, com link para
 * a movimentação `INVOICE_PAYMENT` (de onde se estorna). O nome da conta vem da lista de contas; sem ela
 * a linha mostra só data e valor.
 */
@Component({
  selector: 'app-invoice-payments-list',
  imports: [RouterLink, MoneyComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="payments" data-cy="invoice-payments">
      @for (payment of payments(); track payment.transactionId) {
        <li class="payment" [attr.data-cy]="'invoice-payment-' + payment.transactionId">
          <div class="payment__main">
            <span class="payment__date">{{ date(payment) }}</span>
            <span
              class="payment__account"
              [attr.data-cy]="'invoice-payment-account-' + payment.transactionId"
            >
              {{ accountName(payment) }}
            </span>
            <a
              class="payment__link"
              [routerLink]="['/transactions', payment.transactionId]"
              [attr.data-cy]="'invoice-payment-open-' + payment.transactionId"
            >
              {{ t().cards.invoice.paymentOpen }}
            </a>
          </div>
          <span class="payment__amount"><app-money [value]="payment.amount" /></span>
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
    }

    .payments {
      display: grid;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .payment {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-3) 0;
      border-bottom: var(--border-width) solid var(--color-border);
    }

    .payment:last-child {
      border-bottom: 0;
    }

    .payment__main {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1) var(--space-3);
      min-width: 0;
      font-size: var(--text-sm);
    }

    .payment__account {
      color: var(--color-text-muted);
    }

    .payment__amount {
      font-weight: var(--weight-semibold);
      white-space: nowrap;
    }
  `,
})
export class InvoicePaymentsListComponent {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly payments = input.required<readonly InvoicePayment[]>();
  readonly accounts = input<readonly Account[]>([]);

  private readonly names = computed(
    () => new Map(this.accounts().map((account) => [account.id, account.name])),
  );

  protected date(payment: InvoicePayment): string {
    return formatIsoDate(payment.date, HTML_LANG[this.i18n.language()]);
  }

  protected accountName(payment: InvoicePayment): string {
    return this.names().get(payment.accountId) ?? '';
  }
}
