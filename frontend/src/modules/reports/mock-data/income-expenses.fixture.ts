import type {
  IncomeExpensePoint,
  IncomeExpenseSeries,
  ReportGranularity,
  ReportPeriod,
} from '~/modules/reports/core/types/reports';
import {
  addMonthsClamped,
  DEMO_TODAY,
  dayNumber,
  isoOf,
  lastDayOfMonth,
  toMoney,
} from '~/modules/reports/mock-data/demo-support';

/** Entradas e saídas de um dia em centavos (determinístico, com dia só de reembolso e dias sem nada). */
export function demoDay(iso: string): { income: number; expenses: number } {
  const day = Number(iso.slice(8, 10));
  const n = dayNumber(iso);
  let income = 0;
  if (day === 1) income += 550_000; // salário
  if (day === 20) income += 120_000; // freela
  if (n % 11 === 4) income += 18_000;
  // Consumo: dia sim, dia não; fim de semana um pouco maior; um dia só de reembolso.
  let expenses = n % 4 === 0 ? 0 : 3_500 + ((n * 7919) % 9_000) + (n % 7 >= 5 ? 6_500 : 0);
  if (day === 5) expenses += 82_000; // moradia
  if (n % 29 === 13) expenses = -4_990; // reembolso: o dia fica negativo
  return { income, expenses };
}

function bucket(
  start: string,
  end: string,
  partial: boolean,
): IncomeExpensePoint & { cents: { income: number; expenses: number } } {
  let income = 0;
  let expenses = 0;
  for (let d = dayNumber(start); d <= dayNumber(end); d++) {
    const day = demoDay(isoOf(d));
    income += day.income;
    expenses += day.expenses;
  }
  return {
    periodStart: start,
    periodEnd: end,
    partial,
    income: toMoney(income),
    expenses: toMoney(expenses),
    net: toMoney(income - expenses),
    cents: { income, expenses },
  };
}

function build(
  period: ReportPeriod,
  from: string,
  to: string,
  granularity: ReportGranularity,
  ranges: readonly { start: string; end: string; partial: boolean }[],
): IncomeExpenseSeries {
  const buckets = ranges.map((r) => bucket(r.start, r.end, r.partial));
  const income = buckets.reduce((sum, b) => sum + b.cents.income, 0);
  const expenses = buckets.reduce((sum, b) => sum + b.cents.expenses, 0);
  return {
    period,
    from,
    to,
    basis: granularity === 'MONTH' ? 'COMPETENCE' : 'DATE',
    granularity,
    points: buckets.map((b) => ({
      periodStart: b.periodStart,
      periodEnd: b.periodEnd,
      partial: b.partial,
      income: b.income,
      expenses: b.expenses,
      net: b.net,
    })),
    totals: {
      income: toMoney(income),
      expenses: toMoney(expenses),
      net: toMoney(income - expenses),
    },
  };
}

/** Segunda-feira da semana de `day` (dia absoluto; 1970-01-01 foi quinta). */
function mondayOf(day: number): number {
  return day - ((day + 3) % 7);
}

/**
 * Série de DEMONSTRAÇÃO no formato do contrato futuro (plano 5.1): D7 e D30 diários terminando hoje; M3 por
 * semanas (segunda a domingo) **recortadas** na janela (13 ou 14 pontos); M12 por competência, a corrente
 * inteira e `partial`. O balde de hoje é `partial`. Totais = soma dos pontos; `net` = receita − consumo.
 */
export function demoIncomeExpenseSeries(period: ReportPeriod): IncomeExpenseSeries {
  const today = dayNumber(DEMO_TODAY);
  if (period === 'D7' || period === 'D30') {
    const size = period === 'D7' ? 7 : 30;
    const ranges = Array.from({ length: size }, (_, i) => {
      const iso = isoOf(today - (size - 1) + i);
      return { start: iso, end: iso, partial: i === size - 1 };
    });
    return build(period, ranges[0]!.start, DEMO_TODAY, 'DAY', ranges);
  }
  if (period === 'M3') {
    const from = addMonthsClamped(DEMO_TODAY, -3);
    const ranges: { start: string; end: string; partial: boolean }[] = [];
    for (let start = dayNumber(from); start <= today;) {
      const end = Math.min(mondayOf(start) + 6, today);
      ranges.push({ start: isoOf(start), end: isoOf(end), partial: end === today });
      start = end + 1;
    }
    return build(period, from, DEMO_TODAY, 'WEEK', ranges);
  }
  const [y, m] = DEMO_TODAY.split('-').map(Number);
  const ranges = Array.from({ length: 12 }, (_, i) => {
    const date = new Date(Date.UTC(y!, m! - 1 - (11 - i), 1));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    return {
      start: `${year}-${String(month).padStart(2, '0')}-01`,
      end: lastDayOfMonth(year, month),
      partial: i === 11,
    };
  });
  return build(period, ranges[0]!.start, ranges[11]!.end, 'MONTH', ranges);
}
