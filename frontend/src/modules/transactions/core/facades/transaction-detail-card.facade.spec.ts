import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';

import { TransactionDetailFacade } from '~/modules/transactions/core/facades/transaction-detail.facade';
import { TransactionsEvents } from '~/modules/transactions/core/facades/transactions-events';
import { failWith } from '~/testing/accounts-testing';
import {
  aTransaction,
  provideTransactionsStub,
  TransactionsGatewayStub,
} from '~/testing/transactions-testing';

const blocked = () =>
  aTransaction({
    id: 'tx-card',
    type: 'CARD_PURCHASE',
    voidable: false,
    voidBlockedBy: 'TRANSACTION_IN_CLOSED_INVOICE',
    editable: true,
  });

function setup(gateway = new TransactionsGatewayStub()) {
  TestBed.configureTestingModule({
    providers: [provideTransactionsStub(gateway), TransactionDetailFacade],
  });
  return { gateway, facade: TestBed.inject(TransactionDetailFacade) };
}

describe('TransactionDetailFacade: compra no cartão (T63, T70)', () => {
  it('Dado voidBlockedBy TRANSACTION_IN_CLOSED_INVOICE, então expõe a razão tipada e a ação "cancelar parcelas restantes"', () => {
    const gateway = new TransactionsGatewayStub();
    gateway.get$ = of(blocked());
    const { facade } = setup(gateway);

    facade.load('tx-card');

    expect(facade.voidBlockedBy()).toBe('TRANSACTION_IN_CLOSED_INVOICE');
    expect(facade.canCancelInstallments()).toBe(true);
  });

  it.each([
    ['uma despesa', aTransaction({ voidBlockedBy: 'TRANSACTION_IN_CLOSED_INVOICE' })],
    ['compra com estorno permitido', aTransaction({ type: 'CARD_PURCHASE' })],
    ['compra já estornada', { ...blocked(), status: 'VOIDED' as const }],
    [
      'compra bloqueada por reembolso',
      { ...blocked(), voidBlockedBy: 'HAS_ACTIVE_REFUNDS' as const },
    ],
  ])('Dado %s, então não oferece cancelar parcelas', (_, tx) => {
    const gateway = new TransactionsGatewayStub();
    gateway.get$ = of(tx);
    const { facade } = setup(gateway);

    facade.load('tx-card');

    expect(facade.canCancelInstallments()).toBe(false);
  });

  it('Dado o cancelamento, então envia o motivo aparado, usa a compra da resposta e avisa a lista', () => {
    const gateway = new TransactionsGatewayStub();
    gateway.get$ = of(blocked());
    gateway.cancel$ = of(
      aTransaction({
        id: 'tx-card',
        type: 'CARD_PURCHASE',
        voidBlockedBy: 'TRANSACTION_IN_CLOSED_INVOICE',
        description: 'Notebook (parcelas canceladas)',
      }),
    );
    const { facade } = setup(gateway);
    const events = TestBed.inject(TransactionsEvents);
    let notified = 0;
    events.changes$.subscribe(() => notified++);
    const canceled: string[] = [];
    facade.canceled$.subscribe((tx) => canceled.push(tx.description));
    facade.load('tx-card');

    facade.cancelInstallments('tx-card', '  devolvi o produto  ');

    expect(gateway.cancels).toEqual([{ id: 'tx-card', reason: 'devolvi o produto' }]);
    expect(facade.transaction()?.description).toBe('Notebook (parcelas canceladas)');
    expect(canceled).toEqual(['Notebook (parcelas canceladas)']);
    expect(notified).toBe(1);
    expect(facade.canceling()).toBe(false);
  });

  it('Dado o clique duplo no cancelamento, então uma requisição só', () => {
    const gateway = new TransactionsGatewayStub();
    gateway.get$ = of(blocked());
    gateway.cancel$ = new Subject<never>();
    const { facade } = setup(gateway);
    facade.load('tx-card');

    facade.cancelInstallments('tx-card', 'motivo');
    facade.cancelInstallments('tx-card', 'motivo');

    expect(gateway.cancels).toHaveLength(1);
    expect(facade.canceling()).toBe(true);
  });

  it.each(['CARD_NO_INSTALLMENTS_TO_CANCEL', 'TRANSACTION_NOT_CANCELABLE'])(
    'Dado 422 %s, então a falha fica tipada e a compra continua a mesma',
    (code) => {
      const gateway = new TransactionsGatewayStub();
      gateway.get$ = of(blocked());
      gateway.cancel$ = failWith(422, code);
      const { facade } = setup(gateway);
      facade.load('tx-card');

      facade.cancelInstallments('tx-card', 'motivo');

      expect(facade.cancelProblem()).toMatchObject({ status: 422, code });
      expect(facade.transaction()?.id).toBe('tx-card');
    },
  );
});
