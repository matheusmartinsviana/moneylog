import { TestBed } from '@angular/core/testing';

import { GoalFormFacade } from '~/modules/goals/core/facades/goal-form.facade';
import type { GoalInput } from '~/modules/goals/core/types/goal';
import { failWith } from '~/testing/accounts-testing';
import { aGoal, GoalsGatewayStub, provideGoalsStub } from '~/testing/goals-testing';

const INPUT: GoalInput = {
  name: 'Reserva de emergência',
  target: '20000.00',
  deadline: '2027-12-31',
  priority: 'HIGH',
  description: null,
};

function setup(gateway = new GoalsGatewayStub()) {
  TestBed.configureTestingModule({ providers: [provideGoalsStub(gateway), GoalFormFacade] });
  return { gateway, facade: TestBed.inject(GoalFormFacade) };
}

describe('GoalFormFacade', () => {
  it('Dado criar, então envia uma Idempotency-Key e emite a meta da resposta', () => {
    const { facade, gateway } = setup();
    const saved: string[] = [];
    facade.saved$.subscribe((goal) => saved.push(goal.id));

    facade.save({ kind: 'create', input: INPUT });

    expect(gateway.createKeys).toHaveLength(1);
    expect(saved).toEqual(['goal-new']);
  });

  it('Dado falha de rede e o mesmo corpo, então reusa a chave; corpo novo, chave nova', () => {
    const gateway = new GoalsGatewayStub();
    gateway.next = failWith(0, 'NETWORK');
    const { facade } = setup(gateway);

    facade.save({ kind: 'create', input: INPUT });
    facade.save({ kind: 'create', input: { ...INPUT } });
    facade.save({ kind: 'create', input: { ...INPUT, target: '21000.00' } });

    expect(gateway.createKeys[1]).toBe(gateway.createKeys[0]);
    expect(gateway.createKeys[2]).not.toBe(gateway.createKeys[0]);
  });

  it('Dado 422, então a próxima tentativa tem chave nova e o problema fica tipado', () => {
    const gateway = new GoalsGatewayStub();
    gateway.next = failWith(422, 'GOAL_TARGET_NOT_POSITIVE');
    const { facade } = setup(gateway);

    facade.save({ kind: 'create', input: INPUT });
    expect(facade.problem()?.code).toBe('GOAL_TARGET_NOT_POSITIVE');
    facade.save({ kind: 'create', input: INPUT });

    expect(gateway.createKeys[1]).not.toBe(gateway.createKeys[0]);
  });

  it('Dado editar, então envia a version e não leva chave', () => {
    const { facade, gateway } = setup();

    facade.save({ kind: 'update', id: 'goal-1', input: { ...INPUT, planNote: null, version: 4 } });

    expect(gateway.calls).toContain('update:goal-1:4');
    expect(gateway.createKeys).toHaveLength(0);
  });

  it('Dado carregar, então a meta fica disponível; em erro, some e o estado é erro', () => {
    const gateway = new GoalsGatewayStub();
    const { facade } = setup(gateway);

    facade.load('goal-1');
    expect(facade.goal()?.id).toBe('goal-1');

    gateway.getResult = failWith(404, 'GOAL_NOT_FOUND');
    facade.load('goal-9');
    expect(facade.goal()).toBeNull();
    expect(facade.loadStatus()).toMatchObject({ status: 'error' });
  });

  it('Dado dismissProblem, então a falha some', () => {
    const gateway = new GoalsGatewayStub();
    gateway.next = failWith(409, 'VERSION_CONFLICT');
    const { facade } = setup(gateway);
    facade.save({ kind: 'update', id: 'goal-1', input: { ...INPUT, planNote: null, version: 1 } });

    facade.dismissProblem();

    expect(facade.problem()).toBeNull();
    expect(aGoal().version).toBe(1);
  });
});
