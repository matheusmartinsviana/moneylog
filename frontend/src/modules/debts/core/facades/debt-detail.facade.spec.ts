import { TestBed } from '@angular/core/testing';
import { firstValueFrom, Subject } from 'rxjs';

import { DebtDetailFacade } from '~/modules/debts/core/facades/debt-detail.facade';
import { DebtsListFacade } from '~/modules/debts/core/facades/debts-list.facade';
import { brl, failWith } from '~/testing/accounts-testing';
import { aDebt, DebtsGatewayStub, provideDebtsStub } from '~/testing/debts-testing';

function setup(gateway = new DebtsGatewayStub()) {
  TestBed.configureTestingModule({
    providers: [provideDebtsStub(gateway), DebtDetailFacade, DebtsListFacade],
  });
  return { gateway, facade: TestBed.inject(DebtDetailFacade) };
}

describe('DebtDetailFacade', () => {
  it('Dado a dívida, então expõe os valores e as flags do backend', () => {
    const { facade } = setup();

    facade.load('debt-1');

    expect(facade.debt()).toMatchObject({ cancelable: true, voidable: false });
    expect(facade.debt()?.outstanding.amount).toBe('200.00');
  });

  it('Dado 404, então o estado é notFound', () => {
    const gateway = new DebtsGatewayStub();
    gateway.getResult = failWith(404, 'DEBT_NOT_FOUND');
    const { facade } = setup(gateway);

    facade.load('x');

    expect(facade.state().status).toBe('notFound');
  });

  it('Dado perdoar, então envia o motivo, substitui a dívida pela resposta e emite done$', () => {
    const { facade, gateway } = setup();
    facade.load('debt-1');
    const done: string[] = [];
    facade.done$.subscribe((event) => done.push(`${event.action}:${event.debt.status}`));

    facade.cancel('debt-1', 'combinado');

    expect(gateway.reasons).toEqual(['combinado']);
    expect(facade.debt()?.status).toBe('CANCELED');
    expect(facade.debt()?.outstanding.amount).toBe('0.00');
    expect(done).toEqual(['cancel:CANCELED']);
  });

  it('Dado o clique duplo, então uma requisição só (exhaustMap)', () => {
    const gateway = new DebtsGatewayStub();
    const pending = new Subject<ReturnType<typeof aDebt>>();
    gateway.next = pending;
    const { facade } = setup(gateway);
    facade.load('debt-1');

    facade.cancel('debt-1', 'x');
    facade.cancel('debt-1', 'x');

    expect(gateway.calls.filter((c) => c.startsWith('cancel'))).toHaveLength(1);
    expect(facade.busy()).toBe(true);
    pending.next(aDebt({ status: 'CANCELED', outstanding: brl('0.00') }));
    pending.complete();
    expect(facade.busy()).toBe(false);
  });

  it('Dado DEBT_HAS_SETTLEMENTS ao estornar, então guarda o problema e recarrega do backend', () => {
    const gateway = new DebtsGatewayStub();
    const { facade } = setup(gateway);
    facade.load('debt-1');
    gateway.next = failWith(422, 'DEBT_HAS_SETTLEMENTS');

    facade.void('debt-1', 'engano');

    expect(facade.problem()).toMatchObject({ status: 422, code: 'DEBT_HAS_SETTLEMENTS' });
    expect(gateway.calls.filter((c) => c === 'get:debt-1')).toHaveLength(2);
  });

  it('Dado editar, então envia a version e usa a dívida da resposta', () => {
    const { facade, gateway } = setup();
    facade.load('debt-1');

    facade.update('debt-1', { description: 'Novo', expectedDate: null, version: 2 });

    expect(gateway.calls).toContain('update:debt-1:2');
    expect(facade.debt()?.version).toBe(3);
  });

  it('Dado refresh, então recarrega sem voltar ao esqueleto', () => {
    const { facade } = setup();
    facade.load('debt-1');

    facade.refresh('debt-1');

    expect(facade.state().status).toBe('ready');
  });

  it('Dado muitas dívidas, então loadAll da lista pagina até o fim', async () => {
    const gateway = new DebtsGatewayStub();
    gateway.debts = Array.from({ length: 51 }, (_, i) => aDebt({ id: `d${i}` }));
    TestBed.configureTestingModule({ providers: [provideDebtsStub(gateway), DebtsListFacade] });

    const all = await firstValueFrom(
      TestBed.inject(DebtsListFacade).loadAll({ direction: 'RECEIVABLE' }),
    );

    expect(all).toHaveLength(51);
    expect(gateway.queries.every((q) => q.direction === 'RECEIVABLE')).toBe(true);
  });

  it('Dado um refresh silencioso que falha, então a tela continua pronta com o último dado e um aviso', () => {
    const { facade, gateway } = setup();
    facade.load('debt-1');
    gateway.getResult = failWith(0, 'NETWORK');

    facade.refresh('debt-1');

    expect(facade.state().status).toBe('ready');
    expect(facade.debt()?.id).toBe('debt-1');
    expect(facade.refreshProblem()).toMatchObject({ status: 0 });
  });

  it('Dado o aviso de refresh, quando tento de novo e dá certo, então o aviso some e vem o dado novo', () => {
    const { facade, gateway } = setup();
    facade.load('debt-1');
    gateway.getResult = failWith(0, 'NETWORK');
    facade.refresh('debt-1');
    gateway.getResult = null;
    gateway.debts = [aDebt({ id: 'debt-1', status: 'SETTLED', outstanding: brl('0.00') })];

    facade.retryRefresh();

    expect(facade.refreshProblem()).toBeNull();
    expect(facade.debt()?.status).toBe('SETTLED');
  });

  it('Dado a carga inicial (não silenciosa) que falha, então o estado é error', () => {
    const gateway = new DebtsGatewayStub();
    gateway.getResult = failWith(0, 'NETWORK');
    const { facade } = setup(gateway);

    facade.load('debt-1');

    expect(facade.state().status).toBe('error');
  });

  it('Dado um refresh silencioso que dá 404, então vira notFound (a dívida sumiu de verdade)', () => {
    const { facade, gateway } = setup();
    facade.load('debt-1');
    gateway.getResult = failWith(404, 'DEBT_NOT_FOUND');

    facade.refresh('debt-1');

    expect(facade.state().status).toBe('notFound');
  });
});
