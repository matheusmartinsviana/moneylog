import type { Money } from '~/util/money';

/**
 * Apoio das fixtures de DEMONSTRAÇÃO (não é regra de produto): aqui há aritmética de centavos porque este
 * arquivo **simula o backend** que ainda não tem os endpoints (T181 a T185). No app real o front não soma.
 */
export const DEMO_CURRENCY = 'BRL';
/** O "hoje" das fixtures (sábado), fixo para o desenho e os testes serem determinísticos. */
export const DEMO_TODAY = '2026-10-10';

/** Centavos → string decimal da API (`-3500` → `-35.00`). */
export function toMoney(cents: number): Money {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const units = Math.trunc(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  return { amount: `${sign}${units}.${rest}`, currency: DEMO_CURRENCY };
}

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` → dia absoluto (UTC), só para contar e somar dias nas fixtures. */
export function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(y!, m! - 1, d!) / DAY_MS);
}

export function isoOf(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function addMonthsClamped(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const first = new Date(Date.UTC(y!, m! - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d!, last)))
    .toISOString()
    .slice(0, 10);
}

export function lastDayOfMonth(year: number, month1: number): string {
  return new Date(Date.UTC(year, month1, 0)).toISOString().slice(0, 10);
}
