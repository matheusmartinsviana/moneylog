import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { toIncomeExpenseChart } from '~/app/common/components/charts/income-expense-chart.mapper';
import { LineChartComponent } from '~/app/common/components/charts/line-chart.component';
import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { SegmentedControlComponent } from '~/app/common/components/forms/segmented-control/segmented-control.component';
import { MoneyComponent } from '~/app/common/components/money/money.component';
import { SectionContainerComponent } from '~/app/common/components/section-container/section-container.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import type { SpendingOverviewState } from '~/modules/reports/core/facades/spending-overview.facade';
import { REPORT_PERIODS, type ReportPeriod } from '~/modules/reports/core/types/reports';

/**
 * "Spending overview" do Início (DS 02, T204): o gráfico de entradas e saídas com 7 dias, 30 dias, 3 meses e
 * 12 meses. Desenha **o que o backend devolveu** (`points[]`, `totals`, `basis`): o front só converte valores em
 * coordenadas. O resultado do período (`net`) é rotulado "Resultado do período", nunca "saldo" (R1). Os estados
 * carregando, vazio e erro (com tentar de novo) são do cartão; trocar o período é do pai (que cancela o pedido
 * anterior). Presentational.
 */
@Component({
  selector: 'app-spending-overview',
  imports: [
    ReactiveFormsModule,
    SectionContainerComponent,
    SegmentedControlComponent,
    LineChartComponent,
    MoneyComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-section-container
      [heading]="t().dashboard.overview.title"
      [description]="t().dashboard.overview.description"
    >
      <div class="so__controls">
        <app-segmented-control
          [formControl]="periodControl"
          fieldId="home-overview-period"
          [label]="t().dashboard.overview.periodLabel"
          [hideLabel]="true"
          [options]="options()"
        />
        @if (basisLabel(); as basis) {
          <span class="so__basis" data-cy="home-overview-basis">{{ basis }}</span>
        }
      </div>

      @switch (state().status) {
        @case ('loading') {
          <div data-cy="home-overview-loading">
            <p class="visually-hidden" role="status">{{ t().dashboard.overview.loading }}</p>
            <div class="so__skeleton" aria-hidden="true"></div>
          </div>
        }
        @case ('error') {
          <div class="so__state" role="alert" data-cy="home-overview-error">
            <p>{{ t().dashboard.overview.error }}</p>
            <button
              type="button"
              class="button"
              data-cy="home-overview-retry"
              (click)="retry.emit()"
            >
              {{ t().dashboard.overview.retry }}
            </button>
          </div>
        }
        @case ('empty') {
          <p class="so__state" data-cy="home-overview-empty">{{ t().dashboard.overview.empty }}</p>
        }
        @default {
          @if (chart(); as view) {
            <!-- O gráfico (SVG próprio) é um chunk à parte: o Início abre sem esperar o código do desenho (T200). -->
            @defer (on immediate) {
              <app-line-chart
                [label]="t().dashboard.overview.title"
                [series]="view.series"
                [keys]="view.keys"
                cy="home-overview-chart"
              />
            } @placeholder {
              <div class="so__skeleton" aria-hidden="true"></div>
            }
          }
          @if (totals(); as totals) {
            <dl class="so__totals" data-cy="home-overview-totals">
              <div class="so__total">
                <dt>{{ t().dashboard.overview.income }}</dt>
                <dd data-cy="home-overview-income"><app-money [value]="totals.income" /></dd>
              </div>
              <div class="so__total">
                <dt>{{ t().dashboard.overview.expenses }}</dt>
                <dd data-cy="home-overview-expenses"><app-money [value]="totals.expenses" /></dd>
              </div>
              <div class="so__total">
                <dt>{{ t().dashboard.overview.net }}</dt>
                <dd
                  data-cy="home-overview-net"
                  [class.is-negative]="totals.net.amount.startsWith('-')"
                >
                  <app-money [value]="totals.net" />
                </dd>
              </div>
            </dl>
          }
        }
      }
    </app-section-container>
  `,
  styleUrl: './spending-overview.component.css',
})
export class SpendingOverviewComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly state = input.required<SpendingOverviewState>();
  readonly period = input<ReportPeriod>('D30');
  readonly periodChange = output<ReportPeriod>();
  readonly retry = output<void>();

  protected readonly periodControl = new FormControl<string | null>('D30');

  protected readonly options = computed<readonly ChoiceOption[]>(() =>
    REPORT_PERIODS.map((value) => ({ value, label: this.t().dashboard.overview.periods[value] })),
  );

  private readonly data = computed(() => {
    const state = this.state();
    return state.status === 'ready' || state.status === 'empty' ? state.data : null;
  });

  protected readonly basisLabel = computed(() => {
    const data = this.data();
    return data ? this.t().dashboard.overview.basis[data.basis] : null;
  });

  protected readonly totals = computed(() => this.data()?.totals ?? null);

  protected readonly chart = computed(() => {
    const state = this.state();
    if (state.status !== 'ready') return null;
    const { overview } = this.t().dashboard;
    return toIncomeExpenseChart(state.data, HTML_LANG[this.i18n.language()], {
      income: overview.income,
      expenses: overview.expenses,
    });
  });

  constructor() {
    effect(() => this.periodControl.setValue(this.period(), { emitEvent: false }));
    this.periodControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      if (value !== null && (REPORT_PERIODS as readonly string[]).includes(value)) {
        this.periodChange.emit(value as ReportPeriod);
      }
    });
  }
}
