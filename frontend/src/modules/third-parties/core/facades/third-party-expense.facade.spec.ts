import { TestBed } from '@angular/core/testing';
import { NEVER, of } from 'rxjs';

import { ThirdPartyExpenseFacade } from '~/modules/third-parties/core/facades/third-party-expense.facade';
import { failWith } from '~/testing/accounts-testing';
import {
  aReceivables,
  ThirdPartiesGatewayStub,
  provideThirdPartiesStub,
} from '~/testing/third-parties-testing';

function setup(stub = new ThirdPartiesGatewayStub()) {
  TestBed.configureTestingModule({
    providers: [provideThirdPartiesStub(stub), ThirdPartyExpenseFacade],
  });
  return { stub, facade: TestBed.inject(ThirdPartyExpenseFacade) };
}

describe('ThirdPartyExpenseFacade', () => {
  it('Dado uma despesa marcada, então acha a pessoa e o reembolso recebido que o servidor devolveu', () => {
    const { facade } = setup();

    facade.find('tx-tp-1');

    expect(facade.link()?.person).toEqual({ id: 'person-1', name: 'Ana' });
    expect(facade.link()?.item.received.amount).toBe('100.00');
    expect(facade.link()?.item.pending.amount).toBe('200.00');
  });

  it('Dado uma despesa sem marca, então a consulta termina sem vínculo', () => {
    const { facade } = setup();

    facade.find('tx-qualquer');

    expect(facade.lookup().status).toBe('done');
    expect(facade.link()).toBeNull();
  });

  it('Dado que a consulta falha, então não afirma nem nega a marca', () => {
    const stub = new ThirdPartiesGatewayStub();
    stub.receivables$ = failWith(500, 'INTERNAL');
    const { facade } = setup(stub);

    facade.find('tx-tp-1');

    expect(facade.lookup().status).toBe('unknown');
    expect(facade.link()).toBeNull();
  });

  it('Dado a marca, então manda a pessoa com uma Idempotency-Key e avisa com a resposta do backend', () => {
    const { facade, stub } = setup();
    const marked: string[] = [];
    facade.marked$.subscribe((expense) => marked.push(expense.personId));

    facade.mark({ transactionId: 'tx-1', personId: 'person-1', note: null });

    expect(stub.marks).toHaveLength(1);
    expect(stub.marks[0]!.key).toMatch(/[0-9a-f-]{36}/);
    expect(marked).toEqual(['person-1']);
    expect(facade.saving()).toBe(false);
  });

  it('Dado clique duplo durante o envio, então só uma requisição sai (exhaustMap)', () => {
    const stub = new ThirdPartiesGatewayStub();
    stub.mark$ = NEVER;
    const { facade } = setup(stub);

    facade.mark({ transactionId: 'tx-1', personId: 'person-1', note: null });
    facade.mark({ transactionId: 'tx-1', personId: 'person-1', note: null });

    expect(stub.marks).toHaveLength(1);
    expect(facade.saving()).toBe(true);
  });

  it('Dado falha de rede, então o retry do mesmo envio reaproveita a chave', () => {
    const stub = new ThirdPartiesGatewayStub();
    stub.mark$ = failWith(0, 'NETWORK');
    const { facade } = setup(stub);
    const input = { transactionId: 'tx-1', personId: 'person-1', note: null };

    facade.mark(input);
    expect(facade.problem()).toMatchObject({ status: 0 });
    facade.mark(input);

    expect(stub.marks[1]!.key).toBe(stub.marks[0]!.key);
  });

  it('Dado que já estava marcada, então mostra o motivo e relê a marca do backend', () => {
    const stub = new ThirdPartiesGatewayStub();
    stub.mark$ = failWith(422, 'THIRD_PARTY_EXPENSE_ALREADY_MARKED');
    const { facade } = setup(stub);
    stub.receivables$ = of(aReceivables());

    facade.mark({ transactionId: 'tx-tp-1', personId: 'person-1', note: null });

    expect(facade.problem()?.code).toBe('THIRD_PARTY_EXPENSE_ALREADY_MARKED');
    expect(facade.link()?.person.name).toBe('Ana');
  });
});
