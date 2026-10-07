import type { EntryLens } from '~/modules/transactions/core/types/entry';
import {
  PAYMENT_METHODS,
  TRANSACTION_TYPES,
} from '~/modules/transactions/core/types/transaction-enums';
import type {
  PaymentMethod,
  TransactionStatus,
  TransactionType,
} from '~/modules/transactions/core/types/transaction-enums';
import { cleanSearchTerm } from '~/util/search-term';

export type ListView = 'records' | 'entries';

/** Máximo de caracteres da busca (contrato: `q` até 100). */
export const SEARCH_MAX_LENGTH = 100;

/**
 * Filtros da lista, espelhados na URL (`view`, `from`, `to`, `competence`, `lens`, `type`,
 * `accountId`, `categoryId`, `method`, `status`, `q`). Padrões em S-71.
 */
export interface ListFilters {
  readonly view: ListView;
  /** Visão registros: primeira data (inclusive); `null` = sem limite inferior. */
  readonly from: string | null;
  /** Visão registros: última data (inclusive); `null` = sem limite superior. */
  readonly to: string | null;
  /** Visão por competência: mês `YYYY-MM`. */
  readonly competence: string;
  readonly lens: EntryLens;
  readonly type: TransactionType | null;
  readonly accountId: string | null;
  readonly categoryId: string | null;
  readonly method: PaymentMethod | null;
  readonly status: TransactionStatus;
  readonly q: string;
}

const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const ISO_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Primeiro e último dia do mês de `date` (`YYYY-MM-DD`). */
export function monthBounds(date: string): { readonly from: string; readonly to: string } {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prefix = date.slice(0, 7);
  return { from: `${prefix}-01`, to: `${prefix}-${String(lastDay).padStart(2, '0')}` };
}

/** Primeiro dia do mês que fica `months` meses antes do mês de `date` (`2026-10-04`, 3 → `2026-07-01`). */
export function firstDayMonthsBefore(date: string, months: number): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7)) - 1 - months;
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}

/** Padrões de S-71: Registros do mês corrente, só ativas; Por competência no mês corrente, consumo. */
export function defaultFilters(today: string): ListFilters {
  const { from, to } = monthBounds(today);
  return {
    view: 'records',
    from,
    to,
    competence: today.slice(0, 7),
    lens: 'CONSUMPTION',
    type: null,
    accountId: null,
    categoryId: null,
    method: null,
    status: 'ACTIVE',
    q: '',
  };
}

/** Só o que difere do padrão vai para a URL (endereço curto e legível). */
export function filtersToQuery(filters: ListFilters, today: string): Record<string, string> {
  const base = defaultFilters(today);
  const query: Record<string, string> = {};
  if (filters.view !== base.view) query['view'] = filters.view;
  // `from=` / `to=` vazios na URL = período aberto (campo limpo); ausente = padrão (mês corrente).
  if (filters.from !== base.from) query['from'] = filters.from ?? '';
  if (filters.to !== base.to) query['to'] = filters.to ?? '';
  if (filters.competence !== base.competence) query['competence'] = filters.competence;
  if (filters.lens !== base.lens) query['lens'] = filters.lens;
  if (filters.type) query['type'] = filters.type;
  if (filters.accountId) query['accountId'] = filters.accountId;
  if (filters.categoryId) query['categoryId'] = filters.categoryId;
  if (filters.method) query['method'] = filters.method;
  if (filters.status !== base.status) query['status'] = filters.status;
  if (filters.q.trim() !== '') query['q'] = filters.q;
  return query;
}

/** Filtros a partir dos query params; valor ausente ou inválido volta ao padrão (nunca quebra). */
export function filtersFromQuery(read: (key: string) => string | null, today: string): ListFilters {
  const base = defaultFilters(today);
  const date = (key: string, fallback: string | null): string | null => {
    const value = read(key);
    if (value === '') return null;
    return value !== null && ISO_DATE.test(value) ? value : fallback;
  };
  const oneOf = <T extends string>(key: string, allowed: readonly T[]): T | null => {
    const value = read(key);
    return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
  };
  const uuid = (key: string): string | null => {
    const value = read(key);
    return value !== null && UUID.test(value) ? value : null;
  };
  const competence = read('competence');
  return {
    view: oneOf('view', ['records', 'entries'] as const) ?? base.view,
    from: date('from', base.from),
    to: date('to', base.to),
    competence: competence !== null && ISO_MONTH.test(competence) ? competence : base.competence,
    lens: oneOf('lens', ['CONSUMPTION', 'INCOME'] as const) ?? base.lens,
    type: oneOf('type', TRANSACTION_TYPES),
    accountId: uuid('accountId'),
    categoryId: uuid('categoryId'),
    method: oneOf('method', PAYMENT_METHODS),
    status: oneOf('status', ['ACTIVE', 'VOIDED'] as const) ?? base.status,
    q: cleanSearchTerm(read('q') ?? ''),
  };
}

export function filtersEqual(a: ListFilters, b: ListFilters, today: string): boolean {
  return JSON.stringify(filtersToQuery(a, today)) === JSON.stringify(filtersToQuery(b, today));
}
