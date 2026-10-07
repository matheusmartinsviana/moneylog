import { toIncomeExpenseChart } from '~/app/common/components/charts/income-expense-chart.mapper';
import type {
  IncomeExpensePoint,
  IncomeExpenseSeries,
  ReportGranularity,
} from '~/modules/reports/core/types/reports';

const labels = { income: 'Entradas', expenses: 'Saídas' };
const brl = (amount: string) => ({ amount, currency: 'BRL' });

function series(granularity: ReportGranularity, points: [string, string][]): IncomeExpenseSeries {
  return {
    period: 'D7',
    from: points[0]![0],
    to: points.at(-1)![1],
    basis: granularity === 'MONTH' ? 'COMPETENCE' : 'DATE',
    granularity,
    points: points.map<IncomeExpensePoint>(([periodStart, periodEnd], i) => ({
      periodStart,
      periodEnd,
      partial: i === points.length - 1,
      income: brl(`${100 + i}.00`),
      expenses: brl(i === 1 ? '-35.50' : `${50 + i}.25`),
      net: brl('0.00'),
    })),
    totals: { income: brl('0.00'), expenses: brl('0.00'), net: brl('0.00') },
  };
}

describe('toIncomeExpenseChart (só apresentação)', () => {
  it('Dado a série, então uma chave por ponto e os valores passam como vieram (sem soma nem conversão)', () => {
    const data = series('DAY', [
      ['2026-10-04', '2026-10-04'],
      ['2026-10-05', '2026-10-05'],
      ['2026-10-06', '2026-10-06'],
    ]);

    const chart = toIncomeExpenseChart(data, 'pt-BR', labels);

    expect(chart.keys).toHaveLength(3);
    expect(chart.series.map((s) => [s.id, s.tone, s.label])).toEqual([
      ['income', 'primary', 'Entradas'],
      ['expenses', 'secondary', 'Saídas'],
    ]);
    // Os mesmos objetos Money do backend: nenhuma soma, arredondamento ou conversão.
    expect(chart.series[0]!.values[0]).toBe(data.points[0]!.income);
    expect(chart.series[1]!.values[1]).toBe(data.points[1]!.expenses);
    expect(chart.series[1]!.values[1]!.amount).toBe('-35.50');
  });

  it('Dado dias, semanas e meses, então os rótulos usam datas e competências formatadas, sem Date local', () => {
    const day = toIncomeExpenseChart(
      series('DAY', [['2026-10-10', '2026-10-10']]),
      'pt-BR',
      labels,
    );
    const week = toIncomeExpenseChart(
      series('WEEK', [['2026-07-10', '2026-07-12']]),
      'pt-BR',
      labels,
    );
    const month = toIncomeExpenseChart(
      series('MONTH', [['2026-10-01', '2026-10-31']]),
      'pt-BR',
      labels,
    );

    expect(day.keys[0]).toMatchObject({ shortLabel: '10 de out.', label: '10 de outubro de 2026' });
    expect(week.keys[0]!.label).toMatch(/10 de jul\. – 12 de jul\./);
    expect(month.keys[0]).toMatchObject({ shortLabel: 'out/2026', label: 'outubro de 2026' });
  });
});
