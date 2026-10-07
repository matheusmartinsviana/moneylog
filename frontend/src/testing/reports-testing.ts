import { Provider } from '@angular/core';
import { Observable, of } from 'rxjs';

import { ReportsGateway } from '~/modules/reports/core/interfaces/reports.gateway';
import type {
  IncomeExpenseSeries,
  ReportPeriod,
  SpendingByCategory,
} from '~/modules/reports/core/types/reports';
import {
  toIncomeExpenseSeries,
  toSpendingByCategory,
} from '~/modules/reports/infra/facades/reports-response.mapper';
import type {
  IncomeExpenseSeriesResponse,
  SpendingByCategoryResponse,
} from '~/modules/reports/infra/responses/reports.response';
import { SearchGateway } from '~/modules/search/core/interfaces/search.gateway';
import type { SearchResults } from '~/modules/search/core/types/search';
import { toSearchResults } from '~/modules/search/infra/facades/search-response.mapper';
import type { SearchResultsResponse } from '~/modules/search/infra/responses/search.response';

/*
 * Respostas **fiéis ao contrato 2.6.0**: tipadas com os schemas gerados de `contracts/openapi.yaml` (se o
 * contrato mudar, o `typecheck` quebra aqui) e com os exemplos do próprio contrato. Os valores são os que o
 * backend devolveria; as telas só os exibem (o front não soma nada).
 */
const brl = (amount: string) => ({ amount, currency: 'BRL' as const });
const day = (date: string, income: string, expenses: string, net: string, partial = false) => ({
  periodStart: date,
  periodEnd: date,
  partial,
  income: brl(income),
  expenses: brl(expenses),
  net: brl(net),
});

/** `GET /v1/reports/income-expenses?period=D7`, o exemplo do contrato (dia de reembolso com `expenses` negativo). */
export function anIncomeExpenseSeriesResponse(
  overrides: Partial<IncomeExpenseSeriesResponse> = {},
): IncomeExpenseSeriesResponse {
  return {
    period: 'D7',
    from: '2026-10-04',
    to: '2026-10-10',
    basis: 'DATE',
    granularity: 'DAY',
    points: [
      day('2026-10-04', '0.00', '0.00', '0.00'),
      day('2026-10-05', '3000.00', '0.00', '3000.00'),
      day('2026-10-06', '0.00', '0.00', '0.00'),
      day('2026-10-07', '0.00', '0.00', '0.00'),
      day('2026-10-08', '0.00', '0.00', '0.00'),
      day('2026-10-09', '0.00', '-50.00', '50.00'),
      day('2026-10-10', '0.00', '300.00', '-300.00', true),
    ],
    totals: { income: brl('3000.00'), expenses: brl('250.00'), net: brl('2750.00') },
    ...overrides,
  };
}

export function anIncomeExpenseSeries(
  overrides: Partial<IncomeExpenseSeriesResponse> = {},
): IncomeExpenseSeries {
  return toIncomeExpenseSeries(anIncomeExpenseSeriesResponse(overrides));
}

/** `GET /v1/reports/spending-by-category?month=2026-10`, o exemplo do contrato. */
export function aSpendingByCategoryResponse(
  overrides: Partial<SpendingByCategoryResponse> = {},
): SpendingByCategoryResponse {
  return {
    basis: 'COMPETENCE',
    from: '2026-10-01',
    to: '2026-10-31',
    total: brl('250.00'),
    base: brl('250.00'),
    items: [
      {
        category: { id: '8a3c6b10-5e2f-4d7a-9b41-c0d1e2f3a4b5', name: 'Tecnologia' },
        amount: brl('200.00'),
        share: '0.8000',
      },
    ],
    other: { amount: brl('50.00'), share: '0.2000', categories: 1 },
    ...overrides,
  };
}

export function aSpendingByCategory(
  overrides: Partial<SpendingByCategoryResponse> = {},
): SpendingByCategory {
  return toSpendingByCategory(aSpendingByCategoryResponse(overrides));
}

/** `GET /v1/search?q=...` com um item de cada grupo (o snippet traz marcação de propósito: é texto puro). */
export function aSearchResultsResponse(
  overrides: Partial<SearchResultsResponse> = {},
): SearchResultsResponse {
  return {
    q: 'mercado',
    transactions: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        description: 'Mercado do bairro',
        date: '2026-10-09',
        amount: brl('87.30'),
        type: 'EXPENSE',
        category: { id: '8a3c6b10-5e2f-4d7a-9b41-c0d1e2f3a4b5', name: 'Alimentação' },
        account: { id: '22222222-2222-4222-8222-222222222222', name: 'Nubank' },
      },
    ],
    accounts: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Conta Mercado',
        institution: 'Banco Exemplo',
        type: 'CHECKING',
        status: 'ARCHIVED',
      },
    ],
    categories: [
      {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Mercado',
        kind: 'EXPENSE',
        archived: false,
      },
    ],
    cards: [
      {
        id: '44444444-4444-4444-8444-444444444444',
        name: 'Cartão Mercado',
        institution: null,
        status: 'ACTIVE',
      },
    ],
    notes: [
      {
        id: '55555555-5555-4555-8555-555555555555',
        title: 'Lista de mercado',
        path: 'casa/lista-de-mercado.md',
        snippet: '<b>Comprar</b> leite **e** pão <img src=x onerror=alert(1)>',
      },
    ],
    truncated: [],
    ...overrides,
  };
}

export function aSearchResults(overrides: Partial<SearchResultsResponse> = {}): SearchResults {
  return toSearchResults(aSearchResultsResponse(overrides));
}

/** Porta falsa dos relatórios: guarda as chamadas e devolve o que o teste configurar. */
export class ReportsGatewayStub extends ReportsGateway {
  readonly isDemo = false;
  readonly periods: ReportPeriod[] = [];
  readonly months: string[] = [];
  incomeExpensesResult: (period: ReportPeriod) => Observable<IncomeExpenseSeries> = (period) =>
    of(anIncomeExpenseSeries({ period }));
  spendingResult: (month: string) => Observable<SpendingByCategory> = () =>
    of(aSpendingByCategory());

  incomeExpenses(period: ReportPeriod): Observable<IncomeExpenseSeries> {
    this.periods.push(period);
    return this.incomeExpensesResult(period);
  }

  spendingByCategory(month: string): Observable<SpendingByCategory> {
    this.months.push(month);
    return this.spendingResult(month);
  }
}

export function provideReportsStub(
  stub: ReportsGatewayStub = new ReportsGatewayStub(),
): Provider[] {
  return [{ provide: ReportsGateway, useValue: stub }];
}

/** Porta falsa da busca global. */
export class SearchGatewayStub extends SearchGateway {
  readonly queries: string[] = [];
  result: (q: string) => Observable<SearchResults> = (q) => of(aSearchResults({ q }));

  search(q: string): Observable<SearchResults> {
    this.queries.push(q);
    return this.result(q);
  }
}

export function provideSearchStub(stub: SearchGatewayStub = new SearchGatewayStub()): Provider[] {
  return [{ provide: SearchGateway, useValue: stub }];
}
