import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { GoalMetricValueFacade } from '~/modules/goals/core/facades/goal-metric-value.facade';
import { brl, failWith } from '~/testing/accounts-testing';
import { GoalsGatewayStub, provideGoalsStub } from '~/testing/goals-testing';

function setup(gateway = new GoalsGatewayStub()) {
  TestBed.configureTestingModule({
    providers: [provideGoalsStub(gateway), GoalMetricValueFacade],
  });
  return { gateway, facade: TestBed.inject(GoalMetricValueFacade) };
}

describe('GoalMetricValueFacade', () => {
  it('Dado uma medida, então expõe o valor que o servidor devolveu, sem calcular', () => {
    const gateway = new GoalsGatewayStub();
    gateway.metricValues = { TOTAL_DEBT: brl('8850.00') };
    const { facade } = setup(gateway);

    facade.load('TOTAL_DEBT');

    expect(facade.state().status).toBe('ready');
    expect(facade.value()).toEqual(brl('8850.00'));
  });

  it('Dado a leitura em andamento, então o estado é carregando', () => {
    const gateway = new GoalsGatewayStub();
    gateway.metricValue$ = new Subject();
    const { facade } = setup(gateway);

    facade.load('CARD_DEBT');

    expect(facade.state().status).toBe('loading');
    expect(facade.value()).toBeNull();
  });

  it('Dado falha, então o estado é erro com o problema e tentar de novo relê', () => {
    const gateway = new GoalsGatewayStub();
    gateway.metricValue$ = failWith(500, 'INTERNAL_ERROR');
    const { facade } = setup(gateway);

    facade.load('TOTAL_DEBT');
    expect(facade.state()).toMatchObject({ status: 'error' });

    gateway.metricValue$ = null;
    gateway.metricValues = { TOTAL_DEBT: brl('1.00') };
    facade.load('TOTAL_DEBT');
    expect(facade.value()).toEqual(brl('1.00'));
  });

  it('Dado null, então limpa para ocioso', () => {
    const { facade } = setup();
    facade.load('TOTAL_DEBT');

    facade.load(null);

    expect(facade.state().status).toBe('idle');
  });
});
