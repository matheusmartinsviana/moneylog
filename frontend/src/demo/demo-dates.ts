/**
 * Datas do modo demonstração (UTC, sobre strings `YYYY-MM-DD`). Este código só existe no build `demo`:
 * ele simula o backend com dados de exemplo. No app real o front não calcula nada financeiro.
 */
const DAY_MS = 86_400_000;

export function dayNum(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(y!, m! - 1, d!) / DAY_MS);
}

export function isoOf(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return isoOf(dayNum(iso) + days);
}

export function lastDayOf(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
}

/** Soma meses a uma chave `YYYY-MM`. */
export function addMonthsKey(monthKey: string, months: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1 + months, 1));
  return date.toISOString().slice(0, 7);
}

/** Soma meses a uma data, ajustando o dia ao fim do mês quando preciso. */
export function addMonths(iso: string, months: number): string {
  const key = addMonthsKey(iso.slice(0, 7), months);
  const day = Math.min(Number(iso.slice(8, 10)), Number(lastDayOf(key).slice(8, 10)));
  return `${key}-${String(day).padStart(2, '0')}`;
}

/** Dia `day` do mês `monthKey`, limitado ao último dia do mês. */
export function dateIn(monthKey: string, day: number): string {
  const last = Number(lastDayOf(monthKey).slice(8, 10));
  return `${monthKey}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

/** Hoje no calendário local, como `YYYY-MM-DD`. */
export function localToday(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mm}-${dd}`;
}
