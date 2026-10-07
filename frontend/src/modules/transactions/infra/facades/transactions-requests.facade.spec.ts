import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { TransactionsGateway } from '~/modules/transactions/core/interfaces/transactions.gateway';
import { defaultFilters } from '~/modules/transactions/core/types/list-filters';
import { IDEMPOTENCY_HEADER, TRANSACTIONS_ENDPOINTS } from '~/modules/transactions/infra/endpoints';
import { TransactionsRequestsFacade } from '~/modules/transactions/infra/facades/transactions-requests.facade';
import { provideTransactions } from '~/modules/transactions/infra/transactions.providers';
import { aResponse } from '~/testing/transactions-response-testing';
import { anExpenseInput } from '~/testing/transactions-testing';
import { API_MOCKS } from '~/util/api-mocks';

const ACC = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const filters = defaultFilters('2026-10-04');
const brl = (amount: string) => ({ amount, currency: 'BRL' as const });
const emptyTotals = { count: 0, cashFlow: { in: brl('0.00'), out: brl('0.00'), net: brl('0.00') } };

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

describe('TransactionsRequestsFacade', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('Dado o bootstrap, então a porta é a facade de requisições', () => {
    const { gateway } = setup(true);
    expect(gateway).toBe(TestBed.inject(TransactionsRequestsFacade));
  });

  describe('em modo mock', () => {
    it('Dado o mock, então a lista e os lançamentos vêm vazios com totais zerados, sem requisição', async () => {
      const { gateway, http } = setup(true);

      const records = await firstValueFrom(gateway.list(filters, 1, 50));
      const entries = await firstValueFrom(gateway.listEntries(filters, 1, 50));

      expect(records.items).toEqual([]);
      expect(records.totals).toEqual(emptyTotals);
      expect(entries.items).toEqual([]);
      expect(entries.totals.total).toEqual(brl('0.00'));
      http.expectNone(() => true);
    });

    it('Dado o mock, então criar devolve a movimentação e as demais ações dão 404', async () => {
      const { gateway, http } = setup(true);

      const created = await firstValueFrom(
        gateway.create(anExpenseInput({ amount: '35' }), 'key-1'),
      );
      expect(created).toMatchObject({
        type: 'EXPENSE',
        amount: { amount: '35.00', currency: 'BRL' },
      });
      for (const call of [
        gateway.get('x'),
        gateway.update('x', anExpenseInput(), 1),
        gateway.void('x', 'r'),
      ]) {
        await expect(firstValueFrom(call)).rejects.toMatchObject({
          problem: { code: 'TRANSACTION_NOT_FOUND' },
        });
      }
      http.expectNone(() => true);
    });
  });

  describe('com a API', () => {
    it('Dado a visão registros, então GET /v1/transactions com os filtros do contrato e mapeia os totais recebidos', async () => {
      const { gateway, http } = setup(false);
      const totals = {
        count: 2,
        cashFlow: { in: brl('7.00'), out: brl('1.00'), net: brl('6.00') },
      };

      const result = firstValueFrom(
        gateway.list(
          {
            ...filters,
            type: 'EXPENSE',
            accountId: ACC,
            categoryId: ACC,
            method: 'PIX',
            q: ' café ',
            status: 'VOIDED',
          },
          3,
          50,
        ),
      );
      const req = http.expectOne((r) => r.url === TRANSACTIONS_ENDPOINTS.collection);
      const params = req.request.params;
      expect(req.request.method).toBe('GET');
      expect(params.get('from')).toBe('2026-10-01');
      expect(params.get('to')).toBe('2026-10-31');
      expect(params.get('type')).toBe('EXPENSE');
      expect(params.get('accountId')).toBe(ACC);
      expect(params.get('categoryId')).toBe(ACC);
      expect(params.get('method')).toBe('PIX');
      expect(params.get('status')).toBe('VOIDED');
      expect(params.get('q')).toBe('café');
      expect(params.get('page')).toBe('3');
      expect(params.get('pageSize')).toBe('50');
      expect(params.has('competence')).toBe(false);
      req.flush({ items: [aResponse()], hasNext: false, totals });

      const slice = await result;
      expect(slice.totals).toEqual(totals);
      expect(slice.items).toHaveLength(1);
    });

    it('Dado os padrões, então não manda type, accountId, categoryId, method nem q', () => {
      const { gateway, http } = setup(false);

      gateway.list(filters, 1, 50).subscribe();

      const req = http.expectOne((r) => r.url === TRANSACTIONS_ENDPOINTS.collection);
      for (const key of ['type', 'accountId', 'categoryId', 'method', 'q']) {
        expect(req.request.params.has(key)).toBe(false);
      }
      expect(req.request.params.get('status')).toBe('ACTIVE');
      req.flush({ items: [], hasNext: false, totals: emptyTotals });
    });

    it('Dado a visão por competência, então GET /v1/entries com competence e lens', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(
        gateway.listEntries(
          { ...filters, competence: '2026-09', lens: 'INCOME', method: 'PIX' },
          1,
          50,
        ),
      );
      const req = http.expectOne((r) => r.url === TRANSACTIONS_ENDPOINTS.entries);
      expect(req.request.params.get('competence')).toBe('2026-09');
      expect(req.request.params.get('lens')).toBe('INCOME');
      expect(req.request.params.get('method')).toBe('PIX');
      expect(req.request.params.has('from')).toBe(false);
      req.flush({ items: [], hasNext: false, totals: { total: brl('0.00'), byCategory: [] } });

      expect((await result).totals.total).toEqual(brl('0.00'));
    });

    it('Dado criar, então POST com o header Idempotency-Key e o corpo do tipo', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.create(anExpenseInput(), 'key-abc'));
      const req = http.expectOne(TRANSACTIONS_ENDPOINTS.collection);
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get(IDEMPOTENCY_HEADER)).toBe('key-abc');
      expect(req.request.body).toMatchObject({ type: 'EXPENSE', amount: '35.00', method: 'PIX' });
      req.flush(aResponse(), { status: 201, statusText: 'Created' });

      expect((await result).id).toBe('tx-1');
    });

    it('Dado a mesma chave reenviada (retry), então o header vai igual', () => {
      const { gateway, http } = setup(false);

      gateway.create(anExpenseInput(), 'k').subscribe({ error: () => undefined });
      http.expectOne(TRANSACTIONS_ENDPOINTS.collection).error(new ProgressEvent('error'));
      gateway.create(anExpenseInput(), 'k').subscribe();
      const again = http.expectOne(TRANSACTIONS_ENDPOINTS.collection);

      expect(again.request.headers.get(IDEMPOTENCY_HEADER)).toBe('k');
      again.flush(aResponse(), { status: 201, statusText: 'Created' });
    });

    it('Dado editar, então PUT com version e sem Idempotency-Key', () => {
      const { gateway, http } = setup(false);

      gateway.update('tx-1', anExpenseInput(), 4).subscribe();

      const req = http.expectOne(TRANSACTIONS_ENDPOINTS.item('tx-1'));
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toMatchObject({ type: 'EXPENSE', version: 4 });
      expect(req.request.headers.has(IDEMPOTENCY_HEADER)).toBe(false);
      req.flush(aResponse());
    });

    it('Dado estornar, então POST /void com o motivo', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.void('tx-1', 'duplicada'));
      const req = http.expectOne(TRANSACTIONS_ENDPOINTS.void('tx-1'));
      expect(req.request.body).toEqual({ reason: 'duplicada' });
      req.flush(aResponse({ status: 'VOIDED', voidReason: 'duplicada' }));

      expect(await result).toMatchObject({ status: 'VOIDED', voidReason: 'duplicada' });
    });

    it('Dado buscar por id, então GET /v1/transactions/{id}', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.get('tx-1'));
      http.expectOne(TRANSACTIONS_ENDPOINTS.item('tx-1')).flush(aResponse());

      expect((await result).id).toBe('tx-1');
    });

    it.each([
      [400, 'VALIDATION_FAILED'],
      [409, 'VERSION_CONFLICT'],
      [422, 'REFUND_EXCEEDS_ORIGINAL'],
    ])('Dado %i %s, então falha com status, code e fieldErrors tipados', async (status, code) => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.update('tx-1', anExpenseInput(), 1));
      http
        .expectOne(TRANSACTIONS_ENDPOINTS.item('tx-1'))
        .flush(
          { code, errors: [{ field: 'amount', code: 'X', message: 'm' }] },
          { status, statusText: 'x' },
        );

      await expect(result).rejects.toMatchObject({
        problem: { status, code, fieldErrors: [{ field: 'amount', code: 'X', message: 'm' }] },
      });
    });

    it('Dado erro de rede ao criar, então falha com NETWORK (a chave continua do chamador)', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.create(anExpenseInput(), 'k'));
      http.expectOne(TRANSACTIONS_ENDPOINTS.collection).error(new ProgressEvent('error'));

      await expect(result).rejects.toMatchObject({ problem: { status: 0, code: 'NETWORK' } });
    });
  });
});
