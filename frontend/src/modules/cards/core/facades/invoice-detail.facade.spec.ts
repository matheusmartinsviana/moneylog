import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { InvoiceDetailFacade } from '~/modules/cards/core/facades/invoice-detail.facade';
import { brl, failWith } from '~/testing/accounts-testing';
import { anInvoice, CardsGatewayStub, provideCardsStub } from '~/testing/cards-testing';

function setup(gateway = new CardsGatewayStub()) {
  TestBed.configureTestingModule({ providers: [provideCardsStub(gateway), InvoiceDetailFacade] });
  return { gateway, facade: TestBed.inject(InvoiceDetailFacade) };
}

describe('InvoiceDetailFacade', () => {
  it('Dado a fatura, então expõe itens, total, carryIn e outstanding como o backend os calculou', () => {
    const gateway = new CardsGatewayStub();
    // Os valores não fecham de propósito (total − pago ≠ em aberto): o front mostra o que veio.
    gateway.invoice$ = of(
      anInvoice({
        total: brl('10.00'),
        paid: brl('3.00'),
        carryIn: brl('1.00'),
        outstanding: brl('99.00'),
        creditCarry: brl('17.00'),
      }),
    );
    const { facade } = setup(gateway);

    facade.load('inv-1');

    expect(facade.state().status).toBe('ready');
    expect(facade.invoice()).toMatchObject({
      outstanding: brl('99.00'),
      carryIn: brl('1.00'),
      creditCarry: brl('17.00'),
    });
    expect(facade.invoice()?.items).toHaveLength(1);
  });

  it('Dado fatura de outro usuário ou fora da janela (404), então notFound', () => {
    const gateway = new CardsGatewayStub();
    gateway.invoice$ = failWith(404, 'INVOICE_NOT_FOUND');
    const { facade } = setup(gateway);

    facade.load('inv-1');

    expect(facade.state().status).toBe('notFound');
  });

  it('Dado erro de rede, então error com o problema (tentar de novo)', () => {
    const gateway = new CardsGatewayStub();
    gateway.invoice$ = failWith(0, 'NETWORK');
    const { facade } = setup(gateway);

    facade.load('inv-1');

    expect(facade.state()).toMatchObject({ status: 'error', problem: { status: 0 } });
  });

  it('Dado o pagamento, então replace troca a fatura pela resposta', () => {
    const { facade } = setup();
    facade.load('inv-1');

    facade.replace(anInvoice({ outstanding: brl('783.00'), paid: brl('500.00') }));

    expect(facade.invoice()?.outstanding.amount).toBe('783.00');
    expect(facade.invoice()?.paid.amount).toBe('500.00');
  });
});
