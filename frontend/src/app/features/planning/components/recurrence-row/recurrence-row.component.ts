import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { MenuComponent, MenuItem } from '~/app/common/components/menu/menu.component';
import { MoneyComponent } from '~/app/common/components/money/money.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { frequencyText } from '~/app/features/planning/recurrence-text';
import type { Recurrence } from '~/modules/recurrences/core/types/recurrence';
import { formatIsoDate } from '~/util/date';

/**
 * Uma recorrência na lista. Presentational: o valor do modelo, a próxima ocorrência **pendente** (inclui
 * as vencidas) e a estimativa mensal são os do backend. Desativada e encerrada (`ended`) aparecem em
 * texto, não só apagadas; a encerrada não mostra a estimativa (0,00, fora do custo fixo).
 */
@Component({
  selector: 'li[app-recurrence-row]',
  imports: [RouterLink, MoneyComponent, MenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './recurrence-row.component.html',
  styleUrl: './recurrence-row.component.css',
  host: { class: 'row', '[attr.data-cy]': "'recurrence-row-' + recurrence().id" },
})
export class RecurrenceRowComponent {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly recurrence = input.required<Recurrence>();
  readonly end = output<Recurrence>();
  readonly deactivate = output<Recurrence>();

  protected readonly title = computed(
    () =>
      this.recurrence().description?.trim() ||
      this.recurrence().category.name ||
      this.t().recurrences.types[this.recurrence().type],
  );
  protected readonly frequency = computed(() =>
    frequencyText(this.recurrence(), this.t().recurrences),
  );
  protected readonly destination = computed(() => {
    const recurrence = this.recurrence();
    const name = recurrence.card?.name ?? recurrence.account?.name;
    return name ? interpolate(this.t().recurrences.row.on, { name }) : null;
  });
  protected readonly next = computed(() => {
    const date = this.recurrence().nextOccurrence;
    return date === null
      ? this.t().recurrences.row.noNext
      : interpolate(this.t().recurrences.row.next, {
          date: formatIsoDate(date, HTML_LANG[this.i18n.language()]),
        });
  });
  protected readonly endsOn = computed(() => {
    const date = this.recurrence().endDate;
    return date === null
      ? null
      : interpolate(this.t().recurrences.row.endsOn, {
          date: formatIsoDate(date, HTML_LANG[this.i18n.language()]),
        });
  });
  protected readonly menuItems = computed<readonly MenuItem[]>(() => {
    const copy = this.t().recurrences.row;
    const recurrence = this.recurrence();
    return [
      // Encerrada (`ended`, do backend): "Encerrar" não se aplica; para reabrir, edite o fim.
      ...(recurrence.ended ? [] : [{ id: 'end', label: copy.end, disabled: !recurrence.active }]),
      { id: 'deactivate', label: copy.deactivate, disabled: !recurrence.active, destructive: true },
    ];
  });

  protected run(action: string): void {
    if (action === 'end') this.end.emit(this.recurrence());
    else if (action === 'deactivate') this.deactivate.emit(this.recurrence());
  }
}
