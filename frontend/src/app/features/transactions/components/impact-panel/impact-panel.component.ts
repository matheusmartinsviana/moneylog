import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { MoneyComponent } from '~/app/common/components/money/money.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import type { Impact } from '~/modules/transactions/core/types/transaction';
import { formatCompetenceShort } from '~/util/date';
import { isPositive, type Money } from '~/util/money';

interface ImpactRow {
  readonly key: string;
  readonly label: string;
  readonly value: Money;
}

/**
 * Efeito da movimentação nas lentes de D1 §1: no caixa, no consumo de cada competência e no
 * patrimônio. Presentational: mostra os valores de `impact` exatamente como o backend calculou; não
 * soma, não subtrai e não deriva nada.
 */
@Component({
  selector: 'app-impact-panel',
  imports: [MoneyComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="impact" aria-labelledby="impact-title" data-cy="impact-panel">
      <h2 class="impact__title" id="impact-title">{{ t().transactions.detail.impact.title }}</h2>
      <dl class="impact__list">
        @for (row of rows(); track row.key) {
          <div class="impact__row" [attr.data-cy]="'impact-' + row.key">
            <dt>{{ row.label }}</dt>
            <dd><app-money [value]="row.value" /></dd>
          </div>
        }
      </dl>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    .impact {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4);
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-card);
      background-color: var(--color-surface-muted);
    }

    .impact__title {
      font-size: var(--text-sm);
      font-weight: var(--weight-semibold);
    }

    .impact__list {
      display: grid;
      gap: var(--space-2);
    }

    .impact__row {
      display: flex;
      justify-content: space-between;
      gap: var(--space-3);
    }

    dt {
      color: var(--color-text-muted);
    }

    dd {
      margin: 0;
      font-weight: var(--weight-medium);
      text-align: right;
    }
  `,
})
export class ImpactPanelComponent {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly impact = input.required<Impact>();

  protected readonly rows = computed<readonly ImpactRow[]>(() => {
    const copy = this.t().transactions.detail.impact;
    const locale = HTML_LANG[this.i18n.language()];
    const impact = this.impact();
    return [
      { key: 'cash', label: copy.cash, value: impact.cash },
      ...impact.consumption.map((item) => ({
        key: `consumption-${item.competence}`,
        label: interpolate(copy.consumption, {
          competence: formatCompetenceShort(item.competence, locale),
        }),
        value: item.amount,
      })),
      { key: 'net-worth', label: copy.netWorth, value: impact.netWorth },
      // Só a compra no cartão tem compromisso próprio (parcelas em faturas futuras); é a mesma visão do
      // `committedFuture` do cartão e do `/upcoming`, então nunca se soma aos demais.
      ...(isPositive(impact.commitment)
        ? [{ key: 'commitment', label: copy.commitment, value: impact.commitment }]
        : []),
    ];
  });
}
