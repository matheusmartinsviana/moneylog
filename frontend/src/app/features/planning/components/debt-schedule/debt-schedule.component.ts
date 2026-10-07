import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import {
  LineChartComponent,
  type LineChartKey,
  type LineChartSeries,
} from '~/app/common/components/charts/line-chart.component';
import { MoneyComponent } from '~/app/common/components/money/money.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import type { DebtOverview } from '~/modules/debt-overview/core/types/debt-overview';
import { formatCompetence, formatCompetenceShort } from '~/util/date';

/**
 * Cronograma de vencimentos por mês (presentational): linha do que vence e linha do restante, as duas
 * **como o servidor devolveu** (`schedule.points`), com a tabela equivalente do próprio gráfico. Vencido,
 * sem data e depois do horizonte ficam fora do eixo, como chips. Sem previsão de quitação, o motivo vem do
 * servidor (`payoffReason`). Nada é somado aqui.
 */
@Component({
  selector: 'app-debt-schedule',
  imports: [LineChartComponent, MoneyComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="chips" data-cy="debt-schedule-chips">
      <li class="chip" data-cy="debt-schedule-overdue">
        <span class="chip__label">{{ t().debtOverview.schedule.chips.overdue }}</span>
        <app-money [value]="schedule().overdue" />
      </li>
      <li class="chip" data-cy="debt-schedule-undated">
        <span class="chip__label">{{ t().debtOverview.schedule.chips.undated }}</span>
        <app-money [value]="schedule().undated" />
      </li>
      <li class="chip" data-cy="debt-schedule-beyond">
        <span class="chip__label">{{ t().debtOverview.schedule.chips.beyond }}</span>
        <app-money [value]="schedule().beyondHorizon" />
      </li>
    </ul>

    @if (schedule().points.length === 0) {
      <p class="note" data-cy="debt-schedule-empty">{{ t().debtOverview.schedule.empty }}</p>
    } @else {
      <!-- O gráfico (SVG próprio) é um chunk à parte, como no Início. -->
      @defer (on immediate) {
        <app-line-chart
          [label]="t().debtOverview.schedule.chartLabel"
          [series]="series()"
          [keys]="keys()"
          cy="debt-schedule-chart"
        />
      } @placeholder {
        <div class="list-skeleton" aria-hidden="true">
          <div class="list-skeleton__row"></div>
        </div>
      }
    }

    <p class="payoff" data-cy="debt-schedule-payoff">{{ payoff() }}</p>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-4);
    }

    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .chip {
      display: inline-flex;
      align-items: baseline;
      gap: var(--space-2);
      padding: var(--space-1) var(--space-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      font-size: var(--text-sm);
    }

    .chip__label {
      color: var(--color-text-muted);
    }

    .note,
    .payoff {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }
  `,
})
export class DebtScheduleComponent {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly schedule = input.required<DebtOverview['schedule']>();

  private readonly locale = computed(() => HTML_LANG[this.i18n.language()]);

  protected readonly keys = computed<readonly LineChartKey[]>(() =>
    this.schedule().points.map((point) => ({
      id: point.competence,
      label: formatCompetence(point.competence, this.locale()),
      shortLabel: formatCompetenceShort(point.competence, this.locale()),
    })),
  );

  protected readonly series = computed<readonly LineChartSeries[]>(() => {
    const points = this.schedule().points;
    const copy = this.t().debtOverview.schedule;
    return [
      {
        id: 'due',
        label: copy.dueLine,
        tone: 'primary',
        values: points.map((point) => point.total),
      },
      {
        id: 'remaining',
        label: copy.remainingLine,
        tone: 'secondary',
        values: points.map((point) => point.remainingAfter),
      },
    ];
  });

  protected readonly payoff = computed(() => {
    const { payoffCompetence, payoffReason } = this.schedule();
    const copy = this.t().debtOverview.schedule.payoff;
    if (payoffCompetence !== null) {
      return interpolate(copy.on, { month: formatCompetence(payoffCompetence, this.locale()) });
    }
    return payoffReason !== null ? copy[payoffReason] : '';
  });
}
