import { TestBed } from '@angular/core/testing';
import { NEVER, of } from 'rxjs';

import { TransactionDetailFacade } from '~/modules/transactions/core/facades/transaction-detail.facade';
import { TransactionsEvents } from '~/modules/transactions/core/facades/transactions-events';
import { failWith } from '~/testing/accounts-testing';
import {
  aTransaction,
  provideTransactionsStub,
  TransactionsGatewayStub,
} from '~/testing/transactions-testing';

function setup(gateway = new TransactionsGatewayStub()) {
  TestBed.configureTestingModule({
    providers: [provideTransactionsStub(gateway), TransactionDetailFacade],
  });
  return {
    gateway,
    facade: TestBed.inject(TransactionDetailFacade),
    events: TestBed.inject(TransactionsEvents),
  };
}

describe('TransactionDetailFacade', () => {
  it('Dado o id, então carrega e expõe a movimentação como veio (impacto incluso)', () => {
    const { facade } = setup();

    facade.load('tx-1');

    expect(facade.transaction()).toEqual(aTransaction());
    expect(facade.transaction()?.impact.cash).toEqual({ amount: '-35.00', currency: 'BRL' });
  });

  it('Dado a carga pendente, então "loading"', () => {
    const gateway = new TransactionsGatewayStub();
    gateway.get$ = NEVER;
    const { facade } = setup(gateway);

    facade.load('tx-1');

    expect(facade.state().status).toBe('loading');
  });

  it('Dado 404, então "notFound"; outro erro, "error" com o Problem', () => {
    const gateway = new TransactionsGatewayStub();
    gateway.get$ = failWith(404, 'TRANSACTION_NOT_FOUND');
    const { facade } = setup(gateway);
    facade.load('x');
    expect(facade.state().status).toBe('notFound');

    gateway.get$ = failWith(500, 'INTERNAL_ERROR');
    facade.load('x');
    const state = facade.state();
    expect(state.status === 'error' && state.problem.code).toBe('INTERNAL_ERROR');
  });

  it('Dado o estorno, então envia o motivo, substitui a movimentação pela resposta (VOIDED) e avisa a lista para recarregar', () => {
    const gateway = new TransactionsGatewayStub();
    gateway.void$ = of(
      aTransaction({
        status: 'VOIDED',
        voidReason: 'duplicada',
        voidedAt: '2026-10-04T15:00:00Z',
        voidable: false,
        editable: false,
      }),
    );
    const { facade, events } = setup(gateway);
    facade.load('tx-1');
    let changes = 0;
    events.changes$.subscribe(() => changes++);

    facade.voidTransaction('tx-1', '  duplicada  ');

    expect(gateway.voids).toEqual([{ id: 'tx-1', reason: 'duplicada' }]);
    expect(facade.transaction()).toMatchObject({ status: 'VOIDED', voidReason: 'duplicada' });
    expect(changes).toBe(1);
    expect(facade.voiding()).toBe(false);
  });

  it('Dado TRANSACTION_HAS_ACTIVE_REFUNDS, então expõe a falha e mantém a movimentação', () => {
    const gateway = new TransactionsGatewayStub();
    gateway.void$ = failWith(422, 'TRANSACTION_HAS_ACTIVE_REFUNDS');
    const { facade } = setup(gateway);
    facade.load('tx-1');

    facade.voidTransaction('tx-1', 'motivo');

    expect(facade.voidProblem()?.code).toBe('TRANSACTION_HAS_ACTIVE_REFUNDS');
    expect(facade.transaction()?.status).toBe('ACTIVE');
  });

  it('Dado clique duplo em estornar, então uma requisição só', () => {
    const gateway = new TransactionsGatewayStub();
    gateway.void$ = NEVER;
    const { facade } = setup(gateway);
    facade.load('tx-1');

    facade.voidTransaction('tx-1', 'a');
    facade.voidTransaction('tx-1', 'a');

    expect(gateway.voids).toHaveLength(1);
    expect(facade.voiding()).toBe(true);
  });

  it('Dado o estorno com sucesso, então emite a movimentação devolvida em voided$', () => {
    const { facade } = setup();
    const emitted: string[] = [];
    facade.voided$.subscribe((t) => emitted.push(t.status));

    facade.voidTransaction('tx-1', 'duplicada');

    expect(emitted).toEqual(['VOIDED']);
  });
});
