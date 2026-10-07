import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import { MoneyComponent } from '~/app/common/components/money/money.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import type { Occurrence } from '~/modules/recurrences/core/types/recurrence';
import { formatIsoDate } from '~/util/date';

/**
 * Uma ocorrência pendente (T88): data, descrição, valor previsto (o do modelo, do backend), se é em conta
 * ou no cartão, e as ações "Realizar" e "Pular". Vencida mostra "Atrasada" em **texto** (e cor).
 */
@Component({
  selector: 'li[app-occurrence-row]',
  imports: [MoneyComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './occurrence-row.component.html',
  styleUrl: './occurrence-row.component.css',
  host: { class: 'row', '[attr.data-cy]': "'occurrence-row-' + key()" },
})
export class OccurrenceRowComponent {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly occurrence = input.required<Occurrence>();
  readonly realize = output<Occurrence>();
  readonly skip = output<Occurrence>();

  protected readonly key = computed(
    () => `${this.occurrence().recurrenceId}-${this.occurrence().date}`,
  );
  protected readonly title = computed(
    () =>
      this.occurrence().description?.trim() || this.t().recurrences.types[this.occurrence().type],
  );
  protected readonly dateText = computed(() =>
    formatIsoDate(this.occurrence().date, HTML_LANG[this.i18n.language()]),
  );
  protected readonly realizeLabel = computed(() =>
    interpolate(this.t().recurrences.occurrences.realizeLabel, { label: this.title() }),
  );
  protected readonly skipLabel = computed(() =>
    interpolate(this.t().recurrences.occurrences.skipLabel, { label: this.title() }),
  );
}
