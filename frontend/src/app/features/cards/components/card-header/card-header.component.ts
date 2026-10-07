import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { MoneyComponent } from '~/app/common/components/money/money.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { LimitMeterComponent } from '~/app/features/cards/components/limit-meter/limit-meter.component';
import type { Card } from '~/modules/cards/core/types/card';
import { formatMoney, isPositive } from '~/util/money';

/**
 * Resumo do cartão (T65 CA1, presentational): limite, disponível, crédito, **total comprometido** (fatura
 * corrente + fechadas) e, **separado**, o que já foi comprometido em compras futuras. Os dois números
 * são os do backend e nunca se somam na tela (PR 01, regra 1); a nota explica a diferença.
 */
@Component({
  selector: 'app-card-header',
  imports: [MoneyComponent, LimitMeterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = card();
    <section class="header surface" data-cy="card-header">
      <app-limit-meter [card]="c" />
      <dl class="ledger">
        <div class="ledger__row">
          <dt class="ledger__label">{{ t().cards.detail.limitLabel }}</dt>
          <dd class="ledger__value" data-cy="card-limit-value"><app-money [value]="c.limit" /></dd>
        </div>
        <div class="ledger__row">
          <dt class="ledger__label">{{ t().cards.detail.availableLabel }}</dt>
          <dd class="ledger__value" [class.is-negative]="c.overLimit" data-cy="card-available">
            <app-money [value]="c.availableLimit" />
          </dd>
        </div>
        @if (hasCredit()) {
          <div class="ledger__row">
            <dt class="ledger__label">{{ t().cards.detail.creditBalanceLabel }}</dt>
            <dd class="ledger__value" data-cy="card-credit-balance">
              <app-money [value]="c.creditBalance" />
            </dd>
          </div>
        }
        <div class="ledger__row ledger__row--total">
          <dt class="ledger__label">{{ t().cards.detail.totalCommittedLabel }}</dt>
          <dd class="ledger__value" data-cy="card-total-committed">
            <app-money [value]="c.totalCommitted" />
          </dd>
        </div>
      </dl>
      <p class="header__future num" data-cy="card-committed-future">{{ committedFuture() }}</p>
      <p class="header__note">{{ t().cards.detail.committedFutureNote }}</p>
      <p class="header__note" data-cy="card-days">{{ days() }}</p>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    .header {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-5);
    }

    .header__future {
      font-weight: var(--weight-medium);
    }

    .header__note {
      color: var(--color-text-muted);
      font-size: var(--text-xs);
    }
  `,
})
export class CardHeaderComponent {
  protected readonly t = inject(I18nService).t;

  readonly card = input.required<Card>();

  protected readonly hasCredit = computed(() => isPositive(this.card().creditBalance));
  protected readonly committedFuture = computed(() =>
    interpolate(this.t().cards.detail.committedFuture, {
      amount: formatMoney(this.card().committedFuture),
    }),
  );
  protected readonly days = computed(() =>
    interpolate(this.t().cards.detail.days, {
      closing: String(this.card().closingDay),
      due: String(this.card().dueDay),
    }),
  );
}
