import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { ProgressBarComponent } from '~/app/common/components/progress-bar/progress-bar.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import type { Card } from '~/modules/cards/core/types/card';
import { formatMoney } from '~/util/money';

/**
 * Barra do limite (T64 CA5, presentational): "R$ 7.717,00 disponíveis de R$ 10.000,00". A largura vem
 * de `usedRatio`, que o backend calcula (o front não divide dinheiro); os valores são os do `Card`.
 * Acima do limite (`overLimit`), a barra fica em risco **com texto** ("Acima do limite"), nunca só cor,
 * e o disponível negativo aparece como o backend o devolveu.
 */
@Component({
  selector: 'app-limit-meter',
  imports: [ProgressBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = card();
    @if (c.limit === null || c.availableLimit === null || c.usedRatio === null) {
      <p class="unset" [attr.data-cy]="'card-limit-unset-' + c.id">
        {{ t().cards.limit.notSet }}
      </p>
    } @else {
      <app-progress-bar
        [fieldId]="'card-limit-' + c.id"
        [label]="t().cards.limit.label"
        [hideLabel]="hideLabel()"
        [value]="c.usedRatio"
        [valueText]="summary()"
        [tone]="c.overLimit ? 'risk' : 'default'"
      />
    }
  `,
  styles: `
    .unset {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }
  `,
})
export class LimitMeterComponent {
  protected readonly t = inject(I18nService).t;

  readonly card = input.required<Card>();
  readonly hideLabel = input(false);

  protected readonly summary = computed(() => {
    const card = this.card();
    const copy = this.t().cards.limit;
    if (card.limit === null || card.availableLimit === null) return '';
    return card.overLimit
      ? interpolate(copy.overLimitSummary, { available: formatMoney(card.availableLimit) })
      : interpolate(copy.summary, {
          available: formatMoney(card.availableLimit),
          limit: formatMoney(card.limit),
        });
  });
}
