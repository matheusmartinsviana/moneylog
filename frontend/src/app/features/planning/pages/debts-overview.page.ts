import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import {
  EmptyStateAction,
  EmptyStateComponent,
} from '~/app/common/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { SegmentedControlComponent } from '~/app/common/components/forms/segmented-control/segmented-control.component';
import { MoneyComponent } from '~/app/common/components/money/money.component';
import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { SectionContainerComponent } from '~/app/common/components/section-container/section-container.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { DebtScheduleComponent } from '~/app/features/planning/components/debt-schedule/debt-schedule.component';
import { OngoingInstallmentsModalComponent } from '~/app/features/planning/components/ongoing-installments-modal/ongoing-installments-modal.component';
import { PlanningNavComponent } from '~/app/features/planning/components/planning-nav/planning-nav.component';
import { DebtOverviewFacade } from '~/modules/debt-overview/core/facades/debt-overview.facade';
import {
  DEBT_OVERVIEW_MONTHS,
  type DebtOverview,
} from '~/modules/debt-overview/core/types/debt-overview';
import { formatCompetence, formatIsoDate } from '~/util/date';
import { formatMoney, isPositive } from '~/util/money';
import { formatRatio } from '~/util/ratio';

/**
 * Dívidas totais (smart): quanto o usuário ainda deve, **como o servidor calculou** (cartões, pessoas e
 * outros credores), o custo fixo **ao lado e separado** (nunca soma no total), a comparação com renda e saldo,
 * o cronograma de vencimentos por mês e o caminho da meta de quitar tudo. O front só exibe: sem renda, as
 * razões ficam ocultas com o motivo; "nada cadastrado" nunca vira "sem dívidas".
 */
@Component({
  selector: 'app-debts-overview-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    PageLayoutComponent,
    SectionContainerComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    SegmentedControlComponent,
    MoneyComponent,
    PlanningNavComponent,
    DebtScheduleComponent,
    OngoingInstallmentsModalComponent,
  ],
  providers: [DebtOverviewFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './debts-overview.page.html',
  styleUrl: './debts-overview.page.css',
})
export class DebtsOverviewPage implements OnInit {
  private readonly i18n = inject(I18nService);
  private readonly router = inject(Router);
  protected readonly t = this.i18n.t;
  protected readonly overview = inject(DebtOverviewFacade);

  protected readonly ongoingOpen = signal(false);
  protected readonly monthsControl = new FormControl<string | null>(String(this.overview.months()));
  protected readonly monthsOptions: readonly ChoiceOption[] = DEBT_OVERVIEW_MONTHS.map((count) => ({
    value: String(count),
    label: String(count),
  }));
  protected readonly monthsChoices = computed<readonly ChoiceOption[]>(() =>
    this.monthsOptions.map((option) => ({
      value: option.value,
      label: interpolate(this.t().debtOverview.schedule.horizonOption, { count: option.label }),
    })),
  );

  private readonly locale = computed(() => HTML_LANG[this.i18n.language()]);
  protected readonly emptyActions = computed<readonly EmptyStateAction[]>(() => [
    {
      id: 'ongoing',
      label: this.t().debtOverview.empty.addOngoing,
      available: true,
      primary: true,
    },
    { id: 'debt', label: this.t().debtOverview.empty.addDebt, available: true },
  ]);

  constructor() {
    this.monthsControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      const months = Number(value);
      if (DEBT_OVERVIEW_MONTHS.some((m) => m === months)) this.overview.load(months);
    });
  }

  ngOnInit(): void {
    this.overview.load();
  }

  protected retry(): void {
    this.overview.load();
  }

  protected onEmptyAction(id: string): void {
    if (id === 'ongoing') this.ongoingOpen.set(true);
    else void this.router.navigate(['/quick-add'], { queryParams: { mode: 'debt' } });
  }

  protected afterSaved(): void {
    this.ongoingOpen.set(false);
    this.overview.load();
  }

  protected asOf(data: DebtOverview): string {
    return interpolate(this.t().debtOverview.total.asOf, {
      date: formatIsoDate(data.asOf, this.locale(), 'long'),
    });
  }

  /** Há saldo devedor? (Só lê o sinal do total que o servidor devolveu.) */
  protected hasDebt(data: DebtOverview): boolean {
    return isPositive(data.total);
  }

  protected ratio(value: string): string {
    return formatRatio(value, this.locale());
  }

  protected date(value: string): string {
    return formatIsoDate(value, this.locale(), 'long');
  }

  protected until(value: string): string {
    return interpolate(this.t().debtOverview.cards.until, { date: this.date(value) });
  }

  protected expected(value: string | null): string {
    return value === null
      ? this.t().debtOverview.people.noDate
      : interpolate(this.t().debtOverview.people.expected, { date: this.date(value) });
  }

  protected remainingText(remaining: number, total: number): string {
    return interpolate(this.t().debtOverview.cards.remainingText, {
      remaining: String(remaining),
      total: String(total),
    });
  }

  protected installmentText(plan: DebtOverview['cards']['items'][number]['plans'][number]): string {
    return interpolate(this.t().debtOverview.cards.installmentText, {
      amount: formatMoney(plan.installmentAmount),
    });
  }

  protected trackedInstallments(paid: number | null, total: number | null): string {
    return interpolate(this.t().debtOverview.tracked.installments, {
      paid: String(paid ?? 0),
      total: String(total ?? 0),
    });
  }

  protected trackedProgress(value: string): string {
    return interpolate(this.t().debtOverview.tracked.progress, { percent: this.ratio(value) });
  }

  protected trackedNext(value: string): string {
    return interpolate(this.t().debtOverview.tracked.nextDue, { date: this.date(value) });
  }

  protected monthText(competence: string): string {
    return formatCompetence(competence, this.locale());
  }

  protected goalProgress(progress: string): string {
    return interpolate(this.t().debtOverview.goal.progress, { percent: this.ratio(progress) });
  }
}
