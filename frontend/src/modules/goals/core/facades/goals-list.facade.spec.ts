import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { GoalsListFacade } from '~/modules/goals/core/facades/goals-list.facade';
import type { Goal } from '~/modules/goals/core/types/goal';
import { failWith } from '~/testing/accounts-testing';
import { aGoal, GoalsGatewayStub, provideGoalsStub } from '~/testing/goals-testing';
import type { Slice } from '~/util/api/slice';

function setup(gateway = new GoalsGatewayStub()) {
  TestBed.configureTestingModule({ providers: [provideGoalsStub(gateway), GoalsListFacade] });
  return { gateway, facade: TestBed.inject(GoalsListFacade) };
}

describe('GoalsListFacade', () => {
  it('Dado nenhuma meta, então o estado é vazio', () => {
    const { facade } = setup();

    facade.load('ACTIVE');

    expect(facade.state().status).toBe('empty');
  });

  it('Dado metas, então expõe o que o backend devolveu, na ordem dele, sem recalcular', () => {
    const gateway = new GoalsGatewayStub();
    gateway.goals = [aGoal(), aGoal({ id: 'goal-2', name: 'Viagem', progress: '1.2500' })];
    const { facade } = setup(gateway);

    facade.load('ACTIVE');

    expect(facade.data()?.map((g) => g.id)).toEqual(['goal-1', 'goal-2']);
    expect(facade.data()?.[1]?.progress).toBe('1.2500');
  });

  it('Dado o status, então vai para a consulta; sem status, pede todas', () => {
    const { facade, gateway } = setup();

    facade.load('ARCHIVED');
    facade.load();

    expect(gateway.queries[0]).toMatchObject({ status: 'ARCHIVED', page: 1 });
    expect(gateway.queries[1]).not.toHaveProperty('status');
  });

  it('Dado várias páginas, então pagina até o fim', () => {
    const gateway = new GoalsGatewayStub();
    gateway.goals = Array.from({ length: 51 }, (_, i) => aGoal({ id: `g-${i}` }));
    const { facade } = setup(gateway);

    facade.load('ACTIVE');

    expect(facade.data()).toHaveLength(51);
    expect(gateway.queries.map((q) => q.page)).toEqual([1, 2]);
  });

  it('Dado falha, então o estado é erro tipado e "tentar de novo" recarrega', () => {
    const gateway = new GoalsGatewayStub();
    gateway.listError = failWith(500, 'INTERNAL_ERROR');
    const { facade } = setup(gateway);

    facade.load('ACTIVE');
    expect(facade.error()).toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });

    gateway.listError = null;
    gateway.goals = [aGoal()];
    facade.load('ACTIVE');
    expect(facade.state().status).toBe('ready');
  });

  it('Dado ready, então reload silencioso não passa por loading (nem some com os dados) e troca ao chegar', () => {
    const gateway = new GoalsGatewayStub();
    gateway.goals = [aGoal()];
    const { facade } = setup(gateway);
    facade.load('ACTIVE');
    const pending = new Subject<Slice<Goal>>();
    vi.spyOn(gateway, 'list').mockReturnValue(pending);

    facade.reload('ACTIVE');

    expect(facade.state().status).toBe('ready');
    expect(facade.data()).toHaveLength(1);
    pending.next({ items: [aGoal(), aGoal({ id: 'goal-2' })], hasNext: false });
    pending.complete();
    expect(facade.data()).toHaveLength(2);
  });

  it('Dado ready, então reload que falha mantém o último ready (não vira erro)', () => {
    const gateway = new GoalsGatewayStub();
    gateway.goals = [aGoal()];
    const { facade } = setup(gateway);
    facade.load('ACTIVE');
    gateway.listError = failWith(500, 'INTERNAL_ERROR');

    facade.reload('ACTIVE');

    expect(facade.state().status).toBe('ready');
    expect(facade.data()).toHaveLength(1);
  });

  it('Dado sem dados ainda, então reload se comporta como load (o erro aparece)', () => {
    const gateway = new GoalsGatewayStub();
    gateway.listError = failWith(500, 'INTERNAL_ERROR');
    const { facade } = setup(gateway);

    facade.reload('ACTIVE');

    expect(facade.state().status).toBe('error');
  });
});
