/**
 * Formatação de datas de calendário da API (`YYYY-MM-DD`) e competências (`YYYY-MM`).
 * Essas datas já vêm no fuso do usuário (S-1), então são exibidas como estão: a conversão usa UTC
 * só para o dia não "andar" com o fuso do aparelho. Valor fora do formato volta como veio.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_MONTH = /^(\d{4})-(\d{2})$/;

export type DateStyle = 'short' | 'long';

const DATE_OPTIONS: Readonly<Record<DateStyle, Intl.DateTimeFormatOptions>> = {
  short: { day: 'numeric', month: 'short' },
  long: { day: 'numeric', month: 'long', year: 'numeric' },
};

export function formatIsoDate(value: string, locale: string, style: DateStyle = 'short'): string {
  const match = ISO_DATE.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat(locale, { ...DATE_OPTIONS[style], timeZone: 'UTC' }).format(date);
}

export function formatCompetence(value: string, locale: string): string {
  const match = ISO_MONTH.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** Fuso das datas de calendário do usuário (S-1): "hoje" e competências são contados nele. */
export const USER_TIME_ZONE = 'America/Sao_Paulo';

/**
 * "Hoje" como `YYYY-MM-DD` no fuso do usuário, não no do aparelho nem em UTC: às 23:30 de 31/10 em
 * São Paulo (02:30 de 01/11 em UTC) ainda é `2026-10-31`. É o padrão dos campos de data (S-69).
 */
export function todayIso(now: Date = new Date(), timeZone: string = USER_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** É uma data de calendário real no formato da API (`2026-02-30` não é)? */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** Competência curta `mês/ano` (`2026-10` → `out/2026`), para rótulos como "No consumo de out/2026". */
export function formatCompetenceShort(value: string, locale: string): string {
  const match = ISO_MONTH.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  const month = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
    .format(date)
    .replace(/\.$/, '')
    .toLocaleLowerCase(locale);
  return `${month}/${match[1]}`;
}

/**
 * Instante ISO-8601 UTC da API (`2026-10-04T15:30:00Z`, ex.: `voidedAt`) como data e hora no fuso do
 * usuário (S-1). Valor que não é data volta como veio.
 */
export function formatInstant(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: USER_TIME_ZONE,
  }).format(date);
}

const DAY_MS = 86_400_000;

function isoDayNumber(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Math.floor(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) / DAY_MS);
}

/**
 * "Hoje" ou "Ontem" para uma data em relação ao `asOf` **do backend** (nunca ao relógio do aparelho). Só
 * rótulo de apresentação: devolve `null` para qualquer outro dia (aí a tela mostra a data).
 */
export function relativeDay(date: string, asOf: string): 'today' | 'yesterday' | null {
  if (!isIsoDate(date) || !isIsoDate(asOf)) return null;
  const diff = isoDayNumber(asOf) - isoDayNumber(date);
  return diff === 0 ? 'today' : diff === 1 ? 'yesterday' : null;
}
