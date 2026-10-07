import { TestBed } from '@angular/core/testing';

import { RecurrenceFormFacade } from '~/modules/recurrences/core/facades/recurrence-form.facade';
import type { RecurrenceInput } from '~/modules/recurrences/core/types/recurrence';
import { failWith } from '~/testing/accounts-testing';
import { provideRecurrencesStub, RecurrencesGatewayStub } from '~/testing/recurrences-testing';

const INPUT: RecurrenceInput = {
  type: 'EXPENSE',
  amount: '119.00',
  description: 'Internet',
  categoryId: 'cat-1',
  accountId: 'acc-1',
  method: 'BOLETO',
  cardId: null,
  frequency: 'MONTHLY',
  interval: null,
  unit: null,
  startDate: '2026-10-10',
  endDate: null,
  maxOccurrences: null,
};

function setup(gateway = new RecurrencesGatewayStub()) {
  TestBed.configureTestingModule({
    providers: [provideRecurrencesStub(gateway), RecurrenceFormFacade],
  });
  return { gateway, facade: TestBed.inject(RecurrenceFormFacade) };
}

describe('RecurrenceFormFacade', () => {
  it('Dado criar, então envia uma Idempotency-Key', () => {
    const { facade, gateway } = setup();

    facade.save({ kind: 'create', input: INPUT });

    expect(gateway.createKeys).toHaveLength(1);
  });

  it('Dado falha de rede e o mesmo corpo, então reusa a chave; corpo novo, chave nova', () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.next = failWith(0, 'NETWORK');
    const { facade } = setup(gateway);

    facade.save({ kind: 'create', input: INPUT });
    facade.save({ kind: 'create', input: { ...INPUT } });
    facade.save({ kind: 'create', input: { ...INPUT, amount: '120.00' } });

    expect(gateway.createKeys[1]).toBe(gateway.createKeys[0]);
    expect(gateway.createKeys[2]).not.toBe(gateway.createKeys[0]);
  });

  it('Dado 422, então a próxima tentativa tem chave nova', () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.next = failWith(422, 'RECURRENCE_INVALID');
    const { facade } = setup(gateway);

    facade.save({ kind: 'create', input: INPUT });
    facade.save({ kind: 'create', input: INPUT });

    expect(gateway.createKeys[1]).not.toBe(gateway.createKeys[0]);
  });

  it('Dado dismissProblem, então a falha some', () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.next = failWith(409, 'VERSION_CONFLICT');
    const { facade } = setup(gateway);
    facade.save({
      kind: 'update',
      id: 'r1',
      input: {
        amount: '1.00',
        description: 'x',
        categoryId: 'c',
        accountId: 'a',
        method: 'PIX',
        cardId: null,
        endDate: null,
        version: 1,
      },
    });

    facade.dismissProblem();

    expect(facade.problem()).toBeNull();
  });
});
