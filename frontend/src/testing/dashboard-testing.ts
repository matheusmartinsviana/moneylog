import { provideHttpClient } from '@angular/common/http';
import { EnvironmentProviders, Provider } from '@angular/core';
import { Observable, of } from 'rxjs';

import { DashboardGateway } from '~/modules/dashboard/core/interfaces/dashboard.gateway';
import type { DashboardSummary } from '~/modules/dashboard/core/types/dashboard-summary';
import type { Upcoming } from '~/modules/dashboard/core/types/upcoming';
import { provideDashboard } from '~/modules/dashboard/infra/dashboard.providers';
import { API_MOCKS } from '~/util/api-mocks';
import type { Money } from '~/util/money';

const brl = (amount: string): Money => ({ amount, currency: 'BRL' });

/**
 * Resumo com dados, como o backend devolveria (valores arbitrários, mas com 2 casas e em BRL).
 * Os testes conferem que a tela exibe exatamente estes valores, sem recalcular.
 */
export function aDashboardSummary(overrides: Partial<DashboardSummary> = {}): DashboardSummary {
  return {
    asOf: '2026-10-10',
    isProjection: false,
    hasAccounts: true,
    balances: {
      inAccounts: brl('18900.00'),
      investments: brl('5000.00'),
      available: brl('17617.00'),
      reserved: brl('0.00'),
      committed30d: brl('1283.00'),
      inAccountsChange: {
        previous: brl('17500.00'),
        amount: brl('1400.00'),
        percent: '0.0800',
        since: '2026-09-30',
      },
    },
    committed: {
      d7: brl('1283.00'),
      d30: brl('1283.00'),
      d60: brl('1483.00'),
      d90: brl('1683.00'),
      m6: brl('2283.00'),
      m12: brl('2283.00'),
    },
    projected: {
      d30: brl('29767.00'),
      d90: brl('52517.00'),
      m6: brl('86917.00'),
      m12: brl('155717.00'),
    },
    month: {
      competence: '2026-10',
      income: brl('12000.00'),
      expensesPaid: {
        total: brl('1450.50'),
        byMethod: {
          DEBIT: brl('300.00'),
          PIX: brl('1000.50'),
          CASH: brl('50.00'),
          BOLETO: brl('100.00'),
          TRANSFER: brl('0.00'),
          OTHER: brl('0.00'),
        },
      },
      credit: brl('200.00'),
      refunds: brl('30.00'),
      consumption: brl('1620.50'),
      debtConsumption: null,
      cashFlow: { in: brl('12000.00'), out: brl('2450.50'), net: brl('9549.50') },
      investedNet: brl('1000.00'),
      lent: brl('150.00'),
      received: brl('0.00'),
      net: brl('10379.50'),
    },
    netWorth: {
      accounts: brl('23900.00'),
      receivables: brl('150.00'),
      cardLiabilities: brl('-200.00'),
      payables: brl('-80.00'),
      total: brl('23770.00'),
      cardFutureInstallments: brl('1000.00'),
    },
    ...overrides,
  };
}

/** Próximos compromissos com fatura vencida (com parcela aninhada), dívida a receber e item sem data. */
export function anUpcoming(overrides: Partial<Upcoming> = {}): Upcoming {
  return {
    items: [
      {
        kind: 'INVOICE',
        bucket: 'OVERDUE',
        dueDate: '2026-10-05',
        direction: 'OUT',
        amount: brl('1283.00'),
        label: 'Roxinho',
        refType: 'INVOICE',
        refId: 'inv-1',
        items: [
          {
            kind: 'INSTALLMENT',
            label: 'Notebook',
            installment: { number: 4, total: 10 },
            amount: brl('320.00'),
            informational: true,
          },
        ],
      },
      {
        kind: 'DEBT_RECEIVABLE',
        bucket: 'NEXT_7_DAYS',
        dueDate: '2026-10-15',
        direction: 'IN',
        amount: brl('150.00'),
        label: 'João',
        refType: 'DEBT',
        refId: 'debt-1',
        items: [],
      },
    ],
    undated: [
      {
        kind: 'DEBT_PAYABLE',
        bucket: null,
        dueDate: null,
        direction: 'OUT',
        amount: brl('80.00'),
        label: 'Maria',
        refType: 'DEBT',
        refId: 'debt-2',
        items: [],
      },
    ],
    totals: { out: brl('1363.00'), in: brl('150.00') },
    overdueTruncated: false,
    ...overrides,
  };
}

export function anEmptyUpcoming(): Upcoming {
  return {
    items: [],
    undated: [],
    totals: { out: brl('0.00'), in: brl('0.00') },
    overdueTruncated: false,
  };
}

/** Porta falsa e configurável: cada método devolve o observable informado. */
export class DashboardGatewayStub extends DashboardGateway {
  summary$: Observable<DashboardSummary> = of(aDashboardSummary());
  upcoming$: Observable<Upcoming> = of(anUpcoming());

  getSummary(): Observable<DashboardSummary> {
    return this.summary$;
  }

  getUpcoming(): Observable<Upcoming> {
    return this.upcoming$;
  }
}

export function provideDashboardStub(stub: DashboardGatewayStub): Provider[] {
  return [{ provide: DashboardGateway, useValue: stub }];
}

/** A mesma ligação do bootstrap (porta → infra em modo mock), para testar o app de ponta a ponta. */
export function provideDashboardMock(): (Provider | EnvironmentProviders)[] {
  return [provideHttpClient(), { provide: API_MOCKS, useValue: true }, provideDashboard()];
}
