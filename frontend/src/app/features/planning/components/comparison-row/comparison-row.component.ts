import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import type { SummaryDelta } from '~/modules/monthly-summary/core/types/monthly-summary';
import { formatMoney, isNegative, isPositive, withoutSign } from '~/util/money';
import { formatRatio } from '~/util/ratio';

/**
 * Uma linha da comparação com o mês anterior (presentational): "Subiu R$ 100,00 (66,7%)", "Caiu ..." ou
 * "Igual". O sentido (subiu, caiu) e os valores vêm do backend (`amount` e `percent`); a tela só lê o sinal
 * do texto e formata. Com `percent` nulo (base zero) mostra só o valor, sem inventar percentual. O sentido é
 * sempre uma palavra, nunca só cor.
 */
@Component({
  selector: 'div[app-comparison-row]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dt class="row__label">{{ label() }}</dt>
    <dd class="row__value" [attr.data-cy]="cy() + '-text'">{{ sentence() }}</dd>
  `,
  host: { '[attr.data-cy]': 'cy()' },
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-2) var(--space-4);
      padding: var(--space-2) 0;
    }

    .row__label {
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .row__value {
      margin: 0;
      font-variant-numeric: tabular-nums;
      font-weight: var(--weight-medium);
    }
  `,
})
export class ComparisonRowComponent {
  private readonly i18n = inject(I18nService);

  readonly cy = input.required<string>();
  readonly label = input.required<string>();
  readonly delta = input.required<SummaryDelta>();

  protected readonly sentence = computed(() => {
    const copy = this.i18n.t().summary.comparison;
    const { amount, percent } = this.delta();
    const locale = HTML_LANG[this.i18n.language()];
    const direction = isPositive(amount) ? 'up' : isNegative(amount) ? 'down' : 'same';
    if (direction === 'same') return copy.same;
    const shown = formatMoney(withoutSign(amount));
    if (percent === null) {
      return interpolate(direction === 'up' ? copy.upNoPercent : copy.downNoPercent, {
        amount: shown,
      });
    }
    return interpolate(direction === 'up' ? copy.up : copy.down, {
      amount: shown,
      // Só o texto muda: o sentido já está na palavra "Subiu"/"Caiu".
      percent: formatRatio(percent.replace(/^-/, ''), locale),
    });
  });
}
