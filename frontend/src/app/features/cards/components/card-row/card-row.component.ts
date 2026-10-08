import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { MoneyComponent } from '~/app/common/components/money/money.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { ClosingBadgeComponent } from '~/app/features/cards/components/closing-badge/closing-badge.component';
import { LimitMeterComponent } from '~/app/features/cards/components/limit-meter/limit-meter.component';
import type { Card } from '~/modules/cards/core/types/card';
import { formatCompetenceShort, formatIsoDate } from '~/util/date';
import { isPositive } from '~/util/money';

/**
 * Um cartão na lista (card no celular, linha de tabela no desktop). Presentational: limite, disponível,
 * crédito e fatura atual são os que a API calculou; só habilita "Arquivar" quando `archivable` é `true`.
 * Nunca mostra número, validade ou CVV (o contrato não os tem).
 */
@Component({
  selector: 'li[app-card-row]',
  imports: [RouterLink, MoneyComponent, LimitMeterComponent, ClosingBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './card-row.component.html',
  styleUrl: './card-row.component.css',
  host: { class: 'row', '[attr.data-cy]': "'card-row-' + card().id" },
})
export class CardRowComponent {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly card = input.required<Card>();
  readonly archive = output<Card>();
  readonly unarchive = output<Card>();

  protected readonly hasCredit = computed(() => isPositive(this.card().creditBalance));
  protected readonly invoiceLine = computed(() => {
    const invoice = this.card().currentInvoice;
    if (!invoice) return null;
    const locale = HTML_LANG[this.i18n.language()];
    return interpolate(this.t().cards.invoiceLine, {
      month: formatCompetenceShort(invoice.referenceMonth, locale),
      date: formatIsoDate(invoice.dueDate, locale),
    });
  });
}
