import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { DebtsListFacade } from '~/modules/debts/core/facades/debts-list.facade';
import { aDebt, DebtsGatewayStub, provideDebtsStub } from '~/testing/debts-testing';

describe('DebtsListFacade.loadAllOpen', () => {
  it('Dado dívidas de vários status, então pede só OPEN e PARTIALLY_SETTLED ao backend (status no filtro)', async () => {
    const gateway = new DebtsGatewayStub();
    gateway.debts = [
      aDebt({ id: 'a', status: 'OPEN' }),
      aDebt({ id: 'b', status: 'PARTIALLY_SETTLED' }),
      aDebt({ id: 'c', status: 'SETTLED' }),
      aDebt({ id: 'd', status: 'CANCELED' }),
    ];
    TestBed.configureTestingModule({ providers: [provideDebtsStub(gateway), DebtsListFacade] });

    const debts = await firstValueFrom(
      TestBed.inject(DebtsListFacade).loadAllOpen({ direction: 'RECEIVABLE' }),
    );

    expect(debts.map((d) => d.id)).toEqual(['a', 'b']);
    expect(gateway.queries.map((q) => q.status).sort()).toEqual(['OPEN', 'PARTIALLY_SETTLED']);
    expect(gateway.queries.every((q) => q.direction === 'RECEIVABLE')).toBe(true);
  });
});
