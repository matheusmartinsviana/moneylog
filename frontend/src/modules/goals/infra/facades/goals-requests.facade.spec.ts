import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { GoalsGateway } from '~/modules/goals/core/interfaces/goals.gateway';
import { GOALS_ENDPOINTS } from '~/modules/goals/infra/endpoints';
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
    expect(created.current.amount).toBe('0.00');
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

      const result = firstValueFrom(gateway.update('goal-1', { ...INPUT, version: 3 }));
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
});
