import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { MoneyComponent } from '~/app/common/components/money/money.component';
import type { Money } from '~/util/money';

/**
 * Uma linha do resumo (presentational): rótulo, valor que o backend calculou e, opcionalmente, uma nota
 * curta. Nada é somado aqui. `tone` só destaca saldo negativo (texto + cor).
 */
@Component({
  selector: 'div[app-summary-block]',
  imports: [MoneyComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dt class="block__label">{{ label() }}</dt>
    <dd class="block__value">
      @if (value(); as money) {
        <app-money [value]="money" />
      } @else {
        <span class="num" [attr.data-cy]="cy() + '-text'">{{ text() }}</span>
      }
    </dd>
    @if (note()) {
      <dd class="block__note" [attr.data-cy]="cy() + '-note'">{{ note() }}</dd>
    }
  `,
  host: { class: 'block', '[attr.data-cy]': 'cy()' },
  styles: `
    :host {
      display: grid;
      gap: var(--space-1);
    }

    .block__label {
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .block__value {
      margin: 0;
      font-size: var(--text-xl);
      font-weight: var(--weight-semibold);
      overflow-wrap: anywhere;
    }

    .block__note {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--text-xs);
    }
  `,
})
export class SummaryBlockComponent {
  readonly cy = input.required<string>();
  readonly label = input.required<string>();
  readonly value = input<Money | null>(null);
  /** Texto no lugar do valor (percentual já formatado, "—"). */
  readonly text = input<string>('');
  readonly note = input<string>();
}
