import type {
  LineChartKey,
  LineChartSeries,
} from '~/app/common/components/charts/line-chart.component';
import type { IncomeExpenseSeries } from '~/modules/reports/core/types/reports';
import { formatCompetence, formatCompetenceShort, formatIsoDate } from '~/util/date';

export interface IncomeExpenseChartLabels {
  readonly income: string;
  readonly expenses: string;
}

/**
 * Prepara a série do backend (`GET /v1/reports/income-expenses`) para o `LineChart`: só **apresentação**
 * (rótulos de data e a ordem das séries). Os valores passam como vieram; nada é somado, comparado nem
 * arredondado. Entradas = série primária (azul, cheia); saídas = secundária (neutra, tracejada).
 */
export function toIncomeExpenseChart(
  data: IncomeExpenseSeries,
  locale: string,
  labels: IncomeExpenseChartLabels,
): { keys: LineChartKey[]; series: LineChartSeries[] } {
  const keys = data.points.map<LineChartKey>((point) => {
    if (data.granularity === 'MONTH') {
      const competence = point.periodStart.slice(0, 7);
      return {
        id: point.periodStart,
        label: formatCompetence(competence, locale),
        shortLabel: formatCompetenceShort(competence, locale),
      };
    }
    const start = formatIsoDate(point.periodStart, locale, 'short');
    if (data.granularity === 'WEEK') {
      return {
        id: point.periodStart,
        label: `${start} – ${formatIsoDate(point.periodEnd, locale, 'short')}`,
        shortLabel: start,
      };
    }
    return {
      id: point.periodStart,
      label: formatIsoDate(point.periodStart, locale, 'long'),
      shortLabel: start,
    };
  });
  return {
    keys,
    series: [
      {
        id: 'income',
        label: labels.income,
        tone: 'primary',
        values: data.points.map((p) => p.income),
      },
      {
        id: 'expenses',
        label: labels.expenses,
        tone: 'secondary',
        values: data.points.map((p) => p.expenses),
      },
    ],
  };
}
