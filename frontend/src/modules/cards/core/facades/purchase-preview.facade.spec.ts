import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { PurchasePreviewFacade } from '~/modules/cards/core/facades/purchase-preview.facade';
import { brl, failWith } from '~/testing/accounts-testing';
import { aPurchasePreview, CardsGatewayStub, provideCardsStub } from '~/testing/cards-testing';

function setup(gateway = new CardsGatewayStub()) {
  vi.useFakeTimers();
  TestBed.configureTestingModule({ providers: [provideCardsStub(gateway), PurchasePreviewFacade] });
  return { gateway, facade: TestBed.inject(PurchasePreviewFacade) };
}

const REQUEST = { amount: '1200.00', installments: 6, date: '2026-10-10' };

describe('PurchasePreviewFacade', () => {
  afterEach(() => vi.useRealTimers());

  it('Dado a combinação, então espera 300 ms e pede ao backend valor, parcelas e data', () => {
    const { facade, gateway } = setup();

    facade.request('card-1', REQUEST);
    expect(facade.loading()).toBe(true);
    vi.advanceTimersByTime(299);
    expect(gateway.purchaseRequests).toHaveLength(0);
    vi.advanceTimersByTime(1);

    expect(gateway.purchaseRequests).toEqual([{ cardId: 'card-1', request: REQUEST }]);
    expect(facade.loading()).toBe(false);
  });

  it('Dado valores que não somam, então mostra exatamente o que veio (nada é recalculado)', () => {
    const gateway = new CardsGatewayStub();
    const preview = aPurchasePreview({ total: brl('1200.00'), availableLimitAfter: brl('1.00') });
    gateway.purchasePreview$ = of(preview);
    const { facade } = setup(gateway);

    facade.request('card-1', REQUEST);
    vi.advanceTimersByTime(300);

    const data = facade.data()!;
    expect(data.installments.map((i) => i.amount.amount)).toEqual(['600.01', '599.99']);
    expect(data.total.amount).toBe('1200.00');
    expect(data.availableLimitAfter.amount).toBe('1.00');
    expect(data.installments).toHaveLength(2);
  });

  it('Dado digitar de novo no meio da espera, então só a última combinação é pedida (cancela a anterior)', () => {
    const { facade, gateway } = setup();

    facade.request('card-1', { ...REQUEST, installments: 2 });
    vi.advanceTimersByTime(200);
    facade.request('card-1', { ...REQUEST, installments: 3 });
    vi.advanceTimersByTime(300);

    expect(gateway.purchaseRequests.map((r) => r.request.installments)).toEqual([3]);
  });

  it('Dado dados incompletos (null), então limpa a prévia e não pede nada', () => {
    const { facade, gateway } = setup();
    facade.request('card-1', REQUEST);

    facade.request('card-1', null);
    vi.advanceTimersByTime(1000);

    expect(gateway.purchaseRequests).toHaveLength(0);
    expect(facade.state().status).toBe('idle');
  });

  it('Dado 422, então o estado é error com o code (a tela decide; salvar continua possível)', () => {
    const gateway = new CardsGatewayStub();
    gateway.purchasePreview$ = failWith(422, 'CARD_ARCHIVED');
    const { facade } = setup(gateway);

    facade.request('card-1', REQUEST);
    vi.advanceTimersByTime(300);

    expect(facade.problem()).toMatchObject({ status: 422, code: 'CARD_ARCHIVED' });
  });
});
