import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { map, startWith, switchMap } from 'rxjs';

import {
  BarListComponent,
  type BarListItem,
} from '~/app/common/components/charts/bar-list.component';
import { toIncomeExpenseChart } from '~/app/common/components/charts/income-expense-chart.mapper';
import {
  LineChartComponent,
  type LineChartKey,
  type LineChartSeries,
} from '~/app/common/components/charts/line-chart.component';
import {
  SegmentedBarComponent,
  type SegmentedBarSegment,
} from '~/app/common/components/charts/segmented-bar.component';
import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { SegmentedControlComponent } from '~/app/common/components/forms/segmented-control/segmented-control.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { DEMO_REPORTS_GATEWAY } from '~/modules/reports/core/interfaces/reports.gateway';
import type { ReportPeriod } from '~/modules/reports/core/types/reports';

const PERIODS: readonly ChoiceOption[] = [
  { value: 'D7', label: '7 dias' },
  { value: 'D30', label: '30 dias' },
  { value: 'M3', label: '3 meses' },
  { value: 'M12', label: '12 meses' },
];

/** O UI Kit só existe nos builds de desenvolvimento e mock, que sempre ligam a porta de demonstração. */
function missingDemoGateway(): never {
  throw new Error('DEMO_REPORTS_GATEWAY ausente: o UI Kit só roda em dev e mock.');
}

const BRL = (amount: string) => ({ amount, currency: 'BRL' });
const KEYS: readonly LineChartKey[] = ['seg', 'ter', 'qua', 'qui', 'sex'].map((label) => ({
  id: label,
  label,
}));

/**
 * Gráficos no UI Kit (fatia B): "Spending overview" com os dados de DEMONSTRAÇÃO da porta de relatórios
 * (`ReportsGateway.isDemo`, rotulados), mais os estados do gráfico (vazio, um ponto, valor negativo) e as
 * barras de categoria. Só em desenvolvimento e mock: os textos ficam aqui, fora do contrato de i18n.
 */
@Component({
  selector: 'app-ui-kit-charts',
  imports: [
    ReactiveFormsModule,
    LineChartComponent,
    BarListComponent,
    SegmentedBarComponent,
    SegmentedControlComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="kc" [attr.data-cy]="scope() + '-charts'">
      <h3 class="kc__title">Gráficos</h3>
      @if (isDemo) {
        <p class="kc__demo" [attr.data-cy]="scope() + '-charts-demo'">{{ t().charts.demo }}</p>
      }

      <div class="kc__block">
        <app-segmented-control
          [formControl]="period"
          [fieldId]="scope() + '-charts-period'"
          label="Período"
          [options]="periods"
        />
        @if (overview(); as chart) {
          <app-line-chart
            label="Entradas e saídas"
            [series]="chart.series"
            [keys]="chart.keys"
            [cy]="scope() + '-line-chart'"
          />
        }
      </div>

      <div class="kc__block">
        <span class="kc__state">Com valor negativo (dia só com reembolso)</span>
        <app-line-chart
          label="Saídas com reembolso"
          [series]="negative"
          [keys]="keys"
          [cy]="scope() + '-line-negative'"
        />
      </div>
      <div class="kc__block">
        <span class="kc__state">Vazio</span>
        <app-line-chart
          label="Entradas e saídas"
          [series]="zeros"
          [keys]="keys"
          [cy]="scope() + '-line-empty'"
        />
      </div>
      <div class="kc__block">
        <span class="kc__state">Um ponto</span>
        <app-line-chart
          label="Entradas"
          [series]="single"
          [keys]="oneKey"
          [cy]="scope() + '-line-single'"
        />
      </div>

      <div class="kc__block">
        <span class="kc__state">Barras de categoria</span>
        @if (categories(); as data) {
          <app-bar-list [items]="data.items" [other]="data.other" [cy]="scope() + '-bar-list'" />
        }
      </div>
      <div class="kc__block">
        <span class="kc__state">Barra segmentada</span>
        <app-segmented-bar
          label="Orçamento do mês"
          [segments]="segments"
          [cy]="scope() + '-segmented'"
        />
        <app-segmented-bar
          label="Orçamento do mês"
          [segments]="segments"
          [disabled]="true"
          [cy]="scope() + '-segmented-disabled'"
        />
      </div>
    </section>
  `,
  styles: `
    .kc {
      display: grid;
      gap: var(--space-4);
      padding: var(--space-4);
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-card);
      background-color: var(--color-surface);
      color: var(--color-text);
    }

    .kc__title {
      font-size: var(--text-lg);
    }

    .kc__demo {
      width: fit-content;
      padding: 0 var(--space-2);
      border-radius: var(--radius-pill);
      background-color: var(--color-warning-soft);
      color: var(--color-warning);
      font-size: var(--text-xs);
      font-weight: var(--weight-medium);
    }

    .kc__block {
      display: grid;
      gap: var(--space-2);
      min-width: 0;
    }

    .kc__state {
      color: var(--color-text-muted);
      font-size: var(--text-xs);
    }
  `,
})
export class UiKitChartsComponent {
  /** Porta de demonstração (dev e mock): no UI Kit os gráficos sempre mostram fixtures rotuladas. */
  private readonly gateway = inject(DEMO_REPORTS_GATEWAY) ?? missingDemoGateway();
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  /** Dado de demonstração é sempre rotulado (`charts.demo`); com a porta real, o selo some. */
  protected readonly isDemo = this.gateway.isDemo;

  readonly scope = input.required<'light' | 'dark'>();

  protected readonly periods = PERIODS;
  protected readonly period = new FormControl<string | null>('D30');
  protected readonly keys = KEYS;
  protected readonly oneKey = KEYS.slice(0, 1);
  protected readonly negative: readonly LineChartSeries[] = [
    {
      id: 'expenses',
      label: 'Saídas',
      tone: 'secondary',
      values: [BRL('120.00'), BRL('-49.90'), BRL('80.00'), BRL('0.00'), BRL('150.00')],
    },
  ];
  protected readonly zeros: readonly LineChartSeries[] = [
    { id: 'income', label: 'Entradas', tone: 'primary', values: KEYS.map(() => BRL('0.00')) },
  ];
  protected readonly single: readonly LineChartSeries[] = [
    { id: 'income', label: 'Entradas', tone: 'primary', values: [BRL('500.00')] },
  ];
  protected readonly segments: readonly SegmentedBarSegment[] = [
    { id: 'food', label: 'Alimentação', share: '0.3000', valueText: 'R$ 820,00', tone: 'accent' },
    {
      id: 'transport',
      label: 'Transporte',
      share: '0.1500',
      valueText: 'R$ 420,00',
      tone: 'warning',
    },
    { id: 'rest', label: 'Outras', share: '0.2000', valueText: 'R$ 610,00', tone: 'neutral' },
  ];

  private readonly locale = computed(() => HTML_LANG[this.i18n.language()]);

  protected readonly overview = toSignal(
    this.period.valueChanges.pipe(
      startWith(this.period.value),
      map((value) => (value ?? 'D30') as ReportPeriod),
      switchMap((value) => this.gateway.incomeExpenses(value)),
      map((data) =>
        toIncomeExpenseChart(data, this.locale(), { income: 'Entradas', expenses: 'Saídas' }),
      ),
    ),
  );

  protected readonly categories = toSignal(
    this.gateway.spendingByCategory('2026-10').pipe(
      map((data) => ({
        items: data.items.map<BarListItem>((item) => ({
          id: item.category.id,
          label: item.category.name,
          amount: item.amount,
          share: item.share,
        })),
        other: data.other,
      })),
    ),
  );
}
