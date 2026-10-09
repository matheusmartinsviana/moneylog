import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';

import { GoalDetailFacade } from '~/modules/goals/core/facades/goal-detail.facade';
import type { Goal } from '~/modules/goals/core/types/goal';
import { failWith } from '~/testing/accounts-testing';
import { aGoal, aMetricGoal, GoalsGatewayStub, provideGoalsStub } from '~/testing/goals-testing';

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
    expect(facade.goal()?.current?.amount).toBe('9500.00');
  });

  it('Dado "Cadastrei tudo", então a meta devolvida pelo servidor vira o estado e o evento sai', () => {
    const { facade, gateway } = setup();
    const done: string[] = [];
    facade.done$.subscribe(({ kind, goal }) => done.push(`${kind}:${goal.baselineSet}`));
    facade.load('goal-1');

    facade.baseline('goal-1');

    expect(gateway.calls).toContain('baseline:goal-1');
    expect(done).toEqual(['baseline:true']);
    expect(facade.goal()).toMatchObject({ kind: 'DEBT_PAYOFF', baselineSet: true });
  });

  it('Dado DEBT_PAYOFF_NOTHING_TO_BASELINE, então o problema fica disponível e a meta não muda', () => {
    const { facade, gateway } = setup();
    facade.load('goal-1');
    gateway.next = failWith(422, 'DEBT_PAYOFF_NOTHING_TO_BASELINE');

    facade.baseline('goal-1');

    expect(facade.problem()).toMatchObject({ code: 'DEBT_PAYOFF_NOTHING_TO_BASELINE' });
    expect(facade.goal()).toMatchObject({ kind: 'SAVINGS' });
  });
  describe('plano declarado', () => {
    it('Dado salvar o plano, então o PUT reenvia os valores atuais da meta e a resposta vira o estado', () => {
      const { facade, gateway } = setup();
      const done: string[] = [];
      facade.planDone$.subscribe((kind) => done.push(kind));
      gateway.next = of(aMetricGoal({ planNote: 'Pagar em dia' }));
      facade.apply(aMetricGoal({ version: 3 }));

      facade.savePlanNote('Pagar em dia');

      expect(gateway.updates[0]).toMatchObject({
        kind: 'METRIC',
        name: '',
        target: '4000.00',
        deadline: '2027-04-30',
        planNote: 'Pagar em dia',
        version: 3,
      });
      expect(facade.goal()?.planNote).toBe('Pagar em dia');
      expect(done).toEqual(['note']);
    });

    it('Dado ações e check-in, então chamam a porta em ordem e cada resposta vira o estado', () => {
      const { facade, gateway } = setup();
      facade.load('goal-1');

      facade.addAction({ title: 'Revisar', frequency: 'WEEKLY' });
      facade.updateAction('a-1', { title: 'Revisar tudo', frequency: 'MONTHLY' });
      facade.checkIn('a-1', '2026-10', true);
      facade.checkIn('a-1', '2026-10', false);
      facade.removeAction('a-1');

      expect(gateway.actionCalls).toEqual([
        'add:goal-1:Revisar:WEEKLY',
        'update:goal-1:a-1:Revisar tudo:MONTHLY',
        'check-in:goal-1:a-1:2026-10:true',
        'check-in:goal-1:a-1:2026-10:false',
        'delete:goal-1:a-1',
      ]);
      expect(facade.planBusy()).toBe(false);
    });

    it('Dado falha no limite de ações, então mostra o código, relê a meta do servidor e libera a fila', () => {
      const { facade, gateway } = setup();
      facade.load('goal-1');
      gateway.next = failWith(422, 'GOAL_ACTION_LIMIT');
      gateway.calls.length = 0;

      facade.addAction({ title: 'Mais uma', frequency: 'MONTHLY' });

      expect(facade.planProblem()).toMatchObject({ code: 'GOAL_ACTION_LIMIT' });
      expect(gateway.calls).toContain('get:goal-1');
      expect(facade.planBusy()).toBe(false);

      facade.clearPlanProblem();
      expect(facade.planProblem()).toBeNull();
    });
  });

  describe('destaque da Home', () => {
    it('Dado marcar, então a meta da resposta vira o estado e o evento sai', () => {
      const { facade, gateway } = setup();
      const done: boolean[] = [];
      facade.featuredDone$.subscribe((goal) => done.push(goal.featured));
      facade.load('goal-1');

      facade.setFeatured('goal-1', true);

      expect(gateway.calls).toContain('featured:goal-1:true');
      expect(facade.goal()?.featured).toBe(true);
      expect(done).toEqual([true]);
      expect(facade.featuredBusy()).toBe(false);
    });

    it('Dado falha (meta arquivada), então guarda o motivo e relê a meta', () => {
      const gateway = new GoalsGatewayStub();
      const { facade } = setup(gateway);
      facade.load('goal-1');
      gateway.next = failWith(422, 'GOAL_ARCHIVED');

      facade.setFeatured('goal-1', true);

      expect(facade.featuredProblem()).toMatchObject({ code: 'GOAL_ARCHIVED' });
      expect(gateway.calls.filter((call) => call === 'get:goal-1')).toHaveLength(2);
      expect(facade.goal()?.featured).toBe(false);
    });
  });
});
