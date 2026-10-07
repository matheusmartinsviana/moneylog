import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { DebtFormFacade } from '~/modules/debts/core/facades/debt-form.facade';
import type { DebtInput } from '~/modules/debts/core/types/debt';
import { failWith } from '~/testing/accounts-testing';
import { aDebt, DebtsGatewayStub, provideDebtsStub } from '~/testing/debts-testing';

const INPUT: DebtInput = {
  personId: 'person-1',
  direction: 'RECEIVABLE',
  principal: '80.00',
  date: '2026-10-05',
  expectedDate: null,
  description: 'Jantar',
  categoryId: null,
};

function setup(gateway = new DebtsGatewayStub()) {
  TestBed.configureTestingModule({ providers: [provideDebtsStub(gateway), DebtFormFacade] });
  return { gateway, facade: TestBed.inject(DebtFormFacade) };
}

describe('DebtFormFacade', () => {
  it('Dado o salvar, então envia uma Idempotency-Key e emite a dívida da resposta', () => {
    const { facade, gateway } = setup();
    const saved: string[] = [];
    facade.saved$.subscribe((debt) => saved.push(debt.id));

    facade.save(INPUT);

    expect(saved).toEqual(['debt-new']);
    expect(gateway.createKeys).toHaveLength(1);
    expect(gateway.createKeys[0]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('Dado o clique duplo, então uma requisição só', () => {
    const gateway = new DebtsGatewayStub();
    gateway.next = new Subject<ReturnType<typeof aDebt>>();
    const { facade } = setup(gateway);

    facade.save(INPUT);
    facade.save(INPUT);

    expect(gateway.createKeys).toHaveLength(1);
    expect(facade.saving()).toBe(true);
  });

  it.each([
    ['rede', 0, 'NETWORK'],
    ['5xx', 503, 'INTERNAL_ERROR'],
    ['trava ocupada', 409, 'CONFLICT'],
  ])(
    'Dado falha ambígua (%s), então "tentar de novo" e "Salvar" no mesmo corpo reusam a chave',
    (_n, status, code) => {
      const gateway = new DebtsGatewayStub();
      gateway.next = failWith(status, code);
      const { facade } = setup(gateway);

      facade.save(INPUT);
      expect(facade.canRetry()).toBe(true);
      facade.retry();
      facade.save({ ...INPUT });

      expect(gateway.createKeys).toHaveLength(3);
      expect(new Set(gateway.createKeys).size).toBe(1);
    },
  );

  it('Dado falha ambígua e corpo diferente, então a chave é nova', () => {
    const gateway = new DebtsGatewayStub();
    gateway.next = failWith(0, 'NETWORK');
    const { facade } = setup(gateway);

    facade.save(INPUT);
    facade.save({ ...INPUT, principal: '90.00' });

    expect(gateway.createKeys[1]).not.toBe(gateway.createKeys[0]);
  });

  it('Dado erro de regra (422), então não há "tentar de novo" e a próxima tentativa tem chave nova', () => {
    const gateway = new DebtsGatewayStub();
    gateway.next = failWith(422, 'DEBT_INVALID_PRINCIPAL');
    const { facade } = setup(gateway);

    facade.save(INPUT);
    facade.save(INPUT);

    expect(facade.canRetry()).toBe(false);
    expect(gateway.createKeys[1]).not.toBe(gateway.createKeys[0]);
  });

  it('Dado sucesso depois de uma falha ambígua, então o próximo envio igual usa chave nova', () => {
    const gateway = new DebtsGatewayStub();
    gateway.next = failWith(0, 'NETWORK');
    const { facade } = setup(gateway);
    facade.save(INPUT);
    gateway.next = null;
    facade.retry();

    facade.save(INPUT);

    expect(gateway.createKeys[1]).toBe(gateway.createKeys[0]);
    expect(gateway.createKeys[2]).not.toBe(gateway.createKeys[0]);
  });
});
