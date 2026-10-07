import { TestBed } from '@angular/core/testing';

import { PersonDetailFacade } from '~/modules/people/core/facades/person-detail.facade';
import { failWith } from '~/testing/accounts-testing';
import { aPersonDetail, PeopleGatewayStub, providePeopleStub } from '~/testing/people-testing';

function setup(gateway = new PeopleGatewayStub()) {
  TestBed.configureTestingModule({ providers: [providePeopleStub(gateway), PersonDetailFacade] });
  return { gateway, facade: TestBed.inject(PersonDetailFacade) };
}

describe('PersonDetailFacade', () => {
  it('Dado a pessoa, então expõe o detalhe com o saldo e as dívidas do backend', () => {
    const { facade } = setup();

    facade.load('person-1');

    expect(facade.person()?.net.amount).toBe('150.00');
    expect(facade.person()?.debts).toHaveLength(1);
  });

  it('Dado 404, então o estado é notFound', () => {
    const gateway = new PeopleGatewayStub();
    gateway.getResult = failWith(404, 'PERSON_NOT_FOUND');
    const { facade } = setup(gateway);

    facade.load('x');

    expect(facade.state().status).toBe('notFound');
  });

  it('Dado erro de rede, então o estado é error', () => {
    const gateway = new PeopleGatewayStub();
    gateway.getResult = failWith(0, 'NETWORK');
    const { facade } = setup(gateway);

    facade.load('x');

    expect(facade.state().status).toBe('error');
  });

  it('Dado arquivar, então chama o backend e recarrega o detalhe', () => {
    const gateway = new PeopleGatewayStub();
    gateway.detail = aPersonDetail({ archived: true });
    const { facade } = setup(gateway);
    facade.load('person-1');

    facade.archive('person-1');

    expect(gateway.calls).toEqual(['get:person-1', 'archive:person-1', 'get:person-1']);
    expect(facade.person()?.archived).toBe(true);
  });

  it('Dado falha ao arquivar, então guarda o problema', () => {
    const gateway = new PeopleGatewayStub();
    gateway.next = failWith(422, 'PERSON_ALREADY_ARCHIVED');
    const { facade } = setup(gateway);
    facade.load('person-1');

    facade.archive('person-1');

    expect(facade.problem()).toMatchObject({ code: 'PERSON_ALREADY_ARCHIVED' });
  });

  it('Dado um refresh silencioso que falha, então a tela continua pronta com o último dado e um aviso', () => {
    const { facade, gateway } = setup();
    facade.load('person-1');
    gateway.getResult = failWith(500, 'INTERNAL_ERROR');

    facade.refresh('person-1');

    expect(facade.state().status).toBe('ready');
    expect(facade.person()?.net.amount).toBe('150.00');
    expect(facade.refreshProblem()).toMatchObject({ status: 500 });
  });

  it('Dado o aviso de refresh, quando tento de novo e dá certo, então o aviso some', () => {
    const { facade, gateway } = setup();
    facade.load('person-1');
    gateway.getResult = failWith(0, 'NETWORK');
    facade.refresh('person-1');
    gateway.getResult = null;

    facade.retryRefresh();

    expect(facade.refreshProblem()).toBeNull();
    expect(facade.state().status).toBe('ready');
  });
});
