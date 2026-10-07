import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import {
  CATEGORY_LIMIT,
  CategorySpendingFacade,
} from '~/modules/reports/core/facades/category-spending.facade';
import { aProblem } from '~/testing/accounts-testing';
import {
  aSpendingByCategory,
  provideReportsStub,
  ReportsGatewayStub,
} from '~/testing/reports-testing';
import { ProblemError } from '~/util/api/problem';

function setup(stub = new ReportsGatewayStub()) {
  TestBed.configureTestingModule({ providers: [provideReportsStub(stub), CategorySpendingFacade] });
  return { stub, facade: TestBed.inject(CategorySpendingFacade) };
}

describe('CategorySpendingFacade', () => {
  it('Dado o relatório, então repassa itens, "Outras", total e base como vieram', () => {
    const { facade, stub } = setup();

    facade.load('2026-10');

    expect(stub.months).toEqual(['2026-10']);
    expect(CATEGORY_LIMIT).toBe(5);
    const data = facade.data();
    expect(facade.state().status).toBe('ready');
    expect(data?.total.amount).toBe('250.00');
    expect(data?.base.amount).toBe('250.00');
    expect(data?.items[0]?.share).toBe('0.8000');
    expect(data?.other).toMatchObject({ categories: 1, share: '0.2000' });
  });

  it('Dado sem consumo (itens vazios e other nulo), então o estado é vazio', () => {
    const stub = new ReportsGatewayStub();
    stub.spendingResult = () => of(aSpendingByCategory({ items: [], other: null }));
    const { facade } = setup(stub);

    facade.load('2026-10');

    expect(facade.state().status).toBe('empty');
  });

  it('Dado só "Outras" (itens vazios), então ainda há o que mostrar', () => {
    const stub = new ReportsGatewayStub();
    stub.spendingResult = () => of(aSpendingByCategory({ items: [] }));
    const { facade } = setup(stub);

    facade.load('2026-10');

    expect(facade.state().status).toBe('ready');
  });

  it('Dado erro, então o estado é erro e "tentar de novo" repete o mesmo mês', () => {
    const stub = new ReportsGatewayStub();
    stub.spendingResult = () => throwError(() => new ProblemError(aProblem(0, 'NETWORK')));
    const { facade } = setup(stub);
    facade.load('2026-10');
    expect(facade.state().status).toBe('error');

    stub.spendingResult = () => of(aSpendingByCategory());
    facade.retry();

    expect(stub.months).toEqual(['2026-10', '2026-10']);
    expect(facade.state().status).toBe('ready');
  });
});
