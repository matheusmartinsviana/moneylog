import { TestBed } from '@angular/core/testing';

import { BillingChangePreviewFacade } from '~/modules/cards/core/facades/billing-change-preview.facade';
import { failWith } from '~/testing/accounts-testing';
import { aBillingPreview, CardsGatewayStub, provideCardsStub } from '~/testing/cards-testing';

function setup(gateway = new CardsGatewayStub()) {
  vi.useFakeTimers();
  TestBed.configureTestingModule({
    providers: [provideCardsStub(gateway), BillingChangePreviewFacade],
  });
  return { gateway, facade: TestBed.inject(BillingChangePreviewFacade) };
}

describe('BillingChangePreviewFacade', () => {
  afterEach(() => vi.useRealTimers());

  it('Dado a mudança de dia, então espera 300 ms e traz a prévia do backend como recebida', () => {
    const { facade, gateway } = setup();

    facade.request('card-1', { closingDay: 10, dueDay: 20 });
    vi.advanceTimersByTime(300);

    expect(gateway.billingPreviewCalls).toEqual([{ cardId: 'card-1', closingDay: 10, dueDay: 20 }]);
    expect(facade.data()).toEqual(aBillingPreview());
  });

  it('Dado outra mudança no meio da espera, então só a última é pedida', () => {
    const { facade, gateway } = setup();

    facade.request('card-1', { closingDay: 10, dueDay: 20 });
    vi.advanceTimersByTime(200);
    facade.request('card-1', { closingDay: 11, dueDay: 20 });
    vi.advanceTimersByTime(300);

    expect(gateway.billingPreviewCalls.map((c) => c.closingDay)).toEqual([11]);
  });

  it('Dado nenhuma mudança de dia (null), então nenhuma prévia é pedida', () => {
    const { facade, gateway } = setup();

    facade.request('card-1', null);
    vi.advanceTimersByTime(1000);

    expect(gateway.billingPreviewCalls).toHaveLength(0);
    expect(facade.state().status).toBe('idle');
  });

  it('Dado 422 CARD_INVALID_BILLING_DAY, então error tipado', () => {
    const gateway = new CardsGatewayStub();
    gateway.billingPreview$ = failWith(422, 'CARD_INVALID_BILLING_DAY');
    const { facade } = setup(gateway);

    facade.request('card-1', { closingDay: 40, dueDay: 5 });
    vi.advanceTimersByTime(300);

    expect(facade.problem()?.code).toBe('CARD_INVALID_BILLING_DAY');
  });
});
