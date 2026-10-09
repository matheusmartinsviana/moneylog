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
import { RouterLink } from '@angular/router';

import { toIncomeExpenseChart } from '~/app/common/components/charts/income-expense-chart.mapper';
import { LineChartComponent } from '~/app/common/components/charts/line-chart.component';
import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { SegmentedControlComponent } from '~/app/common/components/forms/segmented-control/segmented-control.component';
import { SectionContainerComponent } from '~/app/common/components/section-container/section-container.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import type { SpendingOverviewState } from '~/modules/reports/core/facades/spending-overview.facade';
import type { ReportPeriod } from '~/modules/reports/core/types/reports';

/** Períodos do gráfico compacto do Início (o de 3 meses fica de fora; o contrato continua aceitando). */
const HOME_PERIODS = ['D7', 'D30', 'M12'] as const satisfies readonly ReportPeriod[];

/**
 * Gráfico compacto de entradas e saídas do Início (DS 02, T204; tela sucinta): 7 dias, 30 dias e 12 meses, sem
 * descrição nem totais (o resumo do mês já está nos indicadores). Ocupa a altura que o painel recebe, sem px
 * fixos. Desenha **o que o backend devolveu** (`points[]`): o front só converte valores em coordenadas. Os
 * estados carregando, vazio e erro (com tentar de novo) são do cartão; trocar o período é do pai (que cancela o
 * pedido anterior). Presentational.
 */
@Component({
  selector: 'app-spending-overview',
  imports: [
    ReactiveFormsModule,
    SectionContainerComponent,
    SegmentedControlComponent,
    LineChartComponent,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-section-container glow fill dense [heading]="t().dashboard.overview.title">
      <div sectionActions class="so__actions">
        <app-segmented-control
          [formControl]="periodControl"
          fieldId="home-overview-period"
          [label]="t().dashboard.overview.periodLabel"
          [hideLabel]="true"
          [options]="options()"
        />
        <a class="so__link" routerLink="/transactions" data-cy="home-overview-transactions">
          {{ t().brief.viewTransactions }}
        </a>
      </div>

      @switch (state().status) {
        @case ('loading') {
          <div class="so__fill" data-cy="home-overview-loading">
            <p class="visually-hidden" role="status">{{ t().dashboard.overview.loading }}</p>
            <div class="so__skeleton sk" aria-hidden="true"></div>
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
          @if (basisHint(); as hint) {
            <p class="so__basis" data-cy="home-overview-hint">{{ hint }}</p>
          }
          @if (chart(); as view) {
            <!-- O gráfico (SVG próprio) é um chunk à parte: o Início abre sem esperar o código do desenho (T200). -->
            @defer (on immediate) {
              <app-line-chart
                [label]="t().dashboard.overview.title"
                [series]="view.series"
                [keys]="view.keys"
                [hero]="true"
                [compact]="true"
                cy="home-overview-chart"
              />
            } @placeholder {
              <div class="so__skeleton sk" aria-hidden="true"></div>
            }
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
    HOME_PERIODS.map((value) => ({ value, label: this.t().dashboard.overview.periods[value] })),
  );

  protected readonly chart = computed(() => {
    const state = this.state();
    if (state.status !== 'ready') return null;
    const { overview } = this.t().dashboard;
    return toIncomeExpenseChart(state.data, HTML_LANG[this.i18n.language()], {
      income: overview.income,
      expenses: overview.expenses,
    });
  });

  /** Dia e semana = dinheiro que entrou (`DATE`); mês = renda do mês (`COMPETENCE`). O rótulo é do backend. */
  protected readonly basisHint = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? this.t().dashboard.overview.basis[state.data.basis] : null;
  });

  constructor() {
    effect(() => this.periodControl.setValue(this.period(), { emitEvent: false }));
    this.periodControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      if (value !== null && (HOME_PERIODS as readonly string[]).includes(value)) {
        this.periodChange.emit(value as ReportPeriod);
      }
    });
  }
}
