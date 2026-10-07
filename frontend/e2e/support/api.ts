/* eslint-disable @typescript-eslint/no-explicit-any */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import type { APIRequestContext } from '@playwright/test';

import { ContractFailure, validateRequest, validateResponse } from './contract';

export interface Money {
  amount: string;
  currency: string;
}
export const brl = (amount: string): Money => ({ amount, currency: 'BRL' });

export interface ApiResult<T = any> {
  status: number;
  body: T;
  headers: Record<string, string>;
}

/** "Hoje" no fuso do usuário (America/Sao_Paulo), como o backend e o front contam. */
export function todayInSaoPaulo(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Falhas de contrato acumuladas por quem chamou a API (o fixture as confere no fim do teste). */
export type FailureSink = ContractFailure[];

/**
 * Cliente da API real para montar cenários (conta, categoria, movimentações) e para os testes de
 * contrato. Toda requisição e resposta passa pelo ajv (`contract.ts`); as falhas vão para `sink`.
 */
export class Api {
  token = '';
  readonly calls: { method: string; path: string; status: number }[] = [];

  constructor(
    private readonly request: APIRequestContext,
    private readonly sink: FailureSink,
  ) {}

  async login(
    email = process.env['E2E_OWNER_EMAIL'],
    password = process.env['E2E_OWNER_PASSWORD'],
  ): Promise<ApiResult> {
    const res = await this.call('POST', '/v1/auth/login', { email, password }, { auth: false });
    if (res.status !== 200) {
      throw new Error(`login da API falhou: ${res.status} ${JSON.stringify(res.body)}`);
    }
    this.token = res.body.accessToken;
    return res;
  }

  async call<T = any>(
    method: string,
    path: string,
    body?: unknown,
    options: {
      auth?: boolean;
      headers?: Record<string, string>;
      validate?: boolean;
      /** `false`: não confere o corpo enviado (sonda com corpo de propósito inválido), só a resposta. */
      validateRequest?: boolean;
    } = {},
  ): Promise<ApiResult<T>> {
    const url = path.split('?')[0] as string;
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    if (options.auth !== false && this.token) headers['Authorization'] = `Bearer ${this.token}`;
    if (body !== undefined && options.validate !== false && options.validateRequest !== false) {
      this.sink.push(...validateRequest(method, url, body));
    }
    const res = await this.request.fetch(path, { method, headers, data: body });
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    this.calls.push({ method, path, status: res.status() });
    if (options.validate !== false) {
      this.sink.push(...validateResponse(method, url, res.status(), parsed, text.length > 0));
    }
    return { status: res.status(), body: parsed as T, headers: res.headers() };
  }

  get<T = any>(path: string): Promise<ApiResult<T>> {
    return this.call<T>('GET', path);
  }

  async ok<T = any>(promise: Promise<ApiResult<T>>, expected = [200, 201, 204]): Promise<T> {
    const res = await promise;
    if (!expected.includes(res.status)) {
      throw new Error(
        `esperava ${expected.join('/')} e veio ${res.status}: ${JSON.stringify(res.body)}`,
      );
    }
    return res.body;
  }

  createAccount(input: {
    name: string;
    type?: string;
    institution?: string | null;
    openingBalance: string;
    openingDate?: string;
  }): Promise<any> {
    return this.ok(
      this.call('POST', '/v1/accounts', {
        name: input.name,
        type: input.type ?? 'CHECKING',
        institution: input.institution ?? null,
        openingBalance: brl(input.openingBalance),
        openingDate: input.openingDate ?? todayInSaoPaulo(),
      }),
    );
  }

  async categoryId(name: string, kind: 'EXPENSE' | 'INCOME' = 'EXPENSE'): Promise<string> {
    const list: { id: string; name: string; kind: string }[] = await this.ok(
      this.get('/v1/categories'),
    );
    const found = list.find((c) => c.name === name && c.kind === kind);
    if (!found) throw new Error(`categoria "${name}" não encontrada`);
    return found.id;
  }

  /** Cria a movimentação (com `Idempotency-Key` nova). Devolve a resposta completa. */
  tx(input: Record<string, unknown>, key: string = randomUUID()): Promise<ApiResult> {
    return this.call('POST', '/v1/transactions', input, { headers: { 'Idempotency-Key': key } });
  }

  txOk(input: Record<string, unknown>): Promise<any> {
    return this.ok(this.tx(input), [201]);
  }
}

interface MoneyBody {
  amount: string;
  accountId: string;
  categoryId: string;
  description?: string;
  date?: string;
  method?: string;
}

export const expense = (o: MoneyBody) => ({
  type: 'EXPENSE',
  amount: o.amount,
  date: o.date ?? todayInSaoPaulo(),
  description: o.description ?? 'despesa',
  notes: null,
  accountId: o.accountId,
  categoryId: o.categoryId,
  method: o.method ?? 'PIX',
});

export const income = (o: MoneyBody) => ({
  ...expense(o),
  type: 'INCOME',
  description: o.description ?? 'receita',
  method: o.method ?? 'TRANSFER',
});

function pg(args: string[]): string {
  const container = process.env['E2E_PG_CONTAINER'] ?? 'moneylog-e2e-postgres-1';
  const user = process.env['DB_USER'] ?? 'moneylog';
  const db = process.env['DB_NAME'] ?? 'moneylog_e2e';
  return execFileSync(
    'docker',
    ['exec', container, 'psql', '-At', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', db, ...args],
    { encoding: 'utf8' },
  ).trim();
}

/** Apaga os dados de domínio (contas, movimentações, categorias do usuário) do banco de teste. */
export function resetDatabase(): void {
  pg([
    '-c',
    `TRUNCATE note_links, note_tags, notes, transaction_revisions, ledger_postings, transaction_installments, idempotency_keys,
      transactions, recurrence_skips, recurring_transactions, goal_reservations, goals, debts, persons, credit_card_invoices, credit_card_billing_rules, credit_cards, accounts CASCADE;
     DELETE FROM categories WHERE system_key IS NULL;
     UPDATE categories SET archived = false WHERE system_key IS NOT NULL;`,
  ]);
}

/** Consulta SQL só de leitura (evidência de persistência). */
export function psql(sql: string): string {
  return pg(['-c', sql]);
}
