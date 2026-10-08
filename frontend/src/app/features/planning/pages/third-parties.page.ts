import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import {
  EmptyStateAction,
  EmptyStateComponent,
} from '~/app/common/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import { MonthPickerComponent } from '~/app/common/components/forms/month-picker/month-picker.component';
import { MoneyComponent } from '~/app/common/components/money/money.component';
import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { SectionContainerComponent } from '~/app/common/components/section-container/section-container.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { PlanningNavComponent } from '~/app/features/planning/components/planning-nav/planning-nav.component';
import { ThirdPartyReceivablesFacade } from '~/modules/third-parties/core/facades/third-party-receivables.facade';
import type { ThirdPartyItem } from '~/modules/third-parties/core/types/third-party';
import { formatCompetence, formatIsoDate } from '~/util/date';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MIN_MONTH = '2000-01';
const MAX_MONTH = '2100-12';

/**
 * Dinheiro a receber de terceiros (smart): por pessoa, o combinado, o recebido e o pendente, e o bloco
 * "gasto bruto x terceiros x líquido do mês" **como o servidor devolve**. Fica separado de patrimônio, renda
 * e despesas pessoais; o front não soma nem recalcula nada. O seletor de mês pede ao servidor.
 */
@Component({
  selector: 'app-third-parties-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    PageLayoutComponent,
    SectionContainerComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    MonthPickerComponent,
    MoneyComponent,
    PlanningNavComponent,
  ],
  providers: [ThirdPartyReceivablesFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './third-parties.page.html',
  styleUrl: './third-parties.page.css',
})
export class ThirdPartiesPage implements OnInit {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  protected readonly receivables = inject(ThirdPartyReceivablesFacade);
  protected readonly minMonth = MIN_MONTH;
  protected readonly maxMonth = MAX_MONTH;
  protected readonly picker = new FormControl<string | null>(null);

  private readonly locale = computed(() => HTML_LANG[this.i18n.language()]);
  protected readonly emptyActions = computed<readonly EmptyStateAction[]>(() => [
    {
      id: 'transactions',
      label: this.t().thirdParties.empty.action,
      available: true,
      primary: true,
      link: '/transactions',
    },
  ]);
  protected readonly monthLabel = computed(() => {
    const competence = this.receivables.data()?.month.competence;
    return competence ? formatCompetence(competence, this.locale()) : '';
  });

  constructor() {
    // O mês que o servidor devolveu é o que o seletor mostra (o padrão é o mês atual dele).
    effect(() => {
      const competence = this.receivables.data()?.month.competence ?? null;
      untracked(() => {
        if (competence !== null && MONTH.test(competence)) {
          this.picker.setValue(competence, { emitEvent: false });
        }
      });
    });
    this.picker.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      if (
        value !== null &&
        MONTH.test(value) &&
        value !== this.receivables.data()?.month.competence
      ) {
        this.receivables.load(value);
      }
    });
  }

  ngOnInit(): void {
    this.receivables.load(null);
  }

  protected retry(): void {
    this.receivables.load();
  }

  protected asOf(date: string): string {
    return interpolate(this.t().thirdParties.total.asOf, {
      date: formatIsoDate(date, this.locale(), 'long'),
    });
  }

  protected expected(date: string | null): string | null {
    return date === null
      ? null
      : interpolate(this.t().thirdParties.people.expected, {
          date: formatIsoDate(date, this.locale(), 'long'),
        });
  }

  /** Para onde o item leva: a dívida ou a movimentação marcada (o recebimento a confirmar não tem destino). */
  protected link(item: ThirdPartyItem): readonly string[] | null {
    if (item.source === 'DEBT') return ['/debts', item.refId];
    return item.source === 'EXPENSE' ? ['/transactions', item.refId] : null;
  }
}
