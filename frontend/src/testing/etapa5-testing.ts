import { Provider } from '@angular/core';
import { Observable, of } from 'rxjs';

import { ExportsGateway } from '~/modules/exports/core/interfaces/exports.gateway';
import type { DownloadedFile, TransactionsExportQuery } from '~/modules/exports/core/types/export';
import { MonthlySummaryGateway } from '~/modules/monthly-summary/core/interfaces/monthly-summary.gateway';
import type { MonthlySummary } from '~/modules/monthly-summary/core/types/monthly-summary';
import type { MonthlySummaryResponse } from '~/modules/monthly-summary/infra/responses/monthly-summary.response';
import { ProjectionsGateway } from '~/modules/projections/core/interfaces/projections.gateway';
import type { Projection, ProjectionQuery } from '~/modules/projections/core/types/projection';
import type { ProjectionResponse } from '~/modules/projections/infra/responses/projection.response';
import { brl } from '~/testing/accounts-testing';

const r = (amount: string) => ({ amount, currency: 'BRL' as const });

/** O cenário de T95: outubro/2026 (mês corrente, parcial) com o setembro de comparação. */
export function aSummary(overrides: Partial<MonthlySummary> = {}): MonthlySummary {
  return {
    competence: '2026-10',
    partial: true,
    isProjection: false,
    income: brl('3000.00'),
    expenses: brl('250.00'),
    investments: brl('10000.00'),
    net: brl('2750.00'),
    savingsRate: '0.9167',
    largestCategory: { category: { id: 'cat-tech', name: 'Tecnologia' }, amount: brl('200.00') },
    largestExpense: {
      transactionId: 'tx-notebook',
      debtId: null,
      description: 'Notebook',
      category: { id: 'cat-tech', name: 'Tecnologia' },
      date: '2026-10-10',
      amount: brl('200.00'),
      installmentNumber: 1,
      installmentTotal: 6,
    },
    card: { consumption: brl('200.00'), outstanding: brl('200.00') },
    futureInstallments: brl('1000.00'),
    comparison: {
      previousMonth: {
        competence: '2026-09',
        income: brl('3000.00'),
        expenses: brl('150.00'),
        investments: brl('0.00'),
        net: brl('2850.00'),
        savingsRate: '0.9500',
      },
      incomeDelta: { amount: brl('0.00'), percent: '0.0000' },
      expensesDelta: { amount: brl('100.00'), percent: '0.6667' },
      investmentsDelta: { amount: brl('10000.00'), percent: null },
      netDelta: { amount: brl('-100.00'), percent: '-0.0351' },
      savingsRateDelta: '-0.0333',
    },
    ...overrides,
  };
}

export function aSummaryResponse(
  overrides: Partial<MonthlySummaryResponse> = {},
): MonthlySummaryResponse {
  return {
    competence: '2026-10',
    partial: true,
    isProjection: false,
    income: r('3000.00'),
    expenses: r('250.00'),
    investments: r('10000.00'),
    net: r('2750.00'),
    savingsRate: '0.9167',
    largestCategory: { category: { id: 'cat-tech', name: 'Tecnologia' }, amount: r('200.00') },
    largestExpense: {
      transactionId: 'tx-notebook',
      debtId: null,
      description: 'Notebook',
      category: { id: 'cat-tech', name: 'Tecnologia' },
      date: '2026-10-10',
      amount: r('200.00'),
      installmentNumber: 1,
      installmentTotal: 6,
    },
    card: { consumption: r('200.00'), outstanding: r('200.00') },
    futureInstallments: r('1000.00'),
    comparison: {
      previousMonth: {
        competence: '2026-09',
        income: r('3000.00'),
        expenses: r('150.00'),
        investments: r('0.00'),
        net: r('2850.00'),
        savingsRate: '0.9500',
      },
      incomeDelta: { amount: r('0.00'), percent: '0.0000' },
      expensesDelta: { amount: r('100.00'), percent: '0.6667' },
      investmentsDelta: { amount: r('10000.00'), percent: null },
      netDelta: { amount: r('-100.00'), percent: '-0.0351' },
      savingsRateDelta: '-0.0333',
    },
    ...overrides,
  };
}

export class MonthlySummaryGatewayStub extends MonthlySummaryGateway {
  readonly months: string[] = [];
  result: ((month: string) => Observable<MonthlySummary>) | null = null;

  /** O resumo padrão do mês (sem passar pelo `result`). */
  resultOf(month: string): Observable<MonthlySummary> {
    return of(aSummary({ competence: month }));
  }

  get(month: string): Observable<MonthlySummary> {
    this.months.push(month);
    return this.result ? this.result(month) : this.resultOf(month);
  }
}

export function provideMonthlySummaryStub(
  stub: MonthlySummaryGatewayStub = new MonthlySummaryGatewayStub(),
): Provider[] {
  return [{ provide: MonthlySummaryGateway, useValue: stub }];
}

/** O cenário de T96 (M6): nov/26 a abr/27, com a meta de 8.500,00 só como informação. */
export function aProjection(overrides: Partial<Projection> = {}): Projection {
  return {
    isProjection: true,
    horizon: 'M6',
    asOf: '2026-10-10',
    startingBalance: brl('20000.00'),
    series: [
      {
        competence: '2026-10',
        periodEnd: '2026-10-31',
        inflows: brl('0.00'),
        outflows: brl('0.00'),
        balance: brl('20000.00'),
      },
      {
        competence: '2026-11',
        periodEnd: '2026-11-30',
        inflows: brl('3000.00'),
        outflows: brl('1402.00'),
        balance: brl('21598.00'),
      },
      {
        competence: '2026-12',
        periodEnd: '2026-12-31',
        inflows: brl('3000.00'),
        outflows: brl('1521.00'),
        balance: brl('23077.00'),
      },
    ],
    assumptions: [
      'ACTIVE_RECURRENCES',
      'REGISTERED_INVOICES_AND_INSTALLMENTS',
      'DEBTS_WITH_EXPECTED_DATE',
      'NO_NEW_SPENDING_TREND',
    ],
    goals: {
      reserved: brl('8500.00'),
      items: [
        {
          goalId: 'goal-1',
          name: 'Reserva de emergência',
          current: brl('8500.00'),
          target: brl('20000.00'),
        },
      ],
    },
    trend: null,
    ...overrides,
  };
}

export function aProjectionResponse(
  overrides: Partial<ProjectionResponse> = {},
): ProjectionResponse {
  return {
    isProjection: true,
    horizon: 'M6',
    asOf: '2026-10-10',
    startingBalance: r('20000.00'),
    series: [
      {
        competence: '2026-11',
        periodEnd: '2026-11-30',
        inflows: r('3000.00'),
        outflows: r('1402.00'),
        balance: r('21598.00'),
      },
    ],
    assumptions: ['ACTIVE_RECURRENCES'],
    goals: { reserved: r('8500.00'), items: [] },
    ...overrides,
  };
}

export class ProjectionsGatewayStub extends ProjectionsGateway {
  readonly queries: ProjectionQuery[] = [];
  result: ((query: ProjectionQuery) => Observable<Projection>) | null = null;

  /** Uma projeção pronta do horizonte (com série e tendência opcionais). */
  fast(
    horizon: Projection['horizon'],
    series?: Projection['series'],
    trend?: Projection['trend'],
  ): Observable<Projection> {
    return of(
      aProjection({
        horizon,
        ...(series ? { series } : {}),
        ...(trend ? { trend } : {}),
      }),
    );
  }

  get(query: ProjectionQuery): Observable<Projection> {
    this.queries.push(query);
    return this.result ? this.result(query) : this.fast(query.horizon);
  }
}

export function provideProjectionsStub(
  stub: ProjectionsGatewayStub = new ProjectionsGatewayStub(),
): Provider[] {
  return [{ provide: ProjectionsGateway, useValue: stub }];
}

export function aFile(overrides: Partial<DownloadedFile> = {}): DownloadedFile {
  return {
    blob: new Blob(['﻿data;tipo\r\n'], { type: 'text/csv' }),
    filename: 'moneylog-transactions-2026-10-01_2026-10-31.csv',
    ...overrides,
  };
}

export class ExportsGatewayStub extends ExportsGateway {
  readonly csvQueries: TransactionsExportQuery[] = [];
  backups = 0;
  csv$: Observable<DownloadedFile> | null = null;
  backup$: Observable<DownloadedFile> | null = null;

  transactionsCsv(query: TransactionsExportQuery): Observable<DownloadedFile> {
    this.csvQueries.push(query);
    return this.csv$ ?? of(aFile());
  }

  backup(): Observable<DownloadedFile> {
    this.backups += 1;
    return (
      this.backup$ ??
      of(
        aFile({
          blob: new Blob(['{"schemaVersion":1}'], { type: 'application/json' }),
          filename: 'moneylog-backup-2026-10-10.json',
        }),
      )
    );
  }
}

export function provideExportsStub(
  stub: ExportsGatewayStub = new ExportsGatewayStub(),
): Provider[] {
  return [{ provide: ExportsGateway, useValue: stub }];
}
