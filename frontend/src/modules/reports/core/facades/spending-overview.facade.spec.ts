import { TestBed } from '@angular/core/testing';
import { NEVER, of, Subject, throwError } from 'rxjs';

import { SpendingOverviewFacade } from '~/modules/reports/core/facades/spending-overview.facade';
import type { IncomeExpenseSeries } from '~/modules/reports/core/types/reports';
import { aProblem } from '~/testing/accounts-testing';
import {
  anIncomeExpenseSeries,
  provideReportsStub,
  ReportsGatewayStub,
} from '~/testing/reports-testing';
import { LEDGER_GATE, LedgerGate } from '~/util/api/ledger-gate';
import { ProblemError } from '~/util/api/problem';

function setup(stub = new ReportsGatewayStub(), gate?: LedgerGate) {
  TestBed.configureTestingModule({
    providers: [
      provideReportsStub(stub),
      SpendingOverviewFacade,
      ...(gate ? [{ provide: LEDGER_GATE, useValue: gate }] : []),
    ],
  });
  return { stub, facade: TestBed.inject(SpendingOverviewFacade) };
}

describe('SpendingOverviewFacade', () => {
  it('Dado a série do backend, quando carrega, então expõe os pontos e os totais sem tocar neles', () => {
    const { facade, stub } = setup();

    facade.load('D7');

    expect(stub.periods).toEqual(['D7']);
    expect(facade.state().status).toBe('ready');
    const data = facade.data();
    expect(data?.totals.net.amount).toBe('2750.00');
    expect(data?.points[5]?.expenses.amount).toBe('-50.00');
    expect(facade.period()).toBe('D7');
  });

  it('Dado nenhum balde, então o estado é vazio (e a série continua acessível)', () => {
    const stub = new ReportsGatewayStub();
    stub.incomeExpensesResult = () => of(anIncomeExpenseSeries({ points: [] }));
    const { facade } = setup(stub);

    facade.load('M12');

    expect(facade.state().status).toBe('empty');
    expect(facade.data()?.points).toEqual([]);
  });

  it('Dado erro, então o estado é erro com o problema, e "tentar de novo" repete o período', () => {
    const stub = new ReportsGatewayStub();
    stub.incomeExpensesResult = () =>
      throwError(() => new ProblemError(aProblem(500, 'INTERNAL_ERROR')));
    const { facade } = setup(stub);
    facade.load('D30');
    expect(facade.state().status).toBe('error');
    expect(facade.error()?.status).toBe(500);

    stub.incomeExpensesResult = (period) => of(anIncomeExpenseSeries({ period }));
    facade.retry();

    expect(stub.periods).toEqual(['D30', 'D30']);
    expect(facade.state().status).toBe('ready');
  });

  it('Dado troca rápida de período, então só a última resposta vence (a anterior é cancelada)', () => {
    const stub = new ReportsGatewayStub();
    const first = new Subject<IncomeExpenseSeries>();
    const second = new Subject<IncomeExpenseSeries>();
    stub.incomeExpensesResult = (period) => (period === 'D7' ? first : second);
    const { facade } = setup(stub);

    facade.load('D7');
    facade.load('M3');
    expect(first.observed).toBe(false);
    first.next(anIncomeExpenseSeries({ period: 'D7' }));
    expect(facade.state().status).toBe('loading');
    second.next(anIncomeExpenseSeries({ period: 'M3', granularity: 'WEEK' }));

    expect(facade.state().status).toBe('ready');
    expect(facade.data()?.period).toBe('M3');
    expect(facade.period()).toBe('M3');
  });

  it('Dado o porteiro do razão, então a leitura espera vaga (no máximo 2 em voo)', () => {
    const gate = new LedgerGate(1);
    gate.run(NEVER).subscribe();
    const { facade, stub } = setup(undefined, gate);

    facade.load('D30');

    expect(facade.state().status).toBe('loading');
    expect(gate.waiting).toBe(1);
    expect(stub.periods).toEqual(['D30']);
  });
});
