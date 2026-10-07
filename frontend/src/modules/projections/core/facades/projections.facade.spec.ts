import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { ProjectionsFacade } from '~/modules/projections/core/facades/projections.facade';
import type { Projection } from '~/modules/projections/core/types/projection';
import { failWith } from '~/testing/accounts-testing';
import {
  aProjection,
  ProjectionsGatewayStub,
  provideProjectionsStub,
} from '~/testing/etapa5-testing';

function setup(gateway = new ProjectionsGatewayStub()) {
  TestBed.configureTestingModule({
    providers: [provideProjectionsStub(gateway), ProjectionsFacade],
  });
  return { gateway, facade: TestBed.inject(ProjectionsFacade) };
}

describe('ProjectionsFacade', () => {
  it('Dado horizonte e tendência, então vão para a consulta e a série é a do backend', () => {
    const { facade, gateway } = setup();

    facade.load({ horizon: 'M12', includeTrend: true });

    expect(gateway.queries).toEqual([{ horizon: 'M12', includeTrend: true }]);
    expect(facade.data()?.series).toHaveLength(3);
    expect(facade.data()?.isProjection).toBe(true);
  });

  it('Dado mudar o horizonte antes da resposta, então a requisição anterior é cancelada', () => {
    const slow = new Subject<Projection>();
    const gateway = new ProjectionsGatewayStub();
    gateway.result = (query) => (query.horizon === 'D30' ? slow : gateway.fast(query.horizon));
    const { facade } = setup(gateway);

    facade.load({ horizon: 'D30', includeTrend: false });
    facade.load({ horizon: 'M6', includeTrend: false });
    slow.next(aProjection({ horizon: 'D30' }));

    expect(facade.data()?.horizon).toBe('M6');
  });

  it('Dado série vazia, então o estado é vazio', () => {
    const gateway = new ProjectionsGatewayStub();
    gateway.result = (query) => gateway.fast(query.horizon, []);
    const { facade } = setup(gateway);

    facade.load({ horizon: 'M6', includeTrend: false });

    expect(facade.state().status).toBe('empty');
  });

  it('Dado falha, então o estado é erro tipado', () => {
    const gateway = new ProjectionsGatewayStub();
    gateway.result = () => failWith(500, 'INTERNAL_ERROR');
    const { facade } = setup(gateway);

    facade.load({ horizon: 'M6', includeTrend: false });

    expect(facade.error()).toMatchObject({ status: 500 });
  });

  it('Dado tendência indisponível, então o motivo do backend chega', () => {
    const gateway = new ProjectionsGatewayStub();
    gateway.result = (query) =>
      gateway.fast(query.horizon, undefined, {
        available: false,
        estimate: true,
        reason: 'INSUFFICIENT_HISTORY',
        monthlyAverage: null,
        basedOn: [],
        series: [],
      });
    const { facade } = setup(gateway);

    facade.load({ horizon: 'M6', includeTrend: true });

    expect(facade.data()?.trend).toMatchObject({
      available: false,
      reason: 'INSUFFICIENT_HISTORY',
    });
  });
});
