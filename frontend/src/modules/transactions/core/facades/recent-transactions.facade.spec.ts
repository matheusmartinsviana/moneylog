import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import {
  RECENT_PAGE_SIZE,
  RecentTransactionsFacade,
} from '~/modules/transactions/core/facades/recent-transactions.facade';
import { failWith } from '~/testing/accounts-testing';
import {
  aTransaction,
  provideTransactionsStub,
  someTotals,
  TransactionsGatewayStub,
} from '~/testing/transactions-testing';

function setup(stub = new TransactionsGatewayStub()) {
  TestBed.configureTestingModule({
    providers: [provideTransactionsStub(stub), RecentTransactionsFacade],
  });
  return { stub, facade: TestBed.inject(RecentTransactionsFacade) };
}

describe('RecentTransactionsFacade', () => {
  it('Dado o asOf do backend, então pede as 5 mais novas até essa data, só ativas e sem limite inferior', () => {
    const { stub, facade } = setup();

    facade.load('2026-10-10');

    expect(RECENT_PAGE_SIZE).toBe(5);
    expect(stub.listCalls).toHaveLength(1);
    const call = stub.listCalls[0]!;
    expect(call.filters).toMatchObject({ from: null, to: '2026-10-10', status: 'ACTIVE' });
    expect(call.page).toBe(1);
    expect(call.pageSize).toBe(5);
    expect(facade.state().status).toBe('ready');
    expect(facade.data()).toHaveLength(1);
  });

  it('Dado nenhuma movimentação, então o estado é vazio', () => {
    const { stub, facade } = setup();
    stub.list$ = () => of({ items: [], hasNext: false, totals: someTotals(0) });

    facade.load('2026-10-10');

    expect(facade.state().status).toBe('empty');
  });

  it('Dado erro, então o estado é erro e "tentar de novo" repete com o mesmo asOf', () => {
    const { stub, facade } = setup();
    stub.list$ = () => failWith(500, 'INTERNAL_ERROR');
    facade.load('2026-10-10');
    expect(facade.state().status).toBe('error');

    stub.list$ = () => of({ items: [aTransaction()], hasNext: false, totals: someTotals(1) });
    facade.retry();

    expect(stub.listCalls.map((c) => c.filters.to)).toEqual(['2026-10-10', '2026-10-10']);
    expect(facade.state().status).toBe('ready');
  });
});
