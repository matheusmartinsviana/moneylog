import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { CardFormFacade } from '~/modules/cards/core/facades/card-form.facade';
import { failWith } from '~/testing/accounts-testing';
import { aCard, CardsGatewayStub, provideCardsStub } from '~/testing/cards-testing';

const INPUT = {
  name: 'Roxinho',
  institution: null,
  limit: '10000.00',
  closingDay: 25,
  dueDay: 5,
  defaultPaymentAccountId: null,
};

function setup(gateway = new CardsGatewayStub()) {
  TestBed.configureTestingModule({ providers: [provideCardsStub(gateway), CardFormFacade] });
  return { gateway, facade: TestBed.inject(CardFormFacade) };
}

describe('CardFormFacade', () => {
  it('Dado o salvar, então emite o cartão da resposta (não o digitado)', () => {
    const { facade } = setup();
    const saved: string[] = [];
    facade.saved$.subscribe((card) => saved.push(`${card.name}:${card.version}`));

    facade.save({ kind: 'create', input: INPUT });

    expect(saved).toEqual(['Roxinho:2']);
    expect(facade.saving()).toBe(false);
    expect(facade.problem()).toBeNull();
  });

  it('Dado o clique duplo, então uma requisição só (exhaustMap)', () => {
    const gateway = new CardsGatewayStub();
    const pending = new Subject<ReturnType<typeof aCard>>();
    gateway.next = pending;
    const { facade } = setup(gateway);

    facade.save({ kind: 'create', input: INPUT });
    facade.save({ kind: 'create', input: INPUT });

    expect(gateway.calls.filter((c) => c.startsWith('create'))).toHaveLength(1);
    expect(facade.saving()).toBe(true);
    pending.next(aCard());
    pending.complete();
    expect(facade.saving()).toBe(false);
  });

  it('Dado a edição, então envia a version e o confirmedEffectiveFrom', () => {
    const { facade, gateway } = setup();

    facade.save({
      kind: 'update',
      id: 'card-1',
      input: { ...INPUT, version: 4, confirmedEffectiveFrom: '2026-11-25' },
    });

    expect(gateway.calls).toContain('update:card-1:4');
    expect(gateway.updates[0]?.confirmedEffectiveFrom).toBe('2026-11-25');
  });

  it('Dado 422/409, então a falha fica tipada em problem com o code', () => {
    const gateway = new CardsGatewayStub();
    gateway.next = failWith(409, 'CARD_BILLING_CHANGE_STALE');
    const { facade } = setup(gateway);

    facade.save({
      kind: 'update',
      id: 'card-1',
      input: { ...INPUT, version: 1, confirmedEffectiveFrom: null },
    });

    expect(facade.problem()).toMatchObject({ status: 409, code: 'CARD_BILLING_CHANGE_STALE' });
    expect(facade.saving()).toBe(false);
  });

  it('Dado um novo envio depois de uma falha, então a falha anterior é limpa', () => {
    const gateway = new CardsGatewayStub();
    gateway.next = failWith(422, 'CARD_INVALID_LIMIT');
    const { facade } = setup(gateway);
    facade.save({ kind: 'create', input: INPUT });
    expect(facade.problem()?.code).toBe('CARD_INVALID_LIMIT');

    gateway.next = null;
    facade.save({ kind: 'create', input: INPUT });

    expect(facade.problem()).toBeNull();
  });

  it('Dado carregar para editar, então guarda o cartão; 404 vira erro e limpa o cartão', () => {
    const gateway = new CardsGatewayStub();
    gateway.cards = [aCard({ id: 'card-1', version: 9 })];
    const { facade } = setup(gateway);

    facade.load('card-1');
    expect(facade.card()?.version).toBe(9);

    gateway.getResult = failWith(404, 'CARD_NOT_FOUND');
    facade.load('card-1');
    expect(facade.card()).toBeNull();
    expect(facade.loadStatus()).toMatchObject({ status: 'error', problem: { status: 404 } });
  });
});
