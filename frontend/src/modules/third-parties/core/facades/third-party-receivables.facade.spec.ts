import { TestBed } from '@angular/core/testing';
import { NEVER, of } from 'rxjs';

import { ThirdPartyReceivablesFacade } from '~/modules/third-parties/core/facades/third-party-receivables.facade';
import { failWith } from '~/testing/accounts-testing';
import {
  aReceivables,
  anEmptyReceivables,
  ThirdPartiesGatewayStub,
  provideThirdPartiesStub,
} from '~/testing/third-parties-testing';

function setup(stub = new ThirdPartiesGatewayStub()) {
  TestBed.configureTestingModule({
    providers: [provideThirdPartiesStub(stub), ThirdPartyReceivablesFacade],
  });
  return { stub, facade: TestBed.inject(ThirdPartyReceivablesFacade) };
}

describe('ThirdPartyReceivablesFacade', () => {
  it('Dado valores a receber, então o estado é pronto com os totais do servidor, sem conta no front', () => {
    const { facade, stub } = setup();

    facade.load(null);

    expect(stub.gets).toEqual([null]);
    expect(facade.state().status).toBe('ready');
    expect(facade.data()?.pending.amount).toBe('700.00');
    expect(facade.data()?.month.personalNet.amount).toBe('3100.00');
  });

  it('Dado outro mês, então ele vai na consulta e fica guardado', () => {
    const { facade, stub } = setup();

    facade.load('2026-09');

    expect(stub.gets).toEqual(['2026-09']);
    expect(facade.month()).toBe('2026-09');
  });

  it('Dado ninguém a receber e mês sem gasto, então o estado é vazio', () => {
    const stub = new ThirdPartiesGatewayStub();
    stub.receivables$ = of(anEmptyReceivables());
    const { facade } = setup(stub);

    facade.load(null);

    expect(facade.state().status).toBe('empty');
  });

  it('Dado ninguém a receber mas gasto bruto no mês, então segue pronto para mostrar o bloco do mês', () => {
    const stub = new ThirdPartiesGatewayStub();
    stub.receivables$ = of(aReceivables({ people: [] }));
    const { facade } = setup(stub);

    facade.load(null);

    expect(facade.state().status).toBe('ready');
  });

  it('Dado carregando, então o estado é carregando', () => {
    const stub = new ThirdPartiesGatewayStub();
    stub.receivables$ = NEVER;
    const { facade } = setup(stub);

    facade.load(null);

    expect(facade.state().status).toBe('loading');
  });

  it('Dado falha de rede, então o estado é erro tipado e tentar de novo recarrega', () => {
    const stub = new ThirdPartiesGatewayStub();
    stub.receivables$ = failWith(0, 'NETWORK');
    const { facade } = setup(stub);

    facade.load(null);
    expect(facade.error()).toMatchObject({ status: 0 });

    stub.receivables$ = null;
    facade.load();
    expect(facade.state().status).toBe('ready');
  });
});
