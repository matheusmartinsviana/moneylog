/**
 * Períodos de check-in das ações de uma meta (ADR-016): `MONTHLY` = `YYYY-MM`, `WEEKLY` = `YYYY-Www`
 * (semana ISO 8601), `ONE_TIME` = `ONCE`. Só formata datas: nenhuma regra financeira.
 */
export type PeriodFrequency = 'MONTHLY' | 'WEEKLY' | 'ONE_TIME';

export const ONCE_PERIOD = 'ONCE';

/** Semana ISO 8601 (a que contém a quinta-feira) de uma data `YYYY-MM-DD`, como `2026-W41`. */
export function isoWeekPeriod(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const weekYear = date.getUTCFullYear();
  const yearStart = Date.UTC(weekYear, 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${weekYear}-W${String(week).padStart(2, '0')}`;
}

/** O período em curso de uma frequência, a partir de "hoje" (`YYYY-MM-DD`). */
export function currentPeriod(frequency: PeriodFrequency, today: string): string {
  switch (frequency) {
    case 'MONTHLY':
      return today.slice(0, 7);
    case 'WEEKLY':
      return isoWeekPeriod(today);
    default:
      return ONCE_PERIOD;
  }
}

export interface PeriodParts {
  readonly kind: 'month' | 'week' | 'once' | 'unknown';
  readonly year: number;
  /** Mês (1-12) ou semana (1-53); 0 em `once`/`unknown`. */
  readonly number: number;
}

export function parsePeriod(period: string): PeriodParts {
  if (period === ONCE_PERIOD) return { kind: 'once', year: 0, number: 0 };
  const month = /^(\d{4})-(\d{2})$/.exec(period);
  if (month) return { kind: 'month', year: Number(month[1]), number: Number(month[2]) };
  const week = /^(\d{4})-W(\d{2})$/.exec(period);
  if (week) return { kind: 'week', year: Number(week[1]), number: Number(week[2]) };
  return { kind: 'unknown', year: 0, number: 0 };
}
