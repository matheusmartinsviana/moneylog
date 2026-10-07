import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { MonthlySummaryFacade } from '~/modules/monthly-summary/core/facades/monthly-summary.facade';
import type { MonthlySummary } from '~/modules/monthly-summary/core/types/monthly-summary';
import { failWith } from '~/testing/accounts-testing';
import {
  aSummary,
  MonthlySummaryGatewayStub,
  provideMonthlySummaryStub,
} from '~/testing/etapa5-testing';

function setup(gateway = new MonthlySummaryGatewayStub()) {
  TestBed.configureTestingModule({
    providers: [provideMonthlySummaryStub(gateway), MonthlySummaryFacade],
  });
  return { gateway, facade: TestBed.inject(MonthlySummaryFacade) };
}

describe('MonthlySummaryFacade', () => {
  it('Dado o mês, então expõe o resumo do backend sem recalcular', () => {
    const { facade, gateway } = setup();

    facade.load('2026-10');

    expect(gateway.months).toEqual(['2026-10']);
    expect(facade.data()).toMatchObject({ savingsRate: '0.9167', partial: true });
    expect(facade.data()?.expenses.amount).toBe('250.00');
  });

  it('Dado trocar de mês antes da resposta, então a anterior é cancelada e não sobrescreve', () => {
    const first = new Subject<MonthlySummary>();
    const gateway = new MonthlySummaryGatewayStub();
    gateway.result = (month) => (month === '2026-09' ? first : gateway.resultOf(month));
    const { facade } = setup(gateway);

    facade.load('2026-09');
    facade.load('2026-10');
    first.next(aSummary({ competence: '2026-09' }));

    expect(facade.data()?.competence).toBe('2026-10');
  });

  it('Dado SUMMARY_MONTH_INVALID, então o estado é erro tipado', () => {
    const gateway = new MonthlySummaryGatewayStub();
    gateway.result = () => failWith(400, 'SUMMARY_MONTH_INVALID');
    const { facade } = setup(gateway);

    facade.load('2026-13');

    expect(facade.error()).toMatchObject({ status: 400, code: 'SUMMARY_MONTH_INVALID' });
  });

  it('Dado carregando, então o estado é loading', () => {
    const gateway = new MonthlySummaryGatewayStub();
    gateway.result = () => new Subject<MonthlySummary>();
    const { facade } = setup(gateway);

    facade.load('2026-10');

    expect(facade.state().status).toBe('loading');
  });
});
