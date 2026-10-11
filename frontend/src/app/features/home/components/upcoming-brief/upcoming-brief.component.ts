import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { MoneyComponent } from '~/app/common/components/money/money.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import type {
  Upcoming,
  UpcomingBucket,
  UpcomingItem,
} from '~/modules/dashboard/core/types/upcoming';
import { formatIsoDate } from '~/util/date';

/** Quantos compromissos o Início mostra (o resto fica no Panorama). */
export const BRIEF_LIMIT = 3;

/** Janela do Início: o que o servidor classificou como vencido, de hoje, de amanhã ou dos próximos 7 dias. */
const NEXT_7_DAYS: readonly UpcomingBucket[] = ['OVERDUE', 'TODAY', 'TOMORROW', 'NEXT_7_DAYS'];

/**
 * "Próximos compromissos" do Início (presentational): no máximo 3 itens dos próximos 7 dias, na ordem e com o
 * `bucket` que o servidor devolveu (nada é recalculado nem somado aqui). A lista completa, com parcelas e o
 * "Realizar", fica no Panorama de Planejamento.
 */
@Component({
  selector: 'app-upcoming-brief',
  imports: [RouterLink, MoneyComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="ub glass" aria-labelledby="home-upcoming-title" data-cy="home-upcoming-brief">
      <header class="ub__head">
        <h2 class="ub__title" id="home-upcoming-title">{{ t().brief.upcoming.title }}</h2>
        <a class="ub__link hit" routerLink="/planning/overview" data-cy="home-upcoming-all">
          {{ t().brief.upcoming.viewAll }}
        </a>
      </header>
      @if (rows().length > 0) {
        <ul class="ub__list">
          @for (row of rows(); track $index) {
            <li
              class="ub__row row-card"
              data-cy="home-upcoming-item"
              [attr.data-kind]="row.item.kind"
            >
              <span class="ub__main">
                <span class="ub__label">{{ row.item.label }}</span>
                <span class="ub__meta">{{ row.when }}</span>
              </span>
              <span
                class="ub__amount num"
                [class.is-incoming]="row.incoming"
                data-cy="home-upcoming-amount"
              >
                <app-money [value]="row.item.amount" />
              </span>
            </li>
          }
        </ul>
      } @else {
        <p class="ub__empty" data-cy="home-upcoming-empty">{{ t().brief.upcoming.empty }}</p>
      }
    </section>
  `,
  styleUrl: './upcoming-brief.component.css',
})
export class UpcomingBriefComponent {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly upcoming = input.required<Upcoming>();

  protected readonly rows = computed(() => {
    const copy = this.t().home.upcoming;
    const locale = HTML_LANG[this.i18n.language()];
    return this.upcoming()
      .items.filter((item): item is UpcomingItem => NEXT_7_DAYS.some((b) => b === item.bucket))
      .slice(0, BRIEF_LIMIT)
      .map((item) => ({
        item,
        incoming: item.direction === 'IN',
        when: item.dueDate
          ? interpolate(copy.due, { date: formatIsoDate(item.dueDate, locale) })
          : copy.undated,
      }));
  });
}
