import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { ProjectionsGateway } from '~/modules/projections/core/interfaces/projections.gateway';
import { PROJECTIONS_ENDPOINTS } from '~/modules/projections/infra/endpoints';
import { ProjectionsRequestsFacade } from '~/modules/projections/infra/facades/projections-requests.facade';
import { provideProjections } from '~/modules/projections/infra/projections.providers';
import { aProjectionResponse } from '~/testing/etapa5-testing';
import { API_MOCKS } from '~/util/api-mocks';

function setup(useMocks: boolean) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_MOCKS, useValue: useMocks },
      provideProjections(),
    ],
  });
  return {
    gateway: TestBed.inject(ProjectionsGateway),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('ProjectionsRequestsFacade', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('Dado o bootstrap, então a porta é a facade de requisições', () => {
    const { gateway } = setup(true);
    expect(gateway).toBe(TestBed.inject(ProjectionsRequestsFacade));
  });

  it('Dado o mock, então a série vem vazia, sem requisição', async () => {
    const { gateway, http } = setup(true);

    const projection = await firstValueFrom(gateway.get({ horizon: 'D90', includeTrend: false }));

    expect(projection).toMatchObject({ isProjection: true, horizon: 'D90', series: [] });
    http.expectNone(() => true);
  });

  it('Dado horizonte e tendência, então viram a query string', async () => {
    const { gateway, http } = setup(false);

    const result = firstValueFrom(gateway.get({ horizon: 'M12', includeTrend: true }));
    const req = http.expectOne((r) => r.url === PROJECTIONS_ENDPOINTS.projection);
    expect(req.request.params.get('horizon')).toBe('M12');
    expect(req.request.params.get('includeTrend')).toBe('true');
    req.flush(aProjectionResponse({ horizon: 'M12' }));

    expect((await result).horizon).toBe('M12');
  });

  it('Dado a resposta, então copia série, premissas, metas e tendência como vieram', async () => {
    const { gateway, http } = setup(false);

    const result = firstValueFrom(gateway.get({ horizon: 'M6', includeTrend: true }));
    http
      .expectOne((r) => r.url === PROJECTIONS_ENDPOINTS.projection)
      .flush(
        aProjectionResponse({
          goals: {
            reserved: { amount: '8500.00', currency: 'BRL' },
            items: [
              {
                goalId: 'g1',
                name: 'Reserva',
                current: { amount: '8500.00', currency: 'BRL' },
                target: { amount: '20000.00', currency: 'BRL' },
              },
            ],
          },
          trend: {
            available: true,
            estimate: true,
            reason: null,
            monthlyAverage: { amount: '900.00', currency: 'BRL' },
            basedOn: ['2026-07', '2026-08', '2026-09'],
            series: [
              {
                competence: '2026-11',
                estimatedSpending: { amount: '900.00', currency: 'BRL' },
                balance: { amount: '20698.00', currency: 'BRL' },
              },
            ],
          },
        }),
      );

    const projection = await result;
    expect(projection.series[0]?.balance.amount).toBe('21598.00');
    expect(projection.assumptions).toEqual(['ACTIVE_RECURRENCES']);
    expect(projection.goals.items[0]?.name).toBe('Reserva');
    expect(projection.trend).toMatchObject({
      estimate: true,
      basedOn: ['2026-07', '2026-08', '2026-09'],
    });
    expect(projection.trend?.monthlyAverage?.amount).toBe('900.00');
    expect(projection.trend?.series[0]?.estimatedSpending.amount).toBe('900.00');
  });

  it('Dado erro da API, então vira ProblemError', async () => {
    const { gateway, http } = setup(false);

    const result = firstValueFrom(gateway.get({ horizon: 'M6', includeTrend: false }));
    http
      .expectOne((r) => r.url === PROJECTIONS_ENDPOINTS.projection)
      .flush({ status: 500, code: 'INTERNAL_ERROR' }, { status: 500, statusText: 'x' });

    await expect(result).rejects.toMatchObject({ problem: { status: 500 } });
  });
});
