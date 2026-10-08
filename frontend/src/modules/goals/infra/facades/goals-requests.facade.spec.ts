import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { GoalsGateway } from '~/modules/goals/core/interfaces/goals.gateway';
import { GOALS_ENDPOINTS, METRIC_SOURCES } from '~/modules/goals/infra/endpoints';
import { GoalsRequestsFacade } from '~/modules/goals/infra/facades/goals-requests.facade';
import { provideGoals } from '~/modules/goals/infra/goals.providers';
import { aGoalResponse } from '~/testing/goals-testing';
import { API_MOCKS } from '~/util/api-mocks';

function setup(useMocks: boolean) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_MOCKS, useValue: useMocks },
      provideGoals(),
    ],
  });
  return {
    gateway: TestBed.inject(GoalsGateway),
    http: TestBed.inject(HttpTestingController),
  };
}

const INPUT = {
  name: ' Reserva de emergência ',
  target: '20000.00',
  deadline: '2027-12-31',
  priority: 'HIGH' as const,
  description: '  ',
};

describe('GoalsRequestsFacade', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('Dado o bootstrap, então a porta GoalsGateway é a facade de requisições', () => {
    const { gateway } = setup(true);
    expect(gateway).toBe(TestBed.inject(GoalsRequestsFacade));
  });

  it('Dado o mock, então a lista vem vazia, criar devolve a meta sem persistir e as demais ações dão 404, sem requisição', async () => {
    const { gateway, http } = setup(true);

    expect(await firstValueFrom(gateway.list({ page: 1, pageSize: 10 }))).toEqual({
      items: [],
      hasNext: false,
    });
    const created = await firstValueFrom(gateway.create(INPUT, 'key-mock'));
    expect(created).toMatchObject({
      id: 'key-mock',
      name: 'Reserva de emergência',
      progress: '0.0000',
      status: 'ACTIVE',
      reservations: [],
    });
    expect(created.current?.amount).toBe('0.00');
    await expect(firstValueFrom(gateway.get('g'))).rejects.toMatchObject({
      problem: { status: 404, code: 'GOAL_NOT_FOUND' },
    });
    await expect(
      firstValueFrom(
        gateway.reserve(
          'g',
          { kind: 'reserve', accountId: 'a', amount: '1.00', date: '2026-10-10', note: null },
          'k',
        ),
      ),
    ).rejects.toMatchObject({ problem: { code: 'GOAL_NOT_FOUND' } });
    http.expectNone(() => true);
  });

  describe('em modo real', () => {
    it('Dado a lista, então pede o status e a página', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.list({ status: 'ACTIVE', page: 2, pageSize: 50 }));
      const req = http.expectOne((r) => r.url === GOALS_ENDPOINTS.collection);
      expect(req.request.params.get('status')).toBe('ACTIVE');
      expect(req.request.params.get('page')).toBe('2');
      req.flush({ items: [aGoalResponse()], hasNext: false });

      const slice = await result;
      expect(slice.items[0]).toMatchObject({ progress: '0.4250', uncovered: false });
      expect(slice.items[0]?.monthlyNeeded?.amount).toBe('766.67');
    });

    it('Dado a meta, então copia o que o backend calculou (sem recalcular) e as reservas', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.get('goal-1'));
      http
        .expectOne(GOALS_ENDPOINTS.item('goal-1'))
        .flush(aGoalResponse({ monthlyNeeded: null, progress: '1.0200', uncovered: true }));

      const goal = await result;
      expect(goal.progress).toBe('1.0200');
      expect(goal.monthlyNeeded).toBeNull();
      expect(goal.uncovered).toBe(true);
      expect(goal.reservations[0]?.account.name).toBe('Nubank');
    });

    it('Dado criar, então leva a Idempotency-Key, o nome aparado e a descrição vazia como null', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.create(INPUT, 'key-g'));
      const req = http.expectOne(GOALS_ENDPOINTS.collection);
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('Idempotency-Key')).toBe('key-g');
      expect(req.request.body).toEqual({
        name: 'Reserva de emergência',
        target: '20000.00',
        deadline: '2027-12-31',
        priority: 'HIGH',
        description: null,
      });
      req.flush(aGoalResponse());
      await result;
    });

    it('Dado editar, então o corpo leva a version', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(
        gateway.update('goal-1', { ...INPUT, planNote: null, version: 3 }),
      );
      const req = http.expectOne(GOALS_ENDPOINTS.item('goal-1'));
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toMatchObject({ version: 3 });
      req.flush(aGoalResponse());
      await result;
    });

    it('Dado reservar, então o valor vai positivo; liberar vai negativo, com a chave', async () => {
      const { gateway, http } = setup(false);

      const reserve = firstValueFrom(
        gateway.reserve(
          'goal-1',
          {
            kind: 'reserve',
            accountId: 'acc-1',
            amount: '8500.00',
            date: '2026-10-10',
            note: ' primeira ',
          },
          'key-1',
        ),
      );
      const first = http.expectOne(GOALS_ENDPOINTS.reservations('goal-1'));
      expect(first.request.headers.get('Idempotency-Key')).toBe('key-1');
      expect(first.request.body).toEqual({
        accountId: 'acc-1',
        amount: '8500.00',
        date: '2026-10-10',
        note: 'primeira',
      });
      first.flush(aGoalResponse());
      await reserve;

      const release = firstValueFrom(
        gateway.reserve(
          'goal-1',
          { kind: 'release', accountId: 'acc-1', amount: '2000.00', date: '2026-10-11', note: '' },
          'key-2',
        ),
      );
      const second = http.expectOne(GOALS_ENDPOINTS.reservations('goal-1'));
      expect(second.request.body).toEqual({
        accountId: 'acc-1',
        amount: '-2000.00',
        date: '2026-10-11',
        note: null,
      });
      second.flush(aGoalResponse());
      await release;
    });

    it('Dado arquivar e desarquivar, então são POST sem corpo', async () => {
      const { gateway, http } = setup(false);

      const archived = firstValueFrom(gateway.archive('goal-1'));
      const a = http.expectOne(GOALS_ENDPOINTS.archive('goal-1'));
      expect(a.request.method).toBe('POST');
      a.flush(aGoalResponse({ status: 'ARCHIVED' }));
      expect((await archived).status).toBe('ARCHIVED');

      const back = firstValueFrom(gateway.unarchive('goal-1'));
      http.expectOne(GOALS_ENDPOINTS.unarchive('goal-1')).flush(aGoalResponse());
      expect((await back).status).toBe('ACTIVE');
    });

    it('Dado erro da API, então vira ProblemError com o code do contrato', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(
        gateway.reserve(
          'goal-1',
          { kind: 'release', accountId: 'a', amount: '9.00', date: '2026-10-10', note: null },
          'k',
        ),
      );
      http
        .expectOne(GOALS_ENDPOINTS.reservations('goal-1'))
        .flush(
          { status: 422, code: 'GOAL_RELEASE_EXCEEDS_RESERVED' },
          { status: 422, statusText: 'Unprocessable' },
        );

      await expect(result).rejects.toMatchObject({
        problem: { status: 422, code: 'GOAL_RELEASE_EXCEEDS_RESERVED' },
      });
    });
  });

  describe('meta de quitar dívidas (2.13.0)', () => {
    it('Dado DEBT_PAYOFF, então o POST não leva nome nem alvo e a meta volta com a base e o aviso', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(
        gateway.create(
          { kind: 'DEBT_PAYOFF', name: '', target: '', deadline: null, description: null },
          'key-1',
        ),
      );
      const req = http.expectOne(GOALS_ENDPOINTS.collection);
      expect(req.request.body).toEqual({ kind: 'DEBT_PAYOFF', deadline: null, description: null });
      req.flush(
        aGoalResponse({
          kind: 'DEBT_PAYOFF',
          baselineSet: true,
          baseline: { amount: '5000.00', currency: 'BRL' },
          grewSinceBaseline: true,
          reservations: [],
        }),
      );

      expect(await result).toMatchObject({
        kind: 'DEBT_PAYOFF',
        baselineSet: true,
        baseline: { amount: '5000.00' },
        grewSinceBaseline: true,
        reservations: [],
      });
    });

    it('Dado "Cadastrei tudo", então posta no baseline sem corpo e devolve a meta', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.baseline('g-1'));
      const req = http.expectOne(GOALS_ENDPOINTS.baseline('g-1'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toBeNull();
      req.flush(aGoalResponse({ kind: 'DEBT_PAYOFF', baselineSet: true }));

      expect((await result).baselineSet).toBe(true);
    });

    it('Dado o PUT, então reenvia planNote e prazo explícitos e omite nome e alvo vazios', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(
        gateway.update('g-1', {
          kind: 'METRIC',
          name: '  ',
          target: '',
          deadline: '2027-04-30',
          description: null,
          planNote: '  pagar em dia  ',
          version: 2,
        }),
      );
      const req = http.expectOne(GOALS_ENDPOINTS.item('g-1'));
      expect(req.request.body).toEqual({
        deadline: '2027-04-30',
        description: null,
        planNote: 'pagar em dia',
        version: 2,
      });
      req.flush(aGoalResponse());
      await result;
    });

    it('Dado criar meta de medida, então manda kind, metric, alvo zero e omite o nome vazio', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(
        gateway.create(
          {
            kind: 'METRIC',
            metric: 'TOTAL_DEBT',
            name: ' ',
            target: '0.00',
            deadline: null,
            description: null,
          },
          'k-1',
        ),
      );
      const req = http.expectOne(GOALS_ENDPOINTS.collection);
      expect(req.request.body).toEqual({
        kind: 'METRIC',
        metric: 'TOTAL_DEBT',
        target: '0.00',
        deadline: null,
        description: null,
      });
      req.flush(aGoalResponse({ kind: 'METRIC', name: null, metric: 'TOTAL_DEBT' }));
      expect(await result).toMatchObject({ kind: 'METRIC', name: null, metric: 'TOTAL_DEBT' });
    });

    it('Dado meta de medida arquivada, então current e remaining nulos chegam como null', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.get('g-1'));
      http
        .expectOne(GOALS_ENDPOINTS.item('g-1'))
        .flush(aGoalResponse({ kind: 'METRIC', name: null, current: null, remaining: null }));

      expect(await result).toMatchObject({ current: null, remaining: null, name: null });
    });

    it('Dado a resposta com plano, então mapeia estágio, ritmo, ações e consistência sem recalcular', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.get('g-1'));
      http.expectOne(GOALS_ENDPOINTS.item('g-1')).flush(
        aGoalResponse({
          stage: 'CONSISTENT',
          streak: 2,
          consistencyRate: '1.0000',
          planNote: 'Pagar em dia',
          actions: [
            {
              id: 'a-1',
              title: 'Pagar a fatura',
              frequency: 'MONTHLY',
              doneIn: ['2026-09'],
              createdAt: '2026-10-01T12:00:00Z',
            },
          ],
          consistency: [
            {
              month: '2026-09',
              expected: { amount: '100.00', currency: 'BRL' },
              actual: null,
              met: null,
              closed: true,
            },
          ],
        }),
      );

      const goal = await result;
      expect(goal.stage).toBe('CONSISTENT');
      expect(goal.actions).toEqual([
        { id: 'a-1', title: 'Pagar a fatura', frequency: 'MONTHLY', doneIn: ['2026-09'] },
      ]);
      expect(goal.consistency[0]).toMatchObject({ actual: null, met: null, closed: true });
      expect(goal.consistencyRate).toBe('1.0000');
    });

    it('Dado as ações do plano, então usa as rotas de ações e check-in', async () => {
      const { gateway, http } = setup(false);

      const add = firstValueFrom(
        gateway.addAction('g-1', { title: ' Revisar ', frequency: 'WEEKLY' }),
      );
      const addReq = http.expectOne(GOALS_ENDPOINTS.actions('g-1'));
      expect(addReq.request.method).toBe('POST');
      expect(addReq.request.body).toEqual({ title: 'Revisar', frequency: 'WEEKLY' });
      addReq.flush(aGoalResponse());
      await add;

      const edit = firstValueFrom(
        gateway.updateAction('g-1', 'a-1', { title: 'X', frequency: 'MONTHLY' }),
      );
      const editReq = http.expectOne(GOALS_ENDPOINTS.action('g-1', 'a-1'));
      expect(editReq.request.method).toBe('PUT');
      editReq.flush(aGoalResponse());
      await edit;

      const check = firstValueFrom(gateway.checkIn('g-1', 'a-1', '2026-10', false));
      const checkReq = http.expectOne(GOALS_ENDPOINTS.checkIn('g-1', 'a-1'));
      expect(checkReq.request.method).toBe('POST');
      expect(checkReq.request.body).toEqual({ period: '2026-10', done: false });
      checkReq.flush(aGoalResponse());
      await check;

      const remove = firstValueFrom(gateway.deleteAction('g-1', 'a-1'));
      const removeReq = http.expectOne(GOALS_ENDPOINTS.action('g-1', 'a-1'));
      expect(removeReq.request.method).toBe('DELETE');
      removeReq.flush(aGoalResponse());
      await remove;
    });

    it('Dado o valor atual de cada medida, então lê da fonte da tela e escolhe o campo, sem somar', async () => {
      const { gateway, http } = setup(false);
      const m = (amount: string) => ({ amount, currency: 'BRL' });

      const debts = firstValueFrom(gateway.metricValue('CARD_DEBT'));
      http
        .expectOne((r) => r.url === METRIC_SOURCES.debts)
        .flush({
          total: m('900.00'),
          parts: { cards: m('500.00'), people: m('100.00'), other: m('300.00') },
        });
      expect(await debts).toEqual(m('500.00'));

      const balance = firstValueFrom(gateway.metricValue('AVAILABLE_BALANCE'));
      http.expectOne(METRIC_SOURCES.dashboard).flush({
        balances: { inAccounts: m('1000.00'), available: m('700.00') },
      });
      expect(await balance).toEqual(m('700.00'));

      const fixed = firstValueFrom(gateway.metricValue('FIXED_COSTS_MONTHLY'));
      http.expectOne(METRIC_SOURCES.recurrences).flush({ fixedCosts: m('250.00') });
      expect(await fixed).toEqual(m('250.00'));
    });

    it('Dado o PUT de uma meta, então ainda manda name e target (o servidor ignora o alvo na quitação)', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(
        gateway.update('g-1', {
          kind: 'DEBT_PAYOFF',
          name: 'Quitar',
          target: '0.00',
          deadline: null,
          description: null,
          planNote: null,
          version: 2,
        }),
      );
      const req = http.expectOne(GOALS_ENDPOINTS.item('g-1'));
      expect(req.request.body).toMatchObject({ name: 'Quitar', target: '0.00', version: 2 });
      req.flush(aGoalResponse());
      await result;
    });
  });
});
