import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { GoalReserveFacade } from '~/modules/goals/core/facades/goal-reserve.facade';
import type { Goal, ReservationInput } from '~/modules/goals/core/types/goal';
import { failWith } from '~/testing/accounts-testing';
import { aGoal, GoalsGatewayStub, provideGoalsStub } from '~/testing/goals-testing';

const INPUT: ReservationInput = {
  kind: 'reserve',
  accountId: 'acc-1',
  amount: '8500.00',
  date: '2026-10-10',
  note: null,
};

function setup(gateway = new GoalsGatewayStub()) {
  TestBed.configureTestingModule({ providers: [provideGoalsStub(gateway), GoalReserveFacade] });
  return { gateway, facade: TestBed.inject(GoalReserveFacade) };
}

describe('GoalReserveFacade', () => {
  it('Dado reservar, então envia uma Idempotency-Key e emite a meta da resposta', () => {
    const { facade, gateway } = setup();
    const reserved: string[] = [];
    facade.reserved$.subscribe((goal) => reserved.push(goal.current?.amount ?? ''));

    facade.reserve('goal-1', INPUT);

    expect(gateway.reservations[0]?.key).toBeTruthy();
    expect(reserved).toEqual(['8500.00']);
  });

  it('Dado o clique duplo, então uma requisição só', () => {
    const gateway = new GoalsGatewayStub();
    gateway.reserve$ = new Subject<Goal>();
    const { facade } = setup(gateway);

    facade.reserve('goal-1', INPUT);
    facade.reserve('goal-1', INPUT);

    expect(gateway.reservations).toHaveLength(1);
    expect(facade.saving()).toBe(true);
  });

  it.each([
    ['rede', 0, 'NETWORK'],
    ['5xx', 503, 'INTERNAL_ERROR'],
    ['409 CONFLICT', 409, 'CONFLICT'],
  ])(
    'Dado falha ambígua (%s), então o "tentar de novo" reenvia com a MESMA chave',
    (_, status, code) => {
      const gateway = new GoalsGatewayStub();
      gateway.reserve$ = failWith(status, code);
      const { facade } = setup(gateway);

      facade.reserve('goal-1', INPUT);
      expect(facade.canRetry()).toBe(true);
      gateway.reserve$ = null;
      facade.retry();

      expect(gateway.reservations).toHaveLength(2);
      expect(gateway.reservations[1]?.key).toBe(gateway.reservations[0]?.key);
      expect(facade.problem()).toBeNull();
    },
  );

  it('Dado falha ambígua e o mesmo envio de novo, então reusa a chave; dados diferentes, chave nova', () => {
    const gateway = new GoalsGatewayStub();
    gateway.reserve$ = failWith(0, 'NETWORK');
    const { facade } = setup(gateway);

    facade.reserve('goal-1', INPUT);
    facade.reserve('goal-1', { ...INPUT });
    facade.reserve('goal-1', { ...INPUT, amount: '9000.00' });

    expect(gateway.reservations[1]?.key).toBe(gateway.reservations[0]?.key);
    expect(gateway.reservations[2]?.key).not.toBe(gateway.reservations[0]?.key);
  });

  it('Dado liberar acima do reservado (422), então não é retentável e a chave seguinte é nova', () => {
    const gateway = new GoalsGatewayStub();
    gateway.reserve$ = failWith(422, 'GOAL_RELEASE_EXCEEDS_RESERVED');
    const { facade } = setup(gateway);

    facade.reserve('goal-1', { ...INPUT, kind: 'release' });
    expect(facade.canRetry()).toBe(false);
    expect(facade.problem()?.code).toBe('GOAL_RELEASE_EXCEEDS_RESERVED');
    facade.reserve('goal-1', { ...INPUT, kind: 'release' });

    expect(gateway.reservations[1]?.key).not.toBe(gateway.reservations[0]?.key);
  });

  it('Dado reabrir a folha, então a falha ambígua da mesma meta continua e a de outra é descartada', () => {
    const gateway = new GoalsGatewayStub();
    gateway.reserve$ = failWith(0, 'NETWORK');
    const { facade } = setup(gateway);
    facade.reserve('goal-1', INPUT);

    facade.reopen('goal-1');
    expect(facade.canRetry()).toBe(true);

    facade.reopen('goal-2');
    expect(facade.problem()).toBeNull();
    expect(aGoal().id).toBe('goal-1');
  });
});
