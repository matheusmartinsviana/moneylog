import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';

import { MoneyComponent } from '~/app/common/components/money/money.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import type { NetWorth } from '~/modules/dashboard/core/types/dashboard-summary';

/**
 * Patrimônio como veio da API. As parcelas futuras do cartão aparecem à parte, com a explicação de
 * que estão fora do total (S-8).
 */
@Component({
  selector: 'app-net-worth',
  imports: [MoneyComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dl class="ledger">
      <div class="ledger__row">
        <dt class="ledger__label">{{ t().home.netWorth.accounts }}</dt>
        <dd class="ledger__value" data-cy="home-net-worth-accounts">
          <app-money [value]="netWorth().accounts" />
        </dd>
      </div>
      <div class="ledger__row">
        <dt class="ledger__label">{{ t().home.netWorth.receivables }}</dt>
        <dd class="ledger__value" data-cy="home-net-worth-receivables">
          <app-money [value]="netWorth().receivables" />
        </dd>
      </div>
      <div class="ledger__row">
        <dt class="ledger__label">{{ t().home.netWorth.cardLiabilities }}</dt>
        <dd class="ledger__value" data-cy="home-net-worth-cards">
          <app-money [value]="netWorth().cardLiabilities" />
        </dd>
      </div>
      <div class="ledger__row">
        <dt class="ledger__label">{{ t().home.netWorth.payables }}</dt>
        <dd class="ledger__value" data-cy="home-net-worth-payables">
          <app-money [value]="netWorth().payables" />
        </dd>
      </div>
      <div class="ledger__row ledger__row--total">
        <dt class="ledger__label">{{ t().home.netWorth.total }}</dt>
        <dd class="ledger__value" data-cy="home-net-worth-total">
          <app-money [value]="netWorth().total" />
        </dd>
      </div>
    </dl>
    <dl class="ledger outside">
      <div class="ledger__row">
        <dt class="ledger__label">{{ t().home.netWorth.cardFutureInstallments }}</dt>
        <dd class="ledger__value" data-cy="home-net-worth-future-installments">
          <app-money [value]="netWorth().cardFutureInstallments" />
        </dd>
      </div>
    </dl>
    <p class="note">{{ t().home.netWorth.cardFutureInstallmentsNote }}</p>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-2);
    }

    .outside {
      padding: 0 var(--space-3);
      border: var(--border-width) dashed var(--color-border);
      border-radius: var(--radius-control);
    }

    .note {
      color: var(--color-text-muted);
      font-size: var(--text-xs);
      text-wrap: pretty;
    }
  `,
})
export class NetWorthComponent {
  protected readonly t = inject(I18nService).t;

  readonly netWorth = input.required<NetWorth>();
}
