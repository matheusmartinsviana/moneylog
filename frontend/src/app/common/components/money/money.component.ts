import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { MoneyPipe } from '~/app/common/pipes/money.pipe';
import { Money } from '~/util/money';

/** Valor monetário com números tabulares, formatado pela moeda do dado. */
@Component({
  selector: 'app-money',
  imports: [MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="num money" data-cy="money-value">{{ value() | money }}</span>`,
  styles: `
    :host {
      display: inline;
    }

    .money {
      font-variant-numeric: tabular-nums;
      font-feature-settings: 'tnum';
      white-space: nowrap;
    }
  `,
})
export class MoneyComponent {
  readonly value = input.required<Money>();
}
