import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { MoneyComponent } from '~/app/common/components/money/money.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { formatIsoDate } from '~/util/date';
import { type DebtSummary, isOpenStatus } from '~/util/debt';

/**
 * Uma dívida na lista da pessoa. Presentational: valor original, quitado e o que falta são os que o
 * backend calculou; o status aparece **em texto** (a cor só reforça), e "Atrasada" é o `overdue` dele.
 * Leva ao detalhe da dívida.
 */
@Component({
  selector: 'li[app-debt-row]',
  imports: [RouterLink, MoneyComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './debt-row.component.html',
  styleUrl: './debt-row.component.css',
  host: { class: 'row', '[attr.data-cy]': "'debt-row-' + debt().id" },
})
export class DebtRowComponent {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly debt = input.required<DebtSummary>();

  protected readonly title = computed(() => {
    const debt = this.debt();
    const copy = this.t().debts.row;
    return (
      debt.description ??
      (debt.direction === 'RECEIVABLE' ? copy.defaultTitleReceivable : copy.defaultTitlePayable)
    );
  });
  protected readonly openLabel = computed(() =>
    interpolate(this.t().debts.row.open, { title: this.title() }),
  );
  protected readonly isOpen = computed(() => isOpenStatus(this.debt().status));
  protected readonly expected = computed(() => {
    const date = this.debt().expectedDate;
    return date === null
      ? this.t().debts.row.noDate
      : interpolate(this.t().debts.row.expected, {
          date: formatIsoDate(date, HTML_LANG[this.i18n.language()]),
        });
  });
}
