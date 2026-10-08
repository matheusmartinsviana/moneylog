import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { RecurrencesGateway } from '~/modules/recurrences/core/interfaces/recurrences.gateway';
import { RECURRENCES_ENDPOINTS } from '~/modules/recurrences/infra/endpoints';
import { RecurrencesRequestsFacade } from '~/modules/recurrences/infra/facades/recurrences-requests.facade';
import { provideRecurrences } from '~/modules/recurrences/infra/recurrences.providers';
import { aRecurrenceResponse, anOccurrenceResponse, brl } from '~/testing/etapa4-response-testing';
import { aResponse } from '~/testing/transactions-response-testing';
import { API_MOCKS } from '~/util/api-mocks';

function setup(useMocks: boolean) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_MOCKS, useValue: useMocks },
      provideRecurrences(),
    ],
  });
  return {
    gateway: TestBed.inject(RecurrencesGateway),
    http: TestBed.inject(HttpTestingController),
  };
}

const INPUT = {
  type: 'EXPENSE' as const,
  amount: '119.00',
  description: ' Internet ',
  categoryId: 'cat-1',
  accountId: 'acc-1',
  method: 'BOLETO' as const,
  cardId: null,
  frequency: 'MONTHLY' as const,
  interval: null,
  unit: null,
  startDate: '2026-09-10',
  endDate: null,
  maxOccurrences: null,
};

describe('RecurrencesRequestsFacade', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('Dado o bootstrap, então a porta RecurrencesGateway é a facade de requisições', () => {
    const { gateway } = setup(true);
    expect(gateway).toBe(TestBed.inject(RecurrencesRequestsFacade));
  });

  it('Dado o mock, então listas e resumo vêm vazios e ações dão 404, sem requisição', async () => {
    const { gateway, http } = setup(true);

    expect(await firstValueFrom(gateway.list({ page: 1, pageSize: 10 }))).toEqual({
      items: [],
      hasNext: false,
    });
    expect(await firstValueFrom(gateway.listOccurrences({ page: 1, pageSize: 10 }))).toEqual({
      items: [],
      hasNext: false,
      overdueTruncated: false,
    });
    expect((await firstValueFrom(gateway.summary())).fixedCosts.amount).toBe('0.00');
    await expect(
      firstValueFrom(gateway.realize('r', '2026-10-10', null, 'k')),
    ).rejects.toMatchObject({
      problem: { status: 404, code: 'RECURRENCE_NOT_FOUND' },
    });
    await expect(firstValueFrom(gateway.skip('r', '2026-10-10'))).rejects.toMatchObject({
      problem: { code: 'RECURRENCE_NOT_FOUND' },
    });
    http.expectNone(() => true);
  });

  describe('em modo real', () => {
    it('Dado a lista, então pede `active` só quando informado', async () => {
      const { gateway, http } = setup(false);

      const all = firstValueFrom(gateway.list({ page: 1, pageSize: 50 }));
      const first = http.expectOne((r) => r.url === RECURRENCES_ENDPOINTS.collection);
      expect(first.request.params.has('active')).toBe(false);
      first.flush({ items: [aRecurrenceResponse()], hasNext: false });
      expect((await all).items[0]).toMatchObject({ frequency: 'MONTHLY', active: true });

      const active = firstValueFrom(gateway.list({ active: true, page: 1, pageSize: 50 }));
      const second = http.expectOne((r) => r.url === RECURRENCES_ENDPOINTS.collection);
      expect(second.request.params.get('active')).toBe('true');
      second.flush({ items: [], hasNext: false });
      await active;
    });

    it('Dado a recorrência, então a estimativa e a próxima ocorrência são as do backend', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.get('rec-1'));
      http
        .expectOne(RECURRENCES_ENDPOINTS.item('rec-1'))
        .flush(
          aRecurrenceResponse({ monthlyEstimate: brl('516.33'), nextOccurrence: '2026-10-09' }),
        );

      const recurrence = await result;
      expect(recurrence.monthlyEstimate.amount).toBe('516.33');
      expect(recurrence.nextOccurrence).toBe('2026-10-09');
    });

    it('Dado criar em conta, então o corpo leva conta e método, sem cartão, intervalo nem unidade fora de CUSTOM', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.create(INPUT, 'key-r'));
      const req = http.expectOne(RECURRENCES_ENDPOINTS.collection);
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('Idempotency-Key')).toBe('key-r');
      expect(req.request.body).toEqual({
        type: 'EXPENSE',
        amount: '119.00',
        description: 'Internet',
        categoryId: 'cat-1',
        accountId: 'acc-1',
        method: 'BOLETO',
        frequency: 'MONTHLY',
        startDate: '2026-09-10',
        endDate: null,
        maxOccurrences: null,
      });
      req.flush(aRecurrenceResponse());
      await result;
    });

    it('Dado criar sem conta ("conta a definir"), então o corpo não leva conta nem método', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(
        gateway.create({ ...INPUT, accountId: null, method: null }, 'key-tbd'),
      );
      const req = http.expectOne(RECURRENCES_ENDPOINTS.collection);
      expect(req.request.body).not.toHaveProperty('accountId');
      expect(req.request.body).not.toHaveProperty('method');
      expect(req.request.body).not.toHaveProperty('cardId');
      req.flush(aRecurrenceResponse({ account: null, method: null }));
      expect((await result).account).toBeNull();
    });

    it('Dado criar no cartão em CUSTOM, então leva cardId, intervalo e unidade, sem conta', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(
        gateway.create(
          {
            ...INPUT,
            type: 'CARD_PURCHASE',
            accountId: null,
            method: null,
            cardId: 'card-1',
            frequency: 'CUSTOM',
            interval: 2,
            unit: 'WEEKS',
          },
          'key-r2',
        ),
      );
      const req = http.expectOne(RECURRENCES_ENDPOINTS.collection);
      expect(req.request.body).toMatchObject({
        type: 'CARD_PURCHASE',
        cardId: 'card-1',
        frequency: 'CUSTOM',
        interval: 2,
        unit: 'WEEKS',
      });
      expect(req.request.body).not.toHaveProperty('accountId');
      expect(req.request.body).not.toHaveProperty('method');
      req.flush(aRecurrenceResponse());
      await result;
    });

    it('Dado editar, então o corpo só tem os dados do modelo (sem frequência nem início) e a version', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(
        gateway.update('rec-1', {
          amount: '124.90',
          description: 'Internet',
          categoryId: 'cat-1',
          accountId: 'acc-1',
          method: 'BOLETO',
          cardId: null,
          endDate: '2027-01-01',
          version: 3,
        }),
      );
      const req = http.expectOne(RECURRENCES_ENDPOINTS.item('rec-1'));
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).not.toHaveProperty('frequency');
      expect(req.request.body).not.toHaveProperty('startDate');
      expect(req.request.body).toMatchObject({
        amount: '124.90',
        endDate: '2027-01-01',
        version: 3,
      });
      req.flush(aRecurrenceResponse({ version: 4 }));
      expect((await result).version).toBe(4);
    });

    it('Dado encerrar, então o corpo leva a data ou vai vazio (hoje, do backend); desativar é POST sem corpo', async () => {
      const { gateway, http } = setup(false);

      const withDate = firstValueFrom(gateway.end('rec-1', '2026-12-31'));
      const first = http.expectOne(RECURRENCES_ENDPOINTS.end('rec-1'));
      expect(first.request.body).toEqual({ endDate: '2026-12-31' });
      first.flush(aRecurrenceResponse({ endDate: '2026-12-31' }));
      await withDate;

      const today = firstValueFrom(gateway.end('rec-1', null));
      const second = http.expectOne(RECURRENCES_ENDPOINTS.end('rec-1'));
      expect(second.request.body).toEqual({});
      second.flush(aRecurrenceResponse());
      await today;

      const off = firstValueFrom(gateway.deactivate('rec-1'));
      const third = http.expectOne(RECURRENCES_ENDPOINTS.deactivate('rec-1'));
      expect(third.request.body).toBeNull();
      third.flush(aRecurrenceResponse({ active: false }));
      expect((await off).active).toBe(false);
    });

    it('Dado o resumo, então custo fixo e receita recorrente são os do backend, sempre como estimativa', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.summary());
      http.expectOne(RECURRENCES_ENDPOINTS.summary).flush({
        fixedCosts: brl('2345.67'),
        recurringIncome: brl('5000.00'),
        estimate: true,
      });

      expect(await result).toEqual({
        fixedCosts: { amount: '2345.67', currency: 'BRL' },
        recurringIncome: { amount: '5000.00', currency: 'BRL' },
        estimate: true,
      });
    });

    it('Dado as ocorrências pendentes, então pede status e não manda `from` (inclui as vencidas)', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(
        gateway.listOccurrences({ status: 'PENDING', page: 1, pageSize: 50 }),
      );
      const req = http.expectOne((r) => r.url === RECURRENCES_ENDPOINTS.occurrences);
      expect(req.request.params.get('status')).toBe('PENDING');
      expect(req.request.params.has('from')).toBe(false);
      req.flush({ items: [anOccurrenceResponse({ overdue: true })], hasNext: false });

      expect((await result).items[0]).toMatchObject({ overdue: true, status: 'PENDING' });
    });

    it('Dado realizar, então POST com Idempotency-Key e o valor real (ou corpo vazio) e devolve a movimentação', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.realize('rec-1', '2026-10-10', '124.90', 'key-1'));
      const req = http.expectOne(RECURRENCES_ENDPOINTS.realize('rec-1', '2026-10-10'));
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('Idempotency-Key')).toBe('key-1');
      expect(req.request.body).toEqual({ amount: '124.90' });
      req.flush(aResponse({ amount: brl('124.90'), description: 'Internet' }));
      expect((await result).amount.amount).toBe('124.90');

      const model = firstValueFrom(gateway.realize('rec-1', '2026-10-10', null, 'key-2'));
      const second = http.expectOne(RECURRENCES_ENDPOINTS.realize('rec-1', '2026-10-10'));
      expect(second.request.body).toEqual({});
      second.flush(aResponse());
      await model;
    });

    it('Dado realizar uma recorrência sem conta, então o corpo leva a conta e o meio escolhidos', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(
        gateway.realize('rec-1', '2026-10-10', null, 'key-p', {
          accountId: 'acc-1',
          method: 'PIX',
        }),
      );
      const req = http.expectOne(RECURRENCES_ENDPOINTS.realize('rec-1', '2026-10-10'));
      expect(req.request.body).toEqual({ accountId: 'acc-1', method: 'PIX' });
      req.flush(aResponse());
      await result;
    });

    it('Dado realizar uma compra no cartão, então devolve a fatura da 1ª parcela (a escolhida pelo backend)', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.realize('rec-2', '2026-10-10', null, 'key-3'));
      http.expectOne(RECURRENCES_ENDPOINTS.realize('rec-2', '2026-10-10')).flush(
        aResponse({
          type: 'CARD_PURCHASE',
          card: { id: 'card-1', name: 'Roxinho' },
          installments: [
            {
              number: 1,
              total: 1,
              amount: brl('50.00'),
              competence: '2026-10',
              invoiceId: 'inv-9',
              invoiceReferenceMonth: '2026-11',
              invoiceDueDate: '2026-11-05',
              status: 'PENDING',
              lateEntry: false,
            },
          ],
        }),
      );

      const realized = await result;
      expect(realized.card).toEqual({ id: 'card-1', name: 'Roxinho' });
      expect(realized.invoice).toEqual({
        id: 'inv-9',
        referenceMonth: '2026-11',
        dueDate: '2026-11-05',
      });
    });

    it('Dado pular, então POST sem corpo e devolve a ocorrência pulada', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.skip('rec-1', '2026-10-10'));
      const req = http.expectOne(RECURRENCES_ENDPOINTS.skip('rec-1', '2026-10-10'));
      expect(req.request.body).toBeNull();
      req.flush(anOccurrenceResponse({ status: 'SKIPPED' }));
      expect((await result).status).toBe('SKIPPED');
    });

    it('Dado 422 RECURRENCE_OCCURRENCE_ALREADY_REALIZED, então a falha chega tipada', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.skip('rec-1', '2026-10-10'));
      http
        .expectOne(RECURRENCES_ENDPOINTS.skip('rec-1', '2026-10-10'))
        .flush(
          { code: 'RECURRENCE_OCCURRENCE_ALREADY_REALIZED', errors: [] },
          { status: 422, statusText: 'Unprocessable Entity' },
        );

      await expect(result).rejects.toMatchObject({
        problem: { status: 422, code: 'RECURRENCE_OCCURRENCE_ALREADY_REALIZED' },
      });
    });
  });
});
