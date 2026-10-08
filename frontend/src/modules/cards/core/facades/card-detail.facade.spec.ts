import { TestBed } from '@angular/core/testing';
import { NEVER, of } from 'rxjs';

import { CardDetailFacade } from '~/modules/cards/core/facades/card-detail.facade';
import { brl, failWith } from '~/testing/accounts-testing';
import {
  aCard,
  anInvoiceItem,
  anInvoiceSummary,
  CardsGatewayStub,
  provideCardsStub,
} from '~/testing/cards-testing';

function setup(gateway = new CardsGatewayStub()) {
  TestBed.configureTestingModule({ providers: [provideCardsStub(gateway), CardDetailFacade] });
  return { gateway, facade: TestBed.inject(CardDetailFacade) };
}

describe('CardDetailFacade', () => {
  it('Dado abrir o cartão, então carrega o cartão e as faturas (e só elas)', () => {
    const gateway = new CardsGatewayStub();
    gateway.invoices = [anInvoiceSummary({ id: 'i1' }), anInvoiceSummary({ id: 'i2' })];
    const { facade } = setup(gateway);

    facade.load('card-1');

    expect(facade.card()?.name).toBe('Roxinho');
    const invoices = facade.invoices();
    expect(invoices.status === 'ready' && invoices.data.map((i) => i.id)).toEqual(['i1', 'i2']);
    expect(gateway.calls).not.toContain('future:card-1');
    expect(facade.future().status).toBe('idle');
  });

  it('Dado o cartão do cenário, então os dois comprometidos chegam separados e sem soma', () => {
    const gateway = new CardsGatewayStub();
    gateway.cards = [
      aCard({
        committedFuture: brl('1000.00'),
        totalCommitted: brl('1283.00'),
        availableLimit: brl('7717.00'),
      }),
    ];
    const { facade } = setup(gateway);

    facade.load('card-1');

    const card = facade.card()!;
    expect(card.committedFuture.amount).toBe('1000.00');
    expect(card.totalCommitted.amount).toBe('1283.00');
    expect(card.availableLimit?.amount).toBe('7717.00');
  });

  it('Dado as parcelas futuras, então carrega só quando pedido e usa total e byInvoice do backend', () => {
    const gateway = new CardsGatewayStub();
    gateway.future$ = of({
      total: brl('1000.00'),
      byInvoice: [
        {
          invoiceId: 'i2',
          referenceMonth: '2026-12',
          dueDate: '2026-12-05',
          amount: brl('200.00'),
          items: [anInvoiceItem({ number: 2 })],
        },
      ],
    });
    const { facade } = setup(gateway);
    facade.load('card-1');

    facade.loadFuture('card-1');

    const future = facade.future();
    expect(future.status === 'ready' && future.data.total.amount).toBe('1000.00');
  });

  it('Dado cartão inexistente ou de outro usuário (404), então notFound; outra falha, error', () => {
    const gateway = new CardsGatewayStub();
    gateway.getResult = failWith(404, 'CARD_NOT_FOUND');
    const { facade } = setup(gateway);

    facade.load('x');
    expect(facade.state().status).toBe('notFound');

    gateway.getResult = failWith(500, 'INTERNAL_ERROR');
    facade.load('x');
    expect(facade.state()).toMatchObject({ status: 'error', problem: { status: 500 } });
  });

  it('Dado falha nas faturas, então o cartão continua na tela e só a aba mostra o erro', () => {
    const gateway = new CardsGatewayStub();
    gateway.invoicesResult = failWith(500, 'INTERNAL_ERROR');
    const { facade } = setup(gateway);

    facade.load('card-1');

    expect(facade.card()).not.toBeNull();
    expect(facade.invoices().status).toBe('error');
  });

  it('Dado mais de 50 faturas, então pagina até o fim', () => {
    const gateway = new CardsGatewayStub();
    gateway.invoices = Array.from({ length: 51 }, (_, i) => anInvoiceSummary({ id: `i${i}` }));
    const { facade } = setup(gateway);

    facade.load('card-1');

    const invoices = facade.invoices();
    expect(invoices.status === 'ready' && invoices.data).toHaveLength(51);
    expect(gateway.invoiceQueries.map((q) => q.page)).toEqual([1, 2]);
  });

  it('Dado refresh, então recarrega sem voltar ao esqueleto e traz o cartão novo', () => {
    const gateway = new CardsGatewayStub();
    gateway.cards = [aCard({ availableLimit: brl('7717.00') })];
    const { facade } = setup(gateway);
    facade.load('card-1');
    gateway.cards = [aCard({ availableLimit: brl('9000.00') })];
    gateway.getResult = NEVER as never;

    facade.refresh('card-1');
    // Enquanto espera, o cartão anterior continua na tela.
    expect(facade.card()?.availableLimit?.amount).toBe('7717.00');

    gateway.getResult = null;
    facade.refresh('card-1');
    expect(facade.card()?.availableLimit?.amount).toBe('9000.00');
  });
});
