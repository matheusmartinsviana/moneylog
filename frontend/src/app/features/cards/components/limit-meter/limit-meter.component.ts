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
    <app-progress-bar
      [fieldId]="'card-limit-' + card().id"
      [label]="t().cards.limit.label"
      [hideLabel]="hideLabel()"
      [value]="card().usedRatio"
      [valueText]="summary()"
      [tone]="card().overLimit ? 'risk' : 'default'"
    />
  `,
})
export class LimitMeterComponent {
  protected readonly t = inject(I18nService).t;

  readonly card = input.required<Card>();
  readonly hideLabel = input(false);

  protected readonly summary = computed(() => {
    const card = this.card();
    const copy = this.t().cards.limit;
    return card.overLimit
      ? interpolate(copy.overLimitSummary, { available: formatMoney(card.availableLimit) })
      : interpolate(copy.summary, {
          available: formatMoney(card.availableLimit),
          limit: formatMoney(card.limit),
        });
  });
}
