import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { GoalDetailFacade } from '~/modules/goals/core/facades/goal-detail.facade';
import type { Goal } from '~/modules/goals/core/types/goal';
import { failWith } from '~/testing/accounts-testing';
import { aGoal, GoalsGatewayStub, provideGoalsStub } from '~/testing/goals-testing';

function setup(gateway = new GoalsGatewayStub()) {
  TestBed.configureTestingModule({ providers: [provideGoalsStub(gateway), GoalDetailFacade] });
  return { gateway, facade: TestBed.inject(GoalDetailFacade) };
}

describe('GoalDetailFacade', () => {
  it('Dado carregar, então expõe a meta do backend', () => {
    const { facade } = setup();

    facade.load('goal-1');

    expect(facade.goal()).toMatchObject({ id: 'goal-1', progress: '0.4250' });
  });

  it('Dado 404, então o estado é erro com o problema tipado', () => {
    const gateway = new GoalsGatewayStub();
    gateway.getResult = failWith(404, 'GOAL_NOT_FOUND');
    const { facade } = setup(gateway);

    facade.load('x');

    expect(facade.error()).toMatchObject({ status: 404, code: 'GOAL_NOT_FOUND' });
  });

  it('Dado arquivar, então a meta da resposta vira o estado e o evento sai', () => {
    const { facade } = setup();
    const done: string[] = [];
    facade.done$.subscribe(({ kind, goal }) => done.push(`${kind}:${goal.status}`));
    facade.load('goal-1');

    facade.archive('goal-1');

    expect(facade.goal()?.status).toBe('ARCHIVED');
    expect(done).toEqual(['archive:ARCHIVED']);
  });

  it('Dado desarquivar, então volta a ativa pela resposta', () => {
    const { facade } = setup();
    facade.load('goal-1');

    facade.unarchive('goal-1');

    expect(facade.goal()?.status).toBe('ACTIVE');
  });

  it('Dado clique duplo em arquivar, então uma requisição só', () => {
    const gateway = new GoalsGatewayStub();
    gateway.next = new Subject<Goal>();
    const { facade } = setup(gateway);

    facade.archive('goal-1');
    facade.archive('goal-1');

    expect(gateway.calls.filter((c) => c.startsWith('archive'))).toHaveLength(1);
    expect(facade.busy()).toBe(true);
  });

  it('Dado falha ao arquivar, então guarda o problema e mantém a meta; clearProblem limpa', () => {
    const gateway = new GoalsGatewayStub();
    const { facade } = setup(gateway);
    facade.load('goal-1');
    gateway.next = failWith(422, 'GOAL_STATE_INCONSISTENT');

    facade.archive('goal-1');

    expect(facade.problem()?.code).toBe('GOAL_STATE_INCONSISTENT');
    expect(facade.goal()?.status).toBe('ACTIVE');
    facade.clearProblem();
    expect(facade.problem()).toBeNull();
  });

  it('Dado GOAL_ALREADY_ARCHIVED (o clique anterior deu certo), então relê a meta e é sucesso silencioso', () => {
    const gateway = new GoalsGatewayStub();
    gateway.goals = [aGoal({ status: 'ARCHIVED', version: 3 })];
    const { facade } = setup(gateway);
    facade.load('goal-1');
    const done: unknown[] = [];
    facade.done$.subscribe((event) => done.push(event));
    gateway.next = failWith(422, 'GOAL_ALREADY_ARCHIVED');

    facade.archive('goal-1');

    expect(facade.problem()).toBeNull();
    expect(facade.goal()?.status).toBe('ARCHIVED');
    expect(done).toEqual([]);
    expect(facade.busy()).toBe(false);
  });

  it('Dado GOAL_NOT_ARCHIVED ao desarquivar, então também é sucesso silencioso', () => {
    const gateway = new GoalsGatewayStub();
    gateway.goals = [aGoal({ status: 'ACTIVE' })];
    const { facade } = setup(gateway);
    facade.load('goal-1');
    gateway.next = failWith(422, 'GOAL_NOT_ARCHIVED');

    facade.unarchive('goal-1');

    expect(facade.problem()).toBeNull();
    expect(facade.goal()?.status).toBe('ACTIVE');
  });

  it('Dado apply (reserva), então a meta devolvida substitui o estado sem recalcular', () => {
    const { facade } = setup();
    facade.load('goal-1');

    facade.apply(aGoal({ current: { amount: '9500.00', currency: 'BRL' }, progress: '0.4750' }));

    expect(facade.goal()).toMatchObject({ progress: '0.4750' });
    expect(facade.goal()?.current.amount).toBe('9500.00');
  });
});
