import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { CardsGateway } from '~/modules/cards/core/interfaces/cards.gateway';
import { provideCards } from '~/modules/cards/infra/cards.providers';
import { CARDS_ENDPOINTS, INVOICES_ENDPOINTS } from '~/modules/cards/infra/endpoints';
import { CardsRequestsFacade } from '~/modules/cards/infra/facades/cards-requests.facade';
import { aCardResponse, anInvoiceResponse, brl } from '~/testing/cards-response-testing';
import { API_MOCKS } from '~/util/api-mocks';

function setup(useMocks: boolean) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_MOCKS, useValue: useMocks },
      provideCards(),
    ],
  });
  return { gateway: TestBed.inject(CardsGateway), http: TestBed.inject(HttpTestingController) };
}

describe('CardsRequestsFacade', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('Dado o bootstrap, então a porta CardsGateway é a facade de requisições', () => {
    const { gateway } = setup(true);
    expect(gateway).toBe(TestBed.inject(CardsRequestsFacade));
  });

  describe('em modo mock', () => {
    it('Dado o mock, então as listas vêm vazias e nenhuma requisição sai', async () => {
      const { gateway, http } = setup(true);

      expect(await firstValueFrom(gateway.list({ page: 1, pageSize: 10 }))).toEqual({
        items: [],
        hasNext: false,
      });
      expect(await firstValueFrom(gateway.listInvoices('c', { page: 1, pageSize: 10 }))).toEqual({
        items: [],
        hasNext: false,
      });
      http.expectNone(() => true);
    });

    it('Dado o mock, então cartão, fatura e prévias dão 404 sem requisição', async () => {
      const { gateway, http } = setup(true);

      await expect(firstValueFrom(gateway.get('x'))).rejects.toMatchObject({
        problem: { status: 404, code: 'CARD_NOT_FOUND' },
      });
      await expect(firstValueFrom(gateway.getInvoice('x'))).rejects.toMatchObject({
        problem: { status: 404, code: 'INVOICE_NOT_FOUND' },
      });
      await expect(
        firstValueFrom(
          gateway.previewPurchase('x', { amount: '1.00', installments: 1, date: '2026-10-10' }),
        ),
      ).rejects.toMatchObject({ problem: { code: 'CARD_NOT_FOUND' } });
      await expect(firstValueFrom(gateway.archive('x'))).rejects.toMatchObject({
        problem: { code: 'CARD_NOT_FOUND' },
      });
      http.expectNone(() => true);
    });

    it('Dado o mock, então criar devolve o cartão como o backend o devolveria', async () => {
      const { gateway, http } = setup(true);

      const card = await firstValueFrom(
        gateway.create({
          name: 'Roxinho',
          institution: null,
          limit: '5000.00',
          closingDay: 25,
          dueDay: 5,
          defaultPaymentAccountId: null,
        }),
      );

      expect(card).toMatchObject({ name: 'Roxinho', status: 'ACTIVE', version: 0 });
      expect(card.limit?.amount).toBe('5000.00');
      http.expectNone(() => true);
    });
  });

  describe('em modo real', () => {
    it('Dado a lista, então pede status, página e tamanho', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.list({ status: 'ARCHIVED', page: 2, pageSize: 50 }));
      const req = http.expectOne((r) => r.url === CARDS_ENDPOINTS.collection);
      expect(req.request.params.get('status')).toBe('ARCHIVED');
      expect(req.request.params.get('page')).toBe('2');
      expect(req.request.params.get('pageSize')).toBe('50');
      req.flush({ items: [aCardResponse()], hasNext: true });

      const slice = await result;
      expect(slice.hasNext).toBe(true);
      expect(slice.items[0]?.name).toBe('Roxinho');
    });

    it('Dado criar e editar, então os corpos levam o limite como Money e o confirmedEffectiveFrom', async () => {
      const { gateway, http } = setup(false);
      const input = {
        name: 'Roxinho',
        institution: 'Nubank',
        limit: '10000.00',
        closingDay: 25,
        dueDay: 5,
        defaultPaymentAccountId: 'acc-1',
      };

      const created = firstValueFrom(gateway.create(input));
      const post = http.expectOne(CARDS_ENDPOINTS.collection);
      expect(post.request.method).toBe('POST');
      expect(post.request.body.limit).toEqual({ amount: '10000.00', currency: 'BRL' });
      post.flush(aCardResponse());
      await created;

      const updated = firstValueFrom(
        gateway.update('card-1', { ...input, version: 2, confirmedEffectiveFrom: '2026-11-25' }),
      );
      const put = http.expectOne(CARDS_ENDPOINTS.item('card-1'));
      expect(put.request.method).toBe('PUT');
      expect(put.request.body).toMatchObject({ version: 2, confirmedEffectiveFrom: '2026-11-25' });
      put.flush(aCardResponse({ version: 3 }));
      expect((await updated).version).toBe(3);
    });

    it('Dado arquivar e desarquivar, então são POST sem corpo e devolvem o cartão', async () => {
      const { gateway, http } = setup(false);

      const archived = firstValueFrom(gateway.archive('card-1'));
      const req = http.expectOne(CARDS_ENDPOINTS.archive('card-1'));
      expect(req.request.method).toBe('POST');
      req.flush(aCardResponse({ status: 'ARCHIVED' }));
      expect((await archived).status).toBe('ARCHIVED');

      void firstValueFrom(gateway.unarchive('card-1'));
      http.expectOne(CARDS_ENDPOINTS.unarchive('card-1')).flush(aCardResponse());
    });

    it('Dado as faturas, então pede o intervalo por fechamento e a página', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(
        gateway.listInvoices('card-1', {
          from: '2026-01-01',
          to: '2026-12-31',
          page: 1,
          pageSize: 50,
        }),
      );
      const req = http.expectOne((r) => r.url === CARDS_ENDPOINTS.invoices('card-1'));
      expect(req.request.params.get('from')).toBe('2026-01-01');
      expect(req.request.params.get('to')).toBe('2026-12-31');
      req.flush({ items: [], hasNext: false });
      expect((await result).items).toEqual([]);
    });

    it('Dado a prévia de compra, então é um POST com valor, parcelas e data (sem efeito colateral)', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(
        gateway.previewPurchase('card-1', {
          amount: '1200.00',
          installments: 6,
          date: '2026-10-10',
        }),
      );
      const req = http.expectOne(CARDS_ENDPOINTS.purchasePreview('card-1'));
      expect(req.request.body).toEqual({ amount: '1200.00', installments: 6, date: '2026-10-10' });
      req.flush({
        installments: [],
        total: brl('1200.00'),
        availableLimitAfter: brl('6517.00'),
        overLimit: false,
        warnings: [],
      });
      expect((await result).availableLimitAfter?.amount).toBe('6517.00');
    });

    it('Dado a prévia de mudança de dias e a de pagamento, então vão como parâmetros de consulta', async () => {
      const { gateway, http } = setup(false);

      void firstValueFrom(gateway.previewBillingChange('card-1', 10, 20));
      const billing = http.expectOne(
        (r) => r.url === CARDS_ENDPOINTS.billingChangePreview('card-1'),
      );
      expect(billing.request.params.get('closingDay')).toBe('10');
      expect(billing.request.params.get('dueDay')).toBe('20');
      billing.flush({
        effectiveFromClosingDate: '2026-11-25',
        firstNewInvoice: { closingDate: '2026-11-10', dueDate: '2026-11-20' },
        movedInstallments: 0,
        movedCredits: 0,
        notice: 'FROM_NEXT_INVOICE',
      });

      void firstValueFrom(gateway.previewPayment('inv-1', '500.00'));
      const payment = http.expectOne((r) => r.url === INVOICES_ENDPOINTS.paymentPreview('inv-1'));
      expect(payment.request.params.get('amount')).toBe('500.00');
      payment.flush({
        kind: 'PARTIAL',
        outstandingAfter: brl('783.00'),
        creditCarryAfter: brl('0.00'),
      });
    });

    it('Dado o pagamento, então leva o header Idempotency-Key e devolve a fatura atualizada', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(
        gateway.payInvoice(
          'inv-1',
          { accountId: 'acc-1', amount: '500.00', date: '2026-10-26' },
          'key-1',
        ),
      );
      const req = http.expectOne(INVOICES_ENDPOINTS.payments('inv-1'));
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('Idempotency-Key')).toBe('key-1');
      expect(req.request.body).toEqual({
        accountId: 'acc-1',
        amount: '500.00',
        date: '2026-10-26',
      });
      req.flush(anInvoiceResponse({ paid: brl('500.00') }));
      expect((await result).paid.amount).toBe('500.00');
    });

    it('Dado uma falha 422, então vira ProblemError com o code do contrato', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.archive('card-1'));
      http
        .expectOne(CARDS_ENDPOINTS.archive('card-1'))
        .flush(
          { code: 'CARD_HAS_PENDING_BALANCE', status: 422 },
          { status: 422, statusText: 'Unprocessable Entity' },
        );

      await expect(result).rejects.toMatchObject({
        problem: { status: 422, code: 'CARD_HAS_PENDING_BALANCE' },
      });
    });
  });

  it('Dado confirmar o fechamento, então POST closing-confirmation com a versão e devolve o cartão', async () => {
    const { gateway, http } = setup(false);

    const result = firstValueFrom(gateway.setClosingConfirmation('card-1', true, 3));
    const req = http.expectOne(CARDS_ENDPOINTS.closingConfirmation('card-1'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ confirmed: true, version: 3 });
    req.flush(aCardResponse({ closingConfirmed: true, version: 4 }));

    const card = await result;
    expect(card.closingConfirmed).toBe(true);
    expect(card.version).toBe(4);
  });

  it('Dado criar sem limite, então o POST manda limit nulo', async () => {
    const { gateway, http } = setup(false);

    const result = firstValueFrom(
      gateway.create({
        name: 'Azul',
        institution: null,
        limit: null,
        closingDay: 10,
        dueDay: 17,
        defaultPaymentAccountId: null,
      }),
    );
    const req = http.expectOne(CARDS_ENDPOINTS.collection);
    expect(req.request.body.limit).toBeNull();
    req.flush(aCardResponse({ limit: null, availableLimit: null, usedRatio: null }));

    expect((await result).limit).toBeNull();
  });
});
