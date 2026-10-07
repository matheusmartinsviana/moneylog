import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NEVER, Observable, of, Subject, throwError } from 'rxjs';

import { DashboardFacade } from '~/modules/dashboard/core/facades/dashboard.facade';
import { DashboardFailure } from '~/modules/dashboard/core/types/dashboard-failure';
import type { DashboardSummary } from '~/modules/dashboard/core/types/dashboard-summary';
import {
  aDashboardSummary,
  anUpcoming,
  DashboardGatewayStub,
  provideDashboardStub,
} from '~/testing/dashboard-testing';

/** Hospeda a facade com escopo de componente, como a página Início faz. */
@Component({ selector: 'app-host', template: '', providers: [DashboardFacade] })
class HostComponent {
  readonly facade = inject(DashboardFacade);
}

function setup(stub = new DashboardGatewayStub()) {
  TestBed.configureTestingModule({ providers: provideDashboardStub(stub) });
  const fixture = TestBed.createComponent(HostComponent);
  return { stub, fixture, facade: fixture.componentInstance.facade };
}

describe('DashboardFacade', () => {
  it('Dado a facade recém-criada, então começa carregando', () => {
    const { facade } = setup();

    expect(facade.state()).toEqual({ status: 'loading' });
    expect(facade.loading()).toBe(true);
    expect(facade.empty()).toBe(false);
    expect(facade.error()).toBeNull();
    expect(facade.data()).toBeNull();
  });

  it('Dado a porta ainda respondendo, quando carrego, então fica em loading', () => {
    const stub = new DashboardGatewayStub();
    stub.summary$ = NEVER;
    const { facade } = setup(stub);

    facade.load();

    expect(facade.loading()).toBe(true);
  });

  it('Dado a porta sem nenhuma conta, quando carrego, então o estado é vazio', () => {
    const stub = new DashboardGatewayStub();
    stub.summary$ = of(aDashboardSummary({ hasAccounts: false }));
    const { facade } = setup(stub);

    facade.load();

    expect(facade.state()).toEqual({ status: 'empty' });
    expect(facade.empty()).toBe(true);
    expect(facade.loading()).toBe(false);
    expect(facade.data()).toBeNull();
  });

  it('Dado contas e um resumo, quando carrego, então expõe exatamente o que a porta devolveu, sem recalcular', () => {
    const stub = new DashboardGatewayStub();
    // Valores propositalmente "incoerentes": se a facade somasse ou subtraísse, o teste quebraria.
    const summary: DashboardSummary = aDashboardSummary({
      balances: {
        inAccounts: { amount: '100.00', currency: 'BRL' },
        investments: { amount: '0.00', currency: 'BRL' },
        available: { amount: '999.99', currency: 'BRL' },
        reserved: { amount: '1.00', currency: 'BRL' },
        committed30d: { amount: '2.00', currency: 'BRL' },
        inAccountsChange: null,
      },
    });
    const upcoming = anUpcoming();
    stub.summary$ = of(summary);
    stub.upcoming$ = of(upcoming);
    const { facade } = setup(stub);

    facade.load();

    expect(facade.state().status).toBe('ready');
    expect(facade.data()?.summary).toBe(summary);
    expect(facade.data()?.upcoming).toBe(upcoming);
    expect(facade.data()?.summary.balances.available).toEqual({
      amount: '999.99',
      currency: 'BRL',
    });
    expect(facade.loading()).toBe(false);
    expect(facade.error()).toBeNull();
  });

  it('Dado uma falha na porta, quando carrego, então o estado é erro "unavailable"', () => {
    const stub = new DashboardGatewayStub();
    stub.summary$ = throwError(() => new Error('rede'));
    const { facade } = setup(stub);

    facade.load();

    expect(facade.state()).toEqual({ status: 'error', reason: 'unavailable' });
    expect(facade.error()).toBe('unavailable');
    expect(facade.data()).toBeNull();
  });

  it('Dado a porta sem permissão, quando carrego, então o erro é "forbidden"', () => {
    const stub = new DashboardGatewayStub();
    stub.upcoming$ = throwError(() => new DashboardFailure('forbidden'));
    const { facade } = setup(stub);

    facade.load();

    expect(facade.error()).toBe('forbidden');
  });

  it('Dado um erro, quando tento de novo e a porta responde, então passa por loading e chega aos dados', () => {
    const stub = new DashboardGatewayStub();
    stub.summary$ = throwError(() => new Error('rede'));
    const { facade } = setup(stub);
    facade.load();
    expect(facade.error()).toBe('unavailable');

    const retry = new Subject<DashboardSummary>();
    stub.summary$ = retry;
    facade.load();
    expect(facade.loading()).toBe(true);

    retry.next(aDashboardSummary());
    retry.complete();
    expect(facade.state().status).toBe('ready');
  });

  it('Dado uma carga em andamento, quando peço outra, então a anterior é descartada (switchMap)', () => {
    const stub = new DashboardGatewayStub();
    const first = new Subject<DashboardSummary>();
    stub.summary$ = first;
    const { facade } = setup(stub);
    facade.load();

    stub.summary$ = of(aDashboardSummary({ hasAccounts: false }));
    facade.load();
    first.next(aDashboardSummary());
    first.complete();

    expect(facade.state()).toEqual({ status: 'empty' });
    expect(first.observed).toBe(false);
  });

  it('Dado a página destruída, então a facade para de ouvir novas cargas', () => {
    const stub = new DashboardGatewayStub();
    const pending = new Subject<DashboardSummary>();
    stub.summary$ = pending;
    const { facade, fixture } = setup(stub);
    facade.load();
    expect(pending.observed).toBe(true);

    fixture.destroy();

    expect(pending.observed).toBe(false);
  });

  it('Dado que o resumo falha enquanto os próximos ainda estão em voo, quando carrego, então não cancela a leitura irmã e só mostra o erro quando as duas terminam', () => {
    const stub = new DashboardGatewayStub();
    let cancelled = false;
    const upcoming = new Subject<ReturnType<typeof anUpcoming>>();
    stub.summary$ = throwError(() => new DashboardFailure('unavailable'));
    stub.upcoming$ = new Observable((subscriber) => {
      const inner = upcoming.subscribe(subscriber);
      return () => {
        if (!upcoming.closed && !subscriber.closed) cancelled = true;
        inner.unsubscribe();
      };
    });
    const { facade } = setup(stub);

    facade.load();

    // Cancelar a irmã deixaria uma requisição abortada no navegador (o backend a processa até o fim)
    // sobreposta à do "tentar de novo".
    expect(cancelled).toBe(false);
    expect(facade.state()).toEqual({ status: 'loading' });

    upcoming.next(anUpcoming());
    upcoming.complete();

    expect(facade.state()).toEqual({ status: 'error', reason: 'unavailable' });
  });

  it('Dado reload (recarga silenciosa), então não volta ao esqueleto e troca os dados quando chegam', () => {
    const stub = new DashboardGatewayStub();
    const { facade } = setup(stub);
    facade.load();
    const next = new Subject<DashboardSummary>();
    stub.summary$ = next;

    facade.reload();

    expect(facade.state().status).toBe('ready');
    next.next(aDashboardSummary({ asOf: '2026-11-01' }));
    next.complete();
    expect(facade.data()?.summary.asOf).toBe('2026-11-01');
  });

  it('Dado reload que falha com o Início já pronto, então mantém os dados e marca refreshFailed (e a próxima carga limpa)', () => {
    const stub = new DashboardGatewayStub();
    const { facade } = setup(stub);
    facade.load();
    stub.summary$ = throwError(() => new Error('rede'));

    facade.reload();

    expect(facade.state().status).toBe('ready');
    expect(facade.refreshFailed()).toBe(true);
    stub.summary$ = of(aDashboardSummary());
    facade.reload();
    expect(facade.refreshFailed()).toBe(false);
  });

  it('Dado load (não silencioso) que falha, então o estado é error', () => {
    const stub = new DashboardGatewayStub();
    const { facade } = setup(stub);
    facade.load();
    stub.summary$ = throwError(() => new Error('rede'));

    facade.load();

    expect(facade.state().status).toBe('error');
  });
});
