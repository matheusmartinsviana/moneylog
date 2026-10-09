import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { DisclosureComponent } from '~/app/common/components/disclosure/disclosure.component';
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
import { LinkedNotesComponent } from '~/app/features/notes/components/linked-notes/linked-notes.component';
import { CategorySpendingComponent } from '~/app/features/planning/components/category-spending/category-spending.component';
import { ComparisonRowComponent } from '~/app/features/planning/components/comparison-row/comparison-row.component';
import { PlanningNavComponent } from '~/app/features/planning/components/planning-nav/planning-nav.component';
import { SummaryBlockComponent } from '~/app/features/planning/components/summary-block/summary-block.component';
import { MonthlySummaryFacade } from '~/modules/monthly-summary/core/facades/monthly-summary.facade';
import { CategorySpendingFacade } from '~/modules/reports/core/facades/category-spending.facade';
import { formatCompetence, todayIso } from '~/util/date';
import { formatRatio } from '~/util/ratio';

/** Janela que o backend aceita (`SUMMARY_MONTH_INVALID` fora dela). */
const MIN_MONTH = '2000-01';
const MAX_MONTH = '2100-12';
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Resumo do mês (smart, T102): `/planning/summary/:month` (S-154). Todos os campos de S-151 e a comparação com
 * o mês anterior vêm do backend; a tela só formata. O mês vai na URL (o F5 volta ao mesmo mês) e o
 * `MonthPicker` navega mês a mês. Sem mês na URL, abre o mês de hoje (só um ponto de partida de navegação:
 * `partial` e `isProjection` vêm da API). "Analisar com IA" fica desligado e honesto até a Etapa 8.
 */
@Component({
  selector: 'app-summary-page',
  imports: [
    CategorySpendingComponent,
    DisclosureComponent,
    LinkedNotesComponent,
    ReactiveFormsModule,
    RouterLink,
    PageLayoutComponent,
    SectionContainerComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    MonthPickerComponent,
    MoneyComponent,
    PlanningNavComponent,
    SummaryBlockComponent,
    ComparisonRowComponent,
  ],
  providers: [MonthlySummaryFacade, CategorySpendingFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './summary.page.html',
  styleUrl: './summary.page.css',
})
export class SummaryPage {
  private readonly i18n = inject(I18nService);
  private readonly router = inject(Router);
  protected readonly t = this.i18n.t;
  protected readonly summary = inject(MonthlySummaryFacade);
  protected readonly categories = inject(CategorySpendingFacade);
  protected readonly minMonth = MIN_MONTH;
  protected readonly maxMonth = MAX_MONTH;

  /** `:month` da rota (`YYYY-MM`); ausente em `/planning/summary`. */
  readonly month = input<string>();

  /** O mês mostrado: o da URL ou, sem ele, o mês de hoje (no fuso do usuário). */
  protected readonly current = computed(() => {
    const month = this.month();
    return month === undefined ? todayIso().slice(0, 7) : month;
  });
  protected readonly validMonth = computed(
    () => MONTH.test(this.current()) && this.current() >= MIN_MONTH && this.current() <= MAX_MONTH,
  );

  protected readonly picker = new FormControl<string | null>(null);
  private readonly locale = computed(() => HTML_LANG[this.i18n.language()]);

  protected readonly monthLabel = computed(() => formatCompetence(this.current(), this.locale()));
  protected readonly title = computed(() =>
    interpolate(this.t().summary.title, { month: this.monthLabel() }),
  );
  protected readonly data = this.summary.data;
  protected readonly savingsRate = computed(() => {
    const rate = this.data()?.savingsRate ?? null;
    return rate === null ? null : formatRatio(rate, this.locale());
  });
  protected readonly previousLabel = computed(() => {
    const previous = this.data()?.comparison.previousMonth.competence;
    return previous ? formatCompetence(previous, this.locale()) : '';
  });
  protected readonly comparisonTitle = computed(() =>
    interpolate(this.t().summary.comparison.title, { month: this.previousLabel() }),
  );
  protected readonly largestExpenseText = computed(() => {
    const expense = this.data()?.largestExpense;
    if (!expense) return '';
    const description = expense.description ?? expense.category.name;
    return expense.installmentNumber !== null && expense.installmentTotal !== null
      ? interpolate(this.t().summary.installment, {
          description,
          number: String(expense.installmentNumber),
          total: String(expense.installmentTotal),
        })
      : description;
  });
  protected readonly largestExpenseLink = computed(() => {
    const expense = this.data()?.largestExpense;
    if (!expense) return null;
    if (expense.transactionId !== null) return ['/transactions', expense.transactionId];
    if (expense.debtId !== null) return ['/debts', expense.debtId];
    return null;
  });
  protected readonly openLabel = computed(() => {
    const expense = this.data()?.largestExpense;
    if (!expense) return '';
    const copy = this.t().summary;
    return interpolate(expense.transactionId !== null ? copy.openTransaction : copy.openDebt, {
      description: this.largestExpenseText(),
    });
  });

  protected readonly invalidActions = computed<readonly EmptyStateAction[]>(() => [
    {
      id: 'current-month',
      label: this.t().summary.invalidMonth.action,
      available: true,
      primary: true,
    },
  ]);

  constructor() {
    // A URL manda: o mês dela é o que o seletor mostra e o que o backend recebe.
    effect(() => {
      const month = this.current();
      const valid = this.validMonth();
      untracked(() => {
        this.picker.setValue(valid ? month : null, { emitEvent: false });
        if (valid) {
          this.summary.load(month);
          this.categories.load(month);
        }
      });
    });
    // Escolher outro mês no seletor muda a URL (o F5 volta ao mesmo mês).
    this.picker.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      if (value !== null && MONTH.test(value) && value !== this.current()) {
        void this.router.navigate(['/planning/summary', value]);
      }
    });
  }

  protected retry(): void {
    if (this.validMonth()) this.summary.load(this.current());
  }

  protected goToCurrentMonth(): void {
    void this.router.navigate(['/planning/summary', todayIso().slice(0, 7)]);
  }
}
