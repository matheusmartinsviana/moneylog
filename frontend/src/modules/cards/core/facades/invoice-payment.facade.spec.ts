import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';

import { InvoicePaymentFacade } from '~/modules/cards/core/facades/invoice-payment.facade';
import { brl, failWith } from '~/testing/accounts-testing';
import {
  aPaymentPreview,
  anInvoice,
  CardsGatewayStub,
  provideCardsStub,
} from '~/testing/cards-testing';

const INPUT = { accountId: 'acc-1', amount: '1283.00', date: '2026-10-26' };

function setup(gateway = new CardsGatewayStub()) {
  vi.useFakeTimers();
  TestBed.configureTestingModule({ providers: [provideCardsStub(gateway), InvoicePaymentFacade] });
  return { gateway, facade: TestBed.inject(InvoicePaymentFacade) };
}

describe('InvoicePaymentFacade', () => {
  afterEach(() => vi.useRealTimers());

  it('Dado o pagamento, então emite a fatura da resposta e envia uma chave por tentativa', () => {
    const { facade, gateway } = setup();
    const paid: string[] = [];
    facade.paid$.subscribe((invoice) => paid.push(invoice.paid.amount));

    facade.pay('inv-1', INPUT);
    facade.pay('inv-1', INPUT);

    expect(paid).toEqual(['1283.00', '1283.00']);
    const [first, second] = gateway.paymentCalls;
    expect(first?.key).toBeTruthy();
    expect(second?.key).not.toBe(first?.key);
  });

  it('Dado o clique duplo, então uma requisição só (exhaustMap)', () => {
    const gateway = new CardsGatewayStub();
    const pending = new Subject<ReturnType<typeof anInvoice>>();
    gateway.pay$ = pending;
    const { facade } = setup(gateway);

    facade.pay('inv-1', INPUT);
    facade.pay('inv-1', INPUT);

    expect(gateway.paymentCalls).toHaveLength(1);
    expect(facade.saving()).toBe(true);
    pending.next(anInvoice());
    pending.complete();
    expect(facade.saving()).toBe(false);
  });

  it('Dado erro de rede, então o "tentar de novo" reutiliza a mesma Idempotency-Key', () => {
    const gateway = new CardsGatewayStub();
    gateway.pay$ = failWith(0, 'NETWORK');
    const { facade } = setup(gateway);

    facade.pay('inv-1', INPUT);
    expect(facade.canRetry()).toBe(true);
    gateway.pay$ = null;
    facade.retry();

    expect(gateway.paymentCalls).toHaveLength(2);
    expect(gateway.paymentCalls[1]?.key).toBe(gateway.paymentCalls[0]?.key);
    expect(facade.problem()).toBeNull();
  });

  it('Dado resposta perdida (rede), quando pago de novo os mesmos dados, então vai a mesma Idempotency-Key', () => {
    const gateway = new CardsGatewayStub();
    gateway.pay$ = failWith(0, 'NETWORK');
    const { facade } = setup(gateway);

    facade.pay('inv-1', INPUT);
    facade.pay('inv-1', { ...INPUT });

    expect(gateway.paymentCalls).toHaveLength(2);
    expect(gateway.paymentCalls[1]?.key).toBe(gateway.paymentCalls[0]?.key);
  });

  it('Dado 5xx, quando fecho e reabro a folha da mesma fatura e pago de novo, então é uma só chave', () => {
    const gateway = new CardsGatewayStub();
    gateway.pay$ = failWith(503, 'UNAVAILABLE');
    const { facade } = setup(gateway);
    facade.pay('inv-1', INPUT);

    facade.reopen('inv-1');
    expect(facade.canRetry()).toBe(true);
    facade.pay('inv-1', INPUT);

    expect(gateway.paymentCalls[1]?.key).toBe(gateway.paymentCalls[0]?.key);
  });

  it('Dado falha ambígua, quando mudo valor, conta, data ou a fatura, então a chave é nova', () => {
    const gateway = new CardsGatewayStub();
    gateway.pay$ = failWith(0, 'NETWORK');
    const { facade } = setup(gateway);
    facade.pay('inv-1', INPUT);
    facade.pay('inv-1', { ...INPUT, amount: '10.00' });
    facade.pay('inv-1', { ...INPUT, accountId: 'acc-2' });
    facade.pay('inv-1', { ...INPUT, date: '2026-10-27' });
    facade.reopen('inv-2');
    facade.pay('inv-2', INPUT);

    const keys = gateway.paymentCalls.map((call) => call.key);
    expect(new Set(keys).size).toBe(5);
  });

  it('Dado recusa definitiva (422) ou sucesso, então o próximo envio usa chave nova', () => {
    const gateway = new CardsGatewayStub();
    gateway.pay$ = failWith(422, 'INVOICE_NOT_PAYABLE');
    const { facade } = setup(gateway);
    facade.pay('inv-1', INPUT);
    gateway.pay$ = null;
    facade.pay('inv-1', INPUT);
    facade.pay('inv-1', INPUT);

    const keys = gateway.paymentCalls.map((call) => call.key);
    expect(new Set(keys).size).toBe(3);
  });

  it('Dado 422 INVOICE_NOT_PAYABLE, então a falha é tipada e não oferece repetir', () => {
    const gateway = new CardsGatewayStub();
    gateway.pay$ = failWith(422, 'INVOICE_NOT_PAYABLE');
    const { facade } = setup(gateway);

    facade.pay('inv-1', INPUT);

    expect(facade.problem()).toMatchObject({ status: 422, code: 'INVOICE_NOT_PAYABLE' });
    expect(facade.canRetry()).toBe(false);
  });

  it('Dado a prévia, então espera 300 ms parado e usa só a última (switchMap)', () => {
    const { facade, gateway } = setup();

    facade.requestPreview('inv-1', '5.00');
    vi.advanceTimersByTime(200);
    facade.requestPreview('inv-1', '50.00');
    vi.advanceTimersByTime(299);
    expect(gateway.paymentPreviewCalls).toHaveLength(0);
    expect(facade.previewLoading()).toBe(true);
    vi.advanceTimersByTime(1);

    expect(gateway.paymentPreviewCalls).toEqual([{ invoiceId: 'inv-1', amount: '50.00' }]);
    expect(facade.previewData()?.kind).toBe('PARTIAL');
  });

  it('Dado a resposta da prévia, então a tela recebe os números do backend sem conta (mesmo que não batam)', () => {
    const gateway = new CardsGatewayStub();
    gateway.paymentPreview$ = of(
      aPaymentPreview({
        kind: 'OVERPAY',
        outstandingAfter: brl('1.23'),
        creditCarryAfter: brl('9.87'),
      }),
    );
    const { facade } = setup(gateway);

    facade.requestPreview('inv-1', '1300.00');
    vi.advanceTimersByTime(300);

    expect(facade.previewData()).toEqual({
      kind: 'OVERPAY',
      outstandingAfter: brl('1.23'),
      creditCarryAfter: brl('9.87'),
    });
  });

  it('Dado erro na prévia, então o estado é error e o pagamento continua possível', () => {
    const gateway = new CardsGatewayStub();
    gateway.paymentPreview$ = failWith(500, 'INTERNAL_ERROR');
    const { facade } = setup(gateway);

    facade.requestPreview('inv-1', '10.00');
    vi.advanceTimersByTime(300);
    expect(facade.previewState().status).toBe('error');

    facade.pay('inv-1', INPUT);
    expect(gateway.paymentCalls).toHaveLength(1);
  });

  it('Dado valor vazio, então limpa a prévia sem pedir nada', () => {
    const { facade, gateway } = setup();
    facade.requestPreview('inv-1', '10.00');

    facade.requestPreview('inv-1', null);
    vi.advanceTimersByTime(1000);

    expect(gateway.paymentPreviewCalls).toHaveLength(0);
    expect(facade.previewState().status).toBe('idle');
  });
});

describe('InvoicePaymentFacade: 409 CONFLICT (trava)', () => {
  it('Dado 409 CONFLICT, então oferece tentar de novo com a mesma chave', () => {
    vi.useFakeTimers();
    const gateway = new CardsGatewayStub();
    gateway.pay$ = failWith(409, 'CONFLICT');
    TestBed.configureTestingModule({
      providers: [provideCardsStub(gateway), InvoicePaymentFacade],
    });
    const facade = TestBed.inject(InvoicePaymentFacade);

    facade.pay('inv-1', INPUT);
    expect(facade.canRetry()).toBe(true);
    gateway.pay$ = null;
    facade.retry();

    expect(gateway.paymentCalls[1]?.key).toBe(gateway.paymentCalls[0]?.key);
    vi.useRealTimers();
  });
});
