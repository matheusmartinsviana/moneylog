/**
 * Aritmética de calendário por dias civis (FE-S-115): datas são strings `YYYY-MM-DD`/`YYYY-MM`.
 * `Date.UTC` só calcula dia da semana e transbordo de mês, nunca guarda valor: o resultado não
 * depende do fuso do aparelho.
 */
import type { Language } from '~/app/common/i18n/i18n';

/** Limites de data aceitos pelo backend (contrato). */
export const MIN_DATE = '2000-01-01';
export const MAX_DATE = '2100-12-31';

export type DateOrder = 'dmy' | 'mdy';

export interface Civil {
  readonly y: number;
  readonly m: number;
  readonly d: number;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function utc(y: number, m: number, d: number): Date {
  // `Date.UTC` trata anos 0 a 99 como 1900+; `setUTCFullYear` não.
  const date = new Date(0);
  date.setUTCFullYear(y, m - 1, d);
  return date;
}

function pad(value: number, size = 2): string {
  return String(value).padStart(size, '0');
}

export function toIso(y: number, m: number, d: number): string {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

export function daysInMonth(y: number, m: number): number {
  return utc(y, m + 1, 0).getUTCDate();
}

/** Data civil de `YYYY-MM-DD`; `null` se não existir no calendário (31/02). */
export function parseIso(iso: string): Civil | null {
  const match = ISO.exec(iso);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m) ? { y, m, d } : null;
}

/** Dia da semana (0 = domingo). */
export function weekday(iso: string): number {
  const c = parseIso(iso);
  return c ? utc(c.y, c.m, c.d).getUTCDay() : 0;
}

export function addDays(iso: string, days: number): string {
  const c = parseIso(iso);
  if (!c) return iso;
  const date = utc(c.y, c.m, c.d + days);
  return toIso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Soma meses mantendo o dia, ou o último dia do mês de destino (31/01 + 1 = 28/02). */
export function addMonths(iso: string, months: number): string {
  const c = parseIso(iso);
  if (!c) return iso;
  const index = c.y * 12 + (c.m - 1) + months;
  const y = Math.floor(index / 12);
  const m = (((index % 12) + 12) % 12) + 1;
  return toIso(y, m, Math.min(c.d, daysInMonth(y, m)));
}

export function clampIso(iso: string, min: string, max: string): string {
  return iso < min ? min : iso > max ? max : iso;
}

/** 6 semanas × 7 dias do mês `YYYY-MM`; dias de fora do mês vêm como `null`. */
export function monthGrid(month: string, weekStart: 0 | 1): (string | null)[][] {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const first = toIso(y, m, 1);
  const offset = (weekday(first) - weekStart + 7) % 7;
  const total = daysInMonth(y, m);
  const cells: (string | null)[] = Array.from({ length: 42 }, (_, i) => {
    const day = i - offset + 1;
    return day >= 1 && day <= total ? toIso(y, m, day) : null;
  });
  return Array.from({ length: 6 }, (_, row) => cells.slice(row * 7, row * 7 + 7));
}

/** Ordem dos campos digitados: mês primeiro só em inglês (FE-S-117). */
export function dateOrder(language: Language): DateOrder {
  return language === 'en' ? 'mdy' : 'dmy';
}

/** Semana começa no domingo (pt, en) ou na segunda (es) (FE-S-117). */
export function weekStart(language: Language): 0 | 1 {
  return language === 'es' ? 1 : 0;
}

/** Aplica a máscara `dd/mm/aaaa` (ou `mm/dd/aaaa`) aos dígitos digitados. */
export function maskDigits(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

export function formatMasked(iso: string, order: DateOrder): string {
  const c = parseIso(iso);
  if (!c) return '';
  return order === 'mdy'
    ? `${pad(c.m)}/${pad(c.d)}/${pad(c.y, 4)}`
    : `${pad(c.d)}/${pad(c.m)}/${pad(c.y, 4)}`;
}

/** `dd/mm/aaaa` completo e real → `YYYY-MM-DD`; qualquer outra coisa → `null`. */
export function parseMasked(text: string, order: DateOrder): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!match) return null;
  const a = Number(match[1]);
  const b = Number(match[2]);
  const y = Number(match[3]);
  const [m, d] = order === 'mdy' ? [a, b] : [b, a];
  const iso = toIso(y, m, d);
  return parseIso(iso) ? iso : null;
}

/** Mês `YYYY-MM` somado de `months` (negativo volta). */
export function addMonthsToMonth(month: string, months: number): string {
  return addMonths(`${month}-01`, months).slice(0, 7);
}
