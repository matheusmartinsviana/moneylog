import { TestBed } from '@angular/core/testing';
import { NEVER, of } from 'rxjs';

import { DebtOverviewFacade } from '~/modules/debt-overview/core/facades/debt-overview.facade';
import { failWith } from '~/testing/accounts-testing';
import {
  aDebtOverview,
  anEmptyDebtOverview,
  DebtOverviewGatewayStub,
  provideDebtOverviewStub,
} from '~/testing/debt-overview-testing';

function setup(stub = new DebtOverviewGatewayStub()) {
  TestBed.configureTestingModule({
    providers: [provideDebtOverviewStub(stub), DebtOverviewFacade],
  });
  return { stub, facade: TestBed.inject(DebtOverviewFacade) };
}

describe('DebtOverviewFacade', () => {
  it('Dado dados cadastrados, então o estado é pronto com o total do servidor, sem conta no front', () => {
    const { facade, stub } = setup();

    facade.load(12);

    expect(stub.gets).toEqual([12]);
    expect(facade.state().status).toBe('ready');
    expect(facade.data()?.total.amount).toBe('6500.00');
  });

  it('Dado nada cadastrado (hasRecords falso), então o estado é vazio e nunca "sem dívidas"', () => {
    const stub = new DebtOverviewGatewayStub();
    stub.overview$ = of(anEmptyDebtOverview());
    const { facade } = setup(stub);

    facade.load();

    expect(facade.state().status).toBe('empty');
  });

  it('Dado cadastro quitado (total zero com registros), então segue pronto', () => {
    const stub = new DebtOverviewGatewayStub();
    stub.overview$ = of(
      aDebtOverview({ hasRecords: true, total: { amount: '0.00', currency: 'BRL' } }),
    );
    const { facade } = setup(stub);

    facade.load();

    expect(facade.state().status).toBe('ready');
  });

  it('Dado carregando, então o estado é carregando', () => {
    const stub = new DebtOverviewGatewayStub();
    stub.overview$ = NEVER;
    const { facade } = setup(stub);

    facade.load();

    expect(facade.state().status).toBe('loading');
  });

  it('Dado falha de rede, então o estado é erro tipado e tentar de novo recarrega', () => {
    const stub = new DebtOverviewGatewayStub();
    stub.overview$ = failWith(0, 'NETWORK');
    const { facade } = setup(stub);

    facade.load();
    expect(facade.error()).toMatchObject({ status: 0 });

    stub.overview$ = null;
    facade.load();
    expect(facade.state().status).toBe('ready');
  });

  it('Dado outro horizonte, então ele vai na consulta e fica guardado', () => {
    const { facade, stub } = setup();

    facade.load(24);

    expect(stub.gets).toEqual([24]);
    expect(facade.months()).toBe(24);
  });
});
