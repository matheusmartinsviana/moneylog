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
import { Router } from '@angular/router';

import { DisclosureComponent } from '~/app/common/components/disclosure/disclosure.component';
import {
  EmptyStateAction,
  EmptyStateComponent,
} from '~/app/common/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { SegmentedControlComponent } from '~/app/common/components/forms/segmented-control/segmented-control.component';
import { SwitchComponent } from '~/app/common/components/forms/switch/switch.component';
import { MoneyComponent } from '~/app/common/components/money/money.component';
import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { SectionContainerComponent } from '~/app/common/components/section-container/section-container.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { PlanningNavComponent } from '~/app/features/planning/components/planning-nav/planning-nav.component';
import {
  SparklineComponent,
  SparklineSeries,
} from '~/app/features/planning/components/sparkline/sparkline.component';
import { ProjectionsFacade } from '~/modules/projections/core/facades/projections.facade';
import {
  DEFAULT_HORIZON,
  PROJECTION_HORIZONS,
  type ProjectionHorizon,
} from '~/modules/projections/core/types/projection';
import { formatCompetence, formatIsoDate } from '~/util/date';

/**
 * Projeções (smart, T103): `/planning/projections?horizon=M6&trend=1`. **Sempre rotulada como projeção, não
 * certeza**, com as premissas (`assumptions[]`, chaves traduzidas) e a série mensal em tabela (a leitura
 * acessível) e em sparkline SVG própria (só desenho). A tendência é uma série à parte, rotulada
 * "estimativa", que não altera a base; sem 3 meses completos o motivo vem do backend. Horizonte e tendência
 * ficam na URL (o F5 restaura); mudar cancela a requisição anterior. Nada é calculado aqui.
 */
@Component({
  selector: 'app-projections-page',
  imports: [
    DisclosureComponent,
    ReactiveFormsModule,
    PageLayoutComponent,
    SectionContainerComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    SegmentedControlComponent,
    SwitchComponent,
    MoneyComponent,
    PlanningNavComponent,
    SparklineComponent,
  ],
  providers: [ProjectionsFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './projections.page.html',
  styleUrl: './projections.page.css',
})
export class ProjectionsPage {
  private readonly i18n = inject(I18nService);
  private readonly router = inject(Router);
  protected readonly t = this.i18n.t;
  protected readonly projection = inject(ProjectionsFacade);

  /** Query params da URL (`?horizon=` e `?trend=1`). */
  readonly horizon = input<string>();
  readonly trend = input<string>();

  protected readonly selectedHorizon = computed<ProjectionHorizon>(() => {
    const value = this.horizon();
    return PROJECTION_HORIZONS.find((h) => h === value) ?? DEFAULT_HORIZON;
  });
  protected readonly includeTrend = computed(() => this.trend() === '1');

  protected readonly horizonControl = new FormControl<string | null>(DEFAULT_HORIZON);
  protected readonly trendControl = new FormControl<boolean>(false, { nonNullable: true });

  protected readonly horizonOptions = computed<readonly ChoiceOption[]>(() =>
    PROJECTION_HORIZONS.map((horizon) => ({
      value: horizon,
      label: this.t().projections.horizons[horizon],
    })),
  );

  private readonly locale = computed(() => HTML_LANG[this.i18n.language()]);
  protected readonly data = this.projection.data;

  protected readonly rows = computed(() =>
    (this.data()?.series ?? []).map((point) => ({
      point,
      month: formatCompetence(point.competence, this.locale()),
      until: interpolate(this.t().projections.table.partialUntil, {
        date: formatIsoDate(point.periodEnd, this.locale(), 'long'),
      }),
    })),
  );
  protected readonly trendRows = computed(() =>
    (this.data()?.trend?.series ?? []).map((point) => ({
      point,
      month: formatCompetence(point.competence, this.locale()),
    })),
  );
  protected readonly sparkSeries = computed<readonly SparklineSeries[]>(() => {
    const data = this.data();
    if (!data) return [];
    const series: SparklineSeries[] = [
      {
        id: 'base',
        keys: data.series.map((point) => point.competence),
        values: data.series.map((point) => point.balance.amount),
      },
    ];
    const trend = data.trend;
    if (trend?.available && trend.series.length > 0) {
      series.push({
        id: 'trend',
        dashed: true,
        keys: trend.series.map((point) => point.competence),
        values: trend.series.map((point) => point.balance.amount),
      });
    }
    return series;
  });
  protected readonly assumptions = computed(() =>
    (this.data()?.assumptions ?? []).map((key) => ({
      key,
      text: this.t().projections.assumptions[key] ?? this.t().projections.assumptionUnknown,
    })),
  );
  protected readonly trendReason = computed(() => {
    const trend = this.data()?.trend;
    if (!trend || trend.available) return null;
    return (
      (trend.reason !== null ? this.t().projections.trend.reasons[trend.reason] : undefined) ??
      this.t().projections.trend.unavailable
    );
  });
  protected readonly trendBasedOn = computed(() => {
    const trend = this.data()?.trend;
    if (!trend || trend.basedOn.length === 0) return null;
    const months = trend.basedOn.map((m) => formatCompetence(m, this.locale())).join(', ');
    return interpolate(this.t().projections.trend.basedOn, { months });
  });

  protected readonly emptyActions = computed<readonly EmptyStateAction[]>(() => [
    {
      id: 'add-account',
      label: this.t().projections.empty.action,
      available: true,
      primary: true,
      link: '/accounts/new',
    },
  ]);

  constructor() {
    // A URL manda: os controles espelham o horizonte e a tendência dela; a requisição sai daqui.
    effect(() => {
      const horizon = this.selectedHorizon();
      const includeTrend = this.includeTrend();
      untracked(() => {
        this.horizonControl.setValue(horizon, { emitEvent: false });
        this.trendControl.setValue(includeTrend, { emitEvent: false });
        this.projection.load({ horizon, includeTrend });
      });
    });
    this.horizonControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      if (PROJECTION_HORIZONS.some((h) => h === value)) this.navigate(value, this.includeTrend());
    });
    this.trendControl.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((on) => this.navigate(this.selectedHorizon(), on));
  }

  protected retry(): void {
    this.projection.load({ horizon: this.selectedHorizon(), includeTrend: this.includeTrend() });
  }

  private navigate(horizon: string | null, includeTrend: boolean): void {
    void this.router.navigate([], {
      queryParams: {
        horizon: horizon === DEFAULT_HORIZON ? null : horizon,
        trend: includeTrend ? '1' : null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
