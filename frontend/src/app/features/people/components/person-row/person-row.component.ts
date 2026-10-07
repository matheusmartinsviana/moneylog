import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { balanceText, openDebtsText } from '~/app/features/people/person-balance';
import type { Person } from '~/modules/people/core/types/person';
import { formatIsoDate } from '~/util/date';

/**
 * Uma pessoa na lista (card no celular, linha de tabela no desktop). Presentational: a frase do saldo
 * vem de `direction` e `net` do backend (a cor só reforça o texto, DS 00), a próxima cobrança é a
 * `nextDueDate` dele. Arquivar e desarquivar só emitem o pedido.
 */
@Component({
  selector: 'li[app-person-row]',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './person-row.component.html',
  styleUrl: './person-row.component.css',
  host: { class: 'row', '[attr.data-cy]': "'person-row-' + person().id" },
})
export class PersonRowComponent {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly person = input.required<Person>();
  readonly archive = output<Person>();
  readonly unarchive = output<Person>();

  protected readonly balance = computed(() => balanceText(this.person(), this.t().people));
  protected readonly debts = computed(() =>
    openDebtsText(this.person().openDebts, this.t().people),
  );
  protected readonly nextDue = computed(() => {
    const date = this.person().nextDueDate;
    if (date === null) return this.t().people.noNextDue;
    return interpolate(this.t().people.nextDue, {
      date: formatIsoDate(date, HTML_LANG[this.i18n.language()]),
    });
  });
  protected readonly openLabel = computed(() =>
    interpolate(this.t().people.row.open, { name: this.person().name }),
  );
}
