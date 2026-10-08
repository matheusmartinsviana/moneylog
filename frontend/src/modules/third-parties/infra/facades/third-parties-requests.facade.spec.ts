import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { ThirdPartiesGateway } from '~/modules/third-parties/core/interfaces/third-parties.gateway';
import { THIRD_PARTY_ENDPOINTS } from '~/modules/third-parties/infra/endpoints';
import { provideThirdParties } from '~/modules/third-parties/infra/third-parties.providers';
import { emptyReceivables } from '~/modules/third-parties/mock-data/empty-receivables';
import { API_MOCKS } from '~/util/api-mocks';

function setup(useMocks: boolean) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_MOCKS, useValue: useMocks },
      provideThirdParties(),
    ],
  });
  return {
    gateway: TestBed.inject(ThirdPartiesGateway),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('ThirdPartiesRequestsFacade', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('Dado o mock, então nada a receber vem sem requisição', async () => {
    const { gateway, http } = setup(true);

    const data = await firstValueFrom(gateway.receivables('2026-09'));

    expect(data.people).toEqual([]);
    expect(data.month.competence).toBe('2026-09');
    http.expectNone(() => true);
  });

  it('Dado um mês, então vira ?month= e a resposta é copiada como veio', async () => {
    const { gateway, http } = setup(false);
    const raw = emptyReceivables('2026-09');
    raw.pending = { amount: '700.00', currency: 'BRL' };
    raw.month.personalNet = { amount: '3100.00', currency: 'BRL' };

    const result = firstValueFrom(gateway.receivables('2026-09'));
    const req = http.expectOne((r) => r.url === THIRD_PARTY_ENDPOINTS.receivables);
    expect(req.request.params.get('month')).toBe('2026-09');
    req.flush(raw);

    const data = await result;
    expect(data.pending.amount).toBe('700.00');
    expect(data.month.personalNet.amount).toBe('3100.00');
  });

  it('Dado sem mês, então não manda o parâmetro (o servidor usa o mês atual)', async () => {
    const { gateway, http } = setup(false);

    const result = firstValueFrom(gateway.receivables(null));
    const req = http.expectOne((r) => r.url === THIRD_PARTY_ENDPOINTS.receivables);
    expect(req.request.params.has('month')).toBe(false);
    req.flush(emptyReceivables(null));
    await result;
  });

  it('Dado marcar, então POST com Idempotency-Key, pessoa e nota aparada', async () => {
    const { gateway, http } = setup(false);

    const result = firstValueFrom(
      gateway.mark({ transactionId: 'tx-1', personId: 'p-1', note: '  presente ' }, 'key-1'),
    );
    const req = http.expectOne(THIRD_PARTY_ENDPOINTS.expenses);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Idempotency-Key')).toBe('key-1');
    expect(req.request.body).toEqual({ transactionId: 'tx-1', personId: 'p-1', note: 'presente' });
    req.flush({ id: 'e-1', transactionId: 'tx-1', personId: 'p-1', note: 'presente' });

    expect((await result).personId).toBe('p-1');
  });

  it('Dado 422 já marcada, então falha tipada com o code', async () => {
    const { gateway, http } = setup(false);

    const result = firstValueFrom(
      gateway.mark({ transactionId: 'tx-1', personId: 'p-1', note: null }, 'key-2'),
    );
    http.expectOne(THIRD_PARTY_ENDPOINTS.expenses).flush(
      { code: 'THIRD_PARTY_EXPENSE_ALREADY_MARKED', status: 422 },
      {
        status: 422,
        statusText: 'Unprocessable',
        headers: { 'Content-Type': 'application/problem+json' },
      },
    );

    await expect(result).rejects.toMatchObject({
      problem: { code: 'THIRD_PARTY_EXPENSE_ALREADY_MARKED' },
    });
  });

  it('Dado registrar recebimento, então POST com Idempotency-Key e só os campos preenchidos', async () => {
    const { gateway, http } = setup(false);

    const result = firstValueFrom(
      gateway.recordReceipt(
        {
          personId: 'p-1',
          transactionId: null,
          amount: '50.00',
          receivedOn: '2026-10-05',
          note: '  ',
        },
        'key-r',
      ),
    );
    const req = http.expectOne(THIRD_PARTY_ENDPOINTS.receipts);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Idempotency-Key')).toBe('key-r');
    expect(req.request.body).toEqual({
      personId: 'p-1',
      amount: '50.00',
      receivedOn: '2026-10-05',
    });
    req.flush({
      id: 'r-1',
      personId: 'p-1',
      transactionId: null,
      amount: { amount: '50.00', currency: 'BRL' },
      receivedOn: '2026-10-05',
      note: null,
    });

    expect((await result).amount.amount).toBe('50.00');
  });

  it('Dado remover recebimento, então DELETE no id e conclui no 204', async () => {
    const { gateway, http } = setup(false);

    const result = firstValueFrom(gateway.deleteReceipt('r-1'), { defaultValue: undefined });
    const req = http.expectOne(THIRD_PARTY_ENDPOINTS.receipt('r-1'));
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });

    await expect(result).resolves.toBeUndefined();
  });
});
