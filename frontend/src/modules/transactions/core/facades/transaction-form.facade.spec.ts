import { TestBed } from '@angular/core/testing';
import { NEVER, Subject } from 'rxjs';

import { TransactionFormFacade } from '~/modules/transactions/core/facades/transaction-form.facade';
import { TransactionsEvents } from '~/modules/transactions/core/facades/transactions-events';
import type { Transaction } from '~/modules/transactions/core/types/transaction';
import { aProblem, failWith } from '~/testing/accounts-testing';
import {
  aTransaction,
  anExpenseInput,
  provideTransactionsStub,
  TransactionsGatewayStub,
} from '~/testing/transactions-testing';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function setup(gateway = new TransactionsGatewayStub()) {
  TestBed.configureTestingModule({
    providers: [provideTransactionsStub(gateway), TransactionFormFacade],
  });
  return {
    gateway,
    facade: TestBed.inject(TransactionFormFacade),
    events: TestBed.inject(TransactionsEvents),
  };
}

describe('TransactionFormFacade', () => {
  it('Dado um envio, então cria com uma Idempotency-Key UUID v4, emite a resposta e avisa a lista', () => {
    const { gateway, facade, events } = setup();
    const saved: Transaction[] = [];
    facade.saved$.subscribe((t) => saved.push(t));
    let changes = 0;
    events.changes$.subscribe(() => changes++);

    facade.submit({ kind: 'create', input: anExpenseInput() });

    expect(gateway.creates).toHaveLength(1);
    expect(gateway.creates[0]!.key).toMatch(UUID_V4);
    expect(saved).toEqual([aTransaction()]);
    expect(changes).toBe(1);
    expect(facade.saving()).toBe(false);
    expect(facade.problem()).toBeNull();
  });

  it('Dado erro de rede e "tentar de novo", então reenvia com a MESMA chave', () => {
    const gateway = new TransactionsGatewayStub();
    gateway.create$ = failWith(0, 'NETWORK');
    const { facade } = setup(gateway);

    facade.submit({ kind: 'create', input: anExpenseInput() });
    expect(facade.canRetry()).toBe(true);
    facade.retry();

    expect(gateway.creates).toHaveLength(2);
    expect(gateway.creates[1]!.key).toBe(gateway.creates[0]!.key);
    expect(gateway.creates[1]!.input).toEqual(gateway.creates[0]!.input);
  });

  it('Dado um envio novo com dados diferentes, então gera uma chave nova', () => {
    const gateway = new TransactionsGatewayStub();
    gateway.create$ = failWith(0, 'NETWORK');
    const { facade } = setup(gateway);

    facade.submit({ kind: 'create', input: anExpenseInput() });
    facade.submit({ kind: 'create', input: { ...anExpenseInput(), description: 'outra' } });

    expect(gateway.creates[1]!.key).not.toBe(gateway.creates[0]!.key);
  });

  it('Dado o retry bem-sucedido, então o envio termina e outro "tentar de novo" não reenvia nada', () => {
    const gateway = new TransactionsGatewayStub();
    gateway.create$ = failWith(0, 'NETWORK');
    const { facade } = setup(gateway);
    facade.submit({ kind: 'create', input: anExpenseInput() });
    const pending = new Subject<Transaction>();
    gateway.create$ = pending;

    facade.retry();
    pending.next(aTransaction());
    pending.complete();
    facade.retry(); // nada para repetir: o envio anterior terminou

    expect(gateway.creates).toHaveLength(2);
    expect(facade.problem()).toBeNull();
  });

  it('Dado clique duplo no salvar, então uma requisição só (exhaustMap)', () => {
    const gateway = new TransactionsGatewayStub();
    gateway.create$ = NEVER;
    const { facade } = setup(gateway);

    facade.submit({ kind: 'create', input: anExpenseInput() });
    facade.submit({ kind: 'create', input: anExpenseInput() });

    expect(gateway.creates).toHaveLength(1);
    expect(facade.saving()).toBe(true);
  });

  it.each([
    [400, 'VALIDATION_FAILED'],
    [409, 'IDEMPOTENCY_KEY_REUSED'],
    [422, 'TRANSACTION_ACCOUNT_NOT_CASH'],
  ])('Dado %i %s, então expõe a falha tipada e não oferece tentar de novo', (status, code) => {
    const gateway = new TransactionsGatewayStub();
    const fieldErrors = [{ field: 'amount', code: 'PATTERN', message: 'x' }];
    gateway.create$ = failWith(status, code, fieldErrors);
    const { facade } = setup(gateway);

    facade.submit({ kind: 'create', input: anExpenseInput() });

    expect(facade.problem()).toEqual(aProblem(status, code, fieldErrors));
    expect(facade.canRetry()).toBe(false);
  });

  it('Dado erro 500, então o "tentar de novo" é oferecido', () => {
    const gateway = new TransactionsGatewayStub();
    gateway.create$ = failWith(500, 'INTERNAL_ERROR');
    const { facade } = setup(gateway);

    facade.submit({ kind: 'create', input: anExpenseInput() });

    expect(facade.canRetry()).toBe(true);
  });

  it('Dado resposta perdida, quando envio a mesma entrada de novo, então vai a mesma Idempotency-Key', () => {
    const gateway = new TransactionsGatewayStub();
    gateway.create$ = failWith(0, 'NETWORK');
    const { facade } = setup(gateway);

    facade.submit({ kind: 'create', input: anExpenseInput() });
    facade.dismissProblem();
    facade.submit({ kind: 'create', input: anExpenseInput() });

    expect(gateway.creates).toHaveLength(2);
    expect(gateway.creates[1]!.key).toBe(gateway.creates[0]!.key);
  });

  it('Dado falha ambígua, quando a entrada muda, ou após recusa 422 ou sucesso, então a chave é nova', () => {
    const gateway = new TransactionsGatewayStub();
    gateway.create$ = failWith(503, 'UNAVAILABLE');
    const { facade } = setup(gateway);
    facade.submit({ kind: 'create', input: anExpenseInput() });
    facade.submit({ kind: 'create', input: { ...anExpenseInput(), description: 'outra' } });
    gateway.create$ = failWith(422, 'X');
    facade.submit({ kind: 'create', input: { ...anExpenseInput(), description: 'outra' } });
    facade.submit({ kind: 'create', input: { ...anExpenseInput(), description: 'outra' } });

    const keys = gateway.creates.map((c) => c.key);
    expect(keys[1]).not.toBe(keys[0]);
    expect(keys[3]).not.toBe(keys[2]);
    expect(new Set(keys).size).toBe(3);
  });

  it('Dado a edição, então o PUT leva a version e não usa Idempotency-Key', () => {
    const { gateway, facade } = setup();

    facade.submit({ kind: 'update', id: 'tx-1', input: anExpenseInput(), version: 4 });

    expect(gateway.updates).toEqual([{ id: 'tx-1', input: anExpenseInput(), version: 4 }]);
    expect(gateway.creates).toHaveLength(0);
  });

  it('Dado 409 VERSION_CONFLICT na edição, então a falha chega tipada', () => {
    const gateway = new TransactionsGatewayStub();
    gateway.update$ = failWith(409, 'VERSION_CONFLICT');
    const { facade } = setup(gateway);

    facade.submit({ kind: 'update', id: 'tx-1', input: anExpenseInput(), version: 4 });

    expect(facade.problem()?.code).toBe('VERSION_CONFLICT');
  });

  it('Dado um novo envio depois de uma falha, então a falha antiga é limpa', () => {
    const gateway = new TransactionsGatewayStub();
    gateway.create$ = failWith(422, 'X');
    const { facade } = setup(gateway);
    facade.submit({ kind: 'create', input: anExpenseInput() });
    gateway.create$ = NEVER;

    facade.submit({ kind: 'create', input: anExpenseInput() });

    expect(facade.problem()).toBeNull();
  });

  it('Dado uma falha, quando descarto o problema, então some o aviso e o "tentar de novo" não reenvia', () => {
    const gateway = new TransactionsGatewayStub();
    gateway.create$ = failWith(0, 'NETWORK');
    const { facade } = setup(gateway);
    facade.submit({ kind: 'create', input: anExpenseInput() });
    expect(facade.canRetry()).toBe(true);

    facade.dismissProblem();
    facade.retry();

    expect(facade.problem()).toBeNull();
    expect(gateway.creates).toHaveLength(1);
  });
});
