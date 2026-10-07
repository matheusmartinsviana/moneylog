import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { TransactionsGateway } from '~/modules/transactions/core/interfaces/transactions.gateway';
import { TRANSACTIONS_ENDPOINTS } from '~/modules/transactions/infra/endpoints';
import { provideTransactions } from '~/modules/transactions/infra/transactions.providers';
import { aResponse } from '~/testing/transactions-response-testing';
import { API_MOCKS } from '~/util/api-mocks';

function setup(useMocks: boolean) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_MOCKS, useValue: useMocks },
      provideTransactions(),
    ],
  });
  return {
    gateway: TestBed.inject(TransactionsGateway),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('TransactionsRequestsFacade: cancelar parcelas restantes (T63)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('Dado o mock, então cancelar dá 404 sem requisição', async () => {
    const { gateway, http } = setup(true);

    await expect(firstValueFrom(gateway.cancelInstallments('x', 'motivo'))).rejects.toMatchObject({
      problem: { status: 404 },
    });
    http.expectNone(() => true);
  });

  it('Dado o modo real, então é um POST com o motivo e devolve a compra da resposta', async () => {
    const { gateway, http } = setup(false);

    const result = firstValueFrom(gateway.cancelInstallments('tx-1', 'devolvi'));
    const req = http.expectOne(TRANSACTIONS_ENDPOINTS.cancelInstallments('tx-1'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reason: 'devolvi' });
    req.flush(aResponse({ id: 'tx-1', type: 'CARD_PURCHASE', description: 'Notebook' }));

    expect((await result).description).toBe('Notebook');
  });

  it('Dado 422 TRANSACTION_NOT_CANCELABLE, então vira ProblemError com o code', async () => {
    const { gateway, http } = setup(false);

    const result = firstValueFrom(gateway.cancelInstallments('tx-1', 'x'));
    http
      .expectOne(TRANSACTIONS_ENDPOINTS.cancelInstallments('tx-1'))
      .flush(
        { code: 'TRANSACTION_NOT_CANCELABLE', status: 422 },
        { status: 422, statusText: 'Unprocessable Entity' },
      );

    await expect(result).rejects.toMatchObject({
      problem: { status: 422, code: 'TRANSACTION_NOT_CANCELABLE' },
    });
  });
});
