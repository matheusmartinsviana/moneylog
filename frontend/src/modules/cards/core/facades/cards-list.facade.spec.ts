import { TestBed } from '@angular/core/testing';
import { firstValueFrom, NEVER } from 'rxjs';

import { CardsListFacade } from '~/modules/cards/core/facades/cards-list.facade';
import { aProblem, failWith, brl } from '~/testing/accounts-testing';
import { aCard, CardsGatewayStub, provideCardsStub } from '~/testing/cards-testing';

function setup(gateway = new CardsGatewayStub()) {
  TestBed.configureTestingModule({ providers: [provideCardsStub(gateway), CardsListFacade] });
  return { gateway, facade: TestBed.inject(CardsListFacade) };
}

describe('CardsListFacade', () => {
  it('Dado a carga em andamento, então expõe "loading" e nada mais', () => {
    const gateway = new CardsGatewayStub();
    gateway.listError = NEVER as never;
    const { facade } = setup(gateway);

    facade.load();

    expect(facade.loading()).toBe(true);
    expect(facade.data()).toBeNull();
  });

  it('Dado nenhum cartão, então expõe "empty"', () => {
    const { facade } = setup();

    facade.load();

    expect(facade.empty()).toBe(true);
  });

  it('Dado cartões, então "data" traz os dois comprometidos e o disponível exatamente como recebidos', () => {
    const gateway = new CardsGatewayStub();
    // Os números não "fecham" de propósito: o front não soma nem corrige.
    gateway.cards = [
      aCard({
        id: 'a',
        availableLimit: brl('1.00'),
        totalCommitted: brl('3.33'),
        committedFuture: brl('4.44'),
        usedRatio: 0.25,
      }),
    ];
    const { facade } = setup(gateway);

    facade.load();

    const card = facade.data()![0]!;
    expect(card.availableLimit.amount).toBe('1.00');
    expect(card.totalCommitted.amount).toBe('3.33');
    expect(card.committedFuture.amount).toBe('4.44');
    expect(card.usedRatio).toBe(0.25);
  });

  it('Dado o filtro, então pede ativos por padrão e arquivados quando escolhidos, 50 por página', () => {
    const { facade, gateway } = setup();

    facade.load();
    facade.load('ARCHIVED');

    expect(gateway.queries.map((q) => [q.status, q.pageSize])).toEqual([
      ['ACTIVE', 50],
      ['ARCHIVED', 50],
    ]);
  });

  it('Dado mais de 50 cartões, então loadAll pagina até hasNext = false (o 51º não some)', async () => {
    const gateway = new CardsGatewayStub();
    gateway.cards = Array.from({ length: 51 }, (_, i) =>
      aCard({ id: `c${i}`, name: `Cartão ${i}` }),
    );
    const { facade } = setup(gateway);

    const all = await firstValueFrom(facade.loadAll('ACTIVE'));

    expect(all).toHaveLength(51);
    expect(gateway.queries.map((q) => q.page)).toEqual([1, 2]);
  });

  it('Dado uma falha, então expõe "error" com o code', () => {
    const gateway = new CardsGatewayStub();
    gateway.listError = failWith(500, 'INTERNAL_ERROR');
    const { facade } = setup(gateway);

    facade.load();

    expect(facade.error()).toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });
  });

  it('Dado arquivar, então a lista usa o cartão da resposta e ele sai da aba de ativos', async () => {
    const gateway = new CardsGatewayStub();
    gateway.cards = [aCard({ id: 'a' }), aCard({ id: 'b' })];
    const { facade } = setup(gateway);
    facade.load();

    const archived = await firstValueFrom(facade.archive('a'));

    expect(archived.status).toBe('ARCHIVED');
    expect(facade.data()?.map((c) => c.id)).toEqual(['b']);
  });

  it('Dado arquivar o último, então a lista fica vazia', async () => {
    const gateway = new CardsGatewayStub();
    gateway.cards = [aCard({ id: 'a' })];
    const { facade } = setup(gateway);
    facade.load();

    await firstValueFrom(facade.archive('a'));

    expect(facade.empty()).toBe(true);
  });

  it('Dado CARD_HAS_PENDING_BALANCE ao arquivar, então o erro chega tipado e a lista não muda', async () => {
    const gateway = new CardsGatewayStub();
    gateway.cards = [aCard({ id: 'a' })];
    const { facade } = setup(gateway);
    facade.load();
    gateway.next = failWith(422, 'CARD_HAS_PENDING_BALANCE');

    await expect(firstValueFrom(facade.archive('a'))).rejects.toMatchObject({
      problem: aProblem(422, 'CARD_HAS_PENDING_BALANCE'),
    });
    expect(facade.data()?.map((c) => c.id)).toEqual(['a']);
  });
});
